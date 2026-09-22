import { SignJWT, jwtVerify } from "jose";

const ADMIN_JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "pqrst12345abcdefgh67890"
);

const ADMIN_JWT_ISSUER = "consumar-super-admin";
const ADMIN_JWT_AUDIENCE = "consumar-admin-panel";
const ADMIN_JWT_EXPIRES = "7d";

export interface AdminTokenPayload {
  sub: string;        // user id
  email: string;
  isSuperAdmin: boolean;
}

/** Issue a signed JWT for an admin user. */
export async function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ADMIN_JWT_ISSUER)
    .setAudience(ADMIN_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ADMIN_JWT_EXPIRES)
    .sign(ADMIN_JWT_SECRET);
}

/** Verify an admin JWT and return the payload, or null if invalid/expired. */
export async function verifyAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ADMIN_JWT_SECRET, {
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE,
    });
    return payload as unknown as AdminTokenPayload;
  } catch {
    return null;
  }
}

/** Extract & verify the Bearer token from an Authorization header string. */
export async function verifyAdminRequest(
  authHeader: string | null
): Promise<AdminTokenPayload | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return verifyAdminToken(token);
}
