const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emails = ["janapativarsha6@gmail.com"];
  for (const email of emails) {
    try {
      await prisma.user.update({
        where: { email },
        data: { 
            isAdmin: false,
            tier: "PAID"
        }
      });
      console.log(`Successfully updated ${email} to PAID tier and removed Super Admin.`);
    } catch (e) {
      console.error(`Failed to update ${email}:`, e.message);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
