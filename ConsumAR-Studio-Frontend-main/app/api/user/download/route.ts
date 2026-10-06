import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type"); // "history" or "activity"
    const fileUrl = searchParams.get("url");

    if (!id || !fileUrl || !type) {
      return NextResponse.json({ success: false, error: "Missing parameters" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const userResults: any[] = await prisma.$queryRawUnsafe(`SELECT tier FROM "Users" WHERE id = $1::uuid LIMIT 1`, userId);
    const tier = userResults[0]?.tier || "FREE";

    const configResults: any[] = await prisma.$queryRawUnsafe(`SELECT "historyDownloadLimit" FROM "FeatureConfig" WHERE tier = $1::"Tier" LIMIT 1`, tier);
    const userEmailResults: any[] = await prisma.$queryRawUnsafe(`SELECT email FROM "Users" WHERE id = $1::uuid LIMIT 1`, userId);
    const userEmail = userEmailResults[0]?.email;
    
    let limit = configResults[0]?.historyDownloadLimit || (tier === "PAID" ? 10 : 2);
    const isAdmin = userEmail === "janapativarsha6@gmail.com" || userEmail === "ganesh@tryitfirst.in";
    
    if (isAdmin) {
      limit = 999999;
    }

    if (type === "history") {
      const items: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "history_items" WHERE id = $1 LIMIT 1`, id);
      const item = items[0];
      
      if (!item || (!isAdmin && item.userId !== userId)) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }

      // Check tier-specific history download limits
      if (tier === "PAID") {
        let paid: any = await prisma.$queryRawUnsafe(`SELECT "historyDownloadCount" FROM "PaidUsers" WHERE id = $1::uuid LIMIT 1`, userId);
        const count = paid[0]?.historyDownloadCount || 0;
        
        if (count >= limit) {
           return NextResponse.json({ success: false, error: `History download limit reached (${limit}).` }, { status: 403 });
        }
        
        await prisma.$executeRawUnsafe(`UPDATE "PaidUsers" SET "historyDownloadCount" = "historyDownloadCount" + 1 WHERE id = $1::uuid`, userId);
      } else {
        // Free user history limit (Standard downloadCount on historyItem)
        if ((item.downloadCount || 0) >= limit) {
           return NextResponse.json({ success: false, error: `Free history download limit reached (${limit}). Upgrade to Pro!` }, { status: 403 });
        }
      }
      
      await prisma.$executeRawUnsafe(`UPDATE "history_items" SET "downloadCount" = "downloadCount" + 1 WHERE id = $1`, id);

    } else {
      const activityResults: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM activities WHERE id = $1 LIMIT 1`, id);
      const activity = activityResults[0];
      
      if (!activity || (!isAdmin && activity.userId !== userId)) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }

      await prisma.$executeRawUnsafe(`UPDATE activities SET "downloadCount" = "downloadCount" + 1 WHERE id = $1`, id);
    }

    // Proxy the file instead of redirecting
    // This fixes S3 Signature errors and allows local USDZ files to be downloaded from other devices!
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    const fileName = fileUrl.split('/').pop()?.split('?')[0] || 'downloaded_file';
    
    return new NextResponse(response.body as any, {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream"
      }
    });

  } catch (error: any) {
    console.error("[download_api] Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
