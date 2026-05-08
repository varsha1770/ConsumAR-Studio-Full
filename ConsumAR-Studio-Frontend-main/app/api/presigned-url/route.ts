import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const LAMBDA_PRESIGNED_URL = process.env.PRESIGNED_URL_SERVICE!;
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bucket_name = searchParams.get('bucket_name');
  const file_type = searchParams.get('file_type');

  if (!bucket_name || !file_type) {
    return NextResponse.json(
      { error: 'Missing bucket_name or file_type' },
      { status: 400 }
    );
  }

  // --- Upload Limit Check ---
  const session = await getServerSession(authOptions);
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  let maxUploads = 10; 
  let userId = null;
  let prefix = "";
  let uploadsUsed = 0;

  if (session?.user?.id) {
    userId = session.user.id;
    const user = await (prisma.user as any).findUnique({ where: { id: userId }});
    const tier = user?.tier || "FREE";
    const isAdmin = user?.isAdmin || tier === "SUPER_ADMIN";

    if (isAdmin) {
      maxUploads = 999999;
      prefix = `admin/${userId}/`;
      uploadsUsed = 0;
    } else if (tier === "PAID") {
      maxUploads = 100;
      prefix = `paid/${userId}/`;
      
      // V4: Paid User Logic with Validity Timer
      let paid: any = await prisma.$queryRawUnsafe(`SELECT * FROM "PaidUsers" WHERE id = $1::uuid LIMIT 1`, userId);
      paid = paid[0];
      
      if (paid) {
        if (new Date(paid.validityTimer) < new Date()) {
          // Reset
          await prisma.$executeRawUnsafe(`
            UPDATE "PaidUsers" SET "dailyUploadCount" = 0, "dailyRescaleCount" = 0, "validityTimer" = $1::timestamp
            WHERE id = $2::uuid
          `, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), userId);
          uploadsUsed = 0;
        } else {
          uploadsUsed = paid.dailyUploadCount;
        }
      } else {
        // Create PaidUser entry if missing
        await prisma.$executeRawUnsafe(`
          INSERT INTO "PaidUsers" ("id", "validityTimer")
          VALUES ($1::uuid, $2::timestamp)
        `, userId, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
        uploadsUsed = 0;
      }

    } else if (tier === "FREE") {
      maxUploads = 10; 
      prefix = `free/${userId}/`;
      uploadsUsed = await (prisma.activity as any).count({
        where: {
          userId,
          type: "UPLOAD",
          createdAt: { gte: startOfDay }
        }
      });
    }

  } else {
    // Guest Usage Check
    const mac = request.headers.get("x-guest-mac") || new URL(request.url).searchParams.get("mac") || "unknown";
    let guest: any = await prisma.$queryRawUnsafe(`
      SELECT * FROM "GuestUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
    `, ip, mac);
    guest = guest[0];

    if (guest) {
      if (new Date(guest.expiresAt) < new Date()) {
        // Reset if expired
        await prisma.$executeRawUnsafe(`
          UPDATE "GuestUsage" SET "uploadCount" = 0, "rescaleCount" = 0, "usdzCount" = 0, 
          "expiresAt" = $1::timestamp, "lastUsage" = NOW() WHERE "id" = $2::uuid
        `, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), guest.id);
        uploadsUsed = 0;
      } else {
        uploadsUsed = guest.uploadCount;
      }
    } else {
      // Create guest
      await prisma.$executeRawUnsafe(`
        INSERT INTO "GuestUsage" ("id", "ipAddress", "macAddress", "expiresAt", "lastUsage")
        VALUES ($1::uuid, $2, $3, $4::timestamp, NOW())
      `, crypto.randomUUID(), ip, mac, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      uploadsUsed = 0;
    }
  }

  if (uploadsUsed >= maxUploads) {
    return NextResponse.json({ error: "Daily upload limit reached. Please upgrade or sign in." }, { status: 403 });
  }
  // --------------------------

  try {
    const lambdaUrl = new URL(LAMBDA_PRESIGNED_URL);
    lambdaUrl.searchParams.set('bucket_name', bucket_name);
    lambdaUrl.searchParams.set('file_type', file_type);
    if (prefix) {
      lambdaUrl.searchParams.set('prefix', prefix);
    }

    let lambdaRes: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      lambdaRes = await fetch(lambdaUrl.toString(), { cache: 'no-store' });

      if (lambdaRes.ok || !TRANSIENT_STATUSES.has(lambdaRes.status)) {
        break;
      }

      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
      }
    }

    if (!lambdaRes) {
      return NextResponse.json(
        { error: 'Failed to reach presigned URL service' },
        { status: 502 }
      );
    }

    if (!lambdaRes.ok) {
      const text = await lambdaRes.text();
      return NextResponse.json(
        { error: `Lambda error (${lambdaRes.status}): ${text}` },
        { status: lambdaRes.status }
      );
    }

    const data = await lambdaRes.json();

    // Log the successful upload initiation
    try {
      await (prisma.activity as any).create({
        data: {
          userId: userId,
          ipAddress: ip,
          type: "UPLOAD",
          fileName: data.file_key || "Uploaded Model",
          glbFile: data.upload_url, // Keep track of the destination
        }
      });

      if (!userId) {
        const mac = request.headers.get("x-guest-mac") || new URL(request.url).searchParams.get("mac") || "unknown";
        await prisma.$executeRawUnsafe(`
          UPDATE "GuestUsage" SET "uploadCount" = "uploadCount" + 1, "lastUsage" = NOW()
          WHERE "ipAddress" = $1 AND "macAddress" = $2
        `, ip, mac);
      } else {
        const userObj = await (prisma.user as any).findUnique({ where: { id: userId }});
        if (userObj?.tier === "PAID") {
          await prisma.$executeRawUnsafe(`
            UPDATE "PaidUsers" SET "dailyUploadCount" = "dailyUploadCount" + 1 WHERE id = $1::uuid
          `, userId);
        }
      }
    } catch (logErr) {
      console.error("[presigned-url] Failed to log upload activity:", logErr);
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[presigned-url] error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to get presigned URL' },
      { status: 500 }
    );
  }
}
