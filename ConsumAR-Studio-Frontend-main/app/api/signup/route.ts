import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateEmail, validatePassword, normalizeEmail } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    console.log("[signup_api] CREATE POSTGRES USER REQUEST:", email);

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Missing email or password" }, { status: 400 });
    }

    const cleanEmail = normalizeEmail(email);

    // Backend Validation
    if (!validateEmail(cleanEmail)) {
      return NextResponse.json({ success: false, error: "Invalid email protocol." }, { status: 400 });
    }

    if (!validatePassword(password)) {
      return NextResponse.json({ success: false, error: "Password does not meet security requirements." }, { status: 400 });
    }

    // Check if user already exists in PostgreSQL
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });
    
    if (existingUser) {
      return NextResponse.json({ success: false, error: "User already exists with this email." }, { status: 400 });
    }

    // Hash the password (Security Protocol upgrade)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save the user to PostgreSQL
    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        password: hashedPassword,
        lastLogin: new Date()
      } as any
    });

    console.log("[signup_api] SUCCESS: Postgres User created with ID:", newUser.id);

    return NextResponse.json({ 
      success: true, 
      message: "User created successfully",
      userId: newUser.id 
    });

  } catch (error: any) {
    console.error("[signup_api] CRITICAL ERROR:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
