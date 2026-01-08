const prisma = require('../prismaClient');

// Admin-only endpoint to clear database
module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Simple admin check - require secret key
  const { adminKey } = req.body || {};
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'polydegen-admin-2026';
  
  if (adminKey !== expectedKey) {
    return res.status(403).json({ error: 'Unauthorized. Invalid admin key.' });
  }

  console.log('🗑️  Admin initiated database clear...');

  try {
    const results = {};

    // Delete in order to respect foreign key constraints
    console.log('Deleting OrderFills...');
    results.orderFills = (await prisma.orderFill.deleteMany({})).count;

    console.log('Deleting Orders...');
    results.orders = (await prisma.order.deleteMany({})).count;

    console.log('Deleting ActivityEvents...');
    results.activityEvents = (await prisma.activityEvent.deleteMany({})).count;

    console.log('Deleting Notifications...');
    results.notifications = (await prisma.notification.deleteMany({})).count;

    console.log('Deleting PriceSnapshots...');
    results.priceSnapshots = (await prisma.priceSnapshot.deleteMany({})).count;

    console.log('Deleting Positions...');
    results.positions = (await prisma.position.deleteMany({})).count;

    console.log('Deleting Trades...');
    results.trades = (await prisma.trade.deleteMany({})).count;

    console.log('Deleting PendingMarkets...');
    results.pendingMarkets = (await prisma.pendingMarket.deleteMany({})).count;

    console.log('Deleting Markets...');
    results.markets = (await prisma.market.deleteMany({})).count;

    console.log('✅ Database cleared successfully!');

    return res.status(200).json({
      success: true,
      message: 'Database cleared successfully',
      deleted: results
    });
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    return res.status(500).json({
      error: 'Failed to clear database',
      details: error.message
    });
  }
};

