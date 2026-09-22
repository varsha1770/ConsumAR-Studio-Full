import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("remote-addr") || "unknown";
    
    // Calculate start of today and month
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    let tier = "NON_LOGGED";
    let rescalesUsed = 0;
    let rescalesUsedMonth = 0;
    let usdzUsed = 0;
    let usdzUsedMonth = 0;
    let uploadsUsed = 0;
    let uploadsUsedMonth = 0;
    let generate3dUsed = 0;
    let generate3dUsedMonth = 0;
    let data: any = {};
    
    // Limits (Now dynamic from FeatureConfig and GenConfig via Raw SQL)
    const allConfigs: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "FeatureConfig"`);
    const genConfigs: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "GenConfig"`);

    const configMap = allConfigs.reduce((acc: any, c: any) => {
      acc[c.tier] = c;
      return acc;
    }, {});

    const genConfigMap = genConfigs.reduce((acc: any, c: any) => {
      acc[c.tier] = c;
      return acc;
    }, {});

    const getConfig = (t: string) => configMap[t] || configMap['FREE'];
    const getGenConfig = (t: string) => genConfigMap[t] || genConfigMap['FREE'] || { dailyLimit: 5 };

    let currentConfig = getConfig('NON_LOGGED');
    let currentGenConfig = getGenConfig('NON_LOGGED');
    let maxRescales = currentConfig.dailyRescaleLimit; 
    let maxRescalesMonth = currentConfig.monthlyRescaleLimit;
    let maxUsdz = currentConfig.dailyUsdzLimit; 
    let maxUsdzMonth = currentConfig.monthlyUsdzLimit;
    let maxUploads = currentConfig.dailyUploadLimit; 
    let maxUploadsMonth = 999999;
    let maxGenerate3d = currentGenConfig.dailyLimit;
    
    const userEmail = session?.user?.email || null;
    const userId = (session?.user as any)?.id || null;
    const todayStr = startOfDay.toISOString();
    const monthStr = startOfMonth.toISOString();

    // V176: Robust IST Date Formatter
    const toIST = (date: any) => {
      if (!date) return null;
      try {
        return new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }).format(new Date(date));
      } catch(e) { return String(date); }
    };

    if (userId || userEmail) {
      // Authenticated User Logic
      const results: any[] = await prisma.$queryRawUnsafe(`
        WITH user_data AS (
          SELECT u.id, u.tier, u."isAdmin", p."dailyUploadCount", p."dailyRescaleCount", p."monthlyRescaleCount", p."historyDownloadCount", p."validityTimer"
          FROM "Users" u
          LEFT JOIN "PaidUsers" p ON u.id = p.id
          WHERE u.id = $1::uuid OR u.email = $2 
          LIMIT 1
        ),
        counts AS (
          SELECT 
            COUNT(*) FILTER (WHERE type = 'RESCALE' AND "createdAt" >= $4::timestamp) as rescales,
            COUNT(*) FILTER (WHERE type = 'RESCALE' AND "createdAt" >= $5::timestamp) as rescales_month,
            COUNT(*) FILTER (WHERE type = 'USDZ_CONVERT' AND "createdAt" >= $4::timestamp) as usdz,
            COUNT(*) FILTER (WHERE type = 'USDZ_CONVERT' AND "createdAt" >= $5::timestamp) as usdz_month,
            COUNT(*) FILTER (WHERE type = 'UPLOAD' AND "createdAt" >= $4::timestamp) as uploads,
            COUNT(*) FILTER (WHERE type = 'UPLOAD' AND "createdAt" >= $5::timestamp) as uploads_month,
            COUNT(*) FILTER (WHERE type = 'GENERATE_3D' AND "createdAt" >= $4::timestamp) as generate3d,
            COUNT(*) FILTER (WHERE type = 'GENERATE_3D' AND "createdAt" >= $5::timestamp) as generate3d_month
          FROM activities
          WHERE (
            "userId" = $1::uuid OR 
            "userEmail" = $2
          )
          AND "createdAt" >= $5::timestamp
        )
        SELECT * FROM user_data, counts;
      `, userId, userEmail, ip, todayStr, monthStr);
      
      data = results[0] || {};
      tier = data.tier || "FREE";
      currentConfig = getConfig(tier);
      currentGenConfig = getGenConfig(tier);

      if (data.isAdmin || userEmail === "janapativarsha6@gmail.com") {
        return NextResponse.json({
          success: true,
          tier: "SUPER_ADMIN",
          usage: { 
            rescales: 0, maxRescales: 999999, rescalesMonth: 0, maxRescalesMonth: 999999,
            usdz: 0, maxUsdz: 999999, usdzMonth: 0, maxUsdzMonth: 999999,
            uploads: 0, maxUploads: 999999, historyDownloads: 0, maxHistoryDownloads: 999999,
            generate3d: 0, maxGenerate3d: 999999,
            lastUsage: "now", expiresAt: "never"
          }
        });
      }

      rescalesUsed = Number(data.rescales) || 0;
      rescalesUsedMonth = Number(data.rescales_month) || 0;
      usdzUsed = Number(data.usdz) || 0;
      usdzUsedMonth = Number(data.usdz_month) || 0;
      uploadsUsed = Number(data.uploads) || 0;
      uploadsUsedMonth = Number(data.uploads_month) || 0;
      generate3dUsed = Number(data.generate3d) || 0;
      generate3dUsedMonth = Number(data.generate3d_month) || 0;

      return NextResponse.json({
        success: true,
        tier,
        usage: {
          rescales: rescalesUsed,
          maxRescales: currentConfig.dailyRescaleLimit,
          rescalesMonth: rescalesUsedMonth,
          maxRescalesMonth: currentConfig.monthlyRescaleLimit,
          usdz: usdzUsed,
          maxUsdz: currentConfig.dailyUsdzLimit,
          usdzMonth: usdzUsedMonth,
          maxUsdzMonth: currentConfig.monthlyUsdzLimit,
          uploads: uploadsUsed,
          maxUploads: currentConfig.dailyUploadLimit,
          generate3d: generate3dUsed,
          maxGenerate3d: currentGenConfig.dailyLimit,
          historyDownloads: Number(data.historyDownloadCount) || 0,
          maxHistoryDownloads: currentConfig.historyDownloadLimit,
          lastUsage: toIST(new Date()), // Logged users lastUsage is 'now'
          expiresAt: toIST(data.validityTimer)
        }
      });

    } else {
      // Guest Logic
      const mac = req.headers.get("x-guest-mac") || `guest_${ip}`;
      const guestResults: any[] = await prisma.$queryRawUnsafe(`
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

          rescalesUsed = 0; usdzUsed = 0; uploadsUsed = 0; generate3dUsed = 0;
        } else {
          rescalesUsed = guest.rescaleCount;
          usdzUsed = guest.usdzCount;
          uploadsUsed = guest.uploadCount;
          generate3dUsed = guest.generate3dCount || 0;
        }

        return NextResponse.json({
          success: true,
          tier: "NON_LOGGED",
          usage: {
            rescales: rescalesUsed,
            maxRescales: currentConfig.dailyRescaleLimit,
            usdz: usdzUsed,
            maxUsdz: currentConfig.dailyUsdzLimit,
            uploads: uploadsUsed,
            maxUploads: currentConfig.dailyUploadLimit,
            generate3d: generate3dUsed,
            maxGenerate3d: currentGenConfig.dailyLimit,
            lastUsage: toIST(guest.lastUsage),
            expiresAt: toIST(guest.expiresAt)
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      tier: "NON_LOGGED",
      usage: { 
        rescales: 0, maxRescales: currentConfig.dailyRescaleLimit, 
        usdz: 0, maxUsdz: currentConfig.dailyUsdzLimit,
        uploads: 0, maxUploads: 10, 
        generate3d: 0, maxGenerate3d: currentGenConfig.dailyLimit 
      }
    });

  } catch (error: any) {
    console.error("[Limits API] Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
