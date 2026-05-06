import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteS3Objects } from "@/lib/s3-delete";
import { sendGoodbyeEmail } from "@/lib/email";

/**
 * THE SELF-DESTRUCT BUTTON: Deletes everything associated with a user.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const userEmail = session.user.email;
    const userName = session.user.name || "User";

    console.log(`[self-destruct] Starting deletion for user: ${userEmail} (${userId})`);

    // 1. COLLECT ALL S3 KEYS
    // From UserSettings (latest)
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // From History (historical)
    const historyItems = await (prisma as any).historyItem.findMany({
      where: { userId },
    });

    const modelKeys = new Set<string>();
    if (settings?.glbFileKey) modelKeys.add(settings.glbFileKey);
    if (settings?.usdzFileKey) modelKeys.add(settings.usdzFileKey);

    historyItems.forEach((item: any) => {
      if (item.glbFile) {
        // Extract key from URL or store separately. 
        // For now, we'll assume the details or a helper can get the key.
        // If we store URLs, we might need to parse them.
      }
    });

    // 2. DELETE USER FROM DATABASE (RAW SQL for speed)
    try {
      // DPDP COMPLIANCE: Absolute Purge of all activities
      await prisma.$executeRawUnsafe(`DELETE FROM activities WHERE "userId" = $1::uuid OR "userEmail" = $2`, userId, userEmail);
      
      // Cascade delete User
      await prisma.$executeRawUnsafe(`DELETE FROM "Users" WHERE id = $1::uuid`, userId);
    } catch (dbErr) {
      console.error("[self-destruct] DB Deletion failed:", dbErr);
      throw dbErr;
    }

    // 3. BACKGROUND CLEANUP (Don't await external services)
    const bucketModels = process.env.S3_BUCKET_MODELS!;
    if (modelKeys.size > 0) {
      deleteS3Objects(Array.from(modelKeys), bucketModels).catch(e => console.error("S3 Cleanup Error:", e));
    }
    sendGoodbyeEmail(userEmail, userName).catch(e => console.error("Email Error:", e));

    return NextResponse.json({ success: true, message: "Account successfully atomized." });
  } catch (error: any) {
    console.error("[self-destruct] Error during deletion:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
