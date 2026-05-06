const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const todayStr = new Date().toISOString();
    const userId = null;
    const userEmail = null;
    const ip = "127.0.0.1";

    const usdzResults = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count 
      FROM activities 
      WHERE type = 'USDZ_CONVERT' 
      AND "createdAt" >= $1::timestamp
      AND (
        "userId" = $2::uuid OR 
        "userEmail" = $3 OR 
        ("userId" IS NULL AND "ipAddress" = $4)
      )
    `, todayStr, userId, userEmail, ip);
    console.log("Query succeeded:", usdzResults);
  } catch (e) {
    console.error("Query failed:", e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
