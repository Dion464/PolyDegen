import React, { useState, memo, useEffect, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import '../../pages/market/MarketDetailGlass.css';

// API base URL resolution
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

// GPU-accelerated shimmer style
const skeletonShimmerStyle = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  willChange: 'background-position',
};

// Inline skeleton for selective loading - GPU optimized
const SkeletonText = memo(({ width = '100%', height = '20px', style = {} }) => (
  <div 
    style={{
      width,
      height,
      borderRadius: '6px',
      ...skeletonShimmerStyle,
      ...style
    }}
  />
));

// Lazy image component with blur placeholder - GPU optimized
const LazyImage = memo(({ src, alt, width = 48, height = 54 }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  // Reset states when src changes
  React.useEffect(() => {
    if (src !== currentSrc) {
      setCurrentSrc(src);
      setIsLoaded(false);
      setHasError(false);
    }
  }, [src, currentSrc]);

  // Optimize Unsplash URLs
  const optimizeSrc = (url) => {
    if (!url) return null;
    if (url.includes('source.unsplash.com')) {
      return url.replace(/\/\d+x\d+\//, '/100x100/').replace(/\?.*$/, '?w=100&h=100&fit=crop');
    }
    return url;
  };

  const optimizedSrc = optimizeSrc(currentSrc);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: '#1a1a1a' }}>
      {(!isLoaded || !optimizedSrc) && !hasError && (
        <div 
          style={{ 
            position: 'absolute',
            inset: 0,
            ...skeletonShimmerStyle
          }}
        />
      )}
      {optimizedSrc && !hasError && (
        <img
          key={optimizedSrc}
          src={optimizedSrc}
          alt={alt}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease',
            position: 'absolute',
            top: 0,
            left: 0,
            willChange: 'opacity'
          }}
        />
      )}
    </div>
  );
});

// Helper function to format volume
const formatVolumeDisplay = (volume) => {
  if (!volume || volume === 0) return '0';
  // If volume is extremely large (likely Wei that wasn't converted), convert it
  if (volume > 1e12) {
    const ethValue = volume / 1e18;
    if (ethValue >= 1e6) return `${(ethValue / 1e6).toFixed(1)}m`;
    if (ethValue >= 1e3) return `${(ethValue / 1e3).toFixed(1)}k`;
    return `${ethValue.toFixed(2)}`;
  }
  // Format with appropriate suffix
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}m`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}k`;
  return `${volume.toFixed(2)}`;
};

// Helper function to get time remaining
const getTimeRemaining = (endTime, resolutionDateTime) => {
  // Try to use endTime first, then resolutionDateTime
  let endDate;
  if (endTime) {
    // Handle both ISO string and unix timestamp
    if (typeof endTime === 'string') {
      endDate = new Date(endTime);
    } else {
      endDate = new Date(Number(endTime) * 1000);
    }
  } else if (resolutionDateTime) {
    endDate = new Date(resolutionDateTime);
  } else {
    return null;
  }
  
  const now = new Date();
  const diff = endDate - now;
  
  if (diff <= 0) return 'Ended';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (months > 0) return `ends in ${months} month${months > 1 ? 's' : ''}`;
  if (days > 0) return `ends in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `ends in ${hours}h`;
  return 'ends soon';
};

const ModernMarketCard = ({ market, showBuyButtons = false, onBuy }) => {
  const history = useHistory();
  const { isConnected, buyShares, ethBalance, account, contracts } = useWeb3();
  
  // Normalize decimal input (same as trading interface)
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
  
  // Flip state
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedSide, setSelectedSide] = useState('yes');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [isBuying, setIsBuying] = useState(false);
  
  // Local price state for instant updates after trades
  const [localYesPrice, setLocalYesPrice] = useState(null);
  const [localNoPrice, setLocalNoPrice] = useState(null);
  
  // Initialize local prices from market prop when it changes
  // Convert from basis points to percentage if needed (market.yesPrice might be in basis points or percentage)
  useEffect(() => {
    if (market.yesPrice != null && market.noPrice != null) {
      // If price is > 100, it's in basis points, divide by 100. Otherwise it's already a percentage.
      const yesPricePercent = market.yesPrice > 100 ? Math.round(market.yesPrice / 100) : Math.round(market.yesPrice);
      const noPricePercent = market.noPrice > 100 ? Math.round(market.noPrice / 100) : Math.round(market.noPrice);
      setLocalYesPrice(yesPricePercent);
      setLocalNoPrice(noPricePercent);
    }
  }, [market.yesPrice, market.noPrice]);
  
  // Check if prices are still loading
  const isPriceLoading = market._priceLoading || (market.yesPrice == null && market.noPrice == null);
  
  // Use local prices if available (updated after trades), otherwise use market prop
  let yesPrice, noPrice;
  if (localYesPrice != null && localNoPrice != null) {
    // Use local prices (most up-to-date, already in percentage)
    yesPrice = localYesPrice;
    noPrice = localNoPrice;
  } else if (market.yesPrice != null && market.noPrice != null) {
    // Convert from basis points to percentage if needed
    // If price is > 100, it's in basis points, divide by 100. Otherwise it's already a percentage.
    yesPrice = market.yesPrice > 100 ? Math.round(market.yesPrice / 100) : Math.round(market.yesPrice);
    noPrice = market.noPrice > 100 ? Math.round(market.noPrice / 100) : Math.round(market.noPrice);
  } else if (!isPriceLoading) {
    // Fallback to probability calculation only if not loading
    const probability = market.currentProbability || market.initialProbability || 0.5;
    yesPrice = Math.round(probability * 100);
    noPrice = 100 - yesPrice;
  } else {
    // Loading state - use placeholder values
    yesPrice = null;
    noPrice = null;
  }
  
  // Get current price based on selected side
  const currentPrice = selectedSide === 'yes' ? yesPrice : noPrice;
  const priceInDollars = currentPrice ? (currentPrice / 100).toFixed(2) : '0.00';
  
  // Calculate max amount based on balance
  const maxAmount = parseFloat(ethBalance || '0');
  const buyAmountNum = parseFloat(buyAmount || '0');
  
  // Calculate potential payout
  const potentialPayout = buyAmountNum > 0 && currentPrice ? (buyAmountNum / (currentPrice / 100)).toFixed(2) : '0.00';
  
  const handleNavigateToMarket = () => {
    if (!isFlipped) {
    history.push(`/markets/${market.id}`);
    }
  };

  const handleBuy = (side, e) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }
    setSelectedSide(side);
    setIsFlipped(true);
  };
  
  const handleClose = (e) => {
    e.stopPropagation();
    setIsFlipped(false);
    setBuyAmount('0.1');
  };
  
  const handleAmountChange = (value) => {
    const numValue = parseFloat(value) || 0;
    if (numValue < 0) return;
    if (numValue > maxAmount) {
      setBuyAmount(maxAmount.toFixed(4));
      return;
    }
    setBuyAmount(value);
  };
  
  const handleSliderChange = (e) => {
    const percentage = parseFloat(e.target.value);
    const amount = (maxAmount * percentage / 100).toFixed(4);
    setBuyAmount(amount);
  };
  
  const handleIncrement = (value) => {
    const newAmount = Math.min(buyAmountNum + value, maxAmount);
    setBuyAmount(newAmount.toFixed(4));
  };
  
  // Fetch fresh prices from chain (same as trading interface)
  const fetchFreshPrices = useCallback(async () => {
    if (!contracts?.predictionMarket || !market.id) return null;

    try {
      const yesPrice = await contracts.predictionMarket.getCurrentPrice(market.id, true);
      const noPrice = await contracts.predictionMarket.getCurrentPrice(market.id, false);
      
      const yesPriceBps = parseFloat(yesPrice.toString());
      const noPriceBps = parseFloat(noPrice.toString());
      const yesPriceCents = yesPriceBps / 100;
      const noPriceCents = noPriceBps / 100;
      
      // Update local prices immediately (convert from basis points to percentage)
      setLocalYesPrice(Math.round(yesPriceBps / 100));
      setLocalNoPrice(Math.round(noPriceBps / 100));
      
      return { yesPriceCents, noPriceCents };
    } catch (err) {
      console.error('Failed to fetch fresh prices from chain:', err);
      return null;
    }
  }, [contracts?.predictionMarket, market.id]);

  // Event-driven price updates (listen for trades to update prices instantly)
  useEffect(() => {
    if (!contracts?.predictionMarket || !market.id) return;

    const contract = contracts.predictionMarket;
    let normalizedMarketId;
    try {
      normalizedMarketId = ethers.BigNumber.from(market.id);
    } catch {
      return;
    }

    // Event handler - updates price instantly when trade happens
    const handlePriceUpdate = async (eventMarketId, _addr, _isYes, _shares, _amount, _newPrice) => {
      if (!eventMarketId.eq(normalizedMarketId)) return;
      
      // Always fetch fresh prices from chain after event (more reliable than using event price)
      setTimeout(() => {
        fetchFreshPrices();
      }, 500);
    };

    // Subscribe to trade events (filtered by marketId for efficiency)
    const purchaseFilter = contract.filters.SharesPurchased(market.id);
    const sellFilter = contract.filters.SharesSold(market.id);
    
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
  }, [contracts?.predictionMarket, market.id, fetchFreshPrices]);

  const handleBuyClick = async (e) => {
    e.stopPropagation();
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }
    
    if (buyAmountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    if (buyAmountNum > maxAmount) {
      toast.error('Insufficient balance');
      return;
    }

    // Check if market has ended
    const endTime = market?.endTime || market?.resolutionTime;
    if (endTime) {
      const endDate = new Date(typeof endTime === 'number' ? endTime * 1000 : endTime);
      if (endDate < new Date()) {
        toast.error('This market has ended. Trading is no longer available.');
        return;
      }
    }

    // Check if market is resolved
    if (market?.resolved) {
      toast.error('This market has been resolved. Trading is closed.');
      return;
    }

    // Normalize amount (same as trading interface)
    let normalizedAmount;
    try {
      normalizedAmount = normalizeDecimal(buyAmount);
    } catch (err) {
      toast.error(err.message || 'Invalid amount');
      return;
    }
    
    try {
      setIsBuying(true);
      const receipt = await buyShares(market.id, selectedSide === 'yes', normalizedAmount);
      
      // Calculate cost and shares for position update
      const costWei = ethers.utils.parseUnits(normalizedAmount, 18).toString();
      const currentPricePercent = selectedSide === 'yes' 
        ? (market.yesPrice || 50) / 100
        : (market.noPrice || 50) / 100;
      // Calculate actual shares: cost / price
      const sharesAmount = parseFloat(normalizedAmount) / Math.max(currentPricePercent, 0.01);
      const sharesWei = ethers.utils.parseUnits(sharesAmount.toFixed(18), 18).toString();
      
      // Update position in database IMMEDIATELY after successful trade
      if (account) {
        try {
          console.log('📝 Updating position...', { marketId: market.id.toString(), account, selectedSide, sharesWei });
          const posResponse = await fetch(`${API_BASE}/api/update-position`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              marketId: market.id.toString(),
              userAddress: account,
              isYes: selectedSide === 'yes',
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
      }

      // Fetch fresh prices from chain and update UI (same as trading interface)
      if (contracts?.predictionMarket && market.id) {
        try {
          // Wait a moment for blockchain state to update after transaction
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Fetch fresh prices from chain
          const prices = await fetchFreshPrices();
          
          if (prices) {
            const { yesPriceCents, noPriceCents } = prices;
            const yesPriceBps = Math.round(yesPriceCents * 100);
            const noPriceBps = Math.round(noPriceCents * 100);
            
            // Update local prices immediately for instant UI update
            setLocalYesPrice(yesPriceBps);
            setLocalNoPrice(noPriceBps);
            
            console.log('📊 Recording price after buy:', { yesPriceBps, noPriceBps });
            
            // Record price snapshot to database
            await fetch(`${API_BASE}/api/record-price`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                marketId: market.id.toString(),
                yesPriceBps: yesPriceBps,
                noPriceBps: noPriceBps,
                blockNumber: receipt?.blockNumber?.toString() || null
              })
            });

            console.log('✅ Price recorded to database');

            // Create activity event for the buy
            const priceBps = selectedSide === 'yes' ? yesPriceBps : noPriceBps;
            
            try {
              await fetch(`${API_BASE}/api/activity/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'TRADE',
                  marketId: market.id.toString(),
                  userAddress: account,
                  isYes: selectedSide === 'yes',
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
      
      toast.success(`${selectedSide === 'yes' ? 'YES' : 'NO'} shares purchased!`);
      setIsFlipped(false);
      setBuyAmount('0.1');
    } catch (error) {
      console.error('Buy failed:', error);
      
      // Parse error message for user-friendly display (same as trading interface)
      let errorMessage = 'Transaction failed';
      const errStr = error?.message?.toLowerCase() || '';
      
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
      } else if (error?.message) {
        errorMessage = error.message.length > 100 ? error.message.substring(0, 100) + '...' : error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsBuying(false);
    }
  };
  
  // Reset flip when market changes
  useEffect(() => {
    setIsFlipped(false);
    setBuyAmount('0.1');
  }, [market.id]);

  // Generate image URL based on category and market ID
  const getMarketImage = () => {
    const marketId = market.id || '0';
    
    // Priority 1: If market has an imageUrl prop from API, use it
    if (market.imageUrl) {
      return market.imageUrl;
    }
    
    // Priority 2: Check localStorage cache
    try {
      const marketImages = JSON.parse(localStorage.getItem('marketImages') || '{}');
      if (marketImages[marketId]) {
        return marketImages[marketId];
      }
    } catch (err) {
      console.log('Error reading market images from localStorage');
    }
    
    // Priority 3: Generate a placeholder based on category
    const category = market.category || 'General';
    
    // Use Unsplash API for category-based images
    const categoryKeywords = {
      'Technology': 'technology,computer,digital',
      'Sports': 'sports,athlete,competition',
      'Politics': 'politics,government,democracy',
      'Entertainment': 'entertainment,showbiz,celebrity',
      'Economics': 'economics,money,finance',
      'Science': 'science,research,laboratory',
      'Crypto': 'cryptocurrency,bitcoin,blockchain',
      'Tech': 'technology,innovation,digital',
      'WTF': 'abstract,surreal,unusual',
      'General': 'abstract,pattern,design'
    };
    
    const keywords = categoryKeywords[category] || categoryKeywords['General'];
    const seed = parseInt(marketId) % 1000;
    
    // Request smaller image size for thumbnails (48x54 display)
    return `https://source.unsplash.com/100x100/?${keywords}&sig=${seed}`;
  };

  // Calculate progress bar width (YES percentage)
  const progressWidth = yesPrice != null ? `${yesPrice}%` : '50%';
  
  // Calculate slider percentage
  const sliderPercentage = maxAmount > 0 ? (buyAmountNum / maxAmount) * 100 : 0;

  return (
    <div 
      className="transition-all duration-300"
      style={{
        width: '100%',
        height: '260px',
        perspective: '1000px',
        cursor: isFlipped ? 'default' : 'pointer',
        border: 'none',
        outline: 'none'
      }}
    >
      <div
        className="flip-card-inner"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transition: 'transform 0.6s',
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front of card */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
        background: 'linear-gradient(135deg, rgba(18,18,18,0.68), rgba(40,40,40,0.52))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: '14px',
            border: isFlipped ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: isFlipped 
              ? '0 18px 45px rgba(0, 0, 0, 0.5)' 
              : '0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 45px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
            overflow: 'hidden',
            transform: 'rotateY(0deg)',
            outline: 'none'
          }}
          className={!isFlipped ? 'hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(247,208,34,0.15)]' : ''}
    >
      <div style={{ padding: '22px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Section: Icon + Title + End Time */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '20px' }}>
          {/* Market Icon */}
          <div 
            onClick={handleNavigateToMarket}
            style={{
              width: '48px',
              height: '54px',
              minWidth: '48px',
              minHeight: '54px',
              borderRadius: '8px',
              overflow: 'hidden',
              flexShrink: 0,
              background: '#1a1a1a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              cursor: 'pointer'
            }}
          >
            <LazyImage
              src={getMarketImage()}
              alt={market.questionTitle || market.question || 'Market prediction'}
              width={48}
              height={54}
            />
          </div>
          
          {/* Title */}
          <div 
            onClick={handleNavigateToMarket}
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          >
            <h3 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600, 
                fontSize: '16.5rpx',
                lineHeight: '26px',
                color: '#F2F2F2',
                margin: 0
              }}
            >
              {market.questionTitle || market.question}
            </h3>
          </div>
          </div>
          
        {/* Middle Section: Volume + Progress Bar with Percentage */}
        <div style={{ marginBottom: '14px' }}>
          {/* End Time above Volume */}
          {getTimeRemaining(market.endTime, market.resolutionDateTime) && (
            <div 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '19px',
                color: '#F2F2F2',
                marginBottom: '6px'
              }}
            >
              {getTimeRemaining(market.endTime, market.resolutionDateTime)}
            </div>
          )}
        
          {/* Volume and Percentage row */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
            {/* Volume on left */}
            <div 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '19px',
                color: '#F2F2F2'
              }}
            >
              {formatVolumeDisplay(market.totalVolume || market.volume)} Vol.
            </div>
            
            {/* Percentage and Label on right */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              {isPriceLoading || yesPrice == null ? (
                <SkeletonText width="55px" height="22px" />
              ) : (
                <>
                  <span 
                    style={{
                      fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      fontWeight: 500,
                      fontSize: '19.5px',
                      lineHeight: '28.5px',
                      color: '#F2F2F2'
                    }}
                  >
                    {yesPrice}%
                  </span>
                  <span 
                    style={{
                      fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      fontWeight: 500,
                      fontSize: '14px',
                      lineHeight: '28.5px',
                      color: '#899CB2'
                    }}
                  >
                    chance
                  </span>
                </>
              )}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div 
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(55, 55, 55, 0.6)',
              borderRadius: '3px',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
            }}
          >
            {isPriceLoading || yesPrice == null ? (
              <div 
                style={{
                  width: '50%',
                  height: '100%',
                  background: 'linear-gradient(90deg, rgba(247, 208, 34, 0.2) 25%, rgba(247, 208, 34, 0.4) 50%, rgba(247, 208, 34, 0.2) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite',
                  borderRadius: '3px',
                  willChange: 'background-position',
                }}
              />
            ) : (
              <div 
                style={{
                  width: progressWidth,
                  height: '100%',
                  background: 'linear-gradient(90deg, #F7D022 0%, #FFE566 100%)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                  boxShadow: '0 0 8px rgba(247, 208, 34, 0.4)'
                }}
              />
            )}
          </div>
        </div>
        
        {/* Bottom Section: Yes/No Buttons */}
        <div 
          data-buy-buttons
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}
        >
          {/* Yes Button */}
          <button
            className="buy-button"
            type="button"
            onClick={(e) => handleBuy('yes', e)}
            style={{
              flex: 1,
              height: '50px',
              background: 'rgba(67, 199, 115, 0.15)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: '8px',
              border: '1px solid rgba(67, 199, 115, 0.2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(67, 199, 115, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(67, 199, 115, 0.4)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(67, 199, 115, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(67, 199, 115, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600, // Semibold
                fontSize: '17px',
                lineHeight: '24px',
                color: '#43C773',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              Yes
            </span>
          </button>
          
          {/* No Button */}
          <button
            className="buy-button"
            type="button"
            onClick={(e) => handleBuy('no', e)}
            style={{
              flex: 1,
              height: '50px',
              background: 'rgba(225, 55, 55, 0.15)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: '8px',
              border: '1px solid rgba(225, 55, 55, 0.2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(225, 55, 55, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(225, 55, 55, 0.4)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(225, 55, 55, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(225, 55, 55, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600, // Semibold
                fontSize: '17px',
                lineHeight: '24px',
                color: '#E13737',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              No
            </span>
          </button>
        </div>
      </div>
      </div>
      
      {/* Back of card - Buy Interface */}
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          background: 'linear-gradient(135deg, rgba(18,18,18,0.68), rgba(40,40,40,0.52))',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '14px',
          border: 'none',
          boxShadow: '0 18px 45px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          transform: 'rotateY(180deg)',
          outline: 'none'
        }}
      >
        <div style={{ padding: '16px 18px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header with close button */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
            {/* Market Icon */}
            <div 
              style={{
                width: '40px',
                height: '40px',
                minWidth: '40px',
                minHeight: '40px',
                borderRadius: '6px',
                overflow: 'hidden',
                flexShrink: 0,
                background: '#1a1a1a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            >
              <LazyImage
                src={getMarketImage()}
                alt={market.questionTitle || market.question || 'Market prediction'}
                width={40}
                height={40}
              />
            </div>
            
            {/* Close button */}
            <button
              onClick={handleClose}
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#F2F2F2',
                fontSize: '18px',
                flexShrink: 0
              }}
            >
              ×
            </button>
          </div>
          
          {/* Title - Full Width */}
          <div style={{ width: '100%', marginBottom: '14px' }}>
            <h3 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600, 
                fontSize: '15px',
                lineHeight: '20px',
                color: '#F2F2F2',
                margin: 0,
                width: '100%',
                wordWrap: 'break-word'
              }}
            >
              {market.questionTitle || market.question}
            </h3>
          </div>
          
          {/* Price and Amount Section */}
          <div style={{ marginBottom: '10px' }}>
            {/* Price display and Amount input */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              marginBottom: '10px',
              padding: '10px',
              background: 'rgba(55, 55, 55, 0.4)',
              borderRadius: '6px',
              border: 'none'
            }}>
              <div style={{ 
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 500,
                fontSize: '16px',
                color: '#F2F2F2',
                minWidth: '50px'
              }}>
                ${priceInDollars}
              </div>
              <input
                type="number"
                value={buyAmount}
                onChange={(e) => { e.stopPropagation(); handleAmountChange(e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                placeholder="0.00"
                min="0"
                max={maxAmount}
                step="0.01"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#F2F2F2',
                  fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontWeight: 500,
                  fontSize: '15px',
                  textAlign: 'right',
                  padding: '0 6px'
                }}
              />
              <div style={{ 
                display: 'flex', 
                gap: '4px'
              }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement(1); }}
                  style={{
                    width: '28px',
                    height: '28px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#F2F2F2',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none'
                  }}
                >
                  +1
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement(10); }}
                  style={{
                    width: '28px',
                    height: '28px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#F2F2F2',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none'
                  }}
                >
                  +10
                </button>
              </div>
            </div>
            
            {/* Slider */}
            <div style={{ 
              marginBottom: '10px',
              position: 'relative',
              height: '10px',
              background: 'rgba(55, 55, 55, 0.9)',
              borderRadius: '5px',
              overflow: 'visible'
            }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: `${sliderPercentage}%`,
                height: '100%',
                background: selectedSide === 'yes' 
                  ? 'rgba(67, 199, 115, 1)' 
                  : 'rgba(225, 55, 55, 1)',
                borderRadius: '5px',
                transition: 'width 0.1s ease',
                zIndex: 0
              }} />
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPercentage}
                onChange={handleSliderChange}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '10px',
                  background: 'transparent',
                  borderRadius: '5px',
                  outline: 'none',
                  cursor: 'pointer',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  zIndex: 2,
                  margin: 0,
                  padding: 0
                }}
              />
              <style>{`
                input[type="range"] {
                  margin: 0;
                  padding: 0;
                }
                input[type="range"]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 12px;
                  height: 12px;
                  background: #1a1a1a;
                  border-radius: 50%;
                  cursor: pointer;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                  border: 2px solid #FFFFFF;
                  margin-top: -2px;
                }
                input[type="range"]::-moz-range-thumb {
                  width: 12px;
                  height: 12px;
                  background: #1a1a1a;
                  border-radius: 50%;
                  cursor: pointer;
                  border: 2px solid #FFFFFF;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                }
                input[type="range"]::-webkit-slider-runnable-track {
                  background: transparent;
                  height: 10px;
                  border-radius: 5px;
                  margin: 0;
                  padding: 0;
                }
                input[type="range"]::-moz-range-track {
                  background: transparent;
                  height: 10px;
                  border-radius: 5px;
                }
              `}</style>
            </div>
          </div>
          
          {/* Buy Button */}
          <button
            onClick={handleBuyClick}
            disabled={isBuying || buyAmountNum <= 0 || !isConnected}
            type="button"
              style={{
                width: '100%',
                height: '50px',
                padding: '10px',
                background: selectedSide === 'yes' 
                  ? 'rgba(67, 199, 115, 1)' 
                  : 'rgba(225, 55, 55, 1)',
              border: 'none',
              borderRadius: '8px',
              cursor: isBuying || buyAmountNum <= 0 || !isConnected ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isBuying || buyAmountNum <= 0 || !isConnected ? 0.6 : 1,
              transition: 'all 0.2s ease',
              marginTop: 'auto',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              outline: 'none'
            }}
            onMouseEnter={(e) => {
              if (!isBuying && buyAmountNum > 0 && isConnected) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
            }}
          >
            <span 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600,
                fontSize: '16px',
                lineHeight: '22px',
                color: '#FFFFFF'
              }}
            >
              Buy {selectedSide === 'yes' ? 'Yes' : 'No'}
            </span>
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ModernMarketCard;
