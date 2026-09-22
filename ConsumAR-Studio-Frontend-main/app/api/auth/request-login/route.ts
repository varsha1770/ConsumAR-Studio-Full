import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // 1. Check if the user exists
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create user if they don't exist (Sign up)
      user = await prisma.user.create({
        data: { email },
      });
    }

    // 2. Generate secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    
    // 3. Generate a 6-digit OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Hash token with SHA256 (allows quick DB lookup) and OTP with bcrypt
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(rawOtp, salt);

    // 5. Calculate expiration time (5 minutes from now)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // 6. Store in AuthRequests table
    await prisma.authRequest.create({
      data: {
        userId: user.id,
        tokenHash,
        otpHash,
        expiresAt,
      },
    });

    // 7. Construct the Magic Link URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const magicLink = `${appUrl}/verify?token=${rawToken}`;

    // 8. Send the email containing both magic link and plaintext OTP
    if (!process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD === "password") {
      // DEV MODE: If no real SMTP is configured, just log it!
      console.log("=========================================");
      console.log(" MAGIC LINK & OTP (Dev Mode / No SMTP)   ");
      console.log(` Email: ${email}`);
      console.log(` OTP Code: ${rawOtp}`);
      console.log(` Magic Link: ${magicLink}`);
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
        from: `"Authentication" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your Login Code & Magic Link",
        html: `
          <h2>Your Login Verification</h2>
          <p>Click the link below to securely log in. This link will expire in 5 minutes.</p>
          <p><a href="${magicLink}">${magicLink}</a></p>
          <br/>
          <p>Alternatively, you can enter the following 6-digit code on the login page:</p>
          <h3 style="letter-spacing: 0.5em; font-size: 24px;">${rawOtp}</h3>
          <p>If you did not request this email, you can safely ignore it.</p>
        `,
      });
    }

    return NextResponse.json({ message: "If an account exists, a link and code have been sent." }, { status: 200 });
  } catch (error) {
    console.error("Error in /request-login:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
