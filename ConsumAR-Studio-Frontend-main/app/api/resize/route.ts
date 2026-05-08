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

const EC2_RESIZE_URL = "http://127.0.0.1:5002/resize";
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

      if (user?.isAdmin) {
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
    const isActuallyBlocked = !userId && !isAutoWatermark && (
      (maxRescales !== 999999 && maxRescales > 0 && rescalesUsed >= maxRescales) || 
      (maxRescalesMonth !== 999999 && maxRescalesMonth > 0 && rescalesUsedMonth >= maxRescalesMonth)
    );

    if (isActuallyBlocked) {
      const errorMsg = rescalesUsedMonth >= maxRescalesMonth 
        ? "Monthly limit reached. Upgrade to Pro for unlimited."
        : "Daily limit reached. Please upgrade to Pro. (Note: Account wipes do not reset daily limits)";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 403 });
    }

    const isDownload = incomingForm.get('is_download') === 'true';
    const force_watermark = incomingForm.get('force_watermark') as string | null;
    const watermark_text = incomingForm.get('watermark_text') as string | null;

    const file = incomingForm.get('file') as File | null;
    const depth = incomingForm.get('depth') as string | null;
    const width = incomingForm.get('width') as string | null;
    const height = incomingForm.get('height') as string | null;
    const unit = incomingForm.get('unit') as string | null;

    if (file) {

      console.log('[resize] Tunnel Mode: Forwarding file to Python backend');
      
      const fileBuffer = await file.arrayBuffer();
      const fileBlob = new Blob([fileBuffer], { type: file.type || 'application/octet-stream' });
      
      const pythonForm = new FormData();
      pythonForm.append('file', fileBlob, file.name || 'model.glb');
      if (width) pythonForm.append('width', width);
      if (height) pythonForm.append('height', height);
      if (depth) pythonForm.append('depth', depth);
      pythonForm.append('unit', unit || 'm');
      
      const userObj = session?.user?.id ? await (prisma.user as any).findUnique({ where: { id: session.user.id }}) : null;
      const currentTier = userObj?.isAdmin ? "PAID" : (userObj?.tier || "NON_LOGGED");
      
      const isPaid = currentTier === "PAID";
      // Mandatory for Guest/Free on download. Clean preview for everyone.
      const shouldWatermark = (!isPaid && isDownload) || force_watermark === 'true';

      pythonForm.append('tier', currentTier);
      if (shouldWatermark) pythonForm.append('force_watermark', 'true');
      if (isDownload) pythonForm.append('is_download', 'true');
      pythonForm.append('watermark_text', watermark_text || 'TryitFirstLabs');

      // Forward to Python backend (bypass browser CORS/404)
      debugLog(`Calling Python Backend at: ${EC2_RESIZE_URL}`);
      
      try {
        const pythonRes = await axios.post(EC2_RESIZE_URL!, pythonForm);
        const data = pythonRes.data;

        // LOG ACTIVITY (Tunnel Mode)
        if (!isAutoWatermark) {
          try {
            const activityEmail = session?.user?.email || (userId ? (await (prisma.user as any).findUnique({ where: { id: userId }}))?.email : null);
            
            await prisma.$executeRawUnsafe(`
              INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile")
              VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
            `, Math.random().toString(36).substring(7), userId || null, activityEmail || null, ip, "RESCALE", file.name || "model.glb", data.glb_url);
            
            if (!userId) {
              const mac = request.headers.get("x-guest-mac") || "unknown";
              await prisma.$executeRawUnsafe(`
                UPDATE "GuestUsage" SET "rescaleCount" = "rescaleCount" + 1, "lastUsage" = NOW()
                WHERE "ipAddress" = $1 AND "macAddress" = $2
              `, ip, mac);
            } else {
              // Increment Paid User counts if applicable
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

            console.log(`[resize][${requestId}] Tunnel Mode Activity logged for: ${activityEmail}`);
          } catch (logErr) {
            console.warn("[resize] Failed to log activity in tunnel mode:", logErr);
          }
        }

        const mac = request.headers.get("x-guest-mac") || "unknown";
        const updatedUsage = await getUsage(userId, ip, session?.user?.email, mac);
        return NextResponse.json({ ...data, usage: updatedUsage });
      } catch (err: any) {
        debugLog(`Tunnel Mode Backend Error: ${err.message}`);
        throw err;
      }
    }

    // Legacy S3-based resize logic
    const s3_key = incomingForm.get('s3_key') as string | null;
    const glb_url = incomingForm.get('glb_url') as string | null;

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

    const ec2Form = new FormData();
    ec2Form.append('s3_key', effective_key);
    if (depth)  ec2Form.append('depth',  depth);
    if (width)  ec2Form.append('width',  width);
    if (height) ec2Form.append('height', height);
    if (unit)   ec2Form.append('unit',   unit);
    
    // Pass the tier to Python backend for watermark logic
    const userObjS3 = session?.user?.id ? await (prisma.user as any).findUnique({ where: { id: session.user.id }}) : null;
    const s3Tier = userObjS3?.isAdmin ? "PAID" : (userObjS3?.tier || "NON_LOGGED");
    
    const isPaidS3 = s3Tier === "PAID";
    const shouldWatermarkS3 = (!isPaidS3 && isDownload) || force_watermark === 'true';

    ec2Form.append('tier', s3Tier);
    if (shouldWatermarkS3) ec2Form.append('force_watermark', 'true');
    if (isDownload) ec2Form.append('is_download', 'true');
    ec2Form.append('watermark_text', (incomingForm.get('watermark_text') as string) || 'TryitFirstLabs');

    debugLog(`Calling EC2_RESIZE_URL: ${EC2_RESIZE_URL}`);
    const ec2Response = await fetch(EC2_RESIZE_URL!, {
      method: 'POST',
      body: ec2Form,
    });
    debugLog(`EC2_RESIZE_URL responded with status: ${ec2Response.status}`);

    const text = await ec2Response.text();
    debugLog(`EC2 Response text length: ${text.length}`);
    if (!ec2Response.ok) {
      debugLog(`EC2 Response failed. returning 500`);
      return NextResponse.json({ success: false, error: `Backend error: ${text}` }, { status: ec2Response.status });
    }

    const data = JSON.parse(text);


    // LOG HISTORY (S3 Mode)
    try {
      const activityEmail = session?.user?.email || (userId ? (await (prisma.user as any).findUnique({ where: { id: userId }}))?.email : null);

      if (userId) {
        await (prisma as any).historyItem.create({
          data: {
            userId: userId,
            fileName: s3KeyStr.split('/').pop() || "Resized Model",
            action: "RESIZE",
            details: JSON.stringify({ width, height, depth, unit }),
            glbFile: data.glb_url,
          }
        });
      }
      
      await prisma.$executeRawUnsafe(`
          INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile")
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
      `, Math.random().toString(36).substring(7), userId || null, activityEmail || null, ip, "RESCALE", s3KeyStr.split('/').pop() || "Resized Model", data.glb_url);
      
      if (!userId) {
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
    const updatedUsage = await getUsage(userId, ip, session?.user?.email, mac_s3);
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
async function getUsage(userId: string | null, ip: string, sessionEmail?: string | null, macAddress: string = "unknown") {
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
      SELECT * FROM "GuestUsage" WHERE "ipAddress" = $3 AND "macAddress" = $4 LIMIT 1
    `, null, null, ip, macAddress);
    
    if (guest[0]) {
      const g = guest[0];
      return {
        rescales: g.rescaleCount, maxRescales,
        rescalesMonth: g.rescaleCount, maxRescalesMonth,
        usdz: g.usdzCount, maxUsdz,
        usdzMonth: g.usdzCount, maxUsdzMonth,
        uploads: g.uploadCount, maxUploads
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
