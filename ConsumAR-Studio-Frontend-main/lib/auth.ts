import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

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
      name: "ConsumAR Login",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const loginEmail = normalizeEmail(credentials.email);
        const loginPassword = credentials.password;
        
        console.log("[nextauth] Postgres Identity Check for:", loginEmail);

        // 1. Find user in PostgreSQL
        const user = await prisma.user.findUnique({
          where: { email: loginEmail }
        });

        if (user) {
          console.log("[nextauth] Existing user found in Postgres:", user.email);
          
          // If the user signed up via Google, they won't have a password set.
          if (!user.password) {
            console.log("[nextauth] LOGIN DENIED: This account was created via Google. Please use the 'Sign in with Google' button.");
            return null;
          }

          // Check password using Bcrypt
          const isMatch = await bcrypt.compare(loginPassword, user.password);

          if (isMatch) {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLogin: new Date() } as any
            });
            return { id: user.id, email: user.email, name: user.email.split("@")[0], isAdmin: (user as any).isAdmin };
          } 
          
          // LEGACY FALLBACK: Check if this is an old plaintext password
          if (!isMatch && user.password === loginPassword) {
            console.log("[nextauth] LEGACY DETECTED: Upgrading user to Hashed Security...");
            const salt = await bcrypt.genSalt(10);
            const upgradedPassword = await bcrypt.hash(loginPassword, salt);
            
            await prisma.user.update({
              where: { id: user.id },
              data: { 
                password: upgradedPassword, 
                lastLogin: new Date() 
              } as any
            });
            
            return { id: user.id, email: user.email, name: user.email.split("@")[0], isAdmin: (user as any).isAdmin };
          }

          console.log("[nextauth] Password mismatch for existing user.");
          return null;
        } 
        
        // 2. AUTO-SIGNUP: If user doesn't exist, CREATE THEM NOW in PostgreSQL
        console.log("[nextauth] NEW USER DETECTED! Auto-creating PostgreSQL account...");

        if (!validateEmail(loginEmail) || !validatePassword(loginPassword)) {
          console.error("[nextauth] Validation failed for auto-signup.");
          return null;
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(loginPassword, salt);

        const newUser = await prisma.user.create({
          data: {
            email: loginEmail,
            password: hashedPassword,
            lastLogin: new Date()
          } as any
        });

        console.log("[nextauth] Auto-Signup SUCCESS in Postgres for:", loginEmail);
        return { 
          id: newUser.id, 
          email: newUser.email, 
          name: newUser.email.split("@")[0] 
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
