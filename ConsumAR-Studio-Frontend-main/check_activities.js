const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- Latest 10 Activities ---");
  const activities = await prisma.$queryRaw`SELECT * FROM activities ORDER BY "createdAt" DESC LIMIT 10`;
  console.log(JSON.stringify(activities, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
