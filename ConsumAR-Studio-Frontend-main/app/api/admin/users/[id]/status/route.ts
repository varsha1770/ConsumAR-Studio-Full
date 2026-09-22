import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/admin-jwt";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify admin JWT
  const admin = await verifyAdminRequest(req.headers.get("authorization"));
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: targetUserId } = await params;

  try {
    const { status, admin_note } = await req.json();

    // Validate status value
    const validStatuses = ["active", "suspended", "permanently_banned"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Require a note when suspending or banning
    if (status !== "active" && !admin_note?.trim()) {
      return NextResponse.json(
        { error: "Admin note is required when suspending or banning a user" },
        { status: 400 }
      );
    }

    // Self-ban guard — admin cannot suspend/ban their own account
    if (targetUserId === admin.sub && status !== "active") {
      return NextResponse.json(
        { error: "You cannot suspend or ban your own account" },
        { status: 400 }
      );
    }

    // Check target user exists
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the user's status in the DB
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        status,
        adminNote: admin_note?.trim() ?? "",
        statusChangedAt: new Date(),
        statusChangedBy: admin.email,
      } as any,
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        isAdmin: true,
        createdAt: true,
        lastLogin: true,
        status: true,
        adminNote: true,
        statusChangedAt: true,
        statusChangedBy: true,
        isSuperAdmin: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name ?? updated.email.split("@")[0],
      tier: updated.tier,
      isAdmin: updated.isAdmin,
      is_super_admin: (updated as any).isSuperAdmin ?? false,
      status: (updated as any).status ?? "active",
      admin_note: (updated as any).adminNote ?? "",
      status_changed_at: (updated as any).statusChangedAt ?? null,
      status_changed_by: (updated as any).statusChangedBy ?? null,
      created_at: updated.createdAt,
      lastLogin: updated.lastLogin,
    });
  } catch (error) {
    console.error(`Admin PATCH /users/${targetUserId}/status error:`, error);
    return NextResponse.json({ error: "Failed to update user status" }, { status: 500 });
  }
}
