
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const featureConfigs = await prisma.featureConfig.findMany();
    console.log('FeatureConfigs:', featureConfigs);
    
    const guestUsages = await prisma.guestUsage.findMany({ take: 5 });
    console.log('GuestUsages:', guestUsages);
    
    const users = await prisma.user.findMany({ take: 5 });
    console.log('Users:', users);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
