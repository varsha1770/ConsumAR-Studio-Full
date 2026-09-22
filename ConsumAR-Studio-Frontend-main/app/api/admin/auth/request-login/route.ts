import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

// Handle CORS preflight
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
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if user exists AND is an admin
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Return generic message — don't reveal whether the email exists
      return NextResponse.json(
        { message: "If an admin account exists for this email, a code has been sent." },
        { status: 200 }
      );
    }

    if (!user.isAdmin) {
      // Not an admin — same generic message to avoid leaking info
      return NextResponse.json(
        { message: "If an admin account exists for this email, a code has been sent." },
        { status: 200 }
      );
    }

    // 2. Generate a 6-digit OTP and hash it
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(rawOtp, salt);

    // 3. Also generate a token hash (for magic-link compatibility, unused here)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 4. Store auth request — 5 minute expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await prisma.authRequest.create({
      data: { userId: user.id, tokenHash, otpHash, expiresAt },
    });

    // 5. Send OTP via email (or log in dev mode)
    const devMode = !process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD === "password";

    if (devMode) {
      console.log("=========================================");
      console.log(" SUPER ADMIN OTP (Dev Mode)              ");
      console.log(` Admin Email : ${normalizedEmail}`);
      console.log(` OTP Code    : ${rawOtp}`);
      console.log("=========================================");
    } else {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: `"ConsumAR Super Admin" <${process.env.SMTP_USER}>`,
        to: normalizedEmail,
        subject: "Super Admin Login Code",
        html: `
          <div style="font-family:sans-serif;padding:20px;background:#f9f9f9;border-radius:10px;">
            <h2 style="color:#5C0FC0;">ConsumAR Super Admin</h2>
            <p>Your one-time login code is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;">${rawOtp}</div>
            <p style="color:#888;font-size:12px;">Expires in 5 minutes. Do not share this code.</p>
          </div>
        `,
      });
    }

    return NextResponse.json(
      { message: "If an admin account exists for this email, a code has been sent." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin request-login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
