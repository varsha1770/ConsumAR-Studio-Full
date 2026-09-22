/**
 * promote_admin.js
 * Sets isAdmin + isSuperAdmin = true for the given emails.
 *
 * Usage:
 *   node scratch/promote_admin.js                  ← promotes the hardcoded list
 *   node scratch/promote_admin.js your@email.com   ← promotes a specific email
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Use CLI arg if provided, otherwise fall back to the hardcoded list
  const emailsFromArgs = process.argv.slice(2);
  const emails = emailsFromArgs.length > 0
    ? emailsFromArgs
    : ["janapativarsha6@gmail.com", "varsha@gmail.com"];

  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`  ✗ No user found: ${email} (log in to the studio first)`);
      continue;
    }
    await prisma.user.update({
      where: { email },
      data: {
        isAdmin: true,
        isSuperAdmin: true,  // new field added by db push
        status: "active",    // ensure not blocked
      },
    });
    console.log(`  ✓ Promoted ${email} to Super Admin`);
  }
  console.log("\nDone. These users can now log into http://localhost:3001");
}

main().catch(console.error).finally(() => prisma.$disconnect());
