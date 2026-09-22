import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const configs = await prisma.$queryRawUnsafe(`SELECT 1`);
    console.log("Database connection successful:", configs);
  } catch (error) {
    console.error("Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
