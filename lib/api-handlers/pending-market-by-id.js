const prisma = require('../prismaClient');

// Helper to convert BigInt values to strings for JSON serialization
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
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const serialized = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value);
    }
    return serialized;
  }
  
  return obj;
}

module.exports = async (req, res) => {
  // Handle OPTIONS preflight FIRST - before any other logic
  // This is critical for CORS to work from localhost
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    return res.status(200).end();
  }

  // Log all incoming requests for debugging
  console.log(`[pending-markets/[id]] Received ${req.method} request`);
  console.log(`[pending-markets/[id]] URL: ${req.url || 'no url'}`);
  console.log(`[pending-markets/[id]] Query:`, req.query);
  
  // Set CORS headers for all other requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // On Vercel, dynamic route params come from req.query
  // The route /api/pending-markets/30 should have req.query.id = '30'
  // But sometimes we need to extract from URL path as fallback
  let id = req.query?.id;
  
  // Try multiple patterns to extract ID - Vercel might pass it differently
  if (!id && req.url) {
    // Try full path: /api/pending-markets/29
    let match = req.url.match(/\/pending-markets\/(\d+)/);
    if (match) {
      id = match[1];
    } else {
      // Try just the number: /29
      match = req.url.match(/\/(\d+)(?:\?|$)/);
      if (match) {
        id = match[1];
      }
    }
    if (id) {
      console.log(`[pending-markets/[id]] Extracted id from URL: ${id}`);
    }
  }
  
  // Also check if Vercel puts it in a different query param
  if (!id && req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'id' || (/^\d+$/.test(String(value)) && !isNaN(parseInt(value)))) {
        id = String(value);
        break;
      }
    }
  }

  console.log(`[pending-markets/[id]] ${req.method} request for id: ${id}, URL: ${req.url}, Query:`, req.query);

  if (!id) {
    console.error('[pending-markets/[id]] Missing id parameter');
    console.error('[pending-markets/[id]] req.query:', req.query);
    console.error('[pending-markets/[id]] req.url:', req.url);
    return res.status(400).json({ error: 'Market ID is required' });
  }

  try {
    if (req.method === 'GET') {
      // Get specific pending market
      const pendingMarket = await prisma.pendingMarket.findUnique({
        where: { id: BigInt(id) }
      });

      if (!pendingMarket) {
        return res.status(404).json({ error: 'Pending market not found' });
      }

      const serializedMarket = serializeBigInt(pendingMarket);
      if (serializedMarket.rules) {
        serializedMarket.rules = JSON.parse(serializedMarket.rules);
      } else {
        serializedMarket.rules = [];
      }

      return res.status(200).json({
        success: true,
        pendingMarket: serializedMarket
      });
    }

    if (req.method === 'PATCH') {
      // Update pending market status (approve/reject)
      console.log('[pending-markets/[id]] PATCH request received');
      console.log('[pending-markets/[id]] Request body:', JSON.stringify(req.body, null, 2));
      console.log('[pending-markets/[id]] ID from query/URL:', id);
      
      // Parse body if it's a string (sometimes Vercel doesn't parse it)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          console.error('[pending-markets/[id]] Failed to parse body:', e);
        }
      }
      
      const { status, deployedMarketId, rejectionReason } = body || req.body;

      if (!status) {
        console.error('[pending-markets/[id]] Missing status in request body');
        return res.status(400).json({ error: 'Status is required' });
      }

      // Validate status
      const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'DEPLOYED'];
      if (!validStatuses.includes(status.toUpperCase())) {
        return res.status(400).json({ 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      // Build update data
      const updateData = {
        status: status.toUpperCase()
      };

      if (status.toUpperCase() === 'DEPLOYED' && deployedMarketId) {
        updateData.deployedMarketId = BigInt(deployedMarketId);
      }

      if (status.toUpperCase() === 'REJECTED' && rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }

      // Update the pending market
      let updatedMarket;
      try {
        updatedMarket = await prisma.pendingMarket.update({
          where: { id: BigInt(id) },
          data: updateData
        });
        console.log(`[pending-markets/[id]] Successfully updated pending market ${id}`);
      } catch (updateError) {
        console.error(`[pending-markets/[id]] Failed to update pending market:`, updateError);
        throw new Error(`Failed to update pending market: ${updateError.message}`);
      }

      // Serialize BigInt values
      const serializedMarket = serializeBigInt(updatedMarket);
      if (serializedMarket.rules) {
        try {
          serializedMarket.rules = JSON.parse(serializedMarket.rules);
        } catch (parseError) {
          console.error(`[pending-markets/[id]] Failed to parse rules:`, parseError);
          serializedMarket.rules = [];
        }
      } else {
        serializedMarket.rules = [];
      }

      // Send notification to market creator (non-blocking)
      if (status.toUpperCase() === 'DEPLOYED' || status.toUpperCase() === 'REJECTED') {
        try {
          let notificationType, notificationTitle, notificationMessage;
          
          if (status.toUpperCase() === 'REJECTED') {
            notificationType = 'MARKET_REJECTED';
            notificationTitle = 'Market Rejected';
            notificationMessage = `Your market "${updatedMarket.question}" was rejected. Reason: ${rejectionReason || 'No reason provided'}`;
          } else if (status.toUpperCase() === 'DEPLOYED') {
            notificationType = 'MARKET_APPROVED';
            notificationTitle = 'Market Approved & Deployed!';
            notificationMessage = `Your market "${updatedMarket.question}" has been approved and deployed to the blockchain!`;
          }
          
          if (notificationType && updatedMarket.creator) {
            await prisma.notification.create({
              data: {
                recipient: updatedMarket.creator.toLowerCase(),
                type: notificationType,
                title: notificationTitle,
                message: notificationMessage,
                marketId: deployedMarketId ? BigInt(deployedMarketId) : null,
                pendingMarketId: BigInt(id),
                read: false
              }
            });
            console.log(`[pending-markets/[id]] Notification sent to ${updatedMarket.creator}`);
          }
        } catch (notifError) {
          console.error(`[pending-markets/[id]] Failed to send notification:`, notifError);
          // Don't fail the request if notification fails - it's non-critical
        }
      }

      return res.status(200).json({
        success: true,
        pendingMarket: serializedMarket
      });
    }

    if (req.method === 'DELETE') {
      // Delete pending market
      await prisma.pendingMarket.delete({
        where: { id: BigInt(id) }
      });

      return res.status(200).json({
        success: true,
        message: 'Pending market deleted'
      });
    }

    // Log unexpected methods
    console.error(`[pending-markets/[id]] Unsupported method: ${req.method} for id: ${id}`);
    return res.status(405).json({ 
      error: 'Method not allowed',
      receivedMethod: req.method,
      supportedMethods: ['GET', 'PATCH', 'DELETE', 'OPTIONS']
    });
  } catch (error) {
    console.error('[pending-markets/[id]] Error in API handler:', error);
    console.error('[pending-markets/[id]] Error stack:', error.stack);
    console.error('[pending-markets/[id]] Error name:', error.name);
    console.error('[pending-markets/[id]] Error code:', error.code);
    
    // Return more detailed error info for debugging
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      code: error.code || 'UNKNOWN',
      name: error.name || 'Error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
