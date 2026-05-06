const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.activity.deleteMany({
    where: {
      type: "USDZ_CONVERT",
      userId: null
    }
  });
  console.log("Guest USDZ conversion activities cleared.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
