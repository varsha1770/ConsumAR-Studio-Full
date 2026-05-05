const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function listUsers() {
  console.log("--- Listing All Users ---");
  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { history: true, activities: true }
      }
    }
  });

  users.forEach(u => {
    console.log(`Email: ${u.email} | ID: ${u.id} | History: ${u._count.history} | Activities: ${u._count.activities}`);
  });

  await prisma.$disconnect();
}

listUsers();
