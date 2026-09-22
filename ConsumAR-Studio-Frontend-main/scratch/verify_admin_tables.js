const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("\n--- Platform Stats ---");
    const stats = await prisma.platformStats.findFirst();
    console.table(stats);

    console.log("\n--- User Activity Summary Sample ---");
    const users = await prisma.userActivitySummary.findMany({
        take: 5,
        select: {
            userId: true,
            totalActivitiesCount: true,
            isPaid: true,
            authProvider: true
        }
    });
    console.table(users);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
