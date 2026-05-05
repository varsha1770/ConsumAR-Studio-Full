const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function createTestActivity() {
  const userId = "c89002da-1f4d-4526-bd12-76f6804f5daa"; // janapativarsha6@gmail.com
  console.log(`--- Creating test activity for: ${userId} ---`);
  
  try {
    const activity = await prisma.activity.create({
      data: {
        userId: userId,
        type: "CONVERSION",
        fileName: "TEST_DASHBOARD_FIX.usdz",
      }
    });

    console.log("Success! Created activity:", activity.id);
  } catch (err) {
    console.error("Failed to create activity:", err);
  }
  
  await prisma.$disconnect();
}

createTestActivity();
