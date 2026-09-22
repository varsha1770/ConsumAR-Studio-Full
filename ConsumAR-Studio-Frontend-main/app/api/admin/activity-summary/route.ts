import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/admin-jwt";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(req: NextRequest) {
  // Verify admin JWT
  const admin = await verifyAdminRequest(req.headers.get("authorization"));
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Read from the user_activity_summary table (owned by the main app)
    const summary = await prisma.userActivitySummary.findUnique({
      where: { id: 1 },
    });

    if (!summary) {
      return NextResponse.json(
        { error: "Activity summary not available yet" },
        { status: 503 }
      );
    }

    // Return snake_case keys so the existing Super Admin frontend works unchanged
    return NextResponse.json({
      total_google_logins:              summary.totalGoogleLogins,
      total_magic_link_logins:          summary.totalMagicLinkLogins,
      total_standard_emails:            summary.totalStandardEmails,
      total_paid_users:                 summary.totalPaidUsers,
      total_free_users:                 summary.totalFreeUsers,
      total_guest_users:                summary.totalGuestUsers,
      total_activities:                 summary.totalActivities,
      total_history_items:              summary.totalHistoryItems,
      total_paid_activities:            summary.totalPaidActivities,
      total_magic_activities:           summary.totalMagicActivities,
      total_google_activities:          summary.totalGoogleActivities,
      total_guest_activities:           summary.totalGuestActivities,
      total_standard_email_activities:  summary.totalStandardEmailActivities,
      total_paid_history:               summary.totalPaidHistory,
      total_magic_history:              summary.totalMagicHistory,
      total_google_history:             summary.totalGoogleHistory,
      total_guest_history:              summary.totalGuestHistory,
      total_standard_email_history:     summary.totalStandardEmailHistory,
      last_updated:                     summary.lastUpdated,
    });
  } catch (error) {
    console.error("Admin activity-summary error:", error);
    return NextResponse.json({ error: "Failed to fetch activity summary" }, { status: 500 });
  }
}
