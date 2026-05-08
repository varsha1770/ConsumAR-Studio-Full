import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: Fetch current feature configurations
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    // Security check: Only Admins can see this
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: (session.user as any).id },
      select: { isAdmin: true }
    });

    if (!admin?.isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const configs = await prisma.$queryRawUnsafe(`SELECT * FROM "FeatureConfig" ORDER BY tier ASC`);

    return NextResponse.json(configs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Update feature configurations
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: (session.user as any).id },
      select: { isAdmin: true }
    });

    if (!admin?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { tier, dailyUploadLimit, dailyRescaleLimit, monthlyRescaleLimit, dailyUsdzLimit, monthlyUsdzLimit, historyDownloadLimit, allowedUnits, isUsdzUnlimited } = body;

    await prisma.$executeRawUnsafe(`
      UPDATE "FeatureConfig" 
      SET "dailyUploadLimit" = $2, "dailyRescaleLimit" = $3, "monthlyRescaleLimit" = $4, 
          "dailyUsdzLimit" = $5, "monthlyUsdzLimit" = $6, "historyDownloadLimit" = $7, 
          "allowedUnits" = $8, "isUsdzUnlimited" = $9
      WHERE tier = $1
    `, tier, dailyUploadLimit, dailyRescaleLimit, monthlyRescaleLimit, dailyUsdzLimit, monthlyUsdzLimit, historyDownloadLimit, allowedUnits, isUsdzUnlimited);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
