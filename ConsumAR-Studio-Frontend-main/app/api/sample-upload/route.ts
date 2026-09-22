import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
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

    // Fetch Sample Config
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
    } else {
      // Seed default
      await prisma.$executeRawUnsafe(`
        INSERT INTO "SampleConfig" ("id", "dailyUploadLimit", "dailyRescaleLimit", "dailyUsdzLimit")
        VALUES (1, 50, 20, 10)
      `);
    }

    if (sampleUsage.uploadCount >= maxUploads) {
      return NextResponse.json({ success: false, error: `Sample models daily upload limit reached (${maxUploads}/day).` }, { status: 403 });
    }

    // Increment upload count
    await prisma.$executeRawUnsafe(`
      UPDATE "SampleUsage" SET "uploadCount" = "uploadCount" + 1, "lastUsage" = NOW()
      WHERE "ipAddress" = $1 AND "macAddress" = $2
    `, ip, mac);

    return NextResponse.json({ 
      success: true,
      usage: {
        uploads: sampleUsage.uploadCount + 1,
        maxUploads,
        rescales: sampleUsage.rescaleCount,
        maxRescales,
        usdz: sampleUsage.usdzCount,
        maxUsdz,
        tier: "SAMPLE"
      }
    });

  } catch (err: any) {
    console.error('[sample-upload] error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || "unknown";
    const mac = request.headers.get("x-guest-mac") || "unknown";

    const sampleResults: any[] = await prisma.$queryRawUnsafe(`
      SELECT * FROM "SampleUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
    `, ip, mac);
    
    let sampleUsage = sampleResults[0];
    const now = new Date();
    if (!sampleUsage || new Date(sampleUsage.expiresAt) < now) {
       sampleUsage = { rescaleCount: 0, uploadCount: 0, usdzCount: 0 };
    }

    // Fetch Sample Config
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

    return NextResponse.json({ 
      success: true,
      usage: {
        uploads: sampleUsage.uploadCount,
        maxUploads,
        rescales: sampleUsage.rescaleCount,
        maxRescales,
        usdz: sampleUsage.usdzCount,
        maxUsdz,
        tier: "SAMPLE"
      }
    });
  } catch (err: any) {
    console.error('[sample-upload GET] error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

