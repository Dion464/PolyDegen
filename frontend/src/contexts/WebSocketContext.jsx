import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Get API URL for polling
const getApiUrl = () => {
  if (window.ENV_CONFIG?.API_URL) {
    return window.ENV_CONFIG.API_URL;
  }
  // Default for local dev
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:8080';
  }
  // Production - use same origin
  return '';
};

// Get WebSocket URL
const getWsUrl = () => {
  if (window.ENV_CONFIG?.WS_URL) {
    return window.ENV_CONFIG.WS_URL;
  }
  
  // Only try WebSocket in development
  if (window.location.hostname === 'localhost') {
    return 'ws://localhost:8080/ws';
  }
  
  // In production (Vercel), return null to use polling instead
  return null;
};

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [usePolling, setUsePolling] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const messageHandlers = useRef(new Map());
  const subscribedMarkets = useRef(new Set());

  // Connect to WebSocket (or fall back to polling)
  const connect = useCallback(() => {
    const wsUrl = getWsUrl();
    
    // If no WebSocket URL (production/Vercel), use polling
    if (!wsUrl) {
      console.log('📡 Using polling mode (Vercel/Production)');
      setUsePolling(true);
      setIsConnected(true);
      setConnectionState('polling');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('🔌 WebSocket connecting to:', wsUrl);
    setConnectionState('connecting');

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setConnectionState('connected');
        setUsePolling(false);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Call handlers for this message type
          const handlers = messageHandlers.current.get(data.type);
          handlers?.forEach(handler => handler(data));
          
          // Call wildcard handlers
          const allHandlers = messageHandlers.current.get('*');
          allHandlers?.forEach(handler => handler(data));
        } catch (error) {
          console.error('WebSocket parse error:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('📡 WebSocket disconnected, switching to polling');
        setIsConnected(true); // Still "connected" via polling
        setConnectionState('polling');
        setUsePolling(true);
      };

      wsRef.current.onerror = () => {
        console.log('⚠️ WebSocket error, switching to polling');
        setUsePolling(true);
        setConnectionState('polling');
        setIsConnected(true);
      };
    } catch (error) {
      console.log('WebSocket not available, using polling');
      setUsePolling(true);
      setIsConnected(true);
      setConnectionState('polling');
    }
  }, []);

  // Send message (no-op in polling mode)
  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Subscribe to global updates
  const subscribeGlobal = useCallback(() => {
    send({ type: 'subscribe_global' });
  }, [send]);

  // Subscribe to market updates
  const subscribeMarket = useCallback((marketId) => {
    subscribedMarkets.current.add(marketId);
    send({ type: 'subscribe_market', marketId });
  }, [send]);

  // Register message handler
  const onMessage = useCallback((type, handler) => {
    if (!messageHandlers.current.has(type)) {
      messageHandlers.current.set(type, new Set());
    }
    messageHandlers.current.get(type).add(handler);
    
    return () => {
      messageHandlers.current.get(type)?.delete(handler);
    };
  }, []);

  // Trigger handlers manually (for polling)
  const triggerHandlers = useCallback((type, data) => {
    const handlers = messageHandlers.current.get(type);
    handlers?.forEach(handler => handler(data));
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const value = {
    isConnected,
    connectionState,
    usePolling,
    send,
    subscribeGlobal,
    subscribeMarket,
    onMessage,
    triggerHandlers,
    subscribedMarkets: subscribedMarkets.current,
    apiUrl: getApiUrl()
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook to use WebSocket context
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}

// Hook for real-time price updates (with polling fallback)
export function useLivePrices(marketId, pollInterval = 10000) {
  const [prices, setPrices] = useState(null);
  const { isConnected, usePolling, subscribeMarket, onMessage, apiUrl } = useWebSocket();
  const lastFetchRef = useRef(null);

  // WebSocket mode
  useEffect(() => {
    if (!isConnected || !marketId || usePolling) return;

    subscribeMarket(marketId);
    
    return onMessage('price_update', (data) => {
      if (data.marketId === marketId || data.marketId === String(marketId)) {
        setPrices({
          yesPrice: data.yesPrice,
          noPrice: data.noPrice,
          timestamp: data.timestamp
        });
      }
    });
  }, [isConnected, marketId, usePolling, subscribeMarket, onMessage]);

  // Polling mode (for Vercel/production)
  // ONLY updates UI when data actually changes - no unnecessary re-renders
  useEffect(() => {
    if (!usePolling || !marketId) return;

    const fetchPrices = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/price-history?marketId=${marketId}&limit=1`);
        if (response.ok) {
          const data = await response.json();
          if (data.history && data.history.length > 0) {
            const latest = data.history[0];
            const newYesPrice = latest.yesPriceBps / 10000;
            const newNoPrice = latest.noPriceBps / 10000;
            
            // Compare with previous values - only update if ACTUALLY different
            const prev = lastFetchRef.current;
            const hasChanged = !prev || 
              Math.abs(prev.yesPrice - newYesPrice) > 0.0001 || 
              Math.abs(prev.noPrice - newNoPrice) > 0.0001;
            
            if (hasChanged) {
              const newPrices = {
                yesPrice: newYesPrice,
                noPrice: newNoPrice,
                timestamp: new Date(latest.timestamp).getTime()
              };
              lastFetchRef.current = newPrices;
              setPrices(newPrices);
              console.log('📊 Price updated:', newYesPrice, newNoPrice);
            }
            // If no change, do nothing - no re-render
          }
        }
      } catch (error) {
        // Silent fail for polling
      }
    };

    // Initial fetch
    fetchPrices();
    
    // Poll at interval (default 10s, but UI only updates on change)
    const interval = setInterval(fetchPrices, pollInterval);
    
    return () => clearInterval(interval);
  }, [usePolling, marketId, apiUrl, pollInterval]);

  return prices;
}

// Hook for real-time activity (with polling fallback)
export function useLiveActivity(marketId = null, pollInterval = 15000) {
  const [activities, setActivities] = useState([]);
  const { isConnected, usePolling, subscribeGlobal, subscribeMarket, onMessage, apiUrl } = useWebSocket();
  const lastFetchRef = useRef(null);

  // WebSocket mode
  useEffect(() => {
    if (!isConnected || usePolling) return;

    if (marketId) {
      subscribeMarket(marketId);
    } else {
      subscribeGlobal();
    }
    
    return onMessage('activity', (data) => {
      if (!marketId || data.marketId === marketId) {
        setActivities(prev => [data, ...prev].slice(0, 100));
      }
    });
  }, [isConnected, usePolling, marketId, subscribeGlobal, subscribeMarket, onMessage]);

  // Polling mode - ONLY updates when new activity arrives
  useEffect(() => {
    if (!usePolling) return;

    const fetchActivity = async () => {
      try {
        const url = marketId 
          ? `${apiUrl}/api/activity?marketId=${marketId}&limit=20`
          : `${apiUrl}/api/activity?limit=20`;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.activities && data.activities.length > 0) {
            // Check if there are NEW activities (compare latest ID)
            const latestId = data.activities[0]?.id;
            if (latestId && latestId !== lastFetchRef.current) {
              lastFetchRef.current = latestId;
              setActivities(data.activities);
              console.log('📢 New activity detected');
            }
            // No new activity = no update = no re-render
          }
        }
      } catch (error) {
        // Silent fail
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, pollInterval);
    
    return () => clearInterval(interval);
  }, [usePolling, marketId, apiUrl, pollInterval]);

  return activities;
}

// Hook for market updates (resolution, etc.)
export function useLiveMarketUpdates(marketId, pollInterval = 30000) {
  const [update, setUpdate] = useState(null);
  const { isConnected, usePolling, subscribeMarket, onMessage, apiUrl } = useWebSocket();

  // WebSocket mode
  useEffect(() => {
    if (!isConnected || !marketId || usePolling) return;

    subscribeMarket(marketId);
    
    return onMessage('market_update', (data) => {
      if (data.marketId === marketId || data.marketId === String(marketId)) {
        setUpdate(data);
      }
    });
  }, [isConnected, marketId, usePolling, subscribeMarket, onMessage]);

  // Polling mode - check market status
  useEffect(() => {
    if (!usePolling || !marketId) return;

    const checkMarket = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/markets?marketId=${marketId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.market?.resolved) {
            setUpdate({
              type: 'market_update',
              marketId,
              status: 'resolved',
              outcome: data.market.outcome
            });
          }
        }
      } catch (error) {
        // Silent fail
      }
    };

    const interval = setInterval(checkMarket, pollInterval);
    
    return () => clearInterval(interval);
  }, [usePolling, marketId, apiUrl, pollInterval]);

  return update;
}

export default WebSocketContext;

