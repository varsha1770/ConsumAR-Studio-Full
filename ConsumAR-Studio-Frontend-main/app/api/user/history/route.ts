import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * THE CHRONICLER: Fetches the activity history for the logged-in user.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userEmail = session.user.email;
    const userId = session.user.id;

    // 1. Fetch User Tier (Raw SQL)
    const userResults: any[] = await prisma.$queryRawUnsafe(`SELECT tier FROM "Users" WHERE id = $1::uuid LIMIT 1`, userId);
    const tier = userResults[0]?.tier || "FREE";

    // 2. Fetch Immutable Ledger (Activities) by Email + Workspace Items (History) by UserId
    const [historyItems, activities] = await Promise.all([
      (prisma as any).historyItem.findMany({
        where: { userId: userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.$queryRawUnsafe(`
        SELECT * FROM activities 
        WHERE "userEmail" = $1 OR "userId" = $2::uuid 
        ORDER BY "createdAt" DESC
      `, userEmail, userId)
    ]) as [any[], any[]];

    // 3. Map Activities to match the UI format
    const mappedActivities = activities.map((a: any) => ({
      id: a.id,
      fileName: a.fileName,
      action: a.type, 
      createdAt: a.createdAt,
      glbFile: a.glbFile,
      usdzFile: a.usdzFile,
      downloadCount: a.downloadCount || 0,
      details: "Persistent Activity Record"
    }));

    // 4. Combine and Sort
    const combinedHistory = [...historyItems, ...mappedActivities].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ success: true, history: combinedHistory, tier });
  } catch (error: any) {
    console.error("[history_api] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
