import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const validateEmail = (email: string) => {
  // Regex: Presence of @ and ., No whitespace
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string) => {
  // Rule of 4: Min 8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special Char
  // Expanded special char set to include . _ -
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._\-])[A-Za-z\d@$!%*?&._\-]{8,}$/;
  return passwordRegex.test(password);
};

export const normalizeEmail = (email: string) => {
  const sanitized = email.toLowerCase().trim();
  const parts = sanitized.split("@");
  if (parts.length !== 2) return sanitized;
  
  // Remove dots from the local part (before the @) to prevent identity typos
  const localPart = parts[0].replace(/\./g, "");
  const domainPart = parts[1];
  
  return `${localPart}@${domainPart}`;
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      id: "otp",
      name: "OTP Login",
      credentials: {
        email: { label: "Email", type: "text" },
        otp: { label: "OTP", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null;
        
        const loginEmail = normalizeEmail(credentials.email);
        
        // Find user
        const user = await prisma.user.findUnique({
          where: { email: loginEmail }
        });

        if (!user) throw new Error("No account found with this email.");

        // Find latest unused auth request
        const authRequest = await prisma.authRequest.findFirst({
          where: {
            userId: user.id,
            isUsed: false,
            expiresAt: { gt: new Date() }
          },
          orderBy: { createdAt: 'desc' }
        });

        if (!authRequest) throw new Error("Invalid or expired OTP. Please request a new one.");

        // Check OTP
        const isMatch = await bcrypt.compare(credentials.otp, authRequest.otpHash);
        if (!isMatch) throw new Error("Incorrect OTP.");

        // Mark as used
        await prisma.authRequest.update({
          where: { id: authRequest.id },
          data: { isUsed: true }
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() } as any
        });

        return { id: user.id, email: user.email, name: user.email.split("@")[0], isAdmin: (user as any).isAdmin };
      }
    }),
    CredentialsProvider({
      id: "magic-link",
      name: "Magic Link Login",
      credentials: {
        token: { label: "Token", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        const tokenHash = crypto.createHash('sha256').update(credentials.token).digest('hex');

        // Find auth request
        const authRequest = await prisma.authRequest.findFirst({
          where: {
            tokenHash,
            isUsed: false,
            expiresAt: { gt: new Date() }
          },
          include: { user: true }
        });

        if (!authRequest || !authRequest.user) {
          throw new Error("Invalid or expired Magic Link. Please request a new one.");
        }

        // Mark as used
        await prisma.authRequest.update({
          where: { id: authRequest.id },
          data: { isUsed: true }
        });

        await prisma.user.update({
          where: { id: authRequest.user.id },
          data: { lastLogin: new Date() } as any
        });

        return { 
          id: authRequest.user.id, 
          email: authRequest.user.email, 
          name: authRequest.user.email.split("@")[0], 
          isAdmin: (authRequest.user as any).isAdmin 
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/", // The root page is now the Login page
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as any).isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).isAdmin = token.isAdmin;
      }
      return session;
    },
  },
};
