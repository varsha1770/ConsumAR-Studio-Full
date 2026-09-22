const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Dropping old user_activity_summary table...");
    await prisma.$executeRaw`DROP TABLE IF EXISTS "user_activity_summary" CASCADE;`;
    console.log("Dropped.");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
