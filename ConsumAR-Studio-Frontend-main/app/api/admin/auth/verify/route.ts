import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signAdminToken } from "@/lib/admin-jwt";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find user and confirm they are an admin
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // 2. Check account status — blocked admins cannot log in
    if ((user as any).status && (user as any).status !== "active") {
      return NextResponse.json({ error: "Account is not active" }, { status: 403 });
    }

    // 3. Find the latest valid auth request
    const authRequest = await prisma.authRequest.findFirst({
      where: {
        userId: user.id,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!authRequest) {
      return NextResponse.json(
        { error: "OTP expired or not found. Please request a new one." },
        { status: 400 }
      );
    }

    // 4. Verify OTP
    const isMatch = await bcrypt.compare(code.trim(), authRequest.otpHash);
    if (!isMatch) {
      return NextResponse.json({ error: "Incorrect code" }, { status: 400 });
    }

    // 5. Mark auth request as used
    await prisma.authRequest.update({
      where: { id: authRequest.id },
      data: { isUsed: true },
    });

    // 6. Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() } as any,
    });

    // 7. Issue admin JWT
    const token = await signAdminToken({
      sub: user.id,
      email: user.email,
      isSuperAdmin: (user as any).isSuperAdmin ?? false,
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? user.email.split("@")[0],
        isAdmin: user.isAdmin,
        isSuperAdmin: (user as any).isSuperAdmin ?? false,
        status: (user as any).status ?? "active",
      },
    });
  } catch (error) {
    console.error("Admin verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
