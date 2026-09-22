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
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        isAdmin: true,
        createdAt: true,
        lastLogin: true,
        // Admin discipline fields
        status: true,
        adminNote: true,
        statusChangedAt: true,
        statusChangedBy: true,
        isSuperAdmin: true,
      },
    });

    // Normalise for the frontend
    const result = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? u.email.split("@")[0],
      tier: u.tier,
      is_super_admin: u.isSuperAdmin ?? false,
      isAdmin: u.isAdmin,
      status: (u as any).status ?? "active",
      admin_note: (u as any).adminNote ?? "",
      status_changed_at: (u as any).statusChangedAt ?? null,
      status_changed_by: (u as any).statusChangedBy ?? null,
      created_at: u.createdAt,
      lastLogin: u.lastLogin,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin GET /users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
