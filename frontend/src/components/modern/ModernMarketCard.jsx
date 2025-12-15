import React, { useState, memo } from 'react';
import { useHistory } from 'react-router-dom';
import '../../pages/market/MarketDetailGlass.css';

// Inline skeleton for selective loading
const SkeletonText = memo(({ width = '100%', height = '20px', style = {} }) => (
  <div 
    className="animate-pulse"
    style={{
      width,
      height,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: '6px',
      ...style
    }}
  />
));

// Lazy image component with blur placeholder - optimized for CLS
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
          className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800"
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
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
            left: 0
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
  
  const handleCardClick = (e) => {
    // Don't navigate if clicking on buy buttons
    if (e.target.closest('.buy-button')) return;
    history.push(`/markets/${market.id}`);
  };

  const handleBuy = (side, e) => {
    e.stopPropagation();
    if (onBuy) {
      onBuy(market.id, side);
    }
  };

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

  return (
    <div 
      onClick={handleCardClick}
      className="glass-card box-shadow cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(247,208,34,0.15)]"
      style={{
        width: '100%',
        minHeight: '235px',
        // Lighter, clearer glass background
        background: 'linear-gradient(135deg, rgba(18,18,18,0.68), rgba(40,40,40,0.52))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: '14px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 45px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
        overflow: 'hidden'
      }}
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
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {market.questionTitle || market.question}
            </h3>
          </div>
          
          {/* End Time */}
          {getTimeRemaining(market.endTime, market.resolutionDateTime) && (
            <div 
              style={{
                fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '19px',
                color: '#F2F2F2',
                flexShrink: 0,
                whiteSpace: 'nowrap'
              }}
            >
              {getTimeRemaining(market.endTime, market.resolutionDateTime)}
            </div>
          )}
        </div>
        
        {/* Middle Section: Volume + Progress Bar with Percentage */}
        <div style={{ marginBottom: '14px' }}>
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
                className="animate-pulse"
                style={{
                  width: '50%',
                  height: '100%',
                  background: 'rgba(247, 208, 34, 0.3)',
                  borderRadius: '3px',
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
  );
};

export default ModernMarketCard;
