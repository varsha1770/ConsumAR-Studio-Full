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
    
    // Limits
    let maxRescales = 2; 
    let maxRescalesMonth = 999999;
    let maxUsdz = 1; 
    let maxUsdzMonth = 999999;
    let maxUploads = 10; 
    let maxUploadsMonth = 999999;
    
    const userEmail = session?.user?.email || null;
    const userId = (session?.user as any)?.id || null;
    const todayStr = startOfDay.toISOString();
    const monthStr = startOfMonth.toISOString();

    if (userId || userEmail) {
      // V2: Consolidated Query for authenticated users
      const results: any[] = await prisma.$queryRawUnsafe(`
        WITH user_data AS (
          SELECT tier, "isAdmin" FROM "Users" WHERE id = $1::uuid OR email = $2 LIMIT 1
        ),
        counts AS (
          SELECT 
            COUNT(*) FILTER (WHERE type = 'RESCALE' AND "createdAt" >= $4::timestamp) as rescales,
            COUNT(*) FILTER (WHERE type = 'RESCALE' AND "createdAt" >= $5::timestamp) as rescales_month,
            COUNT(*) FILTER (WHERE type = 'USDZ_CONVERT' AND "createdAt" >= $4::timestamp) as usdz,
            COUNT(*) FILTER (WHERE type = 'USDZ_CONVERT' AND "createdAt" >= $5::timestamp) as usdz_month,
            COUNT(*) FILTER (WHERE type = 'UPLOAD' AND "createdAt" >= $4::timestamp) as uploads,
            COUNT(*) FILTER (WHERE type = 'UPLOAD' AND "createdAt" >= $5::timestamp) as uploads_month
          FROM activities
          WHERE (
            "userId" = $1::uuid OR 
            "userEmail" = $2
          )
          AND "createdAt" >= $5::timestamp
        )
        SELECT * FROM user_data, counts;
      `, userId, userEmail, ip, todayStr, monthStr);
      
      const data = results[0] || {};
      const isAdmin = data.isAdmin || false;
      tier = data.tier || "FREE";

      if (isAdmin) {
        return NextResponse.json({
          success: true,
          tier: "SUPER_ADMIN",
          usage: {
            rescales: 0, maxRescales: 999999, rescalesMonth: 0, maxRescalesMonth: 999999,
            usdz: 0, maxUsdz: 999999, usdzMonth: 0, maxUsdzMonth: 999999,
            uploads: 0, maxUploads: 999999, uploadsMonth: 0, maxUploadsMonth: 999999
          }
        });
      }

      rescalesUsed = parseInt(data.rescales) || 0;
      rescalesUsedMonth = parseInt(data.rescales_month) || 0;
      usdzUsed = parseInt(data.usdz) || 0;
      usdzUsedMonth = parseInt(data.usdz_month) || 0;
      uploadsUsed = parseInt(data.uploads) || 0;
      uploadsUsedMonth = parseInt(data.uploads_month) || 0;
      
      if (tier === "FREE") {
        maxRescales = 3; maxRescalesMonth = 60;
        maxUsdz = 2; maxUsdzMonth = 15;
        maxUploads = 10;
      } else if (tier === "PAID") {
        maxRescales = 20; maxRescalesMonth = 250;
        maxUsdz = 999999; maxUsdzMonth = 999999;
        maxUploads = 100;
      }
    } else {
      // V2: Consolidated Query for guest users
      const guestResults: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) FILTER (WHERE type = 'RESCALE') as rescales,
          COUNT(*) FILTER (WHERE type = 'USDZ_CONVERT') as usdz,
          COUNT(*) FILTER (WHERE type = 'UPLOAD') as uploads
        FROM activities 
        WHERE "createdAt" >= $1::timestamp 
          AND "ipAddress" = $2 
          AND "userId" IS NULL
      `, todayStr, ip);
      
      rescalesUsed = parseInt(guestResults[0]?.rescales) || 0;
      usdzUsed = parseInt(guestResults[0]?.usdz) || 0;
      uploadsUsed = parseInt(guestResults[0]?.uploads) || 0;
    }

    return NextResponse.json({
      success: true,
      tier,
      usage: {
        rescales: rescalesUsed,
        maxRescales,
        rescalesMonth: rescalesUsedMonth,
        maxRescalesMonth,
        usdz: usdzUsed,
        maxUsdz,
        usdzMonth: usdzUsedMonth,
        maxUsdzMonth,
        uploads: uploadsUsed,
        maxUploads,
        uploadsMonth: uploadsUsedMonth,
        maxUploadsMonth
      }
    });

  } catch (error: any) {
    console.error("[Limits API] Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
