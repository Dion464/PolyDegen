const prisma = require('./prismaClient');
const { ethers } = require('ethers');

/**
 * Create an activity event in the database
 * @param {Object} params
 * @param {BigInt|string|number} params.marketId - Market ID
 * @param {string} params.eventType - ActivityEventType enum value
 * @param {string} [params.userAddress] - User wallet address
 * @param {string} [params.txHash] - Transaction hash
 * @param {BigInt|string|number} [params.blockNumber] - Block number
 * @param {Date} [params.blockTime] - Block timestamp
 * @param {string} [params.description] - Description text
 * @param {Object} [params.metadata] - Metadata object with UI data
 */
async function createActivityEvent({
  marketId,
  eventType,
  userAddress = null,
  txHash = null,
  blockNumber = null,
  blockTime = null,
  description = null,
  metadata = {},
}) {
  try {
    const marketIdBigInt = typeof marketId === 'bigint' ? marketId : BigInt(marketId);
    
    // Normalize user address to lowercase
    const normalizedUserAddress = userAddress ? userAddress.toLowerCase() : null;
    
    // Normalize block number
    const normalizedBlockNumber = blockNumber 
      ? (typeof blockNumber === 'bigint' ? blockNumber : BigInt(blockNumber))
      : null;

    // Check if market exists (for foreign key constraint)
    // If it doesn't exist, we'll still try to create the event but log a warning
    const marketExists = await prisma.market.findUnique({
      where: { marketId: marketIdBigInt },
      select: { marketId: true }
    }).catch(() => null);

    if (!marketExists) {
      console.warn(`[activityService] Market ${marketIdBigInt} does not exist in database yet. Activity event may fail due to foreign key constraint.`);
    }

    const activityEvent = await prisma.activityEvent.create({
      data: {
        marketId: marketIdBigInt,
        userAddress: normalizedUserAddress,
        eventType,
        txHash,
        blockNumber: normalizedBlockNumber,
        blockTime,
        description,
        metadata: metadata || {},
      },
    });

    return activityEvent;
  } catch (error) {
    console.error('Failed to create activity event:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    // Don't throw - activity events are non-critical
    return null;
  }
}

/**
 * Create activity event for a buy/sell trade
 * @param {Object} params
 * @param {BigInt|string|number} params.marketId
 * @param {string} params.userAddress
 * @param {boolean} params.isYes - true for YES/Up side, false for NO/Down side
 * @param {boolean} params.isBuy - true for buying, false for selling
 * @param {string} params.sharesWei - Shares amount in wei
 * @param {number} params.priceBps - Price in basis points
 * @param {string} params.costWei - Cost/payout in wei
 * @param {string} params.txHash
 * @param {BigInt|string|number} params.blockNumber
 * @param {Date} params.blockTime
 * @param {Object} [params.market] - Market object (optional, for getting question/category)
 */
async function createTradeActivity({
  marketId,
  userAddress,
  isYes,
  isBuy = true, // Default to buy for backwards compatibility
  sharesWei,
  priceBps,
  costWei,
  txHash,
  blockNumber,
  blockTime,
  market = null,
  marketQuestion = null, // Accept marketQuestion directly from frontend
}) {
  // Use the purchase price from the trade (priceBps), not current price
  const priceCents = Math.round(priceBps / 100);
  // Use costWei (the amount spent/received) for display, not shares
  // This shows the TCENT amount the user actually spent/received
  const costAmount = parseFloat(ethers.utils.formatEther(costWei || '0'));

  // Determine side label based on market type
  let side = isYes ? 'Yes' : 'No';
  if (market?.category === 'crypto') {
    side = isYes ? 'Up' : 'Down';
  }

  // Action is buy or sell (independent of Yes/No side)
  const action = isBuy ? 'bought' : 'sold';

  // Get market question - prefer passed value, then market object, then null
  const resolvedMarketQuestion = marketQuestion || market?.question || null;

  // Build transaction URL using Incentiv block explorer
  const explorerBase = process.env.BLOCK_EXPLORER_URL || 
                      process.env.VITE_BLOCK_EXPLORER_URL || 
                      'https://explorer-testnet.incentiv.io';
  const txUrl = txHash ? `${explorerBase.replace(/\/$/, '')}/tx/${txHash}` : null;

  // Determine avatar gradient based on category
  let avatarGradient = 'from-[#3B82F6] to-[#06B6D4]'; // Default blue
  if (market?.category === 'crypto') {
    avatarGradient = 'from-[#FF9900] to-[#FF5E00]'; // Orange for crypto
  } else if (market?.category === 'sports') {
    avatarGradient = 'from-[#10B981] to-[#059669]'; // Green for sports
  }

  return await createActivityEvent({
    marketId,
    eventType: 'ORDER_FILLED',
    userAddress,
    txHash,
    blockNumber,
    blockTime,
    description: `${userAddress.slice(0, 8)} ${action} ${side} shares`,
    metadata: {
      action,
      side,
      priceCents, // Purchase price at time of trade
      shares: costAmount, // Cost amount in TCENT (what user spent/received)
      txUrl,
      avatarGradient,
      timestampLabel: 'now',
      marketTitle: resolvedMarketQuestion,
    },
  });
}

/**
 * Create activity event for market creation
 */
async function createMarketCreatedActivity({
  marketId,
  creator,
  question,
  category,
  txHash,
  blockNumber,
  blockTime,
}) {
  return await createActivityEvent({
    marketId,
    eventType: 'MARKET_CREATED',
    userAddress: creator,
    txHash,
    blockNumber,
    blockTime,
    description: `New market created: ${question}`,
    metadata: {
      action: 'created',
      marketTitle: question,
      avatarGradient: category === 'crypto' 
        ? 'from-[#FF9900] to-[#FF5E00]'
        : 'from-[#3B82F6] to-[#06B6D4]',
    },
  });
}

/**
 * Create activity event for market resolution
 */
async function createMarketResolvedActivity({
  marketId,
  outcome,
  resolver,
  txHash,
  blockNumber,
  blockTime,
  market = null,
  marketQuestion = null, // Accept marketQuestion directly
}) {
  const outcomeLabels = { 1: 'Yes', 2: 'No', 3: 'Invalid' };
  const outcomeLabel = outcomeLabels[outcome] || 'Unknown';

  // Prefer passed marketQuestion, then market object question
  const resolvedMarketQuestion = marketQuestion || market?.question || null;

  return await createActivityEvent({
    marketId,
    eventType: 'MARKET_RESOLVED',
    userAddress: resolver,
    txHash,
    blockNumber,
    blockTime,
    description: `Market resolved: ${outcomeLabel}`,
    metadata: {
      action: 'resolved',
      outcome: outcomeLabel,
      marketTitle: resolvedMarketQuestion,
    },
  });
}

module.exports = {
  createActivityEvent,
  createTradeActivity,
  createMarketCreatedActivity,
  createMarketResolvedActivity,
};

