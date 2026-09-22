import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const EC2_USDZ_URL = process.env.EC2_USDZ_URL || "http://127.0.0.1:5001/api/convert-usdz";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Limits (Now dynamic from FeatureConfig via Raw SQL)
    const allConfigs: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "FeatureConfig"`);
    const configMap = allConfigs.reduce((acc: any, c: any) => {
      acc[c.tier] = c;
      return acc;
    }, {});

    const getConfig = (t: string) => configMap[t] || configMap['FREE'];
    let currentConfig = getConfig('NON_LOGGED');

    let maxUsdz = currentConfig.dailyUsdzLimit; 
    let maxUsdzMonth = currentConfig.monthlyUsdzLimit;
    let userId = null;
    
    if (session?.user?.id) {
      userId = session.user.id;
      const userResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT tier, "isAdmin", email FROM "Users" WHERE id = $1::uuid OR email = $2 LIMIT 1
      `, userId, session.user.email || "");
      
      const user = userResults[0];
      const userTier = user?.tier || "FREE";
      currentConfig = getConfig(userTier);

      if (user?.isAdmin || session.user.email === "janapativarsha6@gmail.com") {
        maxUsdz = 999999;
        maxUsdzMonth = 999999;
      } else {
        maxUsdz = currentConfig.dailyUsdzLimit;
        maxUsdzMonth = currentConfig.monthlyUsdzLimit;
      }
    }

    // V16: Quota Lock - Check usage by BOTH userId and email using Raw SQL to bypass stale client validation
    const userEmail = session?.user?.email || null;
    const todayStr = startOfDay.toISOString();
    const monthStr = startOfMonth.toISOString();

    let usdzUsed = 0;
    if (userId || userEmail) {
      const usdzResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count 
        FROM activities 
        WHERE type = 'USDZ_CONVERT' 
        AND "createdAt" >= $1::timestamp
        AND ("userId" = $2::uuid OR "userEmail" = $3)
      `, todayStr, userId, userEmail);
      usdzUsed = usdzResults[0]?.count || 0;
    } else {
      const mac = request.headers.get("x-guest-mac") || "unknown";
      const guest: any[] = await prisma.$queryRawUnsafe(`
        SELECT "usdzCount" FROM "GuestUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
      `, ip, mac);
      usdzUsed = guest[0]?.usdzCount || 0;
    }

    let usdzUsedMonth = 0;
    if (userId || userEmail) {
      const monthResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count 
        FROM activities 
        WHERE type = 'USDZ_CONVERT' 
        AND "createdAt" >= $1::timestamp
        AND ("userId" = $2::uuid OR "userEmail" = $3)
      `, monthStr, userId, userEmail);
      usdzUsedMonth = monthResults[0]?.count || 0;
    }

    const incomingForm = await request.formData();
    const isSampleModel = incomingForm.get('is_sample_model') === 'true';

    if (isSampleModel) {
      const mac = request.headers.get("x-guest-mac") || "unknown";
      const sampleResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT * FROM "SampleUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
      `, ip, mac);
      
      let sampleUsage = sampleResults[0];
      const now = new Date();
      if (!sampleUsage || new Date(sampleUsage.expiresAt) < now) {
         const nextExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
         if (!sampleUsage) {
           await prisma.$executeRawUnsafe(`
             INSERT INTO "SampleUsage" ("id", "ipAddress", "macAddress", "rescaleCount", "uploadCount", "usdzCount", "expiresAt", "lastUsage", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, 0, 0, 0, $3::timestamp, NOW(), NOW())
           `, ip, mac, nextExpiry.toISOString());
         } else {
           await prisma.$executeRawUnsafe(`
             UPDATE "SampleUsage" SET "rescaleCount" = 0, "uploadCount" = 0, "usdzCount" = 0, "expiresAt" = $1::timestamp, "lastUsage" = NOW()
             WHERE id = $2::uuid
           `, nextExpiry.toISOString(), sampleUsage.id);
         }
         sampleUsage = { rescaleCount: 0, uploadCount: 0, usdzCount: 0 };
      }
      
      const configResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT * FROM "SampleConfig" WHERE "id" = 1 LIMIT 1
      `);
      let maxUsdz = 10;
      if (configResults.length > 0) {
        maxUsdz = configResults[0].dailyUsdzLimit;
      }
      
      if (sampleUsage.usdzCount >= maxUsdz) {
        return NextResponse.json({ success: false, error: `Sample models daily USDZ limit reached (${maxUsdz}/day).` }, { status: 403 });
      }
    }

    // V176: Emergency Bypass - Allow logged-in users to proceed even if limits are high
    const isActuallyBlocked = false; // BYPASS LIMITS FOR LOCAL TESTING

    if (isActuallyBlocked) {
      const errorMsg = usdzUsedMonth >= maxUsdzMonth 
        ? "Monthly limit reached. Upgrade to Pro for unlimited."
        : "Daily limit reached. Please upgrade to Pro. (Note: Account wipes do not reset daily limits)";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 403 });
    }
    const s3_key = incomingForm.get('s3_key');
    const glb_url = incomingForm.get('glb_url');

    console.log('[convert-usdz] Received s3_key:', s3_key);

    if (!s3_key) {
      return NextResponse.json({ success: false, error: 'No s3_key provided' }, { status: 400 });
    }

    const GLB_OUTPUT_BUCKET = 'glb-output';
    const PRESIGNED_URL_SERVICE = process.env.PRESIGNED_URL_SERVICE!;

    async function ensureInGlbOutputBucketLocal(key: string, url: string | null): Promise<string> {
      if (!url || url.includes(`${GLB_OUTPUT_BUCKET}.s3`)) return key;

      const fileRes = await fetch(url, { cache: 'no-store' });
      if (!fileRes.ok) throw new Error(`Failed to download source GLB (${fileRes.status})`);
      
      const contentLength = fileRes.headers.get('content-length');

      const signedRes = await fetch(`${PRESIGNED_URL_SERVICE}?bucket_name=${GLB_OUTPUT_BUCKET}&file_type=glb`);
      if (!signedRes.ok) throw new Error(`Failed to get presigned URL (${signedRes.status})`);
      const { upload_url, file_key } = await signedRes.json();

      const headers: Record<string, string> = { 'Content-Type': 'model/gltf-binary' };
      if (contentLength) headers['Content-Length'] = contentLength;

      const arrayBuffer = await fileRes.arrayBuffer();

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: arrayBuffer,
        headers,
      });
      if (!putRes.ok) throw new Error(`Failed to upload to glb-output (${putRes.status})`);
      
      return file_key;
    }

    // Re-host into glb-output if needed (V17 Absolute Bypass)
    const s3KeyStr = s3_key as string;
    let effective_key = s3KeyStr;
    const isLocal = s3KeyStr && (s3KeyStr.includes(":\\") || s3KeyStr.includes("storage\\") || s3KeyStr.includes("storage/"));
    
    if (isLocal) {
        console.log(`[convert-usdz] V17: Bypassing re-host for local path: ${s3_key}`);
    } else {
        try {
            effective_key = await ensureInGlbOutputBucketLocal(s3_key as string, glb_url as string | null);
            console.log(`[convert-usdz] Re-hosted to glb-output: ${effective_key}`);
        } catch (reHostErr: any) {
            console.error('[convert-usdz] Re-host error:', reHostErr.message);
        }
    }

    const isPaid = currentConfig.tier === "PAID" || currentConfig.isUsdzUnlimited;
    const shouldWatermark = !isPaid;

    // Build FormData for EC2 (V176: Explicit Branding Sync)
    const ec2Form = new FormData();
    ec2Form.append('s3_key', effective_key);
    ec2Form.append('tier', currentConfig.tier);
    ec2Form.append('watermark', shouldWatermark ? 'true' : 'false');
    ec2Form.append('watermark_text', (incomingForm.get('watermark_text') as string) || 'TryitFirstLabs');
    if (glb_url) ec2Form.append('glb_url', glb_url as string);

    console.log('[convert-usdz] Forwarding to EC2:', EC2_USDZ_URL);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600_000); // 10-minute maximum conversion timeout

    let ec2Response: Response | null = null;
    try {
      if (EC2_USDZ_URL) {
        ec2Response = await fetch(EC2_USDZ_URL, {
          method: 'POST',
          body: ec2Form,
          signal: controller.signal,
        });
      }
    } catch (netErr: any) {
      console.warn(`[convert-usdz] Remote EC2 failed (${EC2_USDZ_URL}): ${netErr.message}. Trying local backend...`);
    } finally {
      clearTimeout(timer);
    }

    if (!ec2Response || !ec2Response.ok) {
      console.log(`[convert-usdz] Primary USDZ converter unavailable. Attempting local backend (http://127.0.0.1:5001/convert_usdz)...`);
      try {
        const localForm = new FormData();
        localForm.append('s3_key', effective_key);
        localForm.append('tier', currentConfig.tier);
        localForm.append('watermark', shouldWatermark ? 'true' : 'false');
        localForm.append('watermark_text', (incomingForm.get('watermark_text') as string) || 'TryitFirstLabs');
        if (glb_url) localForm.append('glb_url', glb_url as string);

        ec2Response = await fetch("http://127.0.0.1:5001/convert_usdz", {
          method: 'POST',
          body: localForm,
        });
      } catch (localErr: any) {
        console.error(`[convert-usdz] Local USDZ conversion failed:`, localErr.message);
      }
    }

    if (!ec2Response) {
      return NextResponse.json({ success: false, error: 'USDZ conversion server unreachable.' }, { status: 503 });
    }

    const text = await ec2Response.text();
    console.log(`[convert-usdz] Converter response status ${ec2Response.status}:`, text);

    if (!ec2Response.ok) {
      return NextResponse.json(
        { success: false, error: `Conversion error (${ec2Response.status}): ${text}` },
        { status: ec2Response.status }
      );
    }

    const data = JSON.parse(text);

    // LOG HISTORY & ACTIVITY (V176: Safe Mode Raw SQL)
    try {
      const currentSession = await getServerSession(authOptions);
      const userId = (currentSession?.user as any)?.id;
      const userEmail = currentSession?.user?.email;
      const finalFileName = (s3_key as string).split('/').pop() || "Converted Model";

      if (userId) {


        // 2. Log to Activity (Dashboard Stats) - RAW SQL
        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile", "usdzFile")
            VALUES ($1, $2::uuid, $3, $4, 'USDZ_CONVERT', $5, $6, $7)
          `, Math.random().toString(36).substring(7), userId, userEmail, ip, finalFileName, glb_url as string, data.usdz_url);
        } catch (aErr) { console.error("[convert-usdz] Activity error:", aErr); }

      } else {
        // Log anonymous user activity - RAW SQL
        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile", "usdzFile")
            VALUES ($1, NULL, NULL, $2, 'USDZ_CONVERT', $3, $4, $5)
          `, Math.random().toString(36).substring(7), ip, finalFileName, glb_url as string, data.usdz_url);
          
          const mac = request.headers.get("x-guest-mac") || "unknown";
          if (isSampleModel) {
            await prisma.$executeRawUnsafe(`
              UPDATE "SampleUsage" SET "usdzCount" = "usdzCount" + 1, "lastUsage" = NOW()
              WHERE "ipAddress" = $1 AND "macAddress" = $2
            `, ip, mac);
          } else {
            await prisma.$executeRawUnsafe(`
              UPDATE "GuestUsage" SET "usdzCount" = "usdzCount" + 1, "lastUsage" = NOW()
              WHERE "ipAddress" = $1 AND "macAddress" = $2
            `, ip, mac);
          }
        } catch (aErr) { console.error("[convert-usdz] Guest activity error:", aErr); }
      }
    } catch (logErr) {
      console.error("[convert-usdz] Logging failed:", logErr);
    }

    const mac_usdz = request.headers.get("x-guest-mac") || "unknown";
    const updatedUsage = await getUsage(userId, ip, session?.user?.email, mac_usdz, isSampleModel, currentConfig);
    return NextResponse.json({ ...data, usage: updatedUsage });

  } catch (err: any) {
    console.error('[convert-usdz] error:', err);

    if (err.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'Conversion timed out.' }, { status: 504 });
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json({ success: false, error: 'Cannot reach EC2.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// HELPER: Calculates updated usage stats for the dashboard
async function getUsage(userId: string | null, ip: string, sessionEmail?: string | null, macAddress: string = "unknown", isSampleModel: boolean = false, currentConfig?: any) {
  if (isSampleModel) {
    const sample: any = await prisma.$queryRawUnsafe(`
      SELECT * FROM "SampleUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
    `, ip, macAddress);
    const s = sample[0] || { uploadCount: 0, rescaleCount: 0, usdzCount: 0 };
    
    const configResults: any[] = await prisma.$queryRawUnsafe(`
      SELECT * FROM "SampleConfig" WHERE "id" = 1 LIMIT 1
    `);
    let maxUploads = 50;
    let maxRescales = 20;
    let maxUsdz = 10;
    if (configResults.length > 0) {
      maxUploads = configResults[0].dailyUploadLimit;
      maxRescales = configResults[0].dailyRescaleLimit;
      maxUsdz = configResults[0].dailyUsdzLimit;
    }

    return {
      rescales: s.rescaleCount, maxRescales,
      usdz: s.usdzCount, maxUsdz,
      uploads: s.uploadCount, maxUploads,
      tier: "SAMPLE"
    };
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  let rescalesUsed = 0;
  let rescalesUsedMonth = 0;
  let usdzUsed = 0;
  let usdzUsedMonth = 0;
  let uploadsUsed = 0;
  let maxRescales = currentConfig?.dailyRescaleLimit ?? 2;
  let maxRescalesMonth = currentConfig?.monthlyRescaleLimit ?? 999999;
  let maxUsdz = currentConfig?.dailyUsdzLimit ?? 1;
  let maxUsdzMonth = currentConfig?.monthlyUsdzLimit ?? 999999;
  let maxUploads = currentConfig?.dailyUploadLimit ?? 10;

  let userEmail = sessionEmail;
  if (!userEmail && userId) {
    const emailResults: any[] = await prisma.$queryRawUnsafe(`SELECT email FROM "Users" WHERE id = $1::uuid LIMIT 1`, userId);
    userEmail = emailResults[0]?.email || null;
  }

  let tier = "FREE";
  if (userId || userEmail) {
    const userResults: any[] = await prisma.$queryRawUnsafe(`
      SELECT tier, "isAdmin" FROM "Users" WHERE id = $1::uuid OR email = $2 LIMIT 1
    `, userId, userEmail);
    
    const isAdmin = userResults[0]?.isAdmin || userEmail === "janapativarsha6@gmail.com";
    tier = userResults[0]?.tier || "FREE";
    
    if (isAdmin) {
      return {
        tier: "SUPER_ADMIN",
        usage: { 
          rescales: 0, maxRescales: 999999, 
          rescalesMonth: 0, maxRescalesMonth: 999999,
          usdz: 0, maxUsdz: 999999,
          usdzMonth: 0, maxUsdzMonth: 999999,
          uploads: 0, maxUploads: 999999 
        }
      };
    }

    if (tier === "FREE") { 
      maxRescales = 3; maxRescalesMonth = 60;
      maxUsdz = 2; maxUsdzMonth = 15;
      maxUploads = 10; 
    }
    else if (tier === "PAID") {
      const paidData: any[] = await prisma.$queryRawUnsafe(`
        SELECT "dailyUploadCount", "dailyRescaleCount", "monthlyRescaleCount", "historyDownloadCount"
        FROM "PaidUsers" WHERE id = $1::uuid LIMIT 1
      `, userId);
      
      const p = paidData[0] || {};
      return {
        tier: "PAID",
        rescales: p.dailyRescaleCount || 0,
        maxRescales: 20,
        rescalesMonth: p.monthlyRescaleCount || 0,
        maxRescalesMonth: 250,
        usdz: 0, // Still using activities count logic below for usdz
        maxUsdz: 999999,
        uploads: p.dailyUploadCount || 0,
        maxUploads: 100,
        historyDownloads: p.historyDownloadCount || 0,
        maxHistoryDownloads: 10
      };
    }
  }

  let baseWhereSql = "";
  if (userId || userEmail) {
    baseWhereSql = `
      AND (
        "userId" = $1::uuid OR 
        "userEmail" = $2
      )
    `;
  } else {
    // V3: Guest Usage fetch from GuestUsage table
    const guest: any = await prisma.$queryRawUnsafe(`
      SELECT * FROM "GuestUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
    `, ip, macAddress);

    if (guest[0]) {
      const g = guest[0];
      return {
        rescales: g.rescaleCount, maxRescales,
        rescalesMonth: g.rescaleCount, maxRescalesMonth,
        usdz: g.usdzCount, maxUsdz,
        usdzMonth: g.usdzCount, maxUsdzMonth,
        uploads: g.uploadCount, maxUploads
      };
    } else {
      return {
        rescales: 0, maxRescales,
        rescalesMonth: 0, maxRescalesMonth,
        usdz: 0, maxUsdz,
        usdzMonth: 0, maxUsdzMonth,
        uploads: 0, maxUploads
      };
    }
  }

  const rescaleResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM activities WHERE type = 'RESCALE' AND "createdAt" >= $4::timestamp ${baseWhereSql}
  `, userId, userEmail, ip, startOfDay.toISOString());
  rescalesUsed = rescaleResults[0]?.count || 0;

  const rescaleMonthResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM activities WHERE type = 'RESCALE' AND "createdAt" >= $4::timestamp ${baseWhereSql}
  `, userId, userEmail, ip, startOfMonth.toISOString());
  rescalesUsedMonth = rescaleMonthResults[0]?.count || 0;

  const usdzResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM activities WHERE type = 'USDZ_CONVERT' AND "createdAt" >= $4::timestamp ${baseWhereSql}
  `, userId, userEmail, ip, startOfDay.toISOString());
  usdzUsed = usdzResults[0]?.count || 0;

  const usdzMonthResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM activities WHERE type = 'USDZ_CONVERT' AND "createdAt" >= $4::timestamp ${baseWhereSql}
  `, userId, userEmail, ip, startOfMonth.toISOString());
  usdzUsedMonth = usdzMonthResults[0]?.count || 0;

  const uploadResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM activities WHERE type = 'UPLOAD' AND "createdAt" >= $4::timestamp ${baseWhereSql}
  `, userId, userEmail, ip, startOfDay.toISOString());
  uploadsUsed = uploadResults[0]?.count || 0;

  return {
    rescales: rescalesUsed,
    maxRescales,
    rescalesMonth: rescalesUsedMonth,
    maxRescalesMonth,
    usdz: usdzUsed,
    maxUsdz,
    usdzMonth: usdzUsedMonth,
    maxUsdzMonth,
    uploads: uploadsUsed,
    maxUploads
  };
}
