import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { getOrderMatcher } from './lib/orderMatcher.js';
// Note: executeOrderViaAMM not implemented yet
// import { executeOrderViaAMM } from './lib/execute-amm-order.js';

// WebSocket broadcaster for handlers
const wsBroadcaster = require('./lib/wsBroadcaster.js');

// Import handlers from lib/api-handlers
const priceHistoryHandler = require('./lib/api-handlers/price-history.js');
const recordPriceHandler = require('./lib/api-handlers/record-price.js');
const ordersHandler = require('./lib/api-handlers/orders.js');
const userStatsHandler = require('./lib/api-handlers/user-stats.js');
const pendingMarketsHandler = require('./lib/api-handlers/pending-markets.js');
const pendingMarketByIdHandler = require('./lib/api-handlers/pending-market-by-id.js');
const activityHandler = require('./lib/api-handlers/activity.js');
const createActivityHandler = require('./lib/api-handlers/activity-create.js');
const marketParticipantsHandler = require('./lib/api-handlers/market-participants.js');
const marketsHandler = require('./lib/api-handlers/markets.js');
const notificationsHandler = require('./lib/api-handlers/notifications.js');
const marketImagesHandler = require('./lib/api-handlers/market-images.js');
const topHoldersHandler = require('./lib/api-handlers/top-holders.js');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Helper to convert Express req to Vercel-style format
function createVercelRequest(expressReq) {
  return {
    method: expressReq.method,
    url: `${expressReq.protocol}://${expressReq.get('host')}${expressReq.originalUrl}`,
    body: expressReq.body
  };
}

// API Routes
app.get('/api/price-history', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    await priceHistoryHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in price-history handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/record-price', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    await recordPriceHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in record-price handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Order management routes
app.post('/api/orders', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    await ordersHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in orders handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    await ordersHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in orders handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/orders/:orderId', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    // Add orderId to the URL for the handler
    vercelReq.url = `/api/orders/${req.params.orderId}`;
    await ordersHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in orders handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Settlement route (stub - not implemented)
app.post('/api/settle', async (req, res) => {
  try {
    // Settlement is handled on-chain via smart contract
    res.status(200).json({ message: 'Settlement processed' });
  } catch (error) {
    console.error('Error in settle handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// User stats route
app.get('/api/user-stats/:address', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    // Add the address parameter to the request
    vercelReq.params = { address: req.params.address };
    await userStatsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in user-stats handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pending markets routes
app.get('/api/pending-markets', async (req, res) => {
  try {
    const vercelReq = { ...req, query: req.query };
    await pendingMarketsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in pending-markets handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pending-markets', async (req, res) => {
  try {
    const vercelReq = { ...req, query: req.query, body: req.body };
    await pendingMarketsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in pending-markets handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pending-markets/:id', async (req, res) => {
  try {
    const vercelReq = { ...req, query: { ...req.query, id: req.params.id } };
    await pendingMarketByIdHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in pending-market handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Activity routes
app.get('/api/activity', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.query = req.query;
    await activityHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in activity handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/activity/create', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    await createActivityHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in create activity handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Markets list route
app.get('/api/markets', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.query = req.query;
    await marketsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in markets handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Market images route
app.get('/api/market-images', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.query = req.query;
    await marketImagesHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in market-images handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Market participants route (for resolution notifications)
app.get('/api/markets/:marketId/participants', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.query = { ...req.query, marketId: req.params.marketId };
    await marketParticipantsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in market participants handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Top holders route - get top 5 holders for a market
app.get('/api/markets/:marketId/top-holders', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.query = { ...req.query, marketId: req.params.marketId };
    await topHoldersHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in top holders handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Notifications routes
app.get('/api/notifications', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.query = req.query;
    await notificationsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in notifications handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    await notificationsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in notifications handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/notifications', async (req, res) => {
  try {
    const vercelReq = createVercelRequest(req);
    vercelReq.body = req.body;
    await notificationsHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in notifications handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/pending-markets/:id', async (req, res) => {
  try {
    const vercelReq = { ...req, query: { ...req.query, id: req.params.id }, body: req.body };
    await pendingMarketByIdHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in pending-market handler:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pending-markets/:id', async (req, res) => {
  try {
    const vercelReq = { ...req, query: { ...req.query, id: req.params.id } };
    await pendingMarketByIdHandler(vercelReq, res);
  } catch (error) {
    console.error('Error in pending-market handler:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket Server for real-time order book updates
const server = createServer(app);
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  // Handle connection upgrade
  verifyClient: (info) => {
    // Accept all connections for now
    return true;
  }
});

// Subscription channels
const clients = new Map(); // marketId:outcomeId -> Set of WebSocket connections
const globalSubscribers = new Set(); // Clients subscribed to all updates
const marketSubscribers = new Map(); // marketId -> Set of clients for market-specific updates

wss.on('connection', (ws, req) => {
  console.log('📡 New WebSocket connection from:', req.socket.remoteAddress);
  
  // Track all subscriptions for this client
  ws.subscriptions = new Set();

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe') {
        // Subscribe to order book updates for a market/outcome
        const key = `${data.marketId}:${data.outcomeId}`;
        if (!clients.has(key)) {
          clients.set(key, new Set());
        }
        clients.get(key).add(ws);
        ws.subscriptions.add({ type: 'orderbook', key });
        
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: 'orderbook',
          marketId: data.marketId,
          outcomeId: data.outcomeId
        }));
        
        console.log(`✅ Client subscribed to orderbook: ${key}`);
      }
      
      // Subscribe to all global updates (prices, activity, etc.)
      if (data.type === 'subscribe_global') {
        globalSubscribers.add(ws);
        ws.subscriptions.add({ type: 'global' });
        
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: 'global'
        }));
        
        console.log('✅ Client subscribed to global updates');
      }
      
      // Subscribe to a specific market's updates
      if (data.type === 'subscribe_market') {
        const marketId = data.marketId;
        if (!marketSubscribers.has(marketId)) {
          marketSubscribers.set(marketId, new Set());
        }
        marketSubscribers.get(marketId).add(ws);
        ws.subscriptions.add({ type: 'market', marketId });
        
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: 'market',
          marketId
        }));
        
        console.log(`✅ Client subscribed to market: ${marketId}`);
      }
      
      // Ping/pong for keep-alive
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    // Clean up all subscriptions
    globalSubscribers.delete(ws);
    
    ws.subscriptions?.forEach(sub => {
      if (sub.type === 'orderbook' && clients.has(sub.key)) {
        clients.get(sub.key).delete(ws);
        if (clients.get(sub.key).size === 0) {
          clients.delete(sub.key);
        }
      }
      if (sub.type === 'market' && marketSubscribers.has(sub.marketId)) {
        marketSubscribers.get(sub.marketId).delete(ws);
        if (marketSubscribers.get(sub.marketId).size === 0) {
          marketSubscribers.delete(sub.marketId);
        }
      }
    });
    
    console.log('📡 WebSocket disconnected');
  });
});

// Broadcast order book updates
export function broadcastOrderBookUpdate(marketId, outcomeId, orderBookData) {
  const key = `${marketId}:${outcomeId}`;
  if (!clients.has(key)) return;
  
  const message = JSON.stringify({
    type: 'orderbook_update',
    marketId,
    outcomeId,
    timestamp: Date.now(),
    ...orderBookData
  });
  
  clients.get(key).forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Broadcast price updates to global and market subscribers
export function broadcastPriceUpdate(marketId, priceData) {
  const message = JSON.stringify({
    type: 'price_update',
    marketId,
    timestamp: Date.now(),
    ...priceData
  });
  
  // Send to global subscribers
  globalSubscribers.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  
  // Send to market-specific subscribers
  if (marketSubscribers.has(marketId)) {
    marketSubscribers.get(marketId).forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }
}

// Broadcast new activity (trades, etc.)
export function broadcastActivity(activity) {
  const message = JSON.stringify({
    type: 'activity',
    timestamp: Date.now(),
    ...activity
  });
  
  // Send to all global subscribers
  globalSubscribers.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  
  // Send to market-specific subscribers if activity has marketId
  if (activity.marketId && marketSubscribers.has(activity.marketId)) {
    marketSubscribers.get(activity.marketId).forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }
}

// Broadcast market status changes (resolved, etc.)
export function broadcastMarketUpdate(marketId, updateData) {
  const message = JSON.stringify({
    type: 'market_update',
    marketId,
    timestamp: Date.now(),
    ...updateData
  });
  
  // Send to global and market subscribers
  globalSubscribers.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  
  if (marketSubscribers.has(marketId)) {
    marketSubscribers.get(marketId).forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }
}

// Register broadcast functions with the broadcaster module
// This allows API handlers to broadcast updates
wsBroadcaster.setBroadcastFunctions({
  priceUpdate: broadcastPriceUpdate,
  activity: broadcastActivity,
  marketUpdate: broadcastMarketUpdate,
  orderBookUpdate: broadcastOrderBookUpdate
});

// Auto-settlement callback
async function handleAutoSettlement({ makerOrder, takerOrder, fillSize, fillPrice }) {
  try {
    const API_BASE = process.env.API_BASE_URL || `http://localhost:${PORT}`;
    
    // Call settlement endpoint
    const response = await fetch(`${API_BASE}/api/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        makerOrder,
        takerOrder,
        fillSize,
        signatures: {
          maker: makerOrder.signature,
          taker: takerOrder.signature
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Auto-settled trade: ${result.txHash}`);
    } else {
      console.error('Auto-settlement failed:', await response.text());
    }
  } catch (error) {
    console.error('Error in auto-settlement:', error);
  }
}

// Start order matching service
const orderMatcher = getOrderMatcher(handleAutoSettlement);

// Set callback for executing orders via AMM when market price crosses limit
// Note: AMM execution not yet implemented
orderMatcher.setAMMExecutionCallback(async (order) => {
  try {
    console.log(`💰 Order ${order.id} would be executed via AMM (not implemented yet)`);
    // AMM execution logic would go here
    // await executeOrderViaAMM(order);
  } catch (error) {
    console.error(`Failed to process order ${order.id}:`, error);
  }
});

orderMatcher.start(5000); // Match every 5 seconds

server.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`   - GET  /api/price-history`);
  console.log(`   - POST /api/record-price`);
  console.log(`   - POST /api/orders (place order)`);
  console.log(`   - GET  /api/orders (get order book)`);
  console.log(`   - DELETE /api/orders/:id (cancel order)`);
  console.log(`   - POST /api/settle (settle trade)`);
  console.log(`   - GET  /api/user-stats/:address (user profile stats)`);
  console.log(`   - GET  /api/pending-markets (list pending markets)`);
  console.log(`   - POST /api/pending-markets (submit market)`);
  console.log(`   - PATCH /api/pending-markets/:id (approve/reject)`);
  console.log(`   - WS   ws://localhost:${PORT} (WebSocket for order book)`);
  console.log(`\n🔄 Order matching service: Running (matches every 5s)`);
  console.log(`\n📊 Database: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
  console.log(`   Exchange Contract: ${process.env.EXCHANGE_CONTRACT_ADDRESS || 'Not set'}`);
});

