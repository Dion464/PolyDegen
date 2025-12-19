import React, { useState, useEffect, memo } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { getCurrencySymbol } from '../../utils/currency';
import { ethers } from 'ethers';

// Skeleton loading components
const SkeletonBlock = memo(({ className = '', style = {} }) => (
  <div 
    className={`bg-white/10 animate-pulse rounded ${className}`}
    style={{ minHeight: '16px', ...style }}
  />
));

const UserProfileSkeleton = memo(() => (
  <div className="min-h-screen bg-[#0E0E0E]">
    <div className="max-w-7xl mx-auto px-4 py-8 pt-20">
      {/* Header skeleton */}
      <div className="bg-[#1a1a1a] rounded-2xl p-6 mb-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/10" />
          <div className="flex-1">
            <div className="h-6 bg-white/10 rounded w-48 mb-2" />
            <div className="h-4 bg-white/5 rounded w-32" />
          </div>
        </div>
      </div>
      
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#1a1a1a] rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-20 mb-2" />
            <div className="h-6 bg-white/10 rounded w-16" />
          </div>
        ))}
      </div>
      
      {/* Tabs skeleton */}
      <div className="flex gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-24 bg-white/10 rounded-full animate-pulse" />
        ))}
      </div>
      
      {/* Content skeleton */}
      <div className="bg-[#1a1a1a] rounded-2xl p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 animate-pulse">
            <div className="w-12 h-12 rounded-lg bg-white/10" />
            <div className="flex-1">
              <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
            <div className="h-6 w-20 bg-white/10 rounded" />
          </div>
        ))}
      </div>
    </div>
  </div>
));

const UserProfile = () => {
  const { address } = useParams();
  const history = useHistory();
  const { account, isConnected, contracts, provider, chainId } = useWeb3();
  const currencySymbol = getCurrencySymbol(chainId);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (address && contracts.predictionMarket && provider) {
      fetchProfileDataFromChain();
    } else if (address && !contracts.predictionMarket) {
      setError('Please connect your wallet to view profile data');
      setLoading(false);
    }
  }, [address, contracts.predictionMarket, provider]);

  const fetchProfileDataFromChain = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!contracts.predictionMarket || !provider) {
        throw new Error('Contracts not initialized');
      }

      const userAddress = ethers.utils.getAddress(address);
      const predictionMarket = contracts.predictionMarket;

      // Get all active markets
      console.log('📊 Fetching active markets...');
      const activeMarketIds = await predictionMarket.getActiveMarkets();
      console.log('Active markets:', activeMarketIds.length);

      // Get all markets user has interacted with by querying events
      // Query MarketCreated events to find all markets, then check positions
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000); // Last ~50k blocks
      
      const marketCreatedFilter = predictionMarket.filters.MarketCreated();
      const marketCreatedEvents = await predictionMarket.queryFilter(marketCreatedFilter, fromBlock);
      const allMarketIdsSet = new Set(activeMarketIds.map(id => id.toString()));
      
      // Add markets from events
      for (const event of marketCreatedEvents) {
        const marketId = event.args.marketId || event.args[0];
        allMarketIdsSet.add(marketId.toString());
      }

      const allMarketIds = Array.from(allMarketIdsSet).map(id => parseInt(id)).sort((a, b) => b - a); // Sort descending
      console.log('Total markets to check:', allMarketIds.length);

      // Fetch positions and trades for all markets
      const positions = [];
      const trades = [];
      let totalVolume = ethers.BigNumber.from(0);
      let totalInvested = ethers.BigNumber.from(0);
      let winCount = 0;
      let lossCount = 0;
      let totalWinnings = ethers.BigNumber.from(0);

      // Process markets in batches to avoid overwhelming the RPC
      const batchSize = 10;
      for (let i = 0; i < allMarketIds.length; i += batchSize) {
        const batch = allMarketIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (marketId) => {
            try {
              // Get user position
              const position = await predictionMarket.getUserPosition(marketId, userAddress);
              const yesShares = position.yesShares;
              const noShares = position.noShares;
              const invested = position.totalInvested;

              // Only process if user has a position
              if (yesShares.gt(0) || noShares.gt(0) || invested.gt(0)) {
                // Get market data
                const market = await predictionMarket.getMarket(marketId);
                
                // Get current prices
                let yesPriceBps = 5000; // Default 50%
                let noPriceBps = 5000;
                try {
                  yesPriceBps = await predictionMarket.getCurrentPrice(marketId, true);
                  noPriceBps = await predictionMarket.getCurrentPrice(marketId, false);
                } catch (err) {
                  console.log(`Could not get prices for market ${marketId}`);
                }

                // Calculate potential winnings
                let potentialWinnings = ethers.BigNumber.from(0);
                let isWinner = false;

                if (market.resolved && market.outcome !== 0) {
                  // Market resolved - calculate actual winnings using pari-mutuel model
                  const totalYesShares = market.totalYesShares;
                  const totalNoShares = market.totalNoShares;
                  // Use actual totalPool from contract (tracks invested ETH minus fees), fallback to sum if not available
                  const totalPool = market.totalPool && market.totalPool.gt(0) 
                    ? market.totalPool 
                    : totalYesShares.add(totalNoShares);

                  if (market.outcome === 1 && yesShares.gt(0)) {
                    // YES won
                    if (totalYesShares.gt(0)) {
                      potentialWinnings = yesShares.mul(totalPool).div(totalYesShares);
                      isWinner = true;
                      winCount++;
                    } else {
                      lossCount++;
                    }
                  } else if (market.outcome === 2 && noShares.gt(0)) {
                    // NO won
                    if (totalNoShares.gt(0)) {
                      potentialWinnings = noShares.mul(totalPool).div(totalNoShares);
                      isWinner = true;
                      winCount++;
                    } else {
                      lossCount++;
                    }
                  } else {
                    lossCount++;
                  }

                  if (isWinner) {
                    totalWinnings = totalWinnings.add(potentialWinnings);
                  }
                } else {
                  // Market not resolved - calculate potential value based on current prices
                  const yesValue = yesShares.mul(yesPriceBps).div(10000);
                  const noValue = noShares.mul(noPriceBps).div(10000);
                  potentialWinnings = yesValue.add(noValue);
                }

                totalInvested = totalInvested.add(invested);

                positions.push({
                  marketId: marketId.toString(),
                  market: {
                    marketId: marketId.toString(),
                    question: market.question,
                    description: market.description,
                    category: market.category,
                    resolved: market.resolved,
                    outcome: market.outcome,
                    endTime: market.endTime.toNumber(),
                    resolutionTime: market.resolutionTime.toNumber(),
                    totalYesShares: market.totalYesShares.toString(),
                    totalNoShares: market.totalNoShares.toString(),
                    yesPriceBps: yesPriceBps.toString(),
                    noPriceBps: noPriceBps.toString()
                  },
                  yesShares: ethers.utils.formatEther(yesShares),
                  noShares: ethers.utils.formatEther(noShares),
                  totalInvested: ethers.utils.formatEther(invested),
                  potentialWinnings: ethers.utils.formatEther(potentialWinnings),
                  isWinner
                });

                // Query trades from events (SharesPurchased and SharesSold)
                try {
                  // Get current block number
                  const currentBlock = await provider.getBlockNumber();
                  const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10k blocks
                  
                  // Query SharesPurchased events
                  const purchaseFilter = predictionMarket.filters.SharesPurchased(marketId, userAddress);
                  const purchaseEvents = await predictionMarket.queryFilter(purchaseFilter, fromBlock);
                  
                  for (const event of purchaseEvents) {
                    const args = event.args;
                    const tradeCost = args.cost || args[4]; // cost is the 5th arg
                    totalVolume = totalVolume.add(tradeCost);

                    const block = await provider.getBlock(event.blockNumber);
                    trades.push({
                      marketId: marketId.toString(),
                      market: {
                        marketId: marketId.toString(),
                        question: market.question,
                        category: market.category
                      },
                      isYes: args.isYes || args[2],
                      shares: ethers.utils.formatEther(args.shares || args[3]),
                      price: args.newPrice ? (args.newPrice.toNumber() / 100).toFixed(2) : '50.00',
                      cost: ethers.utils.formatEther(tradeCost),
                      blockTime: new Date(block.timestamp * 1000).toISOString(),
                      timestamp: block.timestamp
                    });
                  }

                  // Query SharesSold events
                  const sellFilter = predictionMarket.filters.SharesSold(marketId, userAddress);
                  const sellEvents = await predictionMarket.queryFilter(sellFilter, fromBlock);
                  
                  for (const event of sellEvents) {
                    const args = event.args;
                    const payout = args.payout || args[4]; // payout is the 5th arg
                    totalVolume = totalVolume.add(payout);

                    const block = await provider.getBlock(event.blockNumber);
                    trades.push({
                      marketId: marketId.toString(),
                      market: {
                        marketId: marketId.toString(),
                        question: market.question,
                        category: market.category
                      },
                      isYes: args.isYes || args[2],
                      shares: ethers.utils.formatEther(args.shares || args[3]),
                      price: args.newPrice ? (args.newPrice.toNumber() / 100).toFixed(2) : '50.00',
                      cost: ethers.utils.formatEther(payout),
                      blockTime: new Date(block.timestamp * 1000).toISOString(),
                      timestamp: block.timestamp,
                      isSell: true
                    });
                  }
                } catch (err) {
                  console.log(`Could not get trades for market ${marketId}:`, err.message);
                }
              }
            } catch (err) {
              console.log(`Error processing market ${marketId}:`, err.message);
            }
          })
        );
      }

      // Sort trades by timestamp (newest first)
      trades.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return b.timestamp - a.timestamp;
        }
        return new Date(b.blockTime) - new Date(a.blockTime);
      });

      // Calculate win rate
      const totalResolved = winCount + lossCount;
      const winRate = totalResolved > 0 ? (winCount / totalResolved) * 100 : 0;

      // Count active positions
      const activePositions = positions.filter(p => {
        const yesShares = parseFloat(p.yesShares);
        const noShares = parseFloat(p.noShares);
        return yesShares > 0 || noShares > 0;
      }).length;

      setProfileData({
        address: userAddress,
        stats: {
          totalVolume: ethers.utils.formatEther(totalVolume),
          totalInvested: ethers.utils.formatEther(totalInvested),
          totalTrades: trades.length,
          winCount,
          lossCount,
          winRate: winRate.toFixed(2),
          totalWinnings: ethers.utils.formatEther(totalWinnings),
          activePositions,
          totalMarkets: positions.length
        },
        trades: trades.slice(0, 100), // Limit to 100 most recent
        positions
      });

      console.log('✅ Profile data loaded:', {
        trades: trades.length,
        positions: positions.length,
        totalVolume: ethers.utils.formatEther(totalVolume)
      });
    } catch (err) {
      console.error('Error fetching profile from chain:', err);
      setError(err.message || 'Failed to fetch profile data from blockchain');
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatETH = (value) => {
    const num = parseFloat(value);
    if (num === 0) return '0.00';
    if (num < 0.01) return '<0.01';
    return num.toFixed(4);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getOutcomeLabel = (outcome) => {
    switch (outcome) {
      case 1: return 'YES';
      case 2: return 'NO';
      case 3: return 'INVALID';
      default: return 'PENDING';
    }
  };

  const getOutcomeColor = (outcome) => {
    switch (outcome) {
      case 1: return 'text-green-600 bg-green-50';
      case 2: return 'text-red-600 bg-red-50';
      case 3: return 'text-gray-600 bg-gray-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  // Generate image URL based on category and market ID (Polymarket-style)
  const getMarketImage = (market) => {
    const marketId = market.marketId || '0';
    
    // First, check if there's a stored image URL in localStorage
    try {
      const marketImages = JSON.parse(localStorage.getItem('marketImages') || '{}');
      if (marketImages[marketId]) {
        return marketImages[marketId];
      }
    } catch (err) {
      console.log('Error reading market images from localStorage');
    }
    
    // If market has an imageUrl prop, use it
    if (market.imageUrl) {
      return market.imageUrl;
    }
    
    // Otherwise, generate a placeholder based on category
    const category = market.category || 'General';
    
    // Use Unsplash API for category-based images
    const categoryKeywords = {
      'Technology': 'technology,computer,digital',
      'Sports': 'sports,athlete,competition',
      'Politics': 'politics,government,democracy',
      'Entertainment': 'entertainment,showbiz,celebrity',
      'Economics': 'economics,money,finance',
      'Science': 'science,research,laboratory',
      'General': 'abstract,pattern,design'
    };
    
    const keywords = categoryKeywords[category] || categoryKeywords['General'];
    // Use a deterministic seed based on market ID for consistent images
    const seed = parseInt(marketId) % 1000;
    
    return `https://source.unsplash.com/400x200/?${keywords}&sig=${seed}`;
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Technology': 'bg-blue-500',
      'Sports': 'bg-green-500', 
      'Politics': 'bg-red-500',
      'Entertainment': 'bg-purple-500',
      'Economics': 'bg-yellow-500',
      'Science': 'bg-indigo-500'
    };
    return colors[category] || 'bg-gray-500';
  };

  if (loading) {
    return <UserProfileSkeleton />;
  }

  if (error || !profileData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Profile</h3>
          <p className="text-gray-600 mb-4">{error || 'Profile not found'}</p>
          {!isConnected && (
            <p className="text-sm text-gray-500 mb-4">Please connect your wallet to view profile data</p>
          )}
          <button
            onClick={() => history.push('/markets')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Markets
          </button>
        </div>
      </div>
    );
  }

  const { stats, trades, positions } = profileData;
  const isOwnProfile = isConnected && account?.toLowerCase() === address?.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                {address?.slice(2, 4).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isOwnProfile ? 'Your Profile' : 'Trader Profile'}
          </h1>
                <p className="text-gray-600 font-mono text-sm mt-1">
                  {address}
                </p>
                <div className="flex items-center space-x-4 mt-2">
                  <span className="text-sm text-gray-500">
                    {stats.totalTrades} trades
                  </span>
                  <span className="text-sm text-gray-500">
                    {stats.activePositions} active positions
                  </span>
                </div>
              </div>
            </div>
            {isOwnProfile && (
              <button
                onClick={() => history.push('/markets')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Trade Now
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Total Volume</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatETH(stats.totalVolume)} {currencySymbol}
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Total Invested</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatETH(stats.totalInvested)} {currencySymbol}
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Win Rate</div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.winRate}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.winCount}W / {stats.lossCount}L
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Total Winnings</div>
            <div className="text-2xl font-bold text-green-600">
              {formatETH(stats.totalWinnings)} ETH
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('trades')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'trades'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Trades ({trades.length})
              </button>
              <button
                onClick={() => setActiveTab('positions')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'positions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Positions ({positions.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Trading Statistics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Total Markets</div>
                      <div className="text-xl font-bold text-gray-900">{stats.totalMarkets}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Active Positions</div>
                      <div className="text-xl font-bold text-gray-900">{stats.activePositions}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Wins</div>
                      <div className="text-xl font-bold text-green-600">{stats.winCount}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Losses</div>
                      <div className="text-xl font-bold text-red-600">{stats.lossCount}</div>
                    </div>
                  </div>
                </div>

                {positions.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Positions</h3>
                    <div className="space-y-2">
                      {positions.slice(0, 5).map((position, idx) => (
                        <div
                          key={idx}
                          onClick={() => history.push(`/markets/${position.market.marketId}`)}
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border border-gray-200"
                        >
                          {/* Market Image */}
                          <div className="relative w-24 h-24 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg overflow-hidden">
                            <img
                              src={getMarketImage(position.market)}
                              alt={position.market.question || 'Market'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.className = 'relative w-24 h-24 flex-shrink-0 bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 rounded-lg';
                              }}
                            />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {position.market.question}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {parseFloat(position.yesShares) > 0 && (
                                <span className="mr-4">YES: {formatETH(position.yesShares)}</span>
                              )}
                              {parseFloat(position.noShares) > 0 && (
                                <span>NO: {formatETH(position.noShares)}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-600">Potential Value</div>
                            <div className="font-semibold text-gray-900">
                              {formatETH(position.potentialWinnings)} ETH
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'trades' && (
              <div className="space-y-4">
                {trades.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-gray-600">No trades yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Market
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Side
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Shares
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Cost
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {trades.map((trade, idx) => (
                          <tr
                            key={idx}
                            onClick={() => trade.market && history.push(`/markets/${trade.market.marketId}`)}
                            className="hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {trade.market?.question || `Market ${trade.marketId}`}
                              </div>
                              {trade.market?.category && (
                                <div className="text-xs text-gray-500">{trade.market.category}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                trade.isYes 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {trade.isYes ? 'YES' : 'NO'}
                              </span>
                              {trade.isSell && (
                                <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                                  SELL
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatETH(trade.shares)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {trade.price}¢
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatETH(trade.cost)} ETH
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(trade.blockTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'positions' && (
              <div className="space-y-4">
                {positions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-gray-600">No positions yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {positions.map((position, idx) => (
                      <div
                        key={idx}
                        onClick={() => history.push(`/markets/${position.market.marketId}`)}
                        className="bg-white rounded-lg hover:shadow-md cursor-pointer transition-all border border-gray-200 overflow-hidden"
                      >
                        {/* Market Image */}
                        <div className="relative w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                          <img
                            src={getMarketImage(position.market)}
                            alt={position.market.question || 'Market'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentElement.className = 'relative w-full h-32 bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100';
                            }}
                          />
                          <div className="absolute top-2 left-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium text-white shadow-sm ${getCategoryColor(position.market.category)}`}>
                              {position.market.category || 'General'}
                            </span>
                          </div>
                          {position.market.resolved && (
                            <div className="absolute top-2 right-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getOutcomeColor(position.market.outcome)}`}>
                                {getOutcomeLabel(position.market.outcome)}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="p-6">
                          <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                            {position.market.question}
                          </h4>
                          
                          <div className="space-y-2 mb-4">
                            {parseFloat(position.yesShares) > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">YES Shares:</span>
                                <span className="font-medium text-green-600">{formatETH(position.yesShares)}</span>
                              </div>
                            )}
                            {parseFloat(position.noShares) > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">NO Shares:</span>
                                <span className="font-medium text-red-600">{formatETH(position.noShares)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Invested:</span>
                              <span className="font-medium text-gray-900">{formatETH(position.totalInvested)} ETH</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Potential Value:</span>
                              <span className="font-semibold text-blue-600">{formatETH(position.potentialWinnings)} ETH</span>
                            </div>
                          </div>

                          {position.market.resolved && parseFloat(position.potentialWinnings) > parseFloat(position.totalInvested) && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <div className="text-sm text-green-600 font-medium">
                                🎉 Profit: {formatETH((parseFloat(position.potentialWinnings) - parseFloat(position.totalInvested)).toFixed(6))} ETH
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
