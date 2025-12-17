const prisma = require('../prismaClient');
const { createTradeActivity, createMarketCreatedActivity, createMarketResolvedActivity } = require('../activityService');
const { broadcastActivity, broadcastMarketUpdate } = require('../wsBroadcaster');

function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializeBigInt(v);
    }
    return out;
  }
  return obj;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, ...data } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Type is required' });
    }

    let activityEvent;

    switch (type) {
      case 'TRADE': {
        const {
          marketId,
          userAddress,
          isYes,
          isBuy,
          sharesWei,
          priceBps,
          costWei,
          txHash,
          blockNumber,
          blockTime,
          marketQuestion, // Market question from frontend
        } = data;

        if (!marketId || !userAddress || isYes === undefined || !sharesWei || !priceBps || !costWei) {
          return res.status(400).json({ 
            error: 'Missing required fields: marketId, userAddress, isYes, sharesWei, priceBps, costWei' 
          });
        }

        // Get market info from DB
        let market = await prisma.market.findUnique({
          where: { marketId: BigInt(marketId) },
        }).catch(() => null);

        activityEvent = await createTradeActivity({
          marketId,
          userAddress,
          isYes: Boolean(isYes),
          isBuy: isBuy !== undefined ? Boolean(isBuy) : true, // Default to buy for backwards compat
          sharesWei,
          priceBps: parseInt(priceBps, 10),
          costWei,
          txHash: txHash || null,
          blockNumber: blockNumber ? BigInt(blockNumber) : null,
          blockTime: blockTime ? new Date(blockTime) : new Date(),
          market,
          marketQuestion, // Pass marketQuestion directly from frontend
        });
        break;
      }

      case 'MARKET_CREATED': {
        const {
          marketId,
          creator,
          question,
          category,
          txHash,
          blockNumber,
          blockTime,
        } = data;

        if (!marketId || !creator || !question) {
          return res.status(400).json({ 
            error: 'Missing required fields: marketId, creator, question' 
          });
        }

        activityEvent = await createMarketCreatedActivity({
          marketId,
          creator,
          question,
          category: category || 'general',
          txHash: txHash || null,
          blockNumber: blockNumber ? BigInt(blockNumber) : null,
          blockTime: blockTime ? new Date(blockTime) : new Date(),
        });
        break;
      }

      case 'MARKET_RESOLVED': {
        const {
          marketId,
          outcome,
          resolver,
          txHash,
          blockNumber,
          blockTime,
          marketQuestion, // Market question from frontend
        } = data;

        if (!marketId || !outcome || !resolver) {
          return res.status(400).json({ 
            error: 'Missing required fields: marketId, outcome, resolver' 
          });
        }

        // Get market info from DB
        let market = await prisma.market.findUnique({
          where: { marketId: BigInt(marketId) },
        }).catch(() => null);

        activityEvent = await createMarketResolvedActivity({
          marketId,
          outcome: parseInt(outcome, 10),
          resolver,
          txHash: txHash || null,
          blockNumber: blockNumber ? BigInt(blockNumber) : null,
          blockTime: blockTime ? new Date(blockTime) : new Date(),
          market,
          marketQuestion, // Pass marketQuestion directly from frontend
        });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    if (!activityEvent) {
      return res.status(500).json({ error: 'Failed to create activity event' });
    }

    // Broadcast activity via WebSocket
    const activityData = serializeBigInt(activityEvent);
    broadcastActivity({
      type: type,
      marketId: activityData.marketId,
      ...activityData
    });

    // If market resolved, also broadcast market update
    if (type === 'MARKET_RESOLVED') {
      broadcastMarketUpdate(activityData.marketId, {
        status: 'resolved',
        outcome: data.outcome
      });
    }

    return res.status(200).json({
      success: true,
      activity: activityData,
    });
  } catch (error) {
    console.error('Activity creation API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
};

