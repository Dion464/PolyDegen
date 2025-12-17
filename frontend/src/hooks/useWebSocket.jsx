import { useState, useEffect, useCallback, useRef } from 'react';

// Get WebSocket URL from environment or default
const getWsUrl = () => {
  // Check for environment variable first
  if (window.ENV_CONFIG?.WS_URL) {
    return window.ENV_CONFIG.WS_URL;
  }
  
  // Default: derive from current location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = window.ENV_CONFIG?.API_PORT || '8080';
  
  // In production, use the same host
  if (window.location.hostname !== 'localhost') {
    return `${protocol}//${host}/ws`;
  }
  
  // In development, use localhost with API port
  return `ws://localhost:${port}/ws`;
};

// WebSocket connection states
const WS_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

/**
 * Custom hook for WebSocket connection with auto-reconnect
 */
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const messageHandlers = useRef(new Map());
  const subscriptions = useRef(new Set());

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WS_STATE.OPEN) {
      return; // Already connected
    }

    const wsUrl = getWsUrl();
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    setConnectionState('connecting');

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setConnectionState('connected');
        reconnectAttempts.current = 0;
        
        // Re-subscribe to all previous subscriptions
        subscriptions.current.forEach(sub => {
          wsRef.current.send(JSON.stringify(sub));
        });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Call registered handlers for this message type
          const handlers = messageHandlers.current.get(data.type);
          if (handlers) {
            handlers.forEach(handler => handler(data));
          }
          
          // Also call 'all' handlers
          const allHandlers = messageHandlers.current.get('*');
          if (allHandlers) {
            allHandlers.forEach(handler => handler(data));
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('📡 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setConnectionState('disconnected');
        
        // Auto-reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 Reconnecting in ${delay}ms...`);
          setConnectionState('reconnecting');
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionState('error');
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setConnectionState('error');
    }
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionState('disconnected');
  }, []);

  // Send a message
  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WS_STATE.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('WebSocket not connected, cannot send message');
    return false;
  }, []);

  // Subscribe to global updates (prices, activity, etc.)
  const subscribeGlobal = useCallback(() => {
    const sub = { type: 'subscribe_global' };
    subscriptions.current.add(sub);
    send(sub);
  }, [send]);

  // Subscribe to a specific market
  const subscribeMarket = useCallback((marketId) => {
    const sub = { type: 'subscribe_market', marketId };
    subscriptions.current.add(sub);
    send(sub);
  }, [send]);

  // Subscribe to order book updates
  const subscribeOrderBook = useCallback((marketId, outcomeId) => {
    const sub = { type: 'subscribe', marketId, outcomeId };
    subscriptions.current.add(sub);
    send(sub);
  }, [send]);

  // Register a message handler
  const onMessage = useCallback((type, handler) => {
    if (!messageHandlers.current.has(type)) {
      messageHandlers.current.set(type, new Set());
    }
    messageHandlers.current.get(type).add(handler);
    
    // Return cleanup function
    return () => {
      messageHandlers.current.get(type)?.delete(handler);
    };
  }, []);

  // Ping to keep connection alive
  const ping = useCallback(() => {
    send({ type: 'ping' });
  }, [send]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    // Setup ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (isConnected) {
        ping();
      }
    }, 30000); // Ping every 30 seconds
    
    return () => {
      clearInterval(pingInterval);
      disconnect();
    };
  }, [connect, disconnect, ping, isConnected]);

  return {
    isConnected,
    connectionState,
    lastMessage,
    send,
    connect,
    disconnect,
    subscribeGlobal,
    subscribeMarket,
    subscribeOrderBook,
    onMessage,
    ping
  };
}

/**
 * Hook for subscribing to price updates for a specific market
 */
export function usePriceUpdates(marketId) {
  const [prices, setPrices] = useState(null);
  const { isConnected, subscribeMarket, onMessage } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !marketId) return;

    subscribeMarket(marketId);
    
    const cleanup = onMessage('price_update', (data) => {
      if (data.marketId === marketId) {
        setPrices({
          yesPrice: data.yesPrice,
          noPrice: data.noPrice,
          timestamp: data.timestamp
        });
      }
    });

    return cleanup;
  }, [isConnected, marketId, subscribeMarket, onMessage]);

  return prices;
}

/**
 * Hook for subscribing to activity updates
 */
export function useActivityUpdates() {
  const [activities, setActivities] = useState([]);
  const { isConnected, subscribeGlobal, onMessage } = useWebSocket();

  useEffect(() => {
    if (!isConnected) return;

    subscribeGlobal();
    
    const cleanup = onMessage('activity', (data) => {
      setActivities(prev => [data, ...prev].slice(0, 50)); // Keep last 50
    });

    return cleanup;
  }, [isConnected, subscribeGlobal, onMessage]);

  return activities;
}

export default useWebSocket;

