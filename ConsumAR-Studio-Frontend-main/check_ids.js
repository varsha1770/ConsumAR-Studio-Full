const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkIds() {
  const email = "janapativarsha6@gmail.com";
  const user = await prisma.user.findUnique({
    where: { email },
    include: { history: true, activities: true }
  });

  if (user) {
    console.log(`User ID: ${user.id}`);
    if (user.history.length > 0) {
      console.log(`History Item 0 UserID: ${user.history[0].userId}`);
    }
    console.log(`Activities found: ${user.activities.length}`);
  }

  await prisma.$disconnect();
}

checkIds();
