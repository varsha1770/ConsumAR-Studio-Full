const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("--- Current Counts ---");
    
    const guests = await prisma.guestUsage.count();
    console.log(`Guest Users Count: ${guests}`);
    
    const authProviders = await prisma.userActivitySummary.groupBy({
        by: ['authProvider'],
        _count: { authProvider: true }
    });
    console.log(`\nAuth Provider Counts:`);
    console.table(authProviders);
    
    const paidUsers = await prisma.userActivitySummary.count({
        where: { isPaid: true }
    });
    console.log(`\nPaid Users Count: ${paidUsers}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
