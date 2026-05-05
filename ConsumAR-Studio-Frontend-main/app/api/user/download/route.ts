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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true }
    });
    
    const tier = user?.tier || "FREE";
    const maxDownloads = tier === "PAID" ? 10 : 2;

    let currentDownloads = 0;

    // Check and increment
    if (type === "history") {
      const item = await (prisma as any).historyItem.findUnique({ where: { id } });
      if (!item || item.userId !== session.user.id) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      currentDownloads = item.downloadCount || 0;
      
      if (currentDownloads >= maxDownloads) {
         return NextResponse.json({ success: false, error: `Download limit reached (${maxDownloads} max). Please upgrade to Pro.` }, { status: 403 });
      }

      await (prisma as any).historyItem.update({
        where: { id },
        data: { downloadCount: currentDownloads + 1 }
      });

    } else {
      const activity = await prisma.activity.findUnique({ where: { id } });
      if (!activity || activity.userId !== session.user.id) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      currentDownloads = activity.downloadCount || 0;

      if (currentDownloads >= maxDownloads) {
         return NextResponse.json({ success: false, error: `Download limit reached (${maxDownloads} max). Please upgrade to Pro.` }, { status: 403 });
      }

      await prisma.activity.update({
        where: { id },
        data: { downloadCount: currentDownloads + 1 }
      });
    }

    // Redirect to actual S3 presigned URL or public URL
    return NextResponse.redirect(fileUrl);

  } catch (error: any) {
    console.error("[download_api] Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
