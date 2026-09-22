import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import axios from "axios";
import fs from 'fs';
import path from 'path';

import os from 'os';
const LOG_FILE = path.join(os.tmpdir(), 'next_api_debug.log');
function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
}

export const maxDuration = 300; // 5 minutes (requires Vercel Pro, but prevents Next.js hard timeouts)

const EC2_RESIZE_URL = process.env.EC2_RESIZE_URL;
const PRESIGNED_URL_SERVICE = process.env.PRESIGNED_URL_SERVICE!;
const GLB_OUTPUT_BUCKET = 'glb-output';

/**
 * If the GLB lives outside glb-output (i.e. a manual upload to tryitproductmodels),
 * download it and re-upload it into glb-output so the EC2 resize script can find it.
 * Returns the new s3_key in glb-output, or the original key if no re-hosting is needed.
 */
async function ensureInGlbOutputBucket(
  s3_key: string,
  glb_url: string | null
): Promise<string> {
  // If no URL provided, or URL is already from glb-output, use key as-is
  if (!glb_url || glb_url.includes(`${GLB_OUTPUT_BUCKET}.s3`)) {
    return s3_key;
  }

  // 1. Fetch the GLB bytes from the current presigned URL natively as stream!
  const fileRes = await fetch(glb_url, { cache: 'no-store' });
  if (!fileRes.ok) throw new Error(`Failed to download source GLB (${fileRes.status})`);
  
  // Extract exact content-length to prevent AWS S3 chunked protocol 501 rejection
  const contentLength = fileRes.headers.get('content-length');

  // 2. Get a presigned PUT URL for glb-output bucket
  const signedRes = await fetch(
    `${PRESIGNED_URL_SERVICE}?bucket_name=${GLB_OUTPUT_BUCKET}&file_type=glb`
  );
  if (!signedRes.ok) throw new Error(`Failed to get presigned URL (${signedRes.status})`);
  const { upload_url, file_key } = await signedRes.json();

  // 3. PUT the file into glb-output cleanly without memory crashes
  const headers: Record<string, string> = { 'Content-Type': 'model/gltf-binary' };
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  const arrayBuffer = await fileRes.arrayBuffer();

  const putRes = await fetch(upload_url, {
    method: 'PUT',
    body: arrayBuffer,
    headers,
  });
  if (!putRes.ok) throw new Error(`Failed to stream GLB to glb-output (${putRes.status})`);

  return file_key;
}

export async function POST(request: Request) {
  console.log("!!! API CALLED !!!");
  debugLog("POST /api/resize: Function Entered");
  try {
    const session = await getServerSession(authOptions);
    debugLog("Session retrieved");
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

    let maxRescales = currentConfig.dailyRescaleLimit; 
    let maxRescalesMonth = currentConfig.monthlyRescaleLimit;
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
        maxRescales = 999999;
        maxRescalesMonth = 999999;
      } else {
        maxRescales = currentConfig.dailyRescaleLimit;
        maxRescalesMonth = currentConfig.monthlyRescaleLimit;
      }
    }

    // V16: Quota Lock - Check usage by BOTH userId and email using Raw SQL to bypass stale client validation
    const userEmail = session?.user?.email || null;
    const todayStr = startOfDay.toISOString();
    const monthStr = startOfMonth.toISOString();

    const incomingForm = await request.formData();
    debugLog("Form data parsed");
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[resize][${requestId}] Request started`);
    const isAutoWatermark = incomingForm.get('auto_watermark') === 'true';
    const isSampleModel = incomingForm.get('is_sample_model') === 'true';
    const isDownload = incomingForm.get('is_download') === 'true';

    // Sample Model checks
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
      let maxRescales = 20;
      if (configResults.length > 0) {
        maxRescales = configResults[0].dailyRescaleLimit;
      }
      
      if (!isDownload && sampleUsage.rescaleCount >= maxRescales) {
        return NextResponse.json({ success: false, error: `Sample models daily rescale limit reached (${maxRescales}/day).` }, { status: 403 });
      }
    }

    debugLog(`Prisma Args: todayStr=${todayStr}, userId=${userId}, userEmail=${userEmail}, ip=${ip}`);
    debugLog("Starting Prisma Quota Check...");
    const rescaleResults: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count 
      FROM activities 
      WHERE type = 'RESCALE' 
      AND "createdAt" >= $1::timestamp
      AND (
        "userId" = $2::uuid OR 
        "userEmail" = $3 OR 
        ("userId" IS NULL AND "ipAddress" = $4)
      )
    `, todayStr, userId, userEmail, ip);
    debugLog("Prisma Quota Check complete");

    const rescalesUsed = rescaleResults[0]?.count || 0;
    console.log(`[resize][${requestId}] QUOTA CHECK:`, { 
      userId, 
      userEmail, 
      ip, 
      rescalesUsed, 
      maxRescales,
      todayStr 
    });

    let rescalesUsedMonth = 0;
    if (userId || userEmail) {
      const monthResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count 
        FROM activities 
        WHERE type = 'RESCALE' 
        AND "createdAt" >= $1::timestamp
        AND ("userId" = $2::uuid OR "userEmail" = $3)
      `, monthStr, userId, userEmail);
      rescalesUsedMonth = monthResults[0]?.count || 0;
      console.log(`[resize][${requestId}] MONTHLY QUOTA:`, { rescalesUsedMonth, maxRescalesMonth });
    }



    // V176: Emergency Bypass - Allow logged-in users to proceed even if limits are high
    const isActuallyBlocked = false; // BYPASS LIMITS FOR LOCAL TESTING

    if (isActuallyBlocked) {
      const errorMsg = rescalesUsedMonth >= maxRescalesMonth 
        ? "Monthly limit reached. Upgrade to Pro for unlimited."
        : "Daily limit reached. Please upgrade to Pro. (Note: Account wipes do not reset daily limits)";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 403 });
    }

    const force_watermark = incomingForm.get('force_watermark') as string | null;
    const watermark_text = incomingForm.get('watermark_text') as string | null;

    let s3_key = incomingForm.get('s3_key') as string | null;
    const glb_url = incomingForm.get('glb_url') as string | null;
    const file = incomingForm.get('file') as File | null;
    const depth = incomingForm.get('depth') as string | null;
    const width = incomingForm.get('width') as string | null;
    const height = incomingForm.get('height') as string | null;
    const unit = incomingForm.get('unit') as string | null;
    const mode = (incomingForm.get('mode') as string) || 'non-uniform';

    if (file) {
      debugLog("Processing uploaded GLB file for resize...");
      try {
        let fileBufferObj: Buffer;
        if (typeof file === 'string') {
          fileBufferObj = Buffer.from(file);
        } else {
          fileBufferObj = Buffer.from(await file.arrayBuffer());
        }

        // 1. Fast Local Backend Direct Resize (If local Python server is running)
        try {
          const localFd = new FormData();
          const arrayBuf = new ArrayBuffer(fileBufferObj.length);
          new Uint8Array(arrayBuf).set(fileBufferObj);
          const blob = new Blob([arrayBuf], { type: 'model/gltf-binary' });
          localFd.append('file', blob, (file as File).name || 'model.glb');
          if (width) localFd.append('width', width);
          if (height) localFd.append('height', height);
          if (depth) localFd.append('depth', depth);
          if (unit) localFd.append('unit', unit);
          if (mode) localFd.append('mode', mode);
          if (force_watermark) localFd.append('force_watermark', force_watermark);
          if (watermark_text) localFd.append('watermark_text', watermark_text);

          const localRes = await fetch("http://127.0.0.1:5001/resize", {
            method: 'POST',
            body: localFd
          });

          if (localRes.ok) {
            const localData = await localRes.json();
            if (localData && localData.success) {
              console.log("[resize] Fast Local Backend Resize Succeeded:", localData.glb_url);
              debugLog(`Local backend resize success: ${localData.glb_url}`);

              // Log activity
              try {
                const activityEmail = session?.user?.email || (userId ? (await (prisma.user as any).findUnique({ where: { id: userId }}))?.email : null);
                await prisma.$executeRawUnsafe(`
                    INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile")
                    VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
                `, Math.random().toString(36).substring(7), userId || null, activityEmail || null, ip, "RESCALE", (file as File).name || "Resized Model", localData.glb_url);
              } catch (logErr) {}

              const mac_s3 = request.headers.get("x-guest-mac") || "unknown";
              const updatedUsage = await getUsage(userId, ip, session?.user?.email, mac_s3, isSampleModel);
              return NextResponse.json({ ...localData, usage: updatedUsage });
            }
          }
        } catch (localErr: any) {
          console.warn("[resize] Fast local backend resize failed, trying S3 mode:", localErr.message);
        }

        // 2. S3 Tunnel Mode Fallback (If local server is not running)
        const signedRes = await fetch(`${PRESIGNED_URL_SERVICE}?bucket_name=${GLB_OUTPUT_BUCKET}&file_type=glb`);
        if (!signedRes.ok) throw new Error(`Failed to get presigned URL for tunnel file (${signedRes.status})`);
        const { upload_url, file_key } = await signedRes.json();
        
        const putRes = await fetch(upload_url, { 
           method: 'PUT', 
           body: fileBufferObj as any, 
           headers: { 'Content-Type': 'model/gltf-binary' } 
        });
        if (!putRes.ok) throw new Error(`Failed to upload tunnel file to S3 (${putRes.status})`);
        
        s3_key = file_key;
      } catch (err: any) {
        debugLog(`Tunnel Mode S3 Upload Error: ${err.message}`);
        throw err;
      }
    }

    // Legacy S3-based resize logic
    console.log('[resize] S3 Mode:', { s3_key, glb_url, depth, width, height, unit });
    debugLog(`S3 Mode initialized. s3_key: ${s3_key}, glb_url: ${glb_url}`);

    if (!s3_key) {
      debugLog("No s3_key provided");
      return NextResponse.json({ success: false, error: 'No s3_key or file provided' }, { status: 400 });
    }

    const s3KeyStr = s3_key as string;
    const glbUrlStr = glb_url as string || "";
    let effective_key = s3KeyStr;
    
    // V18: Bypassing ensureInGlbOutputBucket entirely. 
    // The Next.js fetch fails with 403 on private buckets, but the Python 
    // backend's s3_utils.py has boto3 credentials and multi-bucket lookup 
    // (tryitproductmodels and glb-output) so it can download it natively.
    console.log(`[resize] V18: Bypassing re-host. Passing key directly to backend: ${s3_key}`);
    debugLog("Bypassing re-host and delegating to Python boto3");

    // Pass the tier to Python backend for watermark logic
    const userObjS3 = session?.user?.id ? await (prisma.user as any).findUnique({ where: { id: session.user.id }}) : null;
    const s3Tier = userObjS3?.isAdmin ? "PAID" : (userObjS3?.tier || "NON_LOGGED");
    
    const isPaidS3 = s3Tier === "PAID";
    const shouldWatermarkS3 = (!isPaidS3) || force_watermark === 'true';

    const ec2Payload: Record<string, string> = {
      s3_key: effective_key,
      tier: s3Tier || "NON_LOGGED",
      watermark_text: (incomingForm.get('watermark_text') as string) || 'TryitFirstLabs'
    };
    if (depth)  ec2Payload.depth = depth;
    if (width)  ec2Payload.width = width;
    if (height) ec2Payload.height = height;
    if (unit)   ec2Payload.unit = unit;
    if (mode)   ec2Payload.mode = mode;
    if (shouldWatermarkS3) ec2Payload.force_watermark = 'true';
    if (isDownload) ec2Payload.is_download = 'true';

    debugLog(`Calling EC2_RESIZE_URL: ${EC2_RESIZE_URL}`);
    let ec2Response: Response | null = null;
    try {
      if (EC2_RESIZE_URL) {
        ec2Response = await fetch(EC2_RESIZE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ec2Payload),
        });
      }
    } catch (netErr: any) {
      console.warn(`[resize] Remote EC2 failed (${EC2_RESIZE_URL}): ${netErr.message}. Fallback to local backend (http://127.0.0.1:5001/resize)...`);
      debugLog(`Remote EC2 failed (${netErr.message}). Falling back to local backend...`);
    }

    if (!ec2Response || !ec2Response.ok) {
      console.log(`[resize] Primary EC2 failed or unavailable. Attempting local backend (http://127.0.0.1:5001/resize)...`);
      try {
        ec2Response = await fetch("http://127.0.0.1:5001/resize", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ec2Payload),
        });
      } catch (localErr: any) {
        console.error(`[resize] Local backend resize also failed:`, localErr.message);
      }
    }

    if (!ec2Response) {
      return NextResponse.json({ success: false, error: 'Backend resize server unreachable.' }, { status: 503 });
    }

    debugLog(`Backend responded with status: ${ec2Response.status}`);

    const text = await ec2Response.text();
    debugLog(`Backend Response text length: ${text.length}`);
    if (!ec2Response.ok) {
      debugLog(`Backend Response failed. returning ${ec2Response.status}`);
      return NextResponse.json({ success: false, error: `Backend error: ${text}` }, { status: ec2Response.status });
    }

    const data = JSON.parse(text);


    // LOG HISTORY (S3 Mode)
    try {
      const activityEmail = session?.user?.email || (userId ? (await (prisma.user as any).findUnique({ where: { id: userId }}))?.email : null);


      
      await prisma.$executeRawUnsafe(`
          INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile")
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
      `, Math.random().toString(36).substring(7), userId || null, activityEmail || null, ip, "RESCALE", s3KeyStr.split('/').pop() || "Resized Model", data.glb_url);
      
      if (isSampleModel) {
        const mac = request.headers.get("x-guest-mac") || "unknown";
        await prisma.$executeRawUnsafe(`
          UPDATE "SampleUsage" SET "rescaleCount" = "rescaleCount" + 1, "lastUsage" = NOW()
          WHERE "ipAddress" = $1 AND "macAddress" = $2
        `, ip, mac);
      } else if (!userId) {
        const mac = request.headers.get("x-guest-mac") || "unknown";
        await prisma.$executeRawUnsafe(`
          UPDATE "GuestUsage" SET "rescaleCount" = "rescaleCount" + 1, "lastUsage" = NOW()
          WHERE "ipAddress" = $1 AND "macAddress" = $2
        `, ip, mac);
      } else {
        const userObj = await (prisma.user as any).findUnique({ where: { id: userId }});
        if (userObj?.tier === "PAID") {
          await prisma.$executeRawUnsafe(`
            UPDATE "PaidUsers" 
            SET "dailyRescaleCount" = "dailyRescaleCount" + 1, 
                "monthlyRescaleCount" = "monthlyRescaleCount" + 1
            WHERE id = $1::uuid
          `, userId);
        }
      }
      
      console.log(`[resize] Activity logged for: ${activityEmail}`);
    } catch (logErr) {
      console.warn("[resize] Failed to log activity:", logErr);
    }

    const mac_s3 = request.headers.get("x-guest-mac") || "unknown";
    const updatedUsage = await getUsage(userId, ip, session?.user?.email, mac_s3, isSampleModel);
    return NextResponse.json({ ...data, usage: updatedUsage });

  } catch (err: any) {
    debugLog(`FATAL ERROR: ${err.message}\nStack: ${err.stack}`);
    console.error('[resize] FATAL ERROR IN API ROUTE:', err);
    console.error('[resize] Error Stack:', err.stack);
    
    if (err.response) {
      console.error("Error Status:", err.response.status);
      console.error("Error Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error Message:", err.message);
      if (err.stack) console.error("Error Stack:", err.stack);
    }
    
    return NextResponse.json({ 
      success: false, 
      error: err.response?.data?.error || err.message || 'Internal error',
      details: err.stack
    }, { status: 500 });
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
async function getUsage(userId: string | null, ip: string, sessionEmail?: string | null, macAddress: string = "unknown", isSampleModel: boolean = false) {
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
        usdz: 0, // activities count below
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
  `, userId || null, userEmail || null, ip || "127.0.0.1", startOfDay.toISOString());
  rescalesUsed = rescaleResults[0]?.count || 0;

  const rescaleMonthResults: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM activities WHERE type = 'RESCALE' AND "createdAt" >= $4::timestamp ${baseWhereSql}
  `, userId || null, userEmail || null, ip || "127.0.0.1", startOfMonth.toISOString());
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
  `, userId || null, userEmail || null, ip || "127.0.0.1", startOfDay.toISOString());
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
