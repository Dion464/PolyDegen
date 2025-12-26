import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { getCurrencySymbol } from '../../utils/currency';
import { centsToTCENT } from '../../utils/priceFormatter';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { showGlassToast, showTransactionToast } from '../../utils/toastUtils.jsx';
import { 
  createOrderWithDefaults, 
  signOrder, 
  validateOrder, 
  centsToTicks,
  ticksToCents
} from '../../utils/eip712';
import '../../pages/market/MarketDetailGlass.css';

const INCENTIV_EXCHANGE_ADDRESS = '0x8cF17Ff1Abe81B5c74f78edb62b0AeF31936642C';
const EXCHANGE_CONTRACT = import.meta.env.VITE_EXCHANGE_CONTRACT_ADDRESS || INCENTIV_EXCHANGE_ADDRESS;
const resolveApiBase = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  const isLocal8080 = envBase && /localhost:8080|127\.0\.0\.1:8080/i.test(envBase);
  if (envBase && !isLocal8080) {
    return envBase;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
};
const API_BASE = resolveApiBase();

const Web3TradingInterface = ({ marketId, market, onTradeComplete }) => {
  // Add error handling for Web3 context
  let web3Context;
  try {
    web3Context = useWeb3();
  } catch (error) {
    console.error('Web3 context error in trading interface:', error);
    web3Context = {
      isConnected: false,
      account: null,
      contracts: {},
      buyShares: null,
      sellShares: null,
      getUserPosition: null,
      getMarketData: null,
      getUserLimitOrders: null,
      signer: null,
      ethBalance: '0',
      connectWallet: () => {
        console.warn('connectWallet is unavailable outside Web3 provider context.');
      },
    };
  }
  
  const {
    isConnected,
    account,
    contracts,
    buyShares,
    sellShares,
    getUserPosition,
    getMarketData,
    getUserLimitOrders,
    signer,
    ethBalance,
    connectWallet,
    chainId
  } = web3Context;
  
  const currencySymbol = getCurrencySymbol(chainId);
  const homePageFont = 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const getOutcomeButtonStyle = (isActive, width) => ({
    width,
    height: '40px',
    borderRadius: '8px',
    border: isActive ? '1px solid #FFE600' : '1px solid rgba(255,255,255,0.08)',
    background: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(17,17,17,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease'
  });

  const getOffsetButtonStyle = (variant, isActive) => {
    const base = {
      height: '32px',
      borderRadius: '999px',
      border: isActive ? '1px solid #FFE600' : '1px solid rgba(255,255,255,0.08)',
      background: isActive ? 'rgba(255,255,255,0.06)' : 'rgba(15,15,15,0.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: homePageFont,
      fontWeight: 300,
      fontSize: '14px',
      lineHeight: '20px',
      color: '#FFFFFF',
      transition: 'all 0.2s ease'
    };

    if (variant === 'market') {
      return {
        ...base,
        width: '128px',
        border: isActive ? '1px solid #FFE600' : '1px solid rgba(255,255,255,0.12)',
        background: isActive ? 'rgba(255,255,255,0.06)' : 'rgba(20,20,20,0.68)'
      };
    }

    return {
      ...base,
      width: '72px'
    };
  };

  const [activeTab, setActiveTab] = useState('buy');
  const [tradeAmount, setTradeAmount] = useState('0.1');
  const [tradeSide, setTradeSide] = useState('yes');
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [activeLimitButton, setActiveLimitButton] = useState('market'); // 'minus5', 'market', 'plus5'
  const [position, setPosition] = useState({ yesShares: '0', noShares: '0', totalInvested: '0' });
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [estimatedShares, setEstimatedShares] = useState('0');
  const [openOrders, setOpenOrders] = useState([]);

  const amountInputStyle = orderType === 'market'
    ? {
        width: '100%',
        height: '68px',
        padding: '0 24px',
        background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(32px)'
      }
    : {
        width: '100%',
        height: '48px',
        padding: '0 18px',
        background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(32px)'
      };

  const amountInputTextStyle = orderType === 'market'
    ? { fontFamily: homePageFont, fontWeight: 600, fontSize: '28px', lineHeight: '32px', color: '#FFFFFF', letterSpacing: '-0.3px' }
    : { fontFamily: homePageFont, fontWeight: 400, fontSize: '14px', lineHeight: '20px', color: '#FFFFFF' };

  // Function to fetch fresh prices from chain and update UI (ALWAYS gets current blockchain state)
  const fetchFreshPrices = useCallback(async () => {
    if (!contracts?.predictionMarket || !marketId) return null;

    try {
      const yesPrice = await contracts.predictionMarket.getCurrentPrice(marketId, true);
      const noPrice = await contracts.predictionMarket.getCurrentPrice(marketId, false);
      
      const yesPriceBps = parseFloat(yesPrice.toString());
      const noPriceBps = parseFloat(noPrice.toString());
      const yesPriceCents = yesPriceBps / 100;
      const noPriceCents = noPriceBps / 100;
      
      setMarketData(prev => {
        // Always update, even if values are the same (to ensure freshness)
        return { 
          ...prev, 
          yesPrice: yesPriceCents, 
          noPrice: noPriceCents 
        };
      });
      
      console.log('💰 Fresh prices from chain:', { yesPriceCents, noPriceCents });
      return { yesPriceCents, noPriceCents };
    } catch (err) {
      console.error('Failed to fetch fresh prices from chain:', err);
      return null;
    }
  }, [contracts?.predictionMarket, marketId]);

  // Fetch market data and user position
  const fetchData = useCallback(async () => {
    if (!isConnected || !contracts.predictionMarket || !marketId) return;

    try {
      const [marketInfo, userPos, freshPrices] = await Promise.all([
        getMarketData(marketId),
        getUserPosition(marketId),
        fetchFreshPrices(), // Always get fresh prices from chain
      ]);

      // Merge fresh prices into marketInfo to ensure they're always current
      if (freshPrices) {
        marketInfo.yesPrice = freshPrices.yesPriceCents;
        marketInfo.noPrice = freshPrices.noPriceCents;
      }

      setMarketData(marketInfo);
      setPosition(userPos);
    } catch (err) {
      console.log('Blockchain data not available, using fallback:', err.message);
      // Still try to fetch fresh prices even if other data fails
      fetchFreshPrices().catch(() => {});
    }
  }, [isConnected, contracts.predictionMarket, marketId, getMarketData, getUserPosition, fetchFreshPrices]);

  // Event-driven price updates (replaces 30s polling)
  useEffect(() => {
    if (!contracts.predictionMarket || !marketId) return;

    const contract = contracts.predictionMarket;
    let normalizedMarketId;
    try {
      normalizedMarketId = ethers.BigNumber.from(marketId);
    } catch {
      return;
    }

    // Event handler - updates price instantly when trade happens
    const handlePriceUpdate = async (eventMarketId, _addr, isYes, _shares, _amount, newPrice) => {
      if (!eventMarketId.eq(normalizedMarketId)) return;
      
      // Always fetch fresh prices from chain after event (more reliable than using event price)
      setTimeout(() => {
        fetchFreshPrices();
      }, 500);
    };

    // Subscribe to trade events (filtered by marketId for efficiency)
    const purchaseFilter = contract.filters.SharesPurchased(marketId);
    const sellFilter = contract.filters.SharesSold(marketId);
    
    contract.on(purchaseFilter, handlePriceUpdate);
    contract.on(sellFilter, handlePriceUpdate);

    // Initial fetch - always get fresh prices from chain
    fetchFreshPrices();

    // Poll every 10 seconds to always have current prices
    const pricePollInterval = setInterval(() => {
      fetchFreshPrices();
    }, 10000);

    return () => {
      contract.off(purchaseFilter, handlePriceUpdate);
      contract.off(sellFilter, handlePriceUpdate);
      clearInterval(pricePollInterval);
    };
  }, [contracts.predictionMarket, marketId, fetchFreshPrices]);

  const normalizeDecimal = (value) => {
    if (value === null || value === undefined || value === '') {
      throw new Error('Invalid amount: value cannot be empty');
    }
    const str = value.toString().trim().replace(/,/g, '.');
    if (!str || str === '.' || str === '-' || isNaN(Number(str))) {
      throw new Error('Invalid amount: please enter a valid number');
    }
    return str;
  };

  const computeAvgPriceCents = (result, fallbackCents) => {
    const validFromArray = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const nums = arr
        .map((x) => {
          const raw = x?.fillPrice ?? x?.priceTicks ?? x?.price_ticks ?? null;
          if (raw === null || raw === undefined) return null;
          const n = parseInt(raw.toString(), 10);
          return Number.isFinite(n) ? n : null;
        })
        .filter((n) => n !== null);
      if (!nums.length) return null;
      const avgTicks = nums.reduce((s, n) => s + n, 0) / nums.length;
      return ticksToCents(avgTicks);
    };

    const fromFills = validFromArray(result?.fills);
    if (fromFills !== null) return fromFills;
    const fromMatches = validFromArray(result?.matches);
    if (fromMatches !== null) return fromMatches;
    return fallbackCents;
  };

  // Estimate filled TCENT amount using AMM logic
  const calculateEstimatedShares = useCallback(() => {
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      setEstimatedShares('0');
      return;
    }

    try {
      const fallbackYesPrice = marketData?.yesPrice || market?.yesPrice || 50;
      const fallbackNoPrice = marketData?.noPrice || market?.noPrice || 50;
      const investmentAmount = parseFloat(tradeAmount);
      let estimatedShares;

      if (activeTab === 'buy') {
        const currentPrice = tradeSide === 'yes' ? parseFloat(fallbackYesPrice) : parseFloat(fallbackNoPrice);
        const priceDecimal = currentPrice / 100;
        if (priceDecimal > 0 && priceDecimal <= 1) {
          estimatedShares = (investmentAmount / priceDecimal) * 0.98;
        } else {
          estimatedShares = investmentAmount;
        }
      } else {
        const currentPrice = tradeSide === 'yes' ? parseFloat(fallbackYesPrice) : parseFloat(fallbackNoPrice);
        const priceDecimal = currentPrice / 100;
        if (priceDecimal > 0 && priceDecimal <= 1) {
          estimatedShares = investmentAmount * priceDecimal * 0.98;
        } else {
          estimatedShares = investmentAmount;
        }
      }

      if (!Number.isFinite(estimatedShares) || estimatedShares <= 0) {
        estimatedShares = investmentAmount;
      }

      if (estimatedShares < 0.0001) {
        estimatedShares = 0.0001;
      }

      setEstimatedShares(estimatedShares.toFixed(4));
    } catch (err) {
      console.error('Failed to estimate TCENT amount:', err);
      setEstimatedShares(parseFloat(tradeAmount).toFixed(4));
    }
  }, [tradeAmount, tradeSide, activeTab, marketData, market]);

  // Fetch market data and user position (event-driven + fallback)
  useEffect(() => {
    if (!isConnected || !contracts.predictionMarket || !marketId || !account) return;

    const contract = contracts.predictionMarket;
    let normalizedMarketId;
    try {
      normalizedMarketId = ethers.BigNumber.from(marketId);
    } catch {
      return;
    }

    // Initial fetch
        fetchData();

    // Update position when current user trades
    const handleUserTrade = (eventMarketId, trader) => {
      if (!eventMarketId.eq(normalizedMarketId)) return;
      if (trader.toLowerCase() !== account.toLowerCase()) return;
      
      // Refresh position after own trade
      if (getUserPosition) {
        getUserPosition(marketId).then(pos => {
          if (pos) setPosition(pos);
        }).catch(() => {});
      }
    };

    // Subscribe to user's trades only
    const purchaseFilter = contract.filters.SharesPurchased(marketId, account);
    const sellFilter = contract.filters.SharesSold(marketId, account);
    
    contract.on(purchaseFilter, handleUserTrade);
    contract.on(sellFilter, handleUserTrade);

    // Fallback: refresh every 5 minutes
    const fallbackInterval = setInterval(fetchData, 300000);

    return () => {
      contract.off(purchaseFilter, handleUserTrade);
      contract.off(sellFilter, handleUserTrade);
      clearInterval(fallbackInterval);
    };
  }, [isConnected, contracts.predictionMarket, marketId, account, fetchData, getUserPosition]);

  useEffect(() => {
    if (tradeAmount && parseFloat(tradeAmount) > 0) {
    calculateEstimatedShares();
    }
  }, [tradeAmount, tradeSide, activeTab, orderType, marketData?.yesPrice, marketData?.noPrice]);

  // Fetch open orders
  const fetchOpenOrders = useCallback(async () => {
    if (!isConnected || !getUserLimitOrders || !marketId) return;
    try {
      const orders = await getUserLimitOrders(marketId);
      setOpenOrders(orders || []);
    } catch (err) {
      setOpenOrders([]);
    }
  }, [isConnected, getUserLimitOrders, marketId]);

  useEffect(() => {
    fetchOpenOrders();
    const interval = setInterval(fetchOpenOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchOpenOrders]);

  const handleBuy = async () => {
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Check if market has ended
    const endTime = market?.endTime || market?.resolutionTime || marketData?.endTime;
    if (endTime) {
      const endDate = new Date(typeof endTime === 'number' ? endTime * 1000 : endTime);
      if (endDate < new Date()) {
        toast.error('This market has ended. Trading is no longer available.');
        return;
      }
    }

    // Check if market is resolved
    if (market?.resolved || marketData?.resolved) {
      toast.error('This market has been resolved. Trading is closed.');
      return;
    }

    let normalizedAmount;
    try {
      normalizedAmount = normalizeDecimal(tradeAmount);
    } catch (err) {
      toast.error(err.message || 'Invalid amount');
      return;
    }

    if (parseFloat(tradeAmount) > parseFloat(ethBalance)) {
      toast.error(`Insufficient ${currencySymbol} balance`);
      return;
    }

    setLoading(true);

    try {
      if (orderType === 'limit') {
        if (!limitPrice || parseFloat(limitPrice) <= 0 || parseFloat(limitPrice) > 100) {
          toast.error('Please enter a valid limit price (0.01-1.00 TCENT)');
          setLoading(false);
          return;
        }

        if (!signer) {
          toast.error('Please connect your wallet');
          setLoading(false);
          return;
        }

        const outcomeId = tradeSide === 'yes' ? 0 : 1;
        const orderData = {
          maker: account,
          marketId: marketId.toString(),
          outcomeId: outcomeId.toString(),
          price: centsToTicks(parseFloat(limitPrice)).toString(),
          size: ethers.utils.parseUnits(normalizeDecimal(tradeAmount), 18).toString(),
          side: true
        };

        const order = createOrderWithDefaults(orderData);

        const validation = validateOrder(order);
        if (!validation.valid) {
          toast.error(validation.error);
          setLoading(false);
          return;
        }

        try {
          const healthCheck = await fetch(`${API_BASE}/api/orders?marketId=${marketId}&outcomeId=0&depth=1`, {
            method: 'GET'
          });
          if (!healthCheck.ok && healthCheck.status !== 400) {
            throw new Error('API server is not responding. Please ensure the backend API server is running.');
          }
        } catch (err) {
          if (err.message.includes('fetch')) {
            toast.error('Cannot connect to API server. Please start the backend: node api-server.js');
            setLoading(false);
            return;
          }
        }

        const signature = await signOrder(order, chainId, EXCHANGE_CONTRACT, signer);

        const response = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order,
            signature,
            isMarketOrder: false
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to place order' }));
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to place order`);
        }

        const result = await response.json();

        if (result.status === 'matched' || result.status === 'partially_filled') {
          const orderType = tradeSide === 'yes' ? 'YES' : 'NO';
          const avgPrice = computeAvgPriceCents(result, parseFloat(limitPrice));
          const fillAmount = result.matches && result.matches.length > 0
            ? result.matches.reduce((sum, m) => {
                const raw = m?.fillSize ?? m?.sizeWei ?? m?.size_wei ?? null;
                if (!raw) return sum;
                try {
                  return sum + parseFloat(ethers.utils.formatEther(raw));
                } catch {
                  return sum;
                }
              }, 0)
            : parseFloat(tradeAmount);
          
          showGlassToast({
            icon: '💰',
            title: `${orderType} TCENT ${result.status === 'matched' ? 'filled' : 'partially filled'}`,
            description: `${fillAmount.toFixed(4)} ${currencySymbol} @ ${centsToTCENT(avgPrice)} TCENT. ${result.status === 'matched' ? 'Settlement executing on-chain.' : 'Remaining amount stays on the book.'}`,
            duration: 5200
          });
          
          // Update immediately - no delay
          fetchOpenOrders();
          fetchData();
        } else {
          showGlassToast({
            icon: '📥',
            title: 'Limit buy order placed',
            description: `Queued at ${centsToTCENT(limitPrice)} TCENT. We’ll settle it once matched.`,
            duration: 4800
          });
          // Update immediately - no delay
          fetchOpenOrders();
        }
        
        setTradeAmount('');
        setLimitPrice('');
        
        // Update immediately - no delay
        fetchData();
      } else {
        // Market order - buy directly via AMM (instant on-chain)
        if (!signer) {
          toast.error('Please connect your wallet');
          setLoading(false);
          return;
        }

        if (!buyShares) {
          toast.error('Buy function not available. Please reconnect your wallet.');
          setLoading(false);
          return;
        }

        const receipt = await buyShares(marketId, tradeSide === 'yes', normalizedAmount);
        
        showTransactionToast({
          icon: '✅',
          title: `${tradeSide === 'yes' ? 'YES' : 'NO'} TCENT purchased`,
          description: `${parseFloat(normalizedAmount).toFixed(4)} ${currencySymbol} filled via AMM.`,
          txHash: receipt?.transactionHash || receipt?.hash
        });

        setTradeAmount('');
        
        // Calculate cost and shares for position update
        // Shares = Cost / Price (price is in cents, e.g., 73 = $0.73)
        const costWei = ethers.utils.parseUnits(normalizedAmount, 18).toString();
        const currentPricePercent = tradeSide === 'yes' 
          ? (marketData?.yesPrice || market?.yesPrice || 50) / 100
          : (marketData?.noPrice || market?.noPrice || 50) / 100;
        // Calculate actual shares: cost / price
        // If cost = 4 and price = 0.73, shares = 4 / 0.73 = 5.48
        const sharesAmount = parseFloat(normalizedAmount) / Math.max(currentPricePercent, 0.01);
        const sharesWei = ethers.utils.parseUnits(sharesAmount.toFixed(18), 18).toString();
        
        // Update position in database IMMEDIATELY after successful trade
        try {
          console.log('📝 Updating position...', { marketId: marketId.toString(), account, tradeSide, sharesWei });
          const posResponse = await fetch(`${API_BASE}/api/update-position`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              marketId: marketId.toString(),
              userAddress: account,
              isYes: tradeSide === 'yes',
              isBuy: true,
              sharesWei: sharesWei,
              costWei: costWei,
              txHash: receipt?.transactionHash || receipt?.hash || null,
              blockNumber: receipt?.blockNumber?.toString() || null
            })
          });
          const posResult = await posResponse.json();
          if (posResponse.ok && posResult.success) {
            console.log('✅ Position updated in database:', posResult.position);
          } else {
            console.error('⚠️ Position update failed:', posResult);
          }
        } catch (positionErr) {
          console.error('⚠️ Failed to update position:', positionErr);
        }
        
        // Fetch fresh prices from chain and update UI
        if (contracts?.predictionMarket && marketId) {
          try {
            // Wait a moment for blockchain state to update after transaction
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Fetch fresh prices from chain
            const prices = await fetchFreshPrices();
            
            if (prices) {
              const { yesPriceCents, noPriceCents } = prices;
              const yesPriceBps = Math.round(yesPriceCents * 100);
              const noPriceBps = Math.round(noPriceCents * 100);
              
              console.log('📊 Recording price after buy:', { yesPriceBps, noPriceBps });
              
              // Record price snapshot to database
              await fetch(`${API_BASE}/api/record-price`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  marketId: marketId.toString(),
                  yesPriceBps: yesPriceBps,
                  noPriceBps: noPriceBps,
                  blockNumber: receipt?.blockNumber?.toString() || null
                })
              });

              console.log('✅ Price recorded to database');

              // Create activity event for the buy
              const priceBps = tradeSide === 'yes' ? yesPriceBps : noPriceBps;
              
              try {
                await fetch(`${API_BASE}/api/activity/create`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'TRADE',
                    marketId: marketId.toString(),
                    userAddress: account,
                    isYes: tradeSide === 'yes',
                    isBuy: true,
                    sharesWei: sharesWei,
                    priceBps: priceBps,
                    costWei: costWei,
                    txHash: receipt?.transactionHash || receipt?.hash || null,
                    blockNumber: receipt?.blockNumber?.toString() || null,
                    blockTime: receipt?.blockNumber ? new Date().toISOString() : new Date().toISOString(),
                    marketQuestion: market?.questionTitle || market?.question || null,
                  })
                });
                console.log('✅ Activity event created for buy');
              } catch (activityErr) {
                console.error('⚠️ Failed to create activity event:', activityErr);
              }
            }
          } catch (priceErr) {
            console.error('⚠️ Failed to record price after trade:', priceErr);
          }
        }
      }
      
      // Update data (this will also refresh prices via fetchFreshPrices in useEffect)
      fetchData();
      fetchOpenOrders();
      
      // Wait a bit for price to be recorded, then refresh chart
      setTimeout(() => {
      if (onTradeComplete) {
        onTradeComplete();
      }
      }, 800);
    } catch (err) {
      console.error(orderType === 'limit' ? 'Limit order failed:' : 'Buy failed:', err);
      
      // Parse error message for user-friendly display
      let errorMessage = 'Transaction failed';
      const errStr = err.message?.toLowerCase() || '';
      
      if (errStr.includes('call_exception') || errStr.includes('status":0') || errStr.includes('transaction failed')) {
        // Check for specific contract revert reasons
        if (errStr.includes('market has ended') || errStr.includes('market closed')) {
          errorMessage = 'This market has ended. Trading is no longer available.';
        } else if (errStr.includes('market not active') || errStr.includes('not active')) {
          errorMessage = 'This market is not active. It may have been resolved or paused.';
        } else if (errStr.includes('amm') || errStr.includes('not initialized')) {
          errorMessage = 'Market is not ready for trading yet. Please try again later.';
        } else if (errStr.includes('insufficient')) {
          errorMessage = 'Insufficient balance or liquidity for this trade.';
        } else {
          errorMessage = 'Transaction failed. The market may have ended or is temporarily unavailable.';
        }
      } else if (errStr.includes('user rejected') || errStr.includes('user denied')) {
        errorMessage = 'Transaction was cancelled.';
      } else if (errStr.includes('insufficient funds')) {
        errorMessage = 'Insufficient balance to complete this transaction.';
      } else if (errStr.includes('nonce')) {
        errorMessage = 'Transaction error. Please refresh and try again.';
      } else if (err.message) {
        errorMessage = err.message.length > 100 ? err.message.substring(0, 100) + '...' : err.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Check if market has ended
    const endTime = market?.endTime || market?.resolutionTime || marketData?.endTime;
    if (endTime) {
      const endDate = new Date(typeof endTime === 'number' ? endTime * 1000 : endTime);
      if (endDate < new Date()) {
        toast.error('This market has ended. Trading is no longer available.');
        return;
      }
    }

    // Check if market is resolved
    if (market?.resolved || marketData?.resolved) {
      toast.error('This market has been resolved. Trading is closed.');
      return;
    }

    const availableShares = tradeSide === 'yes' ? position.yesShares : position.noShares;
    if (parseFloat(tradeAmount) > parseFloat(availableShares)) {
      toast.error(`Insufficient ${tradeSide.toUpperCase()} TCENT balance`);
      return;
    }

    setLoading(true);

    try {
      if (orderType === 'limit') {
        if (!limitPrice || parseFloat(limitPrice) <= 0 || parseFloat(limitPrice) > 100) {
          toast.error('Please enter a valid limit price (0.01-1.00 TCENT)');
          setLoading(false);
          return;
        }

        if (!signer) {
          toast.error('Please connect your wallet');
          setLoading(false);
          return;
        }

        const outcomeId = tradeSide === 'yes' ? 0 : 1;
        const orderData = {
          maker: account,
          marketId: marketId.toString(),
          outcomeId: outcomeId.toString(),
          price: centsToTicks(parseFloat(limitPrice)).toString(),
          size: ethers.utils.parseUnits(tradeAmount || '0', 18).toString(),
          side: false
        };

        const order = createOrderWithDefaults(orderData);

        const validation = validateOrder(order);
        if (!validation.valid) {
          toast.error(validation.error);
          setLoading(false);
          return;
        }

        try {
          const healthCheck = await fetch(`${API_BASE}/api/orders?marketId=${marketId}&outcomeId=${outcomeId}&depth=1`, {
            method: 'GET'
          });
          if (!healthCheck.ok && healthCheck.status !== 400) {
            throw new Error('API server is not responding. Please ensure the backend API server is running.');
          }
        } catch (err) {
          if (err.message.includes('fetch')) {
            toast.error('Cannot connect to API server. Please start the backend: node api-server.js');
            setLoading(false);
            return;
          }
        }

        const signature = await signOrder(order, chainId, EXCHANGE_CONTRACT, signer);

        const response = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order,
            signature,
            isMarketOrder: false
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to place order' }));
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to place order`);
        }

        const result = await response.json();

        if (result.status === 'matched' || result.status === 'partially_filled') {
          const orderType = tradeSide === 'yes' ? 'YES' : 'NO';
          const avgPrice = computeAvgPriceCents(result, parseFloat(limitPrice));
          const fillAmount = result.matches && result.matches.length > 0
            ? result.matches.reduce((sum, m) => {
                const raw = m?.fillSize ?? m?.sizeWei ?? m?.size_wei ?? null;
                if (!raw) return sum;
                try {
                  return sum + parseFloat(ethers.utils.formatEther(raw));
                } catch {
                  return sum;
                }
              }, 0)
            : parseFloat(tradeAmount);
          
          showGlassToast({
            icon: '💸',
            title: `${orderType} TCENT ${result.status === 'matched' ? 'filled' : 'partially filled'}`,
            description: `${fillAmount.toFixed(4)} ${currencySymbol} @ ${centsToTCENT(avgPrice)} TCENT. ${result.status === 'matched' ? 'Settlement executing on-chain.' : 'Remaining amount stays on the book.'}`,
            duration: 5200
          });
          
          // Update immediately - no delay
          fetchOpenOrders();
          fetchData();
        } else {
          showGlassToast({
            icon: '📤',
            title: 'Limit sell order placed',
            description: `Queued at ${centsToTCENT(limitPrice)} TCENT. We'll process it once matched.`,
            duration: 4800
          });
          // Update immediately - no delay
          fetchOpenOrders();
        }
        
        setTradeAmount('');
        setLimitPrice('');
        
        // Update immediately - no delay
        fetchData();
      } else {
        // Market order - sell directly via AMM (instant on-chain)
        if (!signer) {
          toast.error('Please connect your wallet');
          setLoading(false);
          return;
        }

        if (!sellShares) {
          toast.error('Sell function not available. Please reconnect your wallet.');
          setLoading(false);
          return;
        }

        const receipt = await sellShares(marketId, tradeSide === 'yes', tradeAmount);
        
        showTransactionToast({
          icon: '✅',
          title: `${tradeSide === 'yes' ? 'YES' : 'NO'} TCENT sold`,
          description: `${parseFloat(tradeAmount).toFixed(4)} ${currencySymbol} released via AMM.`,
          txHash: receipt?.transactionHash || receipt?.hash
        });

        // Calculate shares and cost for position update (use tradeAmount before clearing)
        // For selling: tradeAmount = shares being sold, cost = shares * price
        const sharesWei = ethers.utils.parseUnits(tradeAmount, 18).toString();
        const currentPricePercent = tradeSide === 'yes' 
          ? (marketData?.yesPrice || market?.yesPrice || 50) / 100
          : (marketData?.noPrice || market?.noPrice || 50) / 100;
        const costAmount = parseFloat(tradeAmount) * currentPricePercent;
        const costWei = ethers.utils.parseUnits(costAmount.toFixed(18), 18).toString();
        
        setTradeAmount('');
        
        // Update position in database IMMEDIATELY after successful sell
        try {
          console.log('📝 Updating position (sell)...', { marketId: marketId.toString(), account, tradeSide, sharesWei });
          const posResponse = await fetch(`${API_BASE}/api/update-position`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              marketId: marketId.toString(),
              userAddress: account,
              isYes: tradeSide === 'yes',
              isBuy: false,
              sharesWei: sharesWei,
              costWei: costWei,
              txHash: receipt?.transactionHash || receipt?.hash || null,
              blockNumber: receipt?.blockNumber?.toString() || null
            })
          });
          const posResult = await posResponse.json();
          if (posResponse.ok && posResult.success) {
            console.log('✅ Position updated in database (sell):', posResult.position);
          } else {
            console.error('⚠️ Position update failed:', posResult);
          }
        } catch (positionErr) {
          console.error('⚠️ Failed to update position:', positionErr);
        }
        
        // Fetch fresh prices from chain and update UI
        if (contracts?.predictionMarket && marketId) {
          try {
            // Wait a moment for blockchain state to update after transaction
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Fetch fresh prices from chain
            const prices = await fetchFreshPrices();
            
            if (prices) {
              const { yesPriceCents, noPriceCents } = prices;
              const yesPriceBps = Math.round(yesPriceCents * 100);
              const noPriceBps = Math.round(noPriceCents * 100);
              
              console.log('📊 Recording price after sell:', { yesPriceBps, noPriceBps });
              
              // Record price snapshot to database
              await fetch(`${API_BASE}/api/record-price`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  marketId: marketId.toString(),
                  yesPriceBps: yesPriceBps,
                  noPriceBps: noPriceBps,
                  blockNumber: receipt?.blockNumber?.toString() || null
                })
              });

              console.log('✅ Price recorded to database');

              // Create activity event for the sell
              const priceBps = tradeSide === 'yes' ? yesPriceBps : noPriceBps;
              
              try {
                await fetch(`${API_BASE}/api/activity/create`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'TRADE',
                    marketId: marketId.toString(),
                    userAddress: account,
                    isYes: tradeSide === 'yes',
                    isBuy: false,
                    sharesWei: sharesWei,
                    priceBps: priceBps,
                    costWei: costWei,
                    txHash: receipt?.transactionHash || receipt?.hash || null,
                    blockNumber: receipt?.blockNumber?.toString() || null,
                    blockTime: receipt?.blockNumber ? new Date().toISOString() : new Date().toISOString(),
                    marketQuestion: market?.questionTitle || market?.question || null,
                  })
                });
                console.log('✅ Activity event created for sell');
              } catch (activityErr) {
                console.error('⚠️ Failed to create activity event:', activityErr);
              }
            }
          } catch (priceErr) {
            console.error('⚠️ Failed to record price after trade:', priceErr);
          }
        }
      }
      
      // Update data (this will also refresh prices via fetchFreshPrices in useEffect)
      fetchData();
      fetchOpenOrders();
      
      // Wait a bit for price to be recorded, then refresh chart
      setTimeout(() => {
      if (onTradeComplete) {
        onTradeComplete();
      }
      }, 800);
    } catch (err) {
      console.error(orderType === 'limit' ? 'Limit order failed:' : 'Sell failed:', err);
      
      
      let errorMessage = 'Transaction failed';
      const errStr = err.message?.toLowerCase() || '';
      
      if (errStr.includes('call_exception') || errStr.includes('status":0') || errStr.includes('transaction failed')) {
        if (errStr.includes('market has ended') || errStr.includes('market closed')) {
          errorMessage = 'This market has ended. Trading is no longer available.';
        } else if (errStr.includes('market not active') || errStr.includes('not active')) {
          errorMessage = 'This market is not active. It may have been resolved or paused.';
        } else if (errStr.includes('insufficient shares') || errStr.includes('not enough')) {
          errorMessage = 'Insufficient shares to sell.';
        } else {
          errorMessage = 'Transaction failed. The market may have ended or is temporarily unavailable.';
        }
      } else if (errStr.includes('user rejected') || errStr.includes('user denied')) {
        errorMessage = 'Transaction was cancelled.';
      } else if (errStr.includes('insufficient funds')) {
        errorMessage = 'Insufficient balance to complete this transaction.';
      } else if (err.message) {
        errorMessage = err.message.length > 100 ? err.message.substring(0, 100) + '...' : err.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Define prices early
  const yesPrice = marketData?.yesPrice || market?.yesPrice || 50;
  const noPrice = marketData?.noPrice || market?.noPrice || 50;
  const currentPrice = tradeSide === 'yes' ? yesPrice : noPrice;

  // Check if market is resolved
  const isResolved = market?.resolved || marketData?.resolved;
  const outcome = market?.outcome || marketData?.outcome;

  // Show resolved state
  if (isResolved) {
    const resolvedImage = outcome === 1 ? '/yesresolved.svg' : '/no.svg';
    return (
      <div className="glass-card rounded-[12px] sm:rounded-[16px] backdrop-blur-[32px] relative w-full overflow-hidden" style={{ background: 'transparent' }}>
        <img 
          src={resolvedImage} 
          alt={outcome === 1 ? 'Yes - Market Resolved' : 'No - Market Resolved'}
          className="w-full h-auto"
          style={{ display: 'block' }}
        />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="glass-card rounded-[12px] sm:rounded-[16px] backdrop-blur-[32px] relative w-full px-3 sm:px-4" style={{ background: 'transparent', minHeight: '100px', paddingTop: '12px', paddingBottom: '12px' }}>
        <div className="w-full h-full flex items-center justify-center py-3 sm:py-6">
          <button
            onClick={connectWallet}
            className="glass-card rounded-[8px] sm:rounded-[10px] w-full max-w-[160px] sm:max-w-[280px]"
            style={{ 
              height: '36px',
              background: 'transparent',
              border: '1px solid #FFE600',
              backdropFilter: 'blur(32px)',
              fontFamily: homePageFont,
              fontWeight: 600,
              fontSize: '12px',
              lineHeight: '16px',
              color: '#FFFFFF'
            }}
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-[12px] sm:rounded-[16px] backdrop-blur-[32px] relative w-full px-3 sm:px-4" style={{ background: 'transparent', minHeight: '620px', paddingTop: '17px', paddingBottom: '17px' }}>
      <div className="relative w-full min-h-[560px]">
        
        {/* Buy/Sell + 2x Badge - Row at y:0 */}
        <div className="absolute flex items-center justify-between w-full" style={{ left: 0, top: 0, height: '40px' }}>
          <div className="flex items-center p-1 rounded-[8px]" style={{ border: '0.5px solid rgba(255,255,255,0.72)' }}>
            <button
              onClick={() => setActiveTab('buy')}
              className="px-3 rounded-full transition-all"
              style={{ 
                height: '24px', 
                background: activeTab === 'buy' ? '#171717' : 'transparent',
                fontFamily: homePageFont, 
                fontWeight: 300, 
                fontSize: '12px', 
                lineHeight: '16px', 
                color: '#F3F3F3' 
              }}
            >
              Buy
            </button>
            <button
              onClick={() => setActiveTab('sell')}
              className="px-3 rounded-full transition-all"
              style={{ 
                height: '24px', 
                background: activeTab === 'sell' ? '#171717' : 'transparent',
                fontFamily: homePageFont, 
                fontWeight: 300, 
                fontSize: '12px', 
                lineHeight: '16px', 
                color: '#F3F3F3' 
              }}
            >
              Sell
            </button>
          </div>
     
        </div>

        {/* Separator at y:56 */}
        <div className="absolute" style={{ left: 0, top: '56px', width: '100%', height: '1px', borderTop: '1px solid rgba(255,255,255,0.05)' }}></div>

        {/* Yes/No Toggle at y:73 */}
        <div className="glass-card absolute flex items-center gap-1" style={{ 
          left: 0, 
          top: '73px', 
          width: '100%', 
          height: '48px', 
          padding: '4px',
          background: 'rgba(255,255,255,0.04)', 
          backdropFilter: 'blur(32px)', 
          borderRadius: '12px',
          gap: '6px'
        }}>
          <button
            onClick={() => setTradeSide('yes')}
            className="transition-all flex-1"
            style={getOutcomeButtonStyle(tradeSide === 'yes', 'auto')}
          >
            <span style={{ fontFamily: homePageFont, fontWeight: 400, fontSize: '14px', lineHeight: '20px', color: '#F3F3F3' }}>Yes</span>
            <span style={{ fontFamily: homePageFont, fontWeight: 400, fontSize: '14px', lineHeight: '20px', color: '#F3F3F3' }}>{Math.round(yesPrice)}%</span>
          </button>
          
          <button
            onClick={() => setTradeSide('no')}
            className="transition-all flex-1"
            style={getOutcomeButtonStyle(tradeSide === 'no', 'auto')}
          >
            <span style={{ fontFamily: homePageFont, fontWeight: 400, fontSize: '14px', lineHeight: '20px', color: '#F3F3F3' }}>No</span>
            <span style={{ fontFamily: homePageFont, fontWeight: 400, fontSize: '14px', lineHeight: '20px', color: '#F3F3F3' }}>{Math.round(noPrice)}%</span>
          </button>
        </div>

        {/* Market/Limit Tabs at y:137 */}
          <div className="absolute flex items-center w-full" style={{ left: 0, top: '137px', height: '40px', gap: '8px' }}>
          <button
            onClick={() => { setOrderType('market'); setLimitPrice(''); setActiveLimitButton('market'); }}
            className="glass-card flex-1 flex items-center justify-center rounded-[12px]"
            style={{ 
              height: '40px', 
              background: orderType === 'market' ? 'rgba(255,255,255,0.04)' : 'transparent',
              backdropFilter: orderType === 'market' ? 'blur(32px)' : 'none',
              border: orderType === 'market' ? '1px solid #FFE600' : 'none', 
              fontFamily: homePageFont, 
              fontWeight: 300, 
              fontSize: '14px', 
              lineHeight: '20px', 
              color: '#FFFFFF', 
              gap :'6px', 
            }}
          >
            Market
          </button>
          
          <button
            onClick={() => { setOrderType('limit'); setLimitPrice((currentPrice).toFixed(2)); setActiveLimitButton('market'); }}
            className="glass-card flex-1 flex items-center justify-center rounded-[12px]"
            style={{ 
              height: '40px', 
              background: orderType === 'limit' ? 'rgba(255,255,255,0.04)' : 'transparent',
              backdropFilter: orderType === 'limit' ? 'blur(32px)' : 'none',
              border: orderType === 'limit' ? '1px solid #FFE600' : 'none', 
              fontFamily: homePageFont, 
              fontWeight: 300, 
              fontSize: '14px', 
              lineHeight: '20px', 
              color: '#FFFFFF' 
            }}
          >
            Limit
          </button>
        </div>

        {/* LIMIT ORDER ONLY - Limit Price Section at y:186 */}
        {orderType === 'limit' && (
          <>
            <div className="absolute" style={{ left: 0, top: '186px', width: '100%' }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontFamily: homePageFont, fontWeight: 300, fontSize: '14px', lineHeight: '20px', color: '#FFFFFF' }}>Limit Price</span>
                <span style={{ fontFamily: homePageFont, fontWeight: 300, fontSize: '14px', lineHeight: '20px', color: '#FFFFFF' }}>Current: {(currentPrice / 100).toFixed(2)}TCENT</span>
              </div>
              
              <div
                className="glass-card flex items-center rounded-[12px]"
                style={{
                  width: '100%',
                  height: '48px',
                  padding: '0 18px',
                  background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(32px)'
                }}
              >
                <input
                  type="text"
                  value={limitPrice || '0.00'}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none"
                  style={{ fontFamily: homePageFont, fontWeight: 400, fontSize: '14px', lineHeight: '20px', color: '#FFFFFF' }}
                />
              </div>
            </div>

            {/* -5% Market +5% Buttons at y:272 */}
            <div className="absolute flex items-center gap-4" style={{ left: 0, top: '272px' }}>
              <button
                onClick={() => { 
                  setLimitPrice((parseFloat(limitPrice || (currentPrice)) * 0.95).toFixed(2));
                  setActiveLimitButton('minus5');
                }}
                className="flex items-center justify-center"
                style={getOffsetButtonStyle('minus', activeLimitButton === 'minus5')}
              >
                -5%
              </button>
              
              <button
                onClick={() => { 
                  setLimitPrice((currentPrice).toFixed(2));
                  setActiveLimitButton('market');
                }}
                className="flex items-center justify-center"
                style={getOffsetButtonStyle('market', activeLimitButton === 'market')}
              >
                Market
              </button>
              
              <button
                onClick={() => { 
                  setLimitPrice((parseFloat(limitPrice || (currentPrice)) * 1.05).toFixed(2));
                  setActiveLimitButton('plus5');
                }}
                className="flex items-center justify-center"
                style={getOffsetButtonStyle('plus', activeLimitButton === 'plus5')}
              >
                +5%
              </button>
            </div>
          </>
        )}

        {/* Amount Section - y:314 for Limit, y:186 for Market */}
        <div className="absolute" style={{ 
          left: 0, 
          top: orderType === 'limit' ? '314px' : '186px', 
          width: '100%'
        }}>
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontFamily: homePageFont, fontWeight: 300, fontSize: '14px', lineHeight: '20px', color: '#FFFFFF' }}>Amount</span>
            <span style={{ fontFamily: homePageFont, fontWeight: 300, fontSize: '14px', lineHeight: '20px', color: '#FFFFFF' }}>
              Balance: {activeTab === 'buy'
                ? `${parseFloat(ethBalance).toFixed(3)} TCENT`
                : `${parseFloat(tradeSide === 'yes' ? position.yesShares : position.noShares).toFixed(3)} TCENT`}
            </span>
          </div>
          
          <div className="glass-card flex items-center rounded-[12px]" style={amountInputStyle}>
            <input
              type="text"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent outline-none"
              style={amountInputTextStyle}
            />
          </div>
        </div>

        {/* Separator + Entry/Liquidation - y:399 for Limit, y:271 for Market */}
        <div className="absolute" style={{ left: 0, top: orderType === 'limit' ? '399px' : '290px', width: '100%' }}>
          <div style={{ width: '100%', height: '1px', borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}></div>
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: homePageFont, fontWeight: 300, fontSize: '12px', lineHeight: '16px', color: '#8B8B8B' }}>2% Platform fee on buy/sell </span>
              <span style={{ fontFamily: homePageFont, fontWeight: 400, fontSize: '13px', lineHeight: '16px', color: '#FFFFFF' }}>${(currentPrice / 100).toFixed(2)}</span>
            </div>
           
          </div>
        </div>

        {/* Place Order Button - adjusted position */}
        <button
          onClick={activeTab === 'buy' ? handleBuy : handleSell}
          disabled={loading || !tradeAmount || parseFloat(tradeAmount) <= 0}
          className="glass-card rounded-[12px] absolute"
          style={{ 
            left: 0,
            top: orderType === 'limit' ? '476px' : '390px',
            width: '100%',
            height: '56px',
            background: 'linear-gradient(180deg, rgba(15,15,15,0.92) 0%, rgba(8,8,8,0.78) 100%)',
            border: '1px solid #FFE600',
            backdropFilter: 'blur(32px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: homePageFont, 
            fontWeight: 700,
            fontSize: '17px',
            letterSpacing: '0.2px',
            color: '#FFFFFF',
            opacity: loading || !tradeAmount || parseFloat(tradeAmount) <= 0 ? 0.5 : 1,
            cursor: loading || !tradeAmount || parseFloat(tradeAmount) <= 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Processing...' : activeTab === 'buy' ? `Place ${orderType === 'market' ? 'Market' : 'Limit'} Order` : `Place ${orderType === 'market' ? 'Market' : 'Limit'} Sell Order`}
        </button>
      </div>
    </div>
  );
};

export default Web3TradingInterface;
