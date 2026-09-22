const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const r = await prisma.$queryRawUnsafe('SELECT * FROM "FeatureConfig" WHERE tier = \'NON_LOGGED\'');
  console.log(r);
}
run();
