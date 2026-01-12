// Load environment variables from .env file
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('🗑️  Clearing database...\n');

  try {
    // Delete in order to respect foreign key constraints
    console.log('Deleting OrderFills...');
    const orderFillsDeleted = await prisma.orderFill.deleteMany({});
    console.log(`  ✓ Deleted ${orderFillsDeleted.count} order fills`);

    console.log('Deleting Orders...');
    const ordersDeleted = await prisma.order.deleteMany({});
    console.log(`  ✓ Deleted ${ordersDeleted.count} orders`);

    console.log('Deleting ActivityEvents...');
    const activityEventsDeleted = await prisma.activityEvent.deleteMany({});
    console.log(`  ✓ Deleted ${activityEventsDeleted.count} activity events`);

    console.log('Deleting Notifications...');
    const notificationsDeleted = await prisma.notification.deleteMany({});
    console.log(`  ✓ Deleted ${notificationsDeleted.count} notifications`);

    console.log('Deleting PriceSnapshots...');
    const priceSnapshotsDeleted = await prisma.priceSnapshot.deleteMany({});
    console.log(`  ✓ Deleted ${priceSnapshotsDeleted.count} price snapshots`);

    console.log('Deleting Positions...');
    const positionsDeleted = await prisma.position.deleteMany({});
    console.log(`  ✓ Deleted ${positionsDeleted.count} positions`);

    console.log('Deleting Trades...');
    const tradesDeleted = await prisma.trade.deleteMany({});
    console.log(`  ✓ Deleted ${tradesDeleted.count} trades`);

    console.log('Deleting PendingMarkets...');
    const pendingMarketsDeleted = await prisma.pendingMarket.deleteMany({});
    console.log(`  ✓ Deleted ${pendingMarketsDeleted.count} pending markets`);

    console.log('Deleting Markets...');
    const marketsDeleted = await prisma.market.deleteMany({});
    console.log(`  ✓ Deleted ${marketsDeleted.count} markets`);

    console.log('\n✅ Database cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed to clear database:', error);
    process.exit(1);
  });

