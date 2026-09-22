const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting to populate super admin global stats in UserActivitySummary...");

    // 1. Fetch All Counts
    console.log("Calculating global stats...");
    
    // Auth & User Counts
    const totalGoogleLogins = await prisma.account.count({
        where: { provider: 'google' }
    });

    const magicLinkQuery = await prisma.$queryRaw`SELECT COUNT(DISTINCT "userId") as count FROM "AuthRequest" WHERE "isUsed" = true`;
    const totalMagicLinkLogins = Number(magicLinkQuery[0].count);

    const totalUsers = await prisma.user.count();
    const totalStandardEmails = totalUsers - totalGoogleLogins - totalMagicLinkLogins; // Approximation

    // Tier & Usage Counts
    const totalPaidUsers = await prisma.paidUser.count();
    const totalFreeUsers = totalUsers - totalPaidUsers;
    
    const guestsQuery = await prisma.$queryRaw`SELECT COUNT(DISTINCT "ipAddress") as count FROM "GuestUsage"`;
    const totalGuestUsers = Number(guestsQuery[0].count);

    // Total Activity Counts
    const totalActivities = await prisma.activity.count();
    const totalHistoryItems = await prisma.historyItem.count();

    // --- ACTIVITY BREAKDOWN ---
    const guestActivitiesQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "activities" WHERE "userId" IS NULL`;
    const totalGuestActivities = Number(guestActivitiesQuery[0].count);

    const paidActivitiesQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "activities" WHERE "userId" IN (SELECT "id" FROM "PaidUsers")`;
    const totalPaidActivities = Number(paidActivitiesQuery[0].count);

    const googleActivitiesQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "activities" WHERE "userId" IN (SELECT "userId" FROM "Account" WHERE provider='google')`;
    const totalGoogleActivities = Number(googleActivitiesQuery[0].count);

    const magicActivitiesQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "activities" WHERE "userId" IN (SELECT "userId" FROM "AuthRequest" WHERE "isUsed"=true)`;
    const totalMagicActivities = Number(magicActivitiesQuery[0].count);
    
    const totalStandardEmailActivities = totalActivities - (totalGuestActivities + totalGoogleActivities + totalMagicActivities);

    // --- HISTORY BREAKDOWN ---
    const guestHistoryQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "history_items" WHERE "userId" IS NULL`;
    const totalGuestHistory = Number(guestHistoryQuery[0].count);

    const paidHistoryQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "history_items" WHERE "userId" IN (SELECT "id" FROM "PaidUsers")`;
    const totalPaidHistory = Number(paidHistoryQuery[0].count);

    const googleHistoryQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "history_items" WHERE "userId" IN (SELECT "userId" FROM "Account" WHERE provider='google')`;
    const totalGoogleHistory = Number(googleHistoryQuery[0].count);

    const magicHistoryQuery = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "history_items" WHERE "userId" IN (SELECT "userId" FROM "AuthRequest" WHERE "isUsed"=true)`;
    const totalMagicHistory = Number(magicHistoryQuery[0].count);
    
    const totalStandardEmailHistory = totalHistoryItems - (totalGuestHistory + totalGoogleHistory + totalMagicHistory);


    // 2. Update Global UserActivitySummary
    console.log("Updating global UserActivitySummary...");

    await prisma.userActivitySummary.upsert({
        where: { id: 1 },
        update: {
            totalGoogleLogins,
            totalMagicLinkLogins,
            totalStandardEmails: Math.max(0, totalStandardEmails),
            totalPaidUsers,
            totalFreeUsers: Math.max(0, totalFreeUsers),
            totalGuestUsers,
            totalActivities,
            totalHistoryItems,
            totalPaidActivities,
            totalMagicActivities,
            totalGoogleActivities,
            totalGuestActivities,
            totalStandardEmailActivities: Math.max(0, totalStandardEmailActivities),
            totalPaidHistory,
            totalMagicHistory,
            totalGoogleHistory,
            totalGuestHistory,
            totalStandardEmailHistory: Math.max(0, totalStandardEmailHistory)
        },
        create: {
            id: 1,
            totalGoogleLogins,
            totalMagicLinkLogins,
            totalStandardEmails: Math.max(0, totalStandardEmails),
            totalPaidUsers,
            totalFreeUsers: Math.max(0, totalFreeUsers),
            totalGuestUsers,
            totalActivities,
            totalHistoryItems,
            totalPaidActivities,
            totalMagicActivities,
            totalGoogleActivities,
            totalGuestActivities,
            totalStandardEmailActivities: Math.max(0, totalStandardEmailActivities),
            totalPaidHistory,
            totalMagicHistory,
            totalGoogleHistory,
            totalGuestHistory,
            totalStandardEmailHistory: Math.max(0, totalStandardEmailHistory)
        }
    });

    console.log("Global UserActivitySummary updated successfully with breakdowns!");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
