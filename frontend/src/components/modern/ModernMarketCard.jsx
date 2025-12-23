import React, { useState, memo, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import '../../pages/market/MarketDetailGlass.css';

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
  const { isConnected, buyShares, ethBalance } = useWeb3();
  
  // Flip state
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedSide, setSelectedSide] = useState('yes');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [isBuying, setIsBuying] = useState(false);
  
  // Check if prices are still loading
  const isPriceLoading = market._priceLoading || (market.yesPrice == null && market.noPrice == null);
  
  // Use actual prices from market if available (from blockchain), otherwise calculate from probability
  let yesPrice, noPrice;
  if (market.yesPrice != null && market.noPrice != null) {
    // Prices are already in cents from blockchain
    yesPrice = Math.round(market.yesPrice);
    noPrice = Math.round(market.noPrice);
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
  
  const handleCardClick = (e) => {
    // Don't navigate if clicking on buy buttons or flip card elements
    if (e.target.closest('.buy-button') || e.target.closest('.flip-card-inner') || isFlipped) return;
    history.push(`/markets/${market.id}`);
  };

  const handleBuy = (side, e) => {
    e.stopPropagation();
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
    
    try {
      setIsBuying(true);
      await buyShares(market.id, selectedSide === 'yes', buyAmount);
      toast.success(`${selectedSide === 'yes' ? 'YES' : 'NO'} shares purchased!`);
      setIsFlipped(false);
      setBuyAmount('0.1');
    } catch (error) {
      console.error('Buy failed:', error);
      toast.error(error?.message || 'Transaction failed');
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
      onClick={handleCardClick}
      className="glass-card box-shadow transition-all duration-300"
      style={{
        width: '100%',
        minHeight: '235px',
        perspective: '1000px',
        cursor: isFlipped ? 'default' : 'pointer'
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
            minHeight: '235px',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: 'linear-gradient(135deg, rgba(18,18,18,0.68), rgba(40,40,40,0.52))',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 45px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
            overflow: 'hidden',
            transform: 'rotateY(0deg)'
          }}
          className={!isFlipped ? 'hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(247,208,34,0.15)]' : ''}
        >
      <div style={{ padding: '22px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Section: Icon + Title + End Time */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '20px' }}>
          {/* Market Icon */}
          <div 
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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600, 
                fontSize: '19px',
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
        <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
          {/* Yes Button */}
          <button
            className="buy-button"
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
          minHeight: '235px',
          top: 0,
          left: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          background: 'linear-gradient(135deg, rgba(18,18,18,0.68), rgba(40,40,40,0.52))',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 45px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
          overflow: 'hidden',
          transform: 'rotateY(180deg)'
        }}
      >
        <div style={{ padding: '22px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header with close button */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '20px' }}>
            {/* Market Icon */}
            <div 
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
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 
                style={{
                  fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontWeight: 600, 
                  fontSize: '19px',
                  lineHeight: '26px',
                  color: '#F2F2F2',
                  margin: 0
                }}
              >
                {market.questionTitle || market.question}
              </h3>
            </div>
            
            {/* Close button */}
            <button
              onClick={handleClose}
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#F2F2F2',
                fontSize: '20px',
                flexShrink: 0
              }}
            >
              ×
            </button>
          </div>
          
          {/* Price and Amount Section */}
          <div style={{ marginBottom: '20px' }}>
            {/* Price display and Amount input */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '12px',
              background: 'rgba(55, 55, 55, 0.4)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ 
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 500,
                fontSize: '18px',
                color: '#F2F2F2',
                minWidth: '60px'
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
                  fontSize: '18px',
                  textAlign: 'right',
                  padding: '0 8px'
                }}
              />
              <div style={{ 
                display: 'flex', 
                gap: '6px'
              }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement(1); }}
                  style={{
                    width: '32px',
                    height: '32px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#F2F2F2',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  +1
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement(10); }}
                  style={{
                    width: '32px',
                    height: '32px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#F2F2F2',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  +10
                </button>
              </div>
            </div>
            
            {/* Slider */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPercentage}
                onChange={handleSliderChange}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(55, 55, 55, 0.6)',
                  borderRadius: '3px',
                  outline: 'none',
                  cursor: 'pointer',
                  WebkitAppearance: 'none',
                  appearance: 'none'
                }}
              />
              <style>{`
                input[type="range"]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 18px;
                  height: 18px;
                  background: #F2F2F2;
                  border-radius: 50%;
                  cursor: pointer;
                  box-shadow: 0 0 4px rgba(0,0,0,0.3);
                }
                input[type="range"]::-moz-range-thumb {
                  width: 18px;
                  height: 18px;
                  background: #F2F2F2;
                  border-radius: 50%;
                  cursor: pointer;
                  border: none;
                  box-shadow: 0 0 4px rgba(0,0,0,0.3);
                }
                input[type="range"]::-webkit-slider-runnable-track {
                  background: linear-gradient(90deg, 
                    rgba(100, 150, 255, 0.6) 0%, 
                    rgba(150, 100, 255, 0.6) 50%, 
                    rgba(55, 55, 55, 0.6) 50%
                  );
                  height: 6px;
                  border-radius: 3px;
                }
                input[type="range"]::-moz-range-track {
                  background: linear-gradient(90deg, 
                    rgba(100, 150, 255, 0.6) 0%, 
                    rgba(150, 100, 255, 0.6) 50%, 
                    rgba(55, 55, 55, 0.6) 50%
                  );
                  height: 6px;
                  border-radius: 3px;
                }
              `}</style>
            </div>
          </div>
          
          {/* Buy Button */}
          <button
            onClick={handleBuyClick}
            disabled={isBuying || buyAmountNum <= 0 || !isConnected}
            style={{
              width: '100%',
              height: '50px',
              background: selectedSide === 'yes' 
                ? 'rgba(67, 199, 115, 0.9)' 
                : 'rgba(225, 55, 55, 0.9)',
              border: 'none',
              borderRadius: '8px',
              cursor: isBuying || buyAmountNum <= 0 || !isConnected ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              opacity: isBuying || buyAmountNum <= 0 || !isConnected ? 0.6 : 1,
              transition: 'all 0.2s ease',
              marginTop: 'auto'
            }}
            onMouseEnter={(e) => {
              if (!isBuying && buyAmountNum > 0 && isConnected) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600,
                fontSize: '17px',
                lineHeight: '24px',
                color: '#FFFFFF'
              }}
            >
              Buy {selectedSide === 'yes' ? 'Yes' : 'No'}
            </span>
            <span 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 400,
                fontSize: '13px',
                lineHeight: '18px',
                color: 'rgba(255, 255, 255, 0.9)'
              }}
            >
          
            </span>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ModernMarketCard;
