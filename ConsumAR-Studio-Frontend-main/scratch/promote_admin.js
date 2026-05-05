const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emails = ["janapativarsha6@gmail.com", "varsha@gmail.com"];
  for (const email of emails) {
    await prisma.user.update({
      where: { email },
      data: { isAdmin: true }
    });
    console.log(`Promoted ${email} to Super Admin.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
