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
import { useWebSocket, useLiveMarkets } from '../../contexts/WebSocketContext';

// GPU-accelerated skeleton shimmer style (uses transform/opacity for compositing)
const skeletonShimmerStyle = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  willChange: 'background-position',
};

// Skeleton market card for loading state - GPU optimized
const MarketCardSkeleton = memo(() => (
  <div 
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
      <div style={{ width: '48px', height: '54px', borderRadius: '8px', ...skeletonShimmerStyle }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: '20px', borderRadius: '6px', marginBottom: '8px', width: '80%', ...skeletonShimmerStyle }} />
        <div style={{ height: '16px', borderRadius: '6px', width: '60%', ...skeletonShimmerStyle }} />
      </div>
      <div style={{ width: '60px', height: '16px', borderRadius: '6px', ...skeletonShimmerStyle }} />
    </div>
    
    {/* Middle - volume + percentage */}
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ width: '60px', height: '14px', borderRadius: '4px', ...skeletonShimmerStyle }} />
        <div style={{ width: '80px', height: '20px', borderRadius: '4px', ...skeletonShimmerStyle }} />
      </div>
      <div style={{ height: '6px', borderRadius: '3px', ...skeletonShimmerStyle }} />
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

// Trending skeleton - GPU optimized
const TrendingCardSkeleton = memo(() => (
  <div 
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
      <div style={{ width: '48px', height: '48px', borderRadius: '8px', ...skeletonShimmerStyle }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: '20px', borderRadius: '6px', marginBottom: '8px', width: '85%', ...skeletonShimmerStyle }} />
        <div style={{ height: '14px', borderRadius: '6px', width: '50%', ...skeletonShimmerStyle }} />
      </div>
    </div>
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ width: '50px', height: '14px', borderRadius: '4px', ...skeletonShimmerStyle }} />
        <div style={{ width: '70px', height: '18px', borderRadius: '4px', ...skeletonShimmerStyle }} />
      </div>
      <div style={{ height: '6px', borderRadius: '3px', ...skeletonShimmerStyle }} />
    </div>
    <div style={{ display: 'flex', gap: '10px' }}>
      <div style={{ flex: 1, height: '48px', background: 'rgba(67, 199, 115, 0.08)', borderRadius: '8px' }} />
      <div style={{ flex: 1, height: '48px', background: 'rgba(225, 55, 55, 0.08)', borderRadius: '8px' }} />
    </div>
  </div>
));

// Inline skeleton component for selective loading - GPU optimized
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

const TrendingSkeleton = memo(() => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
    {[...Array(3)].map((_, i) => (
      <TrendingCardSkeleton key={i} />
    ))}
  </div>
));

// Lazy image component for market cards - optimized for CLS and GPU compositing
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

  const categories = ['All', 'New', 'Politics', 'Sports', 'Crypto', 'Finance', 'Geopolitics', 'Earnings', 'Tech', 'Culture', 'World', 'Economy', 'Climate & Science', 'Elections', 'Mentions'];
  
  // WebSocket for real-time market updates
  const { subscribeGlobal, onMessage } = useWebSocket();
  const liveMarkets = useLiveMarkets(5000); // 5s polling fallback

  // Define fetchMarkets with useCallback BEFORE it's used in useEffect
  const fetchMarkets = useCallback(async () => {
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
      
      // Batch size for progressive loading (reduces re-renders)
      const BATCH_SIZE = 3;
      const allMarketsData = [];
      
      // Helper to yield to main thread between batches
      const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
      
      // Process markets in batches to reduce main thread blocking
      for (let i = 0; i < activeMarkets.length; i += BATCH_SIZE) {
        const batch = activeMarkets.slice(i, i + BATCH_SIZE);
        
        // Fetch batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (marketId) => {
            try {
              const market = await contractToUse.getMarket(marketId);
              
              // Skip inactive/resolved markets
              if (!market.active || market.resolved) return null;
              
              // Skip markets without valid question
              if (!market.question || market.question.trim() === '') return null;
              
              const marketIdStr = marketId.toString();
              const totalYesShares = parseFloat(ethers.utils.formatEther(market.totalYesShares));
              const totalNoShares = parseFloat(ethers.utils.formatEther(market.totalNoShares));
              
              return {
                id: marketIdStr,
                question: market.question,
                category: market.category || 'General',
                yesPrice: null,
                noPrice: null,
                totalYesShares,
                totalNoShares,
                volume: totalYesShares + totalNoShares,
                creator: market.creator,
                resolved: market.resolved,
                active: market.active,
                createdAt: market.createdAt ? new Date(market.createdAt.toNumber() * 1000) : new Date(),
                endTime: market.endTime ? new Date(market.endTime.toNumber() * 1000).toISOString() : null,
                resolutionTime: market.resolutionTime ? new Date(market.resolutionTime.toNumber() * 1000).toISOString() : null,
                imageUrl: persistedImages[marketIdStr] || (market.imageUrl ?? null),
                _priceLoading: true,
              };
            } catch (err) {
              console.error(`Error fetching market ${marketId}:`, err);
              return null;
            }
          })
        );
        
        // Filter valid results and add to collection
        const validResults = batchResults.filter(Boolean);
        allMarketsData.push(...validResults);
        
        // Batch state update (single re-render per batch)
        if (validResults.length > 0) {
          const currentData = [...allMarketsData];
          setMarkets(currentData);
          
          // Update trending
          const sortedForTrending = [...currentData].sort((a, b) => b.volume - a.volume);
          setTrendingMarkets(sortedForTrending.slice(0, 3));
        }
        
        // Yield to main thread between batches
        if (i + BATCH_SIZE < activeMarkets.length) {
          await yieldToMain();
        }
      }
      
      // Fetch all prices in parallel (non-blocking)
      const pricePromises = allMarketsData.map(async (market) => {
        try {
          const [yesPriceBps, noPriceBps] = await Promise.all([
            contractToUse.getCurrentPrice(market.id, true),
            contractToUse.getCurrentPrice(market.id, false)
          ]);
          return {
            id: market.id,
            yesPrice: Math.round(parseFloat(yesPriceBps.toString()) / 100),
            noPrice: Math.round(parseFloat(noPriceBps.toString()) / 100),
          };
        } catch {
          return { id: market.id, yesPrice: 50, noPrice: 50 };
        }
      });
      
      // Update prices as they resolve (batched)
      Promise.all(pricePromises).then((prices) => {
        const priceMap = Object.fromEntries(prices.map(p => [p.id, p]));
        
        setMarkets(prev => prev.map(m => ({
          ...m,
          yesPrice: priceMap[m.id]?.yesPrice ?? m.yesPrice ?? 50,
          noPrice: priceMap[m.id]?.noPrice ?? m.noPrice ?? 50,
          _priceLoading: false,
        })));
        
        setTrendingMarkets(prev => prev.map(m => ({
          ...m,
          yesPrice: priceMap[m.id]?.yesPrice ?? m.yesPrice ?? 50,
          noPrice: priceMap[m.id]?.noPrice ?? m.noPrice ?? 50,
          _priceLoading: false,
        })));
      });
      
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  }, [contracts, API_BASE]);

  // Initial fetch on mount
  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);
  
  // Subscribe to global market updates via WebSocket
  useEffect(() => {
    subscribeGlobal();
    
    // Listen for new market creation
    const unsubscribe = onMessage('market_created', (data) => {
      if (data.market) {
        // Refresh markets list when new market is created
        fetchMarkets();
      }
    });
    
    // Listen for market updates (resolution, etc.)
    const unsubscribeUpdate = onMessage('market_update', (data) => {
      if (data.market) {
        // Update specific market in list
        setMarkets(prev => {
          const index = prev.findIndex(m => 
            m.id === data.market.id || 
            m.marketId === data.market.id ||
            m.id === data.marketId
          );
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = { ...updated[index], ...data.market };
            return updated;
          }
          return prev;
        });
      }
    });
    
    return () => {
      unsubscribe();
      unsubscribeUpdate();
    };
  }, [subscribeGlobal, onMessage, fetchMarkets]);
  
  // Update markets when live markets data changes (from WebSocket/polling)
  useEffect(() => {
    if (liveMarkets && liveMarkets.length > 0) {
      // Filter out invalid markets first
      const validLiveMarkets = liveMarkets.filter(m => 
        m && m.id && m.question && m.question.trim() !== '' && m.active && !m.resolved
      );
      
      if (validLiveMarkets.length > 0) {
        // Merge with existing markets, prioritizing live data
        setMarkets(prev => {
          const merged = [...prev];
          validLiveMarkets.forEach(liveMarket => {
            const index = merged.findIndex(m => 
              m.id === liveMarket.id || 
              m.marketId === liveMarket.id ||
              m.id === liveMarket.marketId
            );
            if (index >= 0) {
              merged[index] = { ...merged[index], ...liveMarket };
            } else {
              merged.push(liveMarket);
            }
          });
          // Filter out any invalid markets that might have been added
          return merged.filter(m => 
            m && m.id && m.question && m.question.trim() !== '' && m.active && !m.resolved
          );
        });
      }
    }
  }, [liveMarkets]);

  const handleSearch = (e) => {
    e.preventDefault();
    // Search happens in real-time via filteredMarkets, no need to navigate
    // Focus stays on input for continued typing
  };

  const filteredMarkets = markets.filter(market => {
    // Filter out invalid/empty markets
    if (!market || !market.id || !market.question || market.question.trim() === '') {
      return false;
    }
    
    // Only show active, non-resolved markets
    if (market.resolved || !market.active) {
      return false;
    }
    
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
        <div className="mb-6 sm:mb-8 space-y-3">
          {/* Categories row - scrollable */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-all text-[12px] sm:text-[13px] flex-shrink-0 ${
                    selectedCategory === category
                      ? 'bg-[#111111] text-white'
                      : 'bg-[#1a1a1a] text-white/80 hover:bg-[#2a2a2a] hover:text-white'
                  }`}
                  style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          
          {/* Sort dropdown */}
          <div className="flex justify-end">
            <div className="relative">
              <label htmlFor="sort-markets" className="sr-only">Sort markets by</label>
              <select 
                id="sort-markets"
                name="sort-markets"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort markets"
                className="appearance-none px-4 py-2 bg-[#1a1a1a] text-white rounded-full hover:bg-[#2a2a2a] transition-all whitespace-nowrap cursor-pointer text-[12px] sm:text-[13px] font-medium pr-8"
                style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
              >
                <option value="newest">Sort: Newest</option>
                <option value="volume">Sort: Volume</option>
                <option value="popular">Sort: Popular</option>
              </select>
              <svg className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Markets Grid - Progressive loading: show cards as they arrive */}
        {loading && sortedMarkets.length === 0 ? (
          <MarketsGridSkeleton />
        ) : sortedMarkets.length === 0 && !loading ? (
          <div className="text-center py-20 px-4">
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <svg className="w-16 h-16 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-white text-xl font-semibold mb-2 font-space-grotesk">
                {searchQuery.trim() ? `No markets found` : 'No markets available'}
              </h3>
              <p className="text-gray-400 text-sm mb-6 font-space-grotesk">
                {searchQuery.trim() 
                  ? `No markets match "${searchQuery}". Try a different search term.`
                  : 'There are currently no active prediction markets. Be the first to create one!'}
              </p>
              {searchQuery.trim() ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all font-space-grotesk text-sm"
                >
                  Clear Search
                </button>
              ) : (
                <button
                  onClick={() => history.push('/create')}
                  className="px-6 py-2.5 bg-[#FFE600] hover:bg-[#FFE600]/80 text-black rounded-full transition-all font-space-grotesk font-semibold text-sm"
                >
                  Create Market
                </button>
              )}
            </div>
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

