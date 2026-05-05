const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkRecords() {
  const email = "varshasingh1770@gmail.com";
  console.log(`--- Checking records for: ${email} ---`);
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      history: true,
      activities: true
    }
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  console.log(`User ID: ${user.id}`);
  console.log(`History count: ${user.history.length}`);
  user.history.forEach(h => console.log(`  - History: [${h.action}] ${h.fileName}`));
  
  console.log(`Activities count: ${user.activities.length}`);
  user.activities.forEach(a => console.log(`  - Activity: [${a.type}] ${a.fileName}`));
  
  await prisma.$disconnect();
}

checkRecords();
