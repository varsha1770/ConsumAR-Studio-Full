const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const results = await prisma.$queryRaw`SELECT * FROM user_activity_summary LIMIT 5`;
    console.table(results);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
