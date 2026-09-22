const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const res = await prisma.$queryRawUnsafe('SELECT * FROM "FeatureConfig"');
    console.log('FeatureConfig:', res);
  } catch(e) {
    console.error('FeatureConfig Error:', e.message);
  }
  
  try {
    const res = await prisma.$queryRawUnsafe('SELECT * FROM "GenConfig"');
    console.log('GenConfig:', res);
  } catch(e) {
    console.error('GenConfig Error:', e.message);
  }
  await prisma.$disconnect();
}

main().catch(console.error);
