const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function cleanUser() {
  const email = "varshasingh1770@gmail.com";
  console.log(`[FIX] Attempting to clear existing user: ${email}`);

  try {
    // 1. Delete the user (this will cascade delete settings/accounts if they exist)
    const deleted = await prisma.user.delete({
      where: { email },
    });
    console.log(`[SUCCESS] User ${email} has been removed from the database.`);
    console.log(`[NEXT] You can now perform a fresh Google Sign-In.`);
  } catch (error) {
    if (error.code === 'P2025') {
      console.log(`[INFO] User ${email} was not found in the database. (It might have already been deleted).`);
    } else {
      console.error("[ERROR] Failed to delete user:", error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

cleanUser();
