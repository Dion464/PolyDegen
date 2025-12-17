const prisma = require('../prismaClient');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = Math.min(
      parseInt(req.query.limit || '30', 10) || 30,
      200,
    );
    
    // Server-side filtering by eventType
    const eventTypeFilter = req.query.eventType;
    let whereClause = {};
    
    if (eventTypeFilter === 'resolved') {
      whereClause.eventType = 'MARKET_RESOLVED';
    } else if (eventTypeFilter === 'created') {
      whereClause.eventType = 'MARKET_CREATED';
    } else if (eventTypeFilter === 'trades') {
      whereClause.eventType = { in: ['ORDER_FILLED', 'ORDER_PLACED'] };
    }

    const events = await prisma.activityEvent.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        market: {
          select: {
            question: true,
            imageUrl: true,
            category: true,
          },
        },
      },
    });

    const mapped = events.map((ev) => {
      const meta = ev.metadata || {};

      // Use Incentiv block explorer (check both env var formats)
      const explorerBase = process.env.BLOCK_EXPLORER_URL || 
                          process.env.VITE_BLOCK_EXPLORER_URL || 
                          'https://explorer-testnet.incentiv.io';
      const cleanExplorerBase = explorerBase.trim().replace(/\/$/, '');
      const txUrl = meta.txUrl || (ev.txHash ? `${cleanExplorerBase}/tx/${ev.txHash}` : '#');

      const avatarGradient =
        meta.avatarGradient ||
        (ev.market?.category === 'crypto'
          ? 'from-[#FF9900] to-[#FF5E00]'
          : 'from-[#3B82F6] to-[#06B6D4]');

      const timestampLabel = meta.timestampLabel || 'now';

      // Handle different event types
      if (ev.eventType === 'MARKET_RESOLVED') {
        const outcome = meta.outcome || 'Unknown';
        return {
          id: Number(ev.id),
          marketId: Number(ev.marketId),
          eventType: 'MARKET_RESOLVED',
          marketTitle:
            ev.market?.question || meta.marketTitle || `Market #${ev.marketId}`,
          marketImageUrl: ev.market?.imageUrl || null,
          avatarGradient,
          user: 'Market Resolved',
          action: '/',
          side: outcome,
          sideColor: outcome === 'Yes' ? '#FFE600' : outcome === 'No' ? '#E13737' : '#BABABA',
          priceCents: null,
          shares: null,
          timestampLabel,
          createdAt: ev.createdAt,
          txUrl,
        };
      }

      // Format user address: "0xab...cd12"
      const formatAddress = (addr) => {
        if (!addr || addr.length < 10) return addr || 'Unknown';
        return `${addr.slice(0, 4)}..${addr.slice(-4)}`;
      };

      if (ev.eventType === 'MARKET_CREATED') {
        return {
          id: Number(ev.id),
          marketId: Number(ev.marketId),
          eventType: 'MARKET_CREATED',
          marketTitle:
            ev.market?.question || meta.marketTitle || `Market #${ev.marketId}`,
          marketImageUrl: ev.market?.imageUrl || null,
          avatarGradient,
          user: formatAddress(ev.userAddress),
          action: 'created market',
          side: null,
          sideColor: null,
          priceCents: null,
          shares: null,
          timestampLabel,
          createdAt: ev.createdAt,
          txUrl,
        };
      }

      // Default: trade events (ORDER_PLACED, ORDER_FILLED, POSITION_UPDATED, etc.)
      const isBuyLike =
        ev.eventType === 'ORDER_PLACED' ||
        ev.eventType === 'ORDER_FILLED' ||
        ev.eventType === 'POSITION_UPDATED';

      const side = meta.side || (isBuyLike ? 'Yes' : 'No');
      const action = meta.action || (isBuyLike ? 'bought' : 'sold');

      const priceCents =
        typeof meta.priceCents === 'number'
          ? meta.priceCents
          : meta.priceBps
          ? Math.round(meta.priceBps / 100)
          : null;

      // Get shares amount (prefer shares, fall back to notionalUsd for backwards compat)
      const shares =
        typeof meta.shares === 'number'
          ? meta.shares
          : typeof meta.notionalUsd === 'number'
          ? meta.notionalUsd
          : null;

      return {
        id: Number(ev.id),
        marketId: Number(ev.marketId),
        eventType: ev.eventType,
        marketTitle:
          ev.market?.question || meta.marketTitle || `Market #${ev.marketId}`,
        marketImageUrl: ev.market?.imageUrl || null,
        avatarGradient,
        user: formatAddress(ev.userAddress),
        action,
        side,
        sideColor:
          side === 'Yes' || side === 'Up'
            ? '#FFE600'
            : '#E13737',
        priceCents: priceCents ?? 50,
        shares: shares ?? 0, // Shares in tCent
        timestampLabel,
        createdAt: ev.createdAt,
        txUrl,
      };
    });

    return res.status(200).json({
      success: true,
      activity: serializeBigInt(mapped),
    });
  } catch (error) {
    console.error('Activity API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}


