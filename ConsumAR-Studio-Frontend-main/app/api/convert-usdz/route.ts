import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const EC2_USDZ_URL = process.env.EC2_USDZ_URL;

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    let maxUsdz = 1; // Default NON_LOGGED
    let maxUsdzMonth = 999999;
    let userId = null;
    
    if (session?.user?.id) {
      userId = session.user.id;
      const user = await (prisma.user as any).findUnique({ where: { id: userId }});
      const userTier = user?.tier || "FREE";
      
      // V16: Session Email Persistence Lock
      const sessionEmail = session.user.email || user?.email;
      console.log(`[convert-usdz] Session user found: ${sessionEmail} (${userId})`);

      if (user?.isAdmin) {
        // SUPER ADMIN BYPASS: Unlimited quota
        maxUsdz = 999999;
        maxUsdzMonth = 999999;
      } else if (userTier === "PAID") {
        maxUsdz = 999999;
        maxUsdzMonth = 999999;
      } else if (userTier === "FREE") {
        maxUsdz = 2;
        maxUsdzMonth = 15;
      }
    }

    // V16: Quota Lock - Check usage by BOTH userId and email using Raw SQL to bypass stale client validation
    const userEmail = session?.user?.email || null;
    const todayStr = startOfDay.toISOString();
    const monthStr = startOfMonth.toISOString();

    const usdzResults: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count 
      FROM activities 
      WHERE type = 'USDZ_CONVERT' 
      AND "createdAt" >= $1::timestamp
      AND (
        "userId" = $2::uuid OR 
        "userEmail" = $3 OR 
        ("userId" IS NULL AND "ipAddress" = $4)
      )
    `, todayStr, userId, userEmail, ip);

    const usdzUsed = usdzResults[0]?.count || 0;

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

    if (usdzUsed >= maxUsdz || usdzUsedMonth >= maxUsdzMonth) {
      const errorMsg = usdzUsedMonth >= maxUsdzMonth 
        ? "Monthly limit reached. Upgrade to Pro for unlimited."
        : "Daily limit reached. Please upgrade to Pro. (Note: Account wipes do not reset daily limits)";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 403 });
    }

    const incomingForm = await request.formData();
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
    const isLocal = s3KeyStr && (s3KeyStr.includes(":\\") || s3KeyStr.includes("storage\\"));
    
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

    // Build FormData for EC2
    const ec2Form = new FormData();
    ec2Form.append('s3_key', effective_key);

    console.log('[convert-usdz] Forwarding to EC2...');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600_000); // 10-minute maximum conversion timeout

    let ec2Response;
    try {
      ec2Response = await fetch(EC2_USDZ_URL!, {
        method: 'POST',
        body: ec2Form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await ec2Response.text();
    console.log(`[convert-usdz] EC2 ${ec2Response.status}:`, text);

    if (!ec2Response.ok) {
      return NextResponse.json(
        { success: false, error: `EC2 error (${ec2Response.status}): ${text}` },
        { status: ec2Response.status }
      );
    }

    const data = JSON.parse(text);

    // LOG HISTORY & ACTIVITY
    try {
      console.log("[convert-usdz] Attempting to log activity...");
      const session = await getServerSession(authOptions);
      console.log("[convert-usdz] Session check:", session ? "Found" : "Missing", session?.user?.email);

      const userId = (session?.user as any)?.id;

      if (userId) {
        const finalFileName = s3KeyStr.split('/').pop() || "Converted Model";

        // 1. Log to HistoryItem (Standard History)
        try {
          await (prisma as any).historyItem.create({
            data: {
              userId: userId,
              fileName: finalFileName,
              action: "CONVERT",
              glbFile: glb_url as string,
              usdzFile: data.usdz_url,
            }
          });
          console.log("[convert-usdz] HistoryItem created.");
        } catch (hErr) {
          console.error("[convert-usdz] HistoryItem creation failed:", hErr);
        }

        // 2. Log to Activity (Increments Dashboard Count & Stores Links)
        try {
          const activityEmail = session?.user?.email || (userId ? (await (prisma.user as any).findUnique({ where: { id: userId }}))?.email : null);

          await prisma.$executeRawUnsafe(`
            INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile", "usdzFile")
            VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)
          `, Math.random().toString(36).substring(7), userId, activityEmail || null, ip, "USDZ_CONVERT", finalFileName.endsWith('.usdz') ? finalFileName : `${finalFileName}.usdz`, glb_url as string, data.file_url);
          console.log(`[convert-usdz] Activity record created for: ${activityEmail}`);
        } catch (aErr) {
          console.error("[convert-usdz] Activity creation failed:", aErr);
        }

      } else {
        // Log anonymous user activity
        const finalFileName = s3KeyStr.split('/').pop() || "Converted Model";
        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile", "usdzFile")
            VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6)
          `, Math.random().toString(36).substring(7), ip, "USDZ_CONVERT", finalFileName.endsWith('.usdz') ? finalFileName : `${finalFileName}.usdz`, glb_url as string, data.file_url);
          console.log("[convert-usdz] Anonymous activity record created (Raw SQL).");
        } catch (aErr) {
          console.error("[convert-usdz] Anonymous Activity creation failed:", aErr);
        }
      }
    } catch (sessionErr) {
      console.error("[convert-usdz] Critical failure in logging block:", sessionErr);
    }

    const updatedUsage = await getUsage(userId, ip, session?.user?.email);
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
async function getUsage(userId: string | null, ip: string, sessionEmail?: string | null) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  let rescalesUsed = 0;
  let rescalesUsedMonth = 0;
  let usdzUsed = 0;
  let usdzUsedMonth = 0;
  let uploadsUsed = 0;
  let maxRescales = 2;
  let maxRescalesMonth = 999999;
  let maxUsdz = 1;
  let maxUsdzMonth = 999999;
  let maxUploads = 10;

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
    
    const isAdmin = userResults[0]?.isAdmin || false;
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
    else if (tier === "PAID") { maxRescales = 20; maxRescalesMonth = 250; maxUsdz = 999999; maxUsdzMonth = 999999; maxUploads = 100; }
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
    baseWhereSql = `
      AND ("userId" IS NULL AND "ipAddress" = $3)
    `;
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
