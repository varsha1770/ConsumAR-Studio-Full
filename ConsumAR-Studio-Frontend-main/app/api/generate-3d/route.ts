import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const EC2_URL = process.env.EC2_GENERATE_URL;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
    const mac = request.headers.get("x-guest-mac") || `guest_${ip}`;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let isGuest = !session?.user?.email;
    let userId = (session?.user as any)?.id || null;
    let guestId = null;

    if (!isGuest) {
      const user: any = await prisma.$queryRawUnsafe(`SELECT tier, "isAdmin" FROM "Users" WHERE id = $1::uuid LIMIT 1`, userId);
      const tier = user?.[0]?.tier || "FREE";
      const isAdmin = user?.[0]?.isAdmin || tier === "SUPER_ADMIN" || session?.user?.email === "janapativarsha6@gmail.com";

      if (!isAdmin) {
        const config: any = await prisma.$queryRawUnsafe(`SELECT "dailyLimit" FROM "GenConfig" WHERE tier = $1::"Tier" LIMIT 1`, tier);
        const limit = config?.[0]?.dailyLimit || 5;

        const countQuery: any = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as c FROM activities 
          WHERE "userId" = $1::uuid AND type = 'GENERATE_3D' AND "createdAt" >= $2::timestamp
        `, userId, startOfDay.toISOString());
        
        const count = Number(countQuery[0].c);
        if (count >= limit) {
          return NextResponse.json({ success: false, error: 'Daily 3D Generation limit reached.' }, { status: 403 });
        }
      }
    } else {
      let guestResults: any = await prisma.$queryRawUnsafe(`
        SELECT * FROM "GuestUsage" WHERE "macAddress" = $1 OR "ipAddress" = $2 LIMIT 1
      `, mac, ip);

      if (guestResults.length > 0) {
        const guest = guestResults[0];
        const now = new Date();
        const expiresAt = new Date(guest.expiresAt);

        if (expiresAt < now) {
          const nextExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await prisma.$executeRawUnsafe(`
            UPDATE "GuestUsage" SET "rescaleCount" = 0, "uploadCount" = 0, "usdzCount" = 0, "generate3dCount" = 0,
            "expiresAt" = $1::timestamp, "lastUsage" = NOW() WHERE "id" = $2::uuid
          `, nextExpiry.toISOString(), guest.id);
        } else {
          const guestConfig: any = await prisma.$queryRawUnsafe(`SELECT "dailyLimit" FROM "GenConfig" WHERE tier = 'NON_LOGGED' LIMIT 1`);
          const guestLimit = guestConfig?.[0]?.dailyLimit || 2;
          if ((guest.generate3dCount || 0) >= guestLimit) {
            return NextResponse.json({ success: false, error: 'Guest daily 3D Generation limit reached. Please log in.' }, { status: 403 });
          }
        }
        guestId = guest.id;
      } else {
        const nextExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.$executeRawUnsafe(`
          INSERT INTO "GuestUsage" ("id", "ipAddress", "macAddress", "rescaleCount", "uploadCount", "usdzCount", "generate3dCount", "lastUsage", "expiresAt", "createdAt")
          VALUES (gen_random_uuid(), $1, $2, 0, 0, 0, 0, NOW(), $3::timestamp, NOW())
        `, ip, mac, nextExpiry.toISOString());

        let newGuest: any = await prisma.$queryRawUnsafe(`
          SELECT id FROM "GuestUsage" WHERE "macAddress" = $1 OR "ipAddress" = $2 LIMIT 1
        `, mac, ip);
        guestId = newGuest[0]?.id;
      }
    }

    const incomingForm = await request.formData();
    const files = incomingForm.getAll('images');

    if (!files.length) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }

    const ec2Form = new FormData();
    for (const file of files) {
      const f = file as File;
      const arrayBuf = await f.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: f.type || 'image/jpeg' });
      ec2Form.append('images', blob, f.name || 'upload.jpg');
    }

    const controller = new AbortController();
    const onClientAbort = () => controller.abort();
    request.signal.addEventListener('abort', onClientAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 110_000);

    let ec2Response;
    try {
      ec2Response = await fetch(EC2_URL!, {
        method: 'POST',
        body: ec2Form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', onClientAbort);
    }

    const text = await ec2Response.text();

    if (!ec2Response.ok) {
      return NextResponse.json(
        { success: false, error: `EC2 error (${ec2Response.status}): ${text}` },
        { status: ec2Response.status }
      );
    }

    const data = JSON.parse(text);

    try {
      if (!isGuest && userId) {
        await (prisma as any).historyItem.create({
          data: {
            userId: userId,
            fileName: data.glb_url?.split('/').pop() || "Generated Model",
            action: "UPLOAD",
            glbFile: data.glb_url,
          }
        });
        
        await prisma.$executeRawUnsafe(`
          INSERT INTO activities ("id", "userId", "type", "fileName", "createdAt", "downloadCount", "ipAddress", "userEmail")
          VALUES (gen_random_uuid(), $1::uuid, 'GENERATE_3D', $2, NOW(), 0, $3, $4)
        `, userId, "Generated from Images", ip, session?.user?.email || null);
        
      } else if (guestId) {
        await prisma.$executeRawUnsafe(`
          UPDATE "GuestUsage" SET "generate3dCount" = COALESCE("generate3dCount", 0) + 1, "lastUsage" = NOW()
          WHERE id = $1::uuid
        `, guestId);
      }
    } catch (logErr) {
      console.warn("[generate-3d] Failed to log history:", logErr);
    }

    return NextResponse.json(data);

  } catch (err: any) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }

    console.error('[generate-3d] error:', err);

    if (err.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Generation timed out. Try fewer/smaller images.' },
        { status: 504 }
      );
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { success: false, error: 'Cannot reach EC2. Is the server running?' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
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
