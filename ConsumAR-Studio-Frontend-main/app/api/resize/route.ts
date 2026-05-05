import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
  try {
    const session = await getServerSession(authOptions);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    let maxRescales = 2; // Default NON_LOGGED
    let maxRescalesMonth = 999999;
    let userId = null;
    
    if (session?.user?.id) {
      userId = session.user.id;
      const user = await (prisma.user as any).findUnique({ where: { id: userId }});
      const userTier = user?.tier || "FREE";
      
      // V16: Session Email Persistence Lock
      const sessionEmail = session.user.email || user?.email;
      console.log(`[resize] Session user found: ${sessionEmail} (${userId})`);

      if (user?.isAdmin) {
        // SUPER ADMIN BYPASS: Unlimited quota
        maxRescales = 999999;
        maxRescalesMonth = 999999;
      } else if (userTier === "PAID") {
        maxRescales = 20;
        maxRescalesMonth = 999999;
      } else if (userTier === "FREE") {
        maxRescales = 3;
        maxRescalesMonth = 60;
      }
    }

    // V16: Quota Lock - Check usage by BOTH userId and email using Raw SQL to bypass stale client validation
    const userEmail = session?.user?.email || null;
    const todayStr = startOfDay.toISOString();
    const monthStr = startOfMonth.toISOString();

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

    const rescalesUsed = rescaleResults[0]?.count || 0;

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
    }

    if (rescalesUsed >= maxRescales || rescalesUsedMonth >= maxRescalesMonth) {
      const errorMsg = rescalesUsedMonth >= maxRescalesMonth 
        ? "Monthly limit reached. Upgrade to Pro for unlimited."
        : "Daily limit reached. Please upgrade to Pro. (Note: Account wipes do not reset daily limits)";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 403 });
    }

    const incomingForm = await request.formData();
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[resize][${requestId}] Request started`);
    
    // Check if we are receiving a direct file (Tunnel Mode)
    const file = incomingForm.get('file') as File | null;
    const depth = incomingForm.get('depth') as string | null;
    const width = incomingForm.get('width') as string | null;
    const height = incomingForm.get('height') as string | null;
    const unit = incomingForm.get('unit') as string | null;
    const force_watermark = incomingForm.get('force_watermark') as string | null;

    if (file) {
      console.log('[resize] Tunnel Mode: Forwarding file to Python backend');
      
      const pythonForm = new FormData();
      pythonForm.append('file', file);
      if (width) pythonForm.append('width', width);
      if (height) pythonForm.append('height', height);
      if (depth) pythonForm.append('depth', depth);
      pythonForm.append('unit', unit || 'm');
      
      // Calculate tier
      const userObj = session?.user?.id ? await (prisma.user as any).findUnique({ where: { id: session.user.id }}) : null;
      const currentTier = userObj?.isAdmin ? "PAID" : (userObj?.tier || "GUEST");
      
      pythonForm.append('tier', currentTier);
      if (force_watermark) pythonForm.append('force_watermark', force_watermark);

      // Forward to Python backend (bypass browser CORS/404)
      const PYTHON_RESIZE_URL = "http://localhost:5001/resize";
      const pythonRes = await fetch(PYTHON_RESIZE_URL, {
        method: 'POST',
        body: pythonForm,
      });

      if (!pythonRes.ok) {
        const errorText = await pythonRes.text();
        throw new Error(`Python backend error (${pythonRes.status}): ${errorText}`);
      }

      const data = await pythonRes.json();

      // LOG ACTIVITY (Tunnel Mode)
      try {
        const activityEmail = session?.user?.email || (userId ? (await (prisma.user as any).findUnique({ where: { id: userId }}))?.email : null);
        
        await prisma.$executeRawUnsafe(`
          INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile", "createdAt")
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, NOW())
        `, Math.random().toString(36).substring(7), userId || null, activityEmail || null, ip, "RESCALE", file.name || "model.glb", data.glb_url);
        console.log(`[resize][${requestId}] Tunnel Mode Activity logged for: ${activityEmail}`);
      } catch (logErr) {
        console.warn("[resize] Failed to log activity in tunnel mode:", logErr);
      }

      const updatedUsage = await getUsage(userId, ip, session?.user?.email);
      return NextResponse.json({ ...data, usage: updatedUsage });
    }

    // Legacy S3-based resize logic
    const s3_key = incomingForm.get('s3_key') as string | null;
    const glb_url = incomingForm.get('glb_url') as string | null;

    console.log('[resize] S3 Mode:', { s3_key, glb_url, depth, width, height, unit });

    if (!s3_key) {
      return NextResponse.json({ success: false, error: 'No s3_key or file provided' }, { status: 400 });
    }

    const s3KeyStr = s3_key as string;
    const glbUrlStr = glb_url as string || "";
    let effective_key = s3KeyStr;
    const isLocal = s3KeyStr.includes(":\\") || s3KeyStr.includes("storage\\") || glbUrlStr.includes("localhost") || glbUrlStr.includes("127.0.0.1");
    
    if (isLocal) {
        console.log(`[resize] V17: Bypassing re-host for local path: ${s3_key}`);
    } else {
        try {
            effective_key = await ensureInGlbOutputBucket(s3_key, glb_url);
        } catch (reHostErr: any) {
            console.error('[resize] Re-host error:', reHostErr.message);
            return NextResponse.json(
                { success: false, error: `Could not stage file for resize: ${reHostErr.message}` },
                { status: 500 }
            );
        }
    }

    const ec2Form = new FormData();
    ec2Form.append('s3_key', effective_key);
    if (depth)  ec2Form.append('depth',  depth);
    if (width)  ec2Form.append('width',  width);
    if (height) ec2Form.append('height', height);
    if (unit)   ec2Form.append('unit',   unit);
    
    // Pass the tier to Python backend for watermark logic
    const userObjS3 = session?.user?.id ? await (prisma.user as any).findUnique({ where: { id: session.user.id }}) : null;
    const s3Tier = userObjS3?.isAdmin ? "PAID" : (userObjS3?.tier || "GUEST");
    
    ec2Form.append('tier', s3Tier);
    if (force_watermark) ec2Form.append('force_watermark', force_watermark);

    const ec2Response = await fetch(EC2_RESIZE_URL!, {
      method: 'POST',
      body: ec2Form,
    });

    const text = await ec2Response.text();
    if (!ec2Response.ok) {
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
          INSERT INTO activities ("id", "userId", "userEmail", "ipAddress", "type", "fileName", "glbFile", "createdAt")
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, NOW())
      `, Math.random().toString(36).substring(7), userId || null, activityEmail || null, ip, "RESCALE", s3KeyStr.split('/').pop() || "Resized Model", data.glb_url);
      console.log(`[resize] Activity logged for: ${activityEmail}`);
    } catch (logErr) {
      console.warn("[resize] Failed to log activity:", logErr);
    }

    const updatedUsage = await getUsage(userId, ip, session?.user?.email);
    return NextResponse.json({ ...data, usage: updatedUsage });

  } catch (err: any) {
    console.error('[resize] error:', err);
    return NextResponse.json({ 
      success: false, 
      error: err.response?.data?.error || err.message || 'Internal error' 
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
    else if (tier === "PAID") { maxRescales = 20; maxRescalesMonth = 999999; maxUsdz = 999999; maxUsdzMonth = 999999; maxUploads = 999999; }
  }

  const baseWhereSql = `
    AND (
      "userId" = $1::uuid OR 
      "userEmail" = $2 OR 
      ("userId" IS NULL AND "ipAddress" = $3)
    )
  `;

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
