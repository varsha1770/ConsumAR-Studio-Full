const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function resetTest() {
  const userId = "c89002da-1f4d-4526-bd12-76f6804f5daa"; // janapativarsha6@gmail.com
  console.log(`--- Resetting and Re-testing for: ${userId} ---`);
  
  try {
    // Delete old test record
    await prisma.activity.deleteMany({
      where: { fileName: "TEST_DASHBOARD_FIX.usdz" }
    });

    // Create new test record with links
    const activity = await prisma.activity.create({
      data: {
        userId: userId,
        type: "CONVERSION",
        fileName: "CHAIR_TEST_WITH_LINKS.usdz",
        glbFile: "https://tryitproductmodels.s3.ap-south-1.amazonaws.com/temp/dummy.glb",
        usdzFile: "https://tryitproductmodels.s3.ap-south-1.amazonaws.com/temp/dummy.usdz",
      }
    });

    console.log("Success! Created activity with links:", activity.id);
  } catch (err) {
    console.error("Failed:", err);
  }
  
  await prisma.$disconnect();
}

resetTest();
