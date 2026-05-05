import { PrismaClient } from "@prisma/client";

// THE BRIDGE: This creates a single connection to your PostgreSQL database
// that is shared across the entire app.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
