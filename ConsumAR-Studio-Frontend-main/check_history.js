const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkHistory() {
  const email = "janapativarsha6@gmail.com";
  const user = await prisma.user.findUnique({
    where: { email },
    include: { history: true, activities: true }
  });

  if (user) {
    console.log(`User: ${user.email}`);
    user.history.forEach(h => console.log(`  - History: [${h.action}] ${h.fileName}`));
    user.activities.forEach(a => console.log(`  - Activity: [${a.type}] ${a.fileName}`));
  }

  await prisma.$disconnect();
}

checkHistory();
