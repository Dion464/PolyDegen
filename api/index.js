// Consolidated API handler to stay within Vercel's 12 function limit
// All routes go through this single serverless function

// Import handlers from lib folder 
const activityHandler = require('../lib/api-handlers/activity.js');
const createActivityHandler = require('../lib/api-handlers/activity-create.js');
const marketImagesHandler = require('../lib/api-handlers/market-images.js');
const marketsHandler = require('../lib/api-handlers/markets.js');
const marketParticipantsHandler = require('../lib/api-handlers/market-participants.js');
const notificationsHandler = require('../lib/api-handlers/notifications.js');
const ordersHandler = require('../lib/api-handlers/orders.js');
const orderByIdHandler = require('../lib/api-handlers/order-by-id.js');
const pendingMarketsHandler = require('../lib/api-handlers/pending-markets.js');
const pendingMarketByIdHandler = require('../lib/api-handlers/pending-market-by-id.js');
const priceHistoryHandler = require('../lib/api-handlers/price-history.js');
const recordPriceHandler = require('../lib/api-handlers/record-price.js');
const userStatsHandler = require('../lib/api-handlers/user-stats.js');
const topHoldersHandler = require('../lib/api-handlers/top-holders.js');
const updatePositionHandler = require('../lib/api-handlers/update-position.js');
const clearDatabaseHandler = require('../lib/api-handlers/clear-database.js');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse the URL path and query params
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  
  // Always ensure req.query is populated from URL search params
  // Vercel may or may not set this depending on the route
  req.query = req.query || {};
  url.searchParams.forEach((value, key) => {
    // Don't overwrite existing query params from Vercel
    if (req.query[key] === undefined) {
      req.query[key] = value;
    }
  });
  
  console.log(`[API] ${req.method} ${path}`, { query: req.query });

  try {
    // Route based on path
    
    // Activity routes
    if (path === '/api/activity/create') {
      return await createActivityHandler(req, res);
    }
    if (path === '/api/activity') {
      return await activityHandler(req, res);
    }

    // Markets routes
    const marketParticipantsMatch = path.match(/^\/api\/markets\/(\d+)\/participants$/);
    if (marketParticipantsMatch) {
      req.query.marketId = marketParticipantsMatch[1];
      return await marketParticipantsHandler(req, res);
    }
    
    // Top holders route
    const topHoldersMatch = path.match(/^\/api\/markets\/(\d+)\/top-holders$/);
    if (topHoldersMatch) {
      req.query.marketId = topHoldersMatch[1];
      return await topHoldersHandler(req, res);
    }
    
    // Update position route (called after trades)
    if (path === '/api/update-position') {
      return await updatePositionHandler(req, res);
    }
    
    if (path === '/api/markets') {
      return await marketsHandler(req, res);
    }

    // Market images
    if (path === '/api/market-images') {
      return await marketImagesHandler(req, res);
    }

    // Notifications
    if (path === '/api/notifications') {
      return await notificationsHandler(req, res);
    }

    // Orders routes
    const orderByIdMatch = path.match(/^\/api\/orders\/(\d+)$/);
    if (orderByIdMatch) {
      req.query.orderId = orderByIdMatch[1];
      return await orderByIdHandler(req, res);
    }
    if (path === '/api/orders') {
      return await ordersHandler(req, res);
    }

    // Pending markets routes
    const pendingMarketByIdMatch = path.match(/^\/api\/pending-markets\/(\d+)$/);
    if (pendingMarketByIdMatch) {
      req.query.id = pendingMarketByIdMatch[1];
      return await pendingMarketByIdHandler(req, res);
    }
    if (path === '/api/pending-markets') {
      return await pendingMarketsHandler(req, res);
    }

    // Price history
    if (path === '/api/price-history') {
      return await priceHistoryHandler(req, res);
    }

    // Record price
    if (path === '/api/record-price') {
      return await recordPriceHandler(req, res);
    }

    // User stats (with optional address parameter)
    const userStatsMatch = path.match(/^\/api\/user-stats(?:\/(.+))?$/);
    if (userStatsMatch) {
      if (userStatsMatch[1]) {
        req.params = req.params || {};
        req.params.address = userStatsMatch[1];
      }
      return await userStatsHandler(req, res);
    }

    // Admin: Clear database
    if (path === '/api/admin/clear-database') {
      return await clearDatabaseHandler(req, res);
    }

    // 404 for unknown routes
    return res.status(404).json({ error: 'API route not found', path });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
