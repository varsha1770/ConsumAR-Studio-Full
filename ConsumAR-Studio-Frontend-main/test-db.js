const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const ip = "unknown";
    const mac = "unknown";
    const sampleResults = await prisma.$queryRawUnsafe(`
      SELECT * FROM "SampleUsage" WHERE "ipAddress" = $1 AND "macAddress" = $2 LIMIT 1
    `, ip, mac);
    console.log("sampleResults:", sampleResults);

    // Fetch Sample Config
    const configResults = await prisma.$queryRawUnsafe(`
      SELECT * FROM "SampleConfig" WHERE "id" = 1 LIMIT 1
    `);
    console.log("configResults:", configResults);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
