const prisma = require('../prismaClient');
const { broadcastPriceUpdate } = require('../wsBroadcaster');

// Helper to serialize BigInt values
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }
  
  if (typeof obj === 'object') {
    const serialized = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value);
    }
    return serialized;
  }
  
  return obj;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { marketId, yesPriceBps, noPriceBps, blockNumber } = req.body;

    if (!marketId || yesPriceBps === undefined || noPriceBps === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: marketId, yesPriceBps, noPriceBps'
      });
    }

    const marketIdBigInt = BigInt(marketId);
    const yesPriceInt = parseInt(yesPriceBps, 10);
    const noPriceInt = parseInt(noPriceBps, 10);

    // Validate prices are in valid range (0-10000 basis points)
    if (yesPriceInt < 0 || yesPriceInt > 10000 || noPriceInt < 0 || noPriceInt > 10000) {
      return res.status(400).json({
        error: 'Invalid price values. Must be between 0 and 10000 basis points.'
      });
    }

    // Optional: Check if we already have a recent snapshot (within 1 minute) to avoid duplicates
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentSnapshot = await prisma.priceSnapshot.findFirst({
      where: {
        marketId: marketIdBigInt,
        timestamp: {
          gte: oneMinuteAgo
        },
        yesPriceBps: yesPriceInt,
        noPriceBps: noPriceInt
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    if (recentSnapshot) {
      // Duplicate snapshot, return existing one
      return res.status(200).json({
        success: true,
        message: 'Duplicate snapshot (within 1 minute), skipped',
        data: serializeBigInt(recentSnapshot)
      });
    }

    // Create new price snapshot
    const snapshot = await prisma.priceSnapshot.create({
      data: {
        marketId: marketIdBigInt,
        yesPriceBps: yesPriceInt,
        noPriceBps: noPriceInt,
        blockNumber: blockNumber ? BigInt(blockNumber) : null,
        timestamp: new Date()
      }
    });

    // Broadcast price update via WebSocket
    broadcastPriceUpdate(marketId.toString(), {
      yesPrice: yesPriceInt / 10000,
      noPrice: noPriceInt / 10000,
      yesPriceBps: yesPriceInt,
      noPriceBps: noPriceInt
    });

    return res.status(201).json({
      success: true,
      message: 'Price snapshot recorded',
      data: serializeBigInt(snapshot)
    });

  } catch (error) {
    console.error('Error recording price snapshot:', error);
    return res.status(500).json({
      error: 'Failed to record price snapshot',
      details: error.message
    });
  }
};

