/**
 * WebSocket Broadcaster Module
 * Allows API handlers to broadcast updates to connected clients
 */

// Store broadcast functions set by the main server
let broadcastFunctions = {
  priceUpdate: null,
  activity: null,
  marketUpdate: null,
  orderBookUpdate: null
};

// Set broadcast functions (called from api-server.js)
function setBroadcastFunctions(functions) {
  broadcastFunctions = { ...broadcastFunctions, ...functions };
  console.log('📡 WebSocket broadcast functions registered');
}

// Broadcast price update
function broadcastPriceUpdate(marketId, priceData) {
  if (broadcastFunctions.priceUpdate) {
    broadcastFunctions.priceUpdate(marketId, priceData);
  }
}

// Broadcast activity (trade, position change, etc.)
function broadcastActivity(activity) {
  if (broadcastFunctions.activity) {
    broadcastFunctions.activity(activity);
  }
}

// Broadcast market update (resolution, status change)
function broadcastMarketUpdate(marketId, updateData) {
  if (broadcastFunctions.marketUpdate) {
    broadcastFunctions.marketUpdate(marketId, updateData);
  }
}

// Broadcast order book update
function broadcastOrderBookUpdate(marketId, outcomeId, orderBookData) {
  if (broadcastFunctions.orderBookUpdate) {
    broadcastFunctions.orderBookUpdate(marketId, outcomeId, orderBookData);
  }
}

module.exports = {
  setBroadcastFunctions,
  broadcastPriceUpdate,
  broadcastActivity,
  broadcastMarketUpdate,
  broadcastOrderBookUpdate
};

