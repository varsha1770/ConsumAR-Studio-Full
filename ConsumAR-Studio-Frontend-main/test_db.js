const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log("Users:", users.length);
  const activities = await prisma.$queryRawUnsafe(`SELECT * FROM activities ORDER BY "createdAt" DESC LIMIT 10`);
  console.log("Activities:", activities);
  
  // also try to delete nithin's account manually if it exists to see if errors out
  const nithin = users.find(u => u.email === 'nithinchatsgpt121@gmail.com');
  if (nithin) {
    try {
      await prisma.$executeRawUnsafe(`UPDATE activities SET "userId" = NULL, "userEmail" = NULL WHERE "userId" = $1::uuid`, nithin.id);
      await prisma.$executeRawUnsafe(`DELETE FROM "Users" WHERE id = $1::uuid`, nithin.id);
      console.log("Deleted nithin!");
    } catch (e) {
      console.log("Error deleting nithin:", e);
    }
  }
}

check().then(() => process.exit(0));
