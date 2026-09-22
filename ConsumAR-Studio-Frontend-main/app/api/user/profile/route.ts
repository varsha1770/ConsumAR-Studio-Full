import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          gender: true,
          bio: true,
          comment: true,
          rating: true,
          country: true,
          tier: true,
          createdAt: true,
          lastLogin: true,
        },
      });
    } catch (e) {
      // Fallback for stale Prisma engine DLL
      user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          gender: true,
          bio: true,
          country: true,
          tier: true,
          createdAt: true,
          lastLogin: true,
        },
      });
      if (user) {
        const rawRes: any[] = await prisma.$queryRawUnsafe(
          `SELECT comment, rating FROM "Users" WHERE email = $1 LIMIT 1`,
          session.user.email
        );
        if (rawRes && rawRes[0]) {
          user.comment = rawRes[0].comment;
          user.rating = rawRes[0].rating ?? 5;
        }
      }
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name || "",
          image: session.user.image || null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          gender: true,
          bio: true,
          country: true,
          tier: true,
          createdAt: true,
          lastLogin: true,
        },
      });
    }

    return NextResponse.json({ success: true, profile: user });
  } catch (error: any) {
    console.error("[profile_get] error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phoneNumber, gender, bio, comment, rating, country, image } = body;

    let updatedUser: any = null;

    try {
      updatedUser = await prisma.user.upsert({
        where: { email: session.user.email },
        create: {
          email: session.user.email,
          name: name || session.user.name || "",
          phoneNumber: phoneNumber || null,
          gender: gender || "Prefer not to say",
          bio: bio || null,
          comment: comment || null,
          rating: typeof rating === "number" ? rating : 5,
          country: country || null,
          image: image || session.user.image || null,
        },
        update: {
          ...(name !== undefined && { name }),
          ...(phoneNumber !== undefined && { phoneNumber }),
          ...(gender !== undefined && { gender }),
          ...(bio !== undefined && { bio }),
          ...(comment !== undefined && { comment }),
          ...(rating !== undefined && { rating }),
          ...(country !== undefined && { country }),
          ...(image !== undefined && { image }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          gender: true,
          bio: true,
          comment: true,
          rating: true,
          country: true,
          tier: true,
          createdAt: true,
        },
      });
    } catch (upsertErr: any) {
      console.warn("[profile_post] Stale Prisma DLL detected, using SQL fallback:", upsertErr?.message);
      
      // Fallback: upsert standard fields with Prisma, then update comment & rating via raw SQL
      updatedUser = await prisma.user.upsert({
        where: { email: session.user.email },
        create: {
          email: session.user.email,
          name: name || session.user.name || "",
          phoneNumber: phoneNumber || null,
          gender: gender || "Prefer not to say",
          bio: bio || null,
          country: country || null,
          image: image || session.user.image || null,
        },
        update: {
          ...(name !== undefined && { name }),
          ...(phoneNumber !== undefined && { phoneNumber }),
          ...(gender !== undefined && { gender }),
          ...(bio !== undefined && { bio }),
          ...(country !== undefined && { country }),
          ...(image !== undefined && { image }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          gender: true,
          bio: true,
          country: true,
          tier: true,
          createdAt: true,
        },
      });

      if (comment !== undefined || rating !== undefined) {
        const numRating = typeof rating === "number" ? rating : 5;
        await prisma.$executeRawUnsafe(
          `UPDATE "Users" SET comment = $1, rating = $2 WHERE email = $3`,
          comment !== undefined ? comment : null,
          numRating,
          session.user.email
        );
        updatedUser.comment = comment;
        updatedUser.rating = numRating;
      }
    }

    return NextResponse.json({ success: true, profile: updatedUser });
  } catch (error: any) {
    console.error("[profile_post] error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
