const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const ip = "127.0.0.1";
    const mac = "00:00:00:00:00:00";
    const nextExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    await prisma.$executeRawUnsafe(`
      INSERT INTO "SampleUsage" ("id", "ipAddress", "macAddress", "rescaleCount", "uploadCount", "usdzCount", "expiresAt", "lastUsage", "createdAt")
      VALUES (gen_random_uuid(), $1, $2, 0, 0, 0, $3::timestamp, NOW(), NOW())
    `, ip, mac, nextExpiry);
    
    console.log("Insert success!");
  } catch (err) {
    console.error("Error inserting:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
