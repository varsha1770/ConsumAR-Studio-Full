const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkTable() {
  try {
    const tableInfo = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log("Tables in DB:", tableInfo);

    const activityCount = await prisma.$queryRaw`SELECT COUNT(*) FROM activities`;
    console.log("Activity count from SQL:", activityCount);
  } catch (err) {
    console.error("Error checking table:", err);
  }
  await prisma.$disconnect();
}

checkTable();
