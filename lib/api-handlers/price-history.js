const prisma = require('../prismaClient');

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

const timeframeAliasMap = {
  '1h': '1h',
  '60m': '1h',
  '6h': '6h',
  '1d': '24h',
  '24h': '24h',
  '7d': '7d',
  '1w': '7d',
  '30d': '30d',
  '1m': '30d',
  all: 'all'
};

const resolutionMsMap = {
  // For short ranges, we densify to 1-second granularity so the chart can update smoothly without manual refresh.
  // Note: longer ranges keep coarser resolution to avoid generating huge payloads.
  '1h': 1000, // 1 second
  '6h': 1000, // 1 second
  '24h': 1000, // 1 second
  '7d': 5 * 1000, // 5 seconds
  '30d': 60 * 1000, // 1 minute
  all: null
};

const getResolutionMs = (timeframe = '24h') => {
  const lower = typeof timeframe === 'string' ? timeframe.toLowerCase() : '24h';
  const normalized = timeframeAliasMap[lower] || '24h';
  return resolutionMsMap[normalized] ?? null;
};

// Smooth easing function for natural heartbeat-like curves
const easeInOutCubic = (t) => {
  return t < 0.5
    ? 4 * t * t * t  // Ease in (cubic acceleration)
    : 1 - Math.pow(-2 * t + 2, 3) / 2;  // Ease out (cubic deceleration)
};

const densifySnapshots = (entries = [], resolutionMs) => {
  if (!resolutionMs || entries.length < 2) {
    return entries;
  }

  const output = [];
  for (let i = 0; i < entries.length - 1; i++) {
    const current = entries[i];
    const next = entries[i + 1];
    output.push(current);

    const currentTime = current.timestamp instanceof Date ? current.timestamp.getTime() : new Date(current.timestamp).getTime();
    const nextTime = next.timestamp instanceof Date ? next.timestamp.getTime() : new Date(next.timestamp).getTime();
    const timeDiff = nextTime - currentTime;

    if (!Number.isFinite(timeDiff) || timeDiff <= resolutionMs) {
      continue;
    }

    const steps = Math.floor(timeDiff / resolutionMs);
    if (steps <= 1) {
      continue;
    }

    // Use more steps for smoother curves (at least 10 points between major changes)
    const smoothSteps = Math.max(steps, 10);
    
    for (let step = 1; step < smoothSteps; step++) {
      const linearRatio = step / smoothSteps;
      
      // Apply cubic easing for smooth, heartbeat-like transitions
      const easedRatio = easeInOutCubic(linearRatio);
      
      // Add subtle sine wave for heartbeat rhythm (very subtle)
      const heartbeat = Math.sin(linearRatio * Math.PI * 2) * 0.002;
      const finalRatio = easedRatio + heartbeat;
      
      const yesDiff = next.yesPriceBps - current.yesPriceBps;
      const noDiff = next.noPriceBps - current.noPriceBps;
      
      const interpolated = {
        marketId: current.marketId,
        yesPriceBps: Math.round(current.yesPriceBps + yesDiff * finalRatio),
        noPriceBps: Math.round(current.noPriceBps + noDiff * finalRatio),
        blockNumber: current.blockNumber,
        timestamp: new Date(currentTime + (timeDiff * linearRatio)),
        interpolated: true
      };
      output.push(interpolated);
    }
  }

  if (entries.length) {
    output.push(entries[entries.length - 1]);
  }

  return output;
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { marketId, timeframe = '24h' } = req.query;

    if (!marketId) {
      return res.status(400).json({ error: 'marketId is required' });
    }

    const marketIdBigInt = BigInt(marketId);

    // Calculate cutoff time based on timeframe
    const now = new Date();
    let cutoffTime;
    
    switch (timeframe) {
      case '1h':
        cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
      case '1d':
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
      case '1w':
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
      case '1m':
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        cutoffTime = null; // No cutoff
        break;
      default:
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }

    // Fetch snapshots for the window, plus a "carry-forward" snapshot at the window start
    // so short ranges (1H/6H/1D) still show a line even if no trades happened inside the window.
    let snapshots = [];

    if (!cutoffTime) {
      snapshots = await prisma.priceSnapshot.findMany({
        where: { marketId: marketIdBigInt },
        orderBy: { timestamp: 'asc' },
        take: 10000
      });
    } else {
      const [latestBeforeCutoff, inWindow] = await Promise.all([
        prisma.priceSnapshot.findFirst({
          where: {
            marketId: marketIdBigInt,
            timestamp: { lt: cutoffTime }
          },
          orderBy: { timestamp: 'desc' }
        }),
        prisma.priceSnapshot.findMany({
          where: {
            marketId: marketIdBigInt,
            timestamp: { gte: cutoffTime }
          },
          orderBy: { timestamp: 'asc' },
          take: 10000
        })
      ]);

      // Create a synthetic point exactly at cutoffTime using the last known price
      // (or the first in-window price if there is no prior snapshot).
      const seed = latestBeforeCutoff || inWindow[0];
      if (seed) {
        snapshots.push({
          ...seed,
          timestamp: cutoffTime,
          carriedForward: true
        });
      }

      snapshots = snapshots.concat(inWindow);
    }

    const resolutionMs = getResolutionMs(timeframe);
    let enrichedSnapshots = densifySnapshots(snapshots, resolutionMs);

    // Ensure we have at least 2 points so a line is drawable (symbols are disabled).
    if (Array.isArray(enrichedSnapshots) && enrichedSnapshots.length === 1) {
      const only = enrichedSnapshots[0];
      enrichedSnapshots = [
        only,
        {
          ...only,
          timestamp: now,
          carriedForward: true
        }
      ];
    }

    // Safety cap: prevent very large responses if the densification expands too much
    const MAX_POINTS = 20000;
    if (Array.isArray(enrichedSnapshots) && enrichedSnapshots.length > MAX_POINTS) {
      const stride = Math.ceil(enrichedSnapshots.length / MAX_POINTS);
      enrichedSnapshots = enrichedSnapshots.filter((_, idx) => idx % stride === 0 || idx === enrichedSnapshots.length - 1);
    }

    // Format data for chart
    const yesPriceHistory = enrichedSnapshots.map(snapshot => ({
      price: snapshot.yesPriceBps / 10000, // Convert basis points to decimal (5000 -> 0.5)
      timestamp: snapshot.timestamp.toISOString()
    }));

    const noPriceHistory = enrichedSnapshots.map(snapshot => ({
      price: snapshot.noPriceBps / 10000, // Convert basis points to decimal
      timestamp: snapshot.timestamp.toISOString()
    }));

    // Combined price history (for general charts)
    const priceHistory = enrichedSnapshots.map(snapshot => ({
      price: snapshot.yesPriceBps / 10000,
      timestamp: snapshot.timestamp.toISOString()
    }));

    return res.status(200).json({
      success: true,
      data: {
        priceHistory,
        yesPriceHistory,
        noPriceHistory,
        count: enrichedSnapshots.length,
        originalCount: snapshots.length,
        resolutionMs
      }
    });

  } catch (error) {
    console.error('Error fetching price history:', error);
    return res.status(500).json({
      error: 'Failed to fetch price history',
      details: error.message
    });
  }
};

