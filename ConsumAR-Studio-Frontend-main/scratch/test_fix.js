
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testQuery() {
  const ip = '::1';
  const mac = 'guest_ji7ja9gst6_1778178717303'; // From previous check_db output
  
  console.log(`Testing query with mac: ${mac}, ip: ${ip}`);
  
  try {
    const guestResults = await prisma.$queryRawUnsafe(`
      SELECT * FROM "GuestUsage" WHERE "macAddress" = $1 OR "ipAddress" = $2 LIMIT 1
    `, mac, ip);
    
    console.log('Query Success! Results:', guestResults);
  } catch (e) {
    console.error('Query Failed! Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

testQuery();
