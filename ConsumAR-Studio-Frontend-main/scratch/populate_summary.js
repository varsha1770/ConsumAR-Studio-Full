const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // We use gen_random_uuid() to ensure an ID is generated if Prisma didn't set a db-level default
    // We use COUNT(DISTINCT ...) to avoid Cartesian product inflation from multiple joins
    await prisma.$executeRaw`
        INSERT INTO user_activity_summary (id, user_id, total_activities_count, total_history_items_count)
        SELECT 
            gen_random_uuid(),
            u.id, 
            COUNT(DISTINCT a.id) as act_count, 
            COUNT(DISTINCT h.id) as hist_count
        FROM "Users" u
        LEFT JOIN activities a ON u.id = a."userId"
        LEFT JOIN history_items h ON u.id = h."userId"
        GROUP BY u.id
        ON CONFLICT (user_id) DO UPDATE 
        SET 
            total_activities_count = EXCLUDED.total_activities_count,
            total_history_items_count = EXCLUDED.total_history_items_count;
    `;
    console.log("Activity summary table populated successfully!");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
