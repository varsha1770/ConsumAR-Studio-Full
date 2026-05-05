import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user as any)?.isAdmin;

    if (!isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized Access" }, { status: 403 });
    }

    // THE MASTER VIEW: Fetch ALL activities from ALL users
    const activities: any[] = await prisma.$queryRawUnsafe(`
      SELECT a.*, u.email as "userEmail" 
      FROM activities a 
      LEFT JOIN "Users" u ON a."userId" = u.id 
      ORDER BY a."createdAt" DESC 
      LIMIT 500
    `);

    return NextResponse.json({ success: true, activities });
  } catch (error: any) {
    console.error("[Admin API] Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
