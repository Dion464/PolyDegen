import React, { useEffect, useState, useCallback, memo } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { getCurrencySymbol } from '../../utils/currency';
import { ethers } from 'ethers';
import WormStyleNavbar from '../../components/modern/WormStyleNavbar';
import MarketCountdown from '../../components/common/MarketCountdown';
import ModernMarketCard from '../../components/modern/ModernMarketCard';
import HowItWorksModal from '../../components/modal/HowItWorksModal';
import { CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL } from '../../contracts/eth-config';
import '../market/MarketDetailGlass.css';

// Skeleton market card for loading state
const MarketCardSkeleton = memo(() => (
  <div 
    className="animate-pulse"
    style={{
      width: '100%',
      minHeight: '235px',
      background: 'linear-gradient(135deg, rgba(18,18,18,0.68), rgba(40,40,40,0.52))',
      backdropFilter: 'blur(24px)',
      borderRadius: '14px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      padding: '22px 20px',
    }}
  >
    {/* Top row - avatar + title */}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '20px' }}>
      <div style={{ width: '48px', height: '54px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', marginBottom: '8px', width: '80%' }} />
        <div style={{ height: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', width: '60%' }} />
      </div>
      <div style={{ width: '60px', height: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px' }} />
    </div>
    
    {/* Middle - volume + percentage */}
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ width: '60px', height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
        <div style={{ width: '80px', height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }} />
    </div>
    
    {/* Bottom - buttons */}
    <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
      <div style={{ flex: 1, height: '50px', background: 'rgba(67, 199, 115, 0.1)', borderRadius: '8px' }} />
      <div style={{ flex: 1, height: '50px', background: 'rgba(225, 55, 55, 0.1)', borderRadius: '8px' }} />
    </div>
  </div>
));

// Skeleton grid for loading state
const MarketsGridSkeleton = memo(() => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
    {[...Array(6)].map((_, i) => (
      <MarketCardSkeleton key={i} />
    ))}
  </div>
));

// Trending skeleton
const TrendingCardSkeleton = memo(() => (
  <div 
    className="animate-pulse"
    style={{
      background: 'transparent',
      backdropFilter: 'blur(26px)',
      borderRadius: '14px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      minHeight: '220px',
      padding: '20px 18px',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', marginBottom: '8px', width: '85%' }} />
        <div style={{ height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', width: '50%' }} />
      </div>
    </div>
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ width: '50px', height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
        <div style={{ width: '70px', height: '18px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }} />
    </div>
    <div style={{ display: 'flex', gap: '10px' }}>
      <div style={{ flex: 1, height: '48px', background: 'rgba(67, 199, 115, 0.08)', borderRadius: '8px' }} />
      <div style={{ flex: 1, height: '48px', background: 'rgba(225, 55, 55, 0.08)', borderRadius: '8px' }} />
    </div>
  </div>
));

// Inline skeleton component for selective loading
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

const TrendingSkeleton = memo(() => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
    {[...Array(3)].map((_, i) => (
      <TrendingCardSkeleton key={i} />
    ))}
  </div>
));

// Lazy image component for market cards - optimized for CLS
const LazyMarketImage = memo(({ src, alt, width = 48, height = 48 }) => {
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

  // Optimize Unsplash URLs for smaller sizes
  const optimizeSrc = (url) => {
    if (!url) return null;
    if (url.includes('source.unsplash.com')) {
      return url.replace(/\/\d+x\d+\//, '/100x100/').replace(/\?.*$/, '?w=100&h=100&fit=crop');
    }
    return url;
  };

  const optimizedSrc = optimizeSrc(currentSrc);

  return (
    <div 
      style={{ 
        width: `${width}px`, 
        height: `${height}px`, 
        position: 'relative',
        backgroundColor: '#1a1a1a'
      }}
    >
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

const HomeWormStyle = () => {
  const history = useHistory();
  const { contracts, provider, chainId } = useWeb3();
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [trendingMarkets, setTrendingMarkets] = useState([]);
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'volume', 'popular'
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  
  const currencySymbol = getCurrencySymbol(chainId);
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

  const categories = ['All', 'Politics', 'Sports', 'Crypto', 'Tech', 'WTF'];

  useEffect(() => {
    fetchMarkets();
  }, [contracts]);

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      
      // Create a direct provider if wallet is not connected
      let contractToUse = contracts?.predictionMarket;
      
      if (!contractToUse) {
        // Use direct RPC connection without wallet
        if (!RPC_URL) {
          throw new Error('RPC_URL not configured. Please set VITE_RPC_URL environment variable.');
        }
        const directProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
        contractToUse = new ethers.Contract(
          CONTRACT_ADDRESS,
          CONTRACT_ABI,
          directProvider
        );
      }

      // Fetch images FIRST so they're available when markets render
      let persistedImages = {};
      try {
        const imageResponse = await fetch(`${API_BASE}/api/market-images`);
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imagesArray = Array.isArray(imageData.images) ? imageData.images : [];
          imagesArray.forEach((img) => {
            if (img.marketId && img.imageUrl) {
              persistedImages[img.marketId.toString()] = img.imageUrl;
            }
          });
        }
      } catch (imgErr) {
        console.warn('Unable to load market images from API:', imgErr);
      }

      const activeMarkets = await contractToUse.getActiveMarkets();
      
      // Stream markets progressively - first come, first serve
      const allMarketsData = [];
      
      // Process markets one by one and update state progressively
      for (const marketId of activeMarkets) {
        try {
          const market = await contractToUse.getMarket(marketId);
          
          // Skip inactive/resolved markets early
          if (!market.active || market.resolved) continue;
          
          const marketIdStr = marketId.toString();
          
          // Create partial market data immediately (basic info first)
          // Images are already loaded so include them right away
          const partialMarket = {
            id: marketIdStr,
            question: market.question,
            category: market.category || 'General',
            yesPrice: null, // Will be filled in
            noPrice: null,
            totalYesShares: parseFloat(ethers.utils.formatEther(market.totalYesShares)),
            totalNoShares: parseFloat(ethers.utils.formatEther(market.totalNoShares)),
            volume: null, // Will be computed
            creator: market.creator,
            resolved: market.resolved,
            active: market.active,
            createdAt: market.createdAt ? new Date(market.createdAt.toNumber() * 1000) : new Date(),
            endTime: market.endTime ? new Date(market.endTime.toNumber() * 1000).toISOString() : null,
            resolutionTime: market.resolutionTime ? new Date(market.resolutionTime.toNumber() * 1000).toISOString() : null,
            imageUrl: persistedImages[marketIdStr] || (market.imageUrl ?? null),
            _priceLoading: true, // Flag for skeleton state
          };
          
          // Calculate volume from shares
          partialMarket.volume = partialMarket.totalYesShares + partialMarket.totalNoShares;
          
          // Add to allMarketsData and update state immediately
          allMarketsData.push(partialMarket);
          
          // Update markets state progressively
          setMarkets([...allMarketsData]);
          
          // Update trending (top 3 by volume) progressively
          const sortedForTrending = [...allMarketsData].sort((a, b) => b.volume - a.volume);
          setTrendingMarkets(sortedForTrending.slice(0, 3));
          
          // Fetch prices asynchronously and update when ready
          contractToUse.getCurrentPrice(marketId, true)
            .then(async (yesPriceBps) => {
              const noPriceBps = await contractToUse.getCurrentPrice(marketId, false);
              const yesPrice = Math.round(parseFloat(yesPriceBps.toString()) / 100);
              const noPrice = Math.round(parseFloat(noPriceBps.toString()) / 100);
              
              // Update the market with price data
              setMarkets(prev => prev.map(m => 
                m.id === marketIdStr 
                  ? { ...m, yesPrice, noPrice, _priceLoading: false }
                  : m
              ));
              setTrendingMarkets(prev => prev.map(m => 
                m.id === marketIdStr 
                  ? { ...m, yesPrice, noPrice, _priceLoading: false }
                  : m
              ));
            })
            .catch(() => {
              // Set defaults if price fetch fails
              setMarkets(prev => prev.map(m => 
                m.id === marketIdStr 
                  ? { ...m, yesPrice: 50, noPrice: 50, _priceLoading: false }
                  : m
              ));
              setTrendingMarkets(prev => prev.map(m => 
                m.id === marketIdStr 
                  ? { ...m, yesPrice: 50, noPrice: 50, _priceLoading: false }
                  : m
              ));
            });
          
        } catch (err) {
          console.error(`Error fetching market ${marketId}:`, err);
        }
      }
      
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    // Search happens in real-time via filteredMarkets, no need to navigate
    // Focus stays on input for continued typing
  };

  const filteredMarkets = markets.filter(market => {
    const matchesCategory = selectedCategory === 'All' || market.category === selectedCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || 
      market.question.toLowerCase().includes(query) ||
      (market.category && market.category.toLowerCase().includes(query)) ||
      (market.creator && market.creator.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  // Sort filtered markets
  const sortedMarkets = [...filteredMarkets].sort((a, b) => {
    switch (sortBy) {
      case 'volume':
        return b.volume - a.volume;
      case 'popular':
        // Sort by total shares (popularity indicator)
        return (b.totalYesShares + b.totalNoShares) - (a.totalYesShares + a.totalNoShares);
      case 'newest':
      default:
        return b.createdAt - a.createdAt;
    }
  });

  // Helper function to get time remaining
  const getTimeRemaining = (endTime, resolutionTime) => {
    let endDate;
    if (endTime) {
      // endTime could be a Date object or ISO string
      endDate = endTime instanceof Date ? endTime : new Date(endTime);
    } else if (resolutionTime) {
      endDate = new Date(resolutionTime);
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

  const getMarketImage = (market) => {
    if (market.imageUrl) {
      return market.imageUrl;
    }

    if (market.description && market.description.startsWith('data:image')) {
      return market.description;
    }

    const category = market.category || 'General';
    
    const categoryKeywords = {
      'Politics': 'politics,government,election',
      'Sports': 'sports,athlete,competition',
      'Crypto': 'cryptocurrency,bitcoin,blockchain',
      'Tech': 'technology,innovation,digital',
      'AI': 'artificial-intelligence,robot,future',
      'Stocks': 'stock-market,trading,finance',
      'WTF': 'abstract,surreal,unusual',
      'General': 'abstract,gradient,modern'
    };
    
    const keywords = categoryKeywords[category] || categoryKeywords['General'];
    const seed = parseInt(market.id || '0', 10) % 1000;
    
    // Request smaller image size for thumbnails (48x48 display)
    return `https://source.unsplash.com/100x100/?${keywords}&sig=${seed}`;
  };

  return (
    <div className="min-h-screen bg-[#0E0E0E]" style={{ fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Navbar */}
      <WormStyleNavbar />
      
      {/* Hero Section - Optimized with preloaded background */}
      <div 
        className="relative w-full overflow-visible"
        style={{
          backgroundImage: 'url(/hero-background.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          minHeight: 'min(500px, 60vh)',
          paddingBottom: 'clamp(100px, 25vw, 200px)',
          willChange: 'transform' // Optimize paint performance
        }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/70"></div>
        
        {/* Content */}
        <div className="relative max-w-6xl mx-auto px-4 pt-20 sm:pt-32 pb-12 sm:pb-20 mt-4 sm:mt-10">
          <div className="text-center">
            <h1 className="text-[22px] sm:text-[28px] md:text-[33px] font-medium text-white leading-tight mb-6 sm:mb-8 font-space-grotesk px-2">
              Discover the latest Prediction Markets<br className="hidden sm:block" />
              <span className="sm:hidden"> </span>or Create your Own & Earn!
            </h1>
            
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto px-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search markets..."
                  className="w-full px-4 sm:px-6 py-3 sm:py-5 bg-white/10 backdrop-blur-md text-white rounded-[12px] border border-white/20 focus:border-white/40 focus:outline-none placeholder:text-gray-300 transition-all text-sm sm:text-lg"
                />
                <button
                  type="submit"
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-2 sm:p-3 rounded-full transition-colors backdrop-blur-md"
                  aria-label="Search markets"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Main Content Section - Moved up with negative margin */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 -mt-20 sm:-mt-40 relative z-10">

        {/* Trending Section - Hide when searching */}
        {!searchQuery.trim() && (
          <div className="mb-8 sm:mb-12">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2
                style={{
                  fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontWeight: 600,
                  fontSize: '12px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#F2F2F2',
                  opacity: 0.9,
                }}
                className="text-[11px] sm:text-[14px]"
              >
                Trending markets
              </h2>
            </div>
            
            {/* Show skeleton placeholders while initial load, then progressively show content */}
            {loading && trendingMarkets.length === 0 ? (
              <TrendingSkeleton />
            ) : (
              trendingMarkets.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
              {trendingMarkets.map((market) => (
                <div
                  key={market.id}
                  onClick={() => history.push(`/markets/${market.id}`)}
                  className="glass-card background box-shadow rounded-[14px] overflow-hidden cursor-pointer transition-all duration-300 ease-out group relative hover:scale-[1.02]"
                  style={{
                    // Use glass-card outline for border; keep interior mostly transparent with blur
                    background: 'transparent',
                    backdropFilter: 'blur(26px)',
                    WebkitBackdropFilter: 'blur(26px)',
                    borderRadius: '14px',
                    minHeight: '220px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.2), 0 26px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.18)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  <div style={{ padding: '20px 18px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Top Section: Icon + Title + End Time */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px' }}>
                      {/* Market Icon - Fixed dimensions to prevent CLS */}
                      <div 
                        style={{
                          width: '48px',
                          height: '48px',
                          minWidth: '48px',
                          minHeight: '48px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          flexShrink: 0,
                          background: '#1a1a1a',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        <LazyMarketImage
                          src={getMarketImage(market)}
                          alt={market.question || 'Market prediction'}
                          width={48}
                          height={48}
                        />
                      </div>
                      
                      {/* Title and ID */}
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
                          {market.question}
                        </h3>
                        <span
                          style={{
                            fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            fontWeight: 400,
                            fontSize: '12px',
                            color: '#899CB2',
                            marginTop: '4px',
                            display: 'inline-block'
                          }}
                        >
                        
                        </span>
                      </div>
                      
                      {/* End Time */}
                      {getTimeRemaining(market.endTime, market.resolutionTime) && (
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
                          {getTimeRemaining(market.endTime, market.resolutionTime)}
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
                          {market.volume != null ? (
                            <>
                              {market.volume >= 1000000 ? `${(market.volume / 1000000).toFixed(1)}m` : market.volume >= 1000 ? `${(market.volume / 1000).toFixed(1)}k` : market.volume.toFixed(2)} Vol.
                            </>
                          ) : (
                            <SkeletonText width="60px" height="14px" />
                          )}
                        </div>
                        
                        {/* Percentage and Label on right */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          {market._priceLoading || market.yesPrice == null ? (
                            <SkeletonText width="55px" height="22px" />
                          ) : (
                            <>
                              <span 
                                style={{
                                  fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                  fontWeight: 500,
                                  fontSize: '18.38px',
                                  lineHeight: '27.58px',
                                  color: '#F2F2F2'
                                }}
                              >
                                {market.yesPrice}%
                              </span>
                              <span 
                                style={{
                                  fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                  fontWeight: 500,
                                  fontSize: '13.83px',
                                  lineHeight: '27.58px',
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
                        {market._priceLoading || market.yesPrice == null ? (
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
                              width: `${market.yesPrice}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #F7D022 0%, #FFE566 100%)',
                              borderRadius: '3px',
                              boxShadow: '0 0 8px rgba(247, 208, 34, 0.4)',
                              transition: 'width 0.3s ease-out'
                            }}
                          />
                        )}
                      </div>
                    </div>
                    
                    {/* Bottom Section: Yes/No Buttons */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                      {/* Yes Button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); history.push(`/markets/${market.id}`); }}
                        style={{
                          flex: 1,
                          height: '48px',
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
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(67, 199, 115, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(67, 199, 115, 0.2)';
                        }}
                      >
                        <span 
                          style={{
                            fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            fontWeight: 600, // Semibold
                            fontSize: '16.09px',
                            color: '#43C773'
                          }}
                        >
                          Yes
                        </span>
                      </button>
                      
                      {/* No Button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); history.push(`/markets/${market.id}`); }}
                        style={{
                          flex: 1,
                          height: '48px',
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
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(225, 55, 55, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(225, 55, 55, 0.2)';
                        }}
                      >
                        <span 
                          style={{
                            fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            fontWeight: 600, // Semibold
                            fontSize: '16.09px',
                            color: '#E13737'
                          }}
                        >
                          No
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
              )
            )}
          </div>
        )}

        {/* Results Counter */}
        {!loading && (searchQuery.trim() || selectedCategory !== 'All') && (
          <div className="mb-4">
            <p className="text-gray-400 text-sm font-space-grotesk">
              Found <span className="text-white font-semibold">{sortedMarkets.length}</span> market{sortedMarkets.length !== 1 ? 's' : ''}
              {searchQuery.trim() && <span> matching "<span className="text-white">{searchQuery}</span>"</span>}
              {selectedCategory !== 'All' && <span> in <span className="text-white">{selectedCategory}</span></span>}
            </p>
          </div>
        )}

        {/* Category Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-3 sm:gap-4">
          <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide w-full sm:w-auto -mx-1 px-1">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-full font-medium font-space-grotesk whitespace-nowrap transition-all text-[13px] sm:text-[15px] ${
                  selectedCategory === category
                    ? 'bg-[#222222] text-white'
                    : 'bg-[#010101] text-white hover:bg-[#333333] border border-white/10'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          
          <div className="relative w-full sm:w-auto">
            <label htmlFor="sort-markets" className="sr-only">Sort markets by</label>
            <select 
              id="sort-markets"
              name="sort-markets"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort markets"
              className="appearance-none flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#222222] text-white rounded-full hover:bg-[#333333] transition-all whitespace-nowrap border border-white/10 cursor-pointer text-[12px] sm:text-[14px] font-medium font-space-grotesk pr-9 sm:pr-10 w-full sm:w-auto"
            >
              <option value="newest">Sort: Newest</option>
              <option value="volume">Sort: Volume</option>
              <option value="popular">Sort: Popular</option>
            </select>
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Markets Grid - Progressive loading: show cards as they arrive */}
        {loading && sortedMarkets.length === 0 ? (
          <MarketsGridSkeleton />
        ) : sortedMarkets.length === 0 && !loading ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg font-space-grotesk">
              {searchQuery.trim() ? `No markets found for "${searchQuery}"` : 'No markets found'}
            </p>
            <p className="text-gray-500 text-sm mt-2 font-space-grotesk">
              {searchQuery.trim() ? 'Try a different search term' : 'Try creating one or check back later!'}
            </p>
            {searchQuery.trim() && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all font-space-grotesk"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {sortedMarkets.map((market) => (
              <ModernMarketCard
                key={market.id}
                market={{
                  ...market,
                  questionTitle: market.question || market.questionTitle,
                  totalVolume: market.volume || market.totalVolume,
                  endTime: market.endTime,
                  resolutionDateTime: market.resolutionTime || market.endTime
                }}
                showBuyButtons={true}
                onBuy={(marketId, side) => {
                  history.push(`/markets/${marketId}`);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 sm:mt-20">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm order-2 sm:order-1">
              <button className="text-gray-400 hover:text-white transition-colors font-medium">
                Terms
              </button>
              <button className="text-gray-400 hover:text-white transition-colors font-medium">
                Privacy
              </button>
            </div>
            
            <button 
              onClick={() => setHowItWorksOpen(true)}
              className="text-[#FFE600] hover:text-[#FFE600]/80 transition-colors text-xs sm:text-sm font-medium order-1 sm:order-2"
            >
              How it Works?
            </button>
            
            <div className="flex gap-4 order-3">
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors" aria-label="Follow us on X (Twitter)">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors" aria-label="Join our Discord community">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
              <a href="https://telegram.org" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors" aria-label="Join our Telegram group">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12a12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472c-.18 1.898-.962 6.502-1.36 8.627c-.168.9-.499 1.201-.82 1.23c-.696.065-1.225-.46-1.9-.902c-1.056-.693-1.653-1.124-2.678-1.8c-1.185-.78-.417-1.21.258-1.91c.177-.184 3.247-2.977 3.307-3.23c.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345c-.48.33-.913.49-1.302.48c-.428-.008-1.252-.241-1.865-.44c-.752-.245-1.349-.374-1.297-.789c.027-.216.325-.437.893-.663c3.498-1.524 5.83-2.529 6.998-3.014c3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* How It Works Modal */}
      <HowItWorksModal 
        isOpen={howItWorksOpen} 
        onClose={() => setHowItWorksOpen(false)} 
      />
    </div>
  );
};

export default HomeWormStyle;

