import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login", // Redirect unauthenticated requests to the explicit login page
  },
});

/**
 * Matcher logic:
 * - Protect the dashboard and any admin APIs.
 * - The root (/), /studio, and /signup are now public areas.
 */
export const config = { 
  matcher: [
    "/dashboard/:path*",
    "/api/admin/:path*"
  ] 
};
