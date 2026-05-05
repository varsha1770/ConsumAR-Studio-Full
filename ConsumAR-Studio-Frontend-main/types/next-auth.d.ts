import NextAuth, { DefaultSession } from "next-auth";

/**
 * THE TYPE BINDER: Extends NextAuth types to include the User ID.
 * This resolves the "Property 'id' does not exist" errors in the API routes.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}
