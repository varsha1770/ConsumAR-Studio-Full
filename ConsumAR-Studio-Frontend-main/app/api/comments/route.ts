import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const comments: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, name, email, image, comment, rating, bio, "createdAt" FROM "Users" WHERE comment IS NOT NULL AND comment != '' ORDER BY "createdAt" DESC LIMIT 10`
    );

    return NextResponse.json({ success: true, comments });
  } catch (error: any) {
    console.error("[comments_get] error:", error);
    return NextResponse.json({ success: false, comments: [] });
  }
}
