import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import WormStyleNavbar from '../../components/modern/WormStyleNavbar';
import { showGlassToast, showTransactionToast } from '../../utils/toastUtils';

const AdminResolution = () => {
  const history = useHistory();
  const { isConnected, account, contracts, getMarketData, getActiveMarkets } = useWeb3();
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);

  // Resolve API base URL
  const resolveApiBase = () => {
    const envBase = import.meta.env.VITE_API_BASE_URL;
    
    // Ignore placeholder URLs
    if (envBase && (envBase.includes('your-backend-api.com') || envBase.includes('example.com') || envBase.includes('placeholder'))) {
      console.warn('Ignoring placeholder API URL:', envBase);
    } else if (envBase && !/localhost:8080|127\.0\.0\.1:8080/i.test(envBase)) {
      return envBase;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      if (!/localhost|127\.0\.0\.1/i.test(origin)) {
        return origin;
      }
      return 'https://polydegen.vercel.app';
    }
    
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    
    return '';
  };

  const loadMarkets = useCallback(async () => {
    if (!contracts?.predictionMarket) {
      setMarkets([]);
      return;
    }

    try {
      setLoading(true);
      const ids = await getActiveMarkets();
      if (!ids || ids.length === 0) {
        setMarkets([]);
        return;
      }

      console.log('📊 Loading markets for resolution, found', ids.length, 'active markets');

      const marketData = await Promise.all(
        ids.map(async (id) => {
          try {
            const data = await getMarketData(id);
            // Log markets that have reached resolution time
            if (data && data.resolutionTime) {
              const resolutionTimestamp = Number(data.resolutionTime) * 1000;
              const now = Date.now();
              const hasReachedResolution = !data.resolved && now >= resolutionTimestamp;
              if (hasReachedResolution) {
                console.log('✅ Market ready for resolution:', {
                  id: data.id,
                  question: data.question,
                  resolutionTime: new Date(resolutionTimestamp).toLocaleString(),
                  currentTime: new Date(now).toLocaleString()
                });
              }
            }
            return data;
          } catch (err) {
            console.error('Failed to fetch market data', err);
            return null;
          }
        })
      );

      const validMarkets = marketData.filter(Boolean);
      console.log('📊 Loaded', validMarkets.length, 'markets');
      setMarkets(validMarkets);
    } catch (err) {
      console.error('Failed to load active markets', err);
      showGlassToast({ title: 'Failed to load markets', icon: '❌' });
    } finally {
      setLoading(false);
    }
  }, [contracts?.predictionMarket, getActiveMarkets, getMarketData]);

  useEffect(() => {
    if (isConnected) {
      loadMarkets();
    } else {
      setMarkets([]);
    }
  }, [isConnected, loadMarkets]);

  const actionableMarkets = useMemo(
    () => {
      const now = Date.now();
      const filtered = markets.filter((market) => {
        if (!market || !market.resolutionTime) return false;
        const resolutionTimestamp = Number(market.resolutionTime) * 1000;
        const hasReachedResolution = !market.resolved && now >= resolutionTimestamp;
        return hasReachedResolution;
      });
      console.log('🎯 Actionable markets (ready for resolution):', filtered.length, 'out of', markets.length);
      return filtered;
    },
    [markets]
  );

  const resolvedMarkets = useMemo(
    () => markets.filter((market) => market?.resolved),
    [markets]
  );

  const handleResolve = async (marketId, outcome) => {
    if (!contracts?.predictionMarket) {
      showGlassToast({ title: 'Connect an admin wallet to resolve markets', icon: '⚠️' });
      return;
    }

    try {
      setResolvingId(marketId);
      showGlassToast({ title: 'Submitting resolution...', icon: '⏳' });
      
      // Get market data for notifications
      const market = await getMarketData(marketId);
      if (!market) {
        throw new Error('Market not found');
      }

      // Resolve market on-chain
      const tx = await contracts.predictionMarket.resolveMarket(marketId, outcome);
      showTransactionToast({ title: 'Resolution submitted', txHash: tx.hash });
      const receipt = await tx.wait();

      // Get all participants with positions in this market
      const apiBaseUrl = resolveApiBase();
      let participants = [];
      
      // First try database
      try {
        const participantsResponse = await fetch(`${apiBaseUrl}/api/markets/${marketId}/participants`);
        if (participantsResponse.ok) {
          const participantsData = await participantsResponse.json();
          if (participantsData.success && participantsData.participants?.length > 0) {
            participants = participantsData.participants || [];
            console.log('✅ Found participants from database:', participants.length);
          }
        }
      } catch (err) {
        console.error('Failed to fetch participants from database:', err);
      }

      // Fallback: Query positions directly from blockchain if database has no participants
      if (participants.length === 0 && contracts?.predictionMarket) {
        try {
          console.log('⚠️ No participants in database, querying blockchain events...');
          
          // Get provider from contract
          const provider = contracts.predictionMarket.provider || 
                          (contracts.predictionMarket.signer?.provider) ||
                          (typeof window !== 'undefined' && window.ethereum ? new (await import('ethers')).providers.Web3Provider(window.ethereum) : null);
          
          if (!provider) {
            console.warn('No provider available for blockchain queries');
          } else {
            // Get all SharePurchased and SharesSold events for this market
            const contract = contracts.predictionMarket;
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 50000); // Last ~50k blocks

            // Query all purchase events
            const purchaseFilter = contract.filters.SharesPurchased(marketId, null);
            const purchaseEvents = await contract.queryFilter(purchaseFilter, fromBlock);

            // Query all sell events
            const sellFilter = contract.filters.SharesSold(marketId, null);
            const sellEvents = await contract.queryFilter(sellFilter, fromBlock);

            // Collect all unique trader addresses
            const traderSet = new Set();
            const traderPositions = new Map(); // Map<address, {yesShares, noShares}>

            // Process purchase events
            for (const event of purchaseEvents) {
              const args = event.args;
              const trader = (args.buyer || args[1])?.toLowerCase();
              const isYes = args.isYes || args[2];
              const shares = args.shares || args[3];
              
              if (trader) {
                traderSet.add(trader);
                if (!traderPositions.has(trader)) {
                  traderPositions.set(trader, { yesShares: '0', noShares: '0' });
                }
                const pos = traderPositions.get(trader);
                if (isYes) {
                  pos.yesShares = (BigInt(pos.yesShares) + BigInt(shares.toString())).toString();
                } else {
                  pos.noShares = (BigInt(pos.noShares) + BigInt(shares.toString())).toString();
                }
              }
            }

            // Process sell events (subtract from positions)
            for (const event of sellEvents) {
              const args = event.args;
              const trader = (args.seller || args[1])?.toLowerCase();
              const isYes = args.isYes || args[2];
              const shares = args.shares || args[3];
              
              if (trader && traderPositions.has(trader)) {
                const pos = traderPositions.get(trader);
                if (isYes) {
                  const current = BigInt(pos.yesShares);
                  const sold = BigInt(shares.toString());
                  pos.yesShares = (current > sold ? current - sold : BigInt(0)).toString();
                } else {
                  const current = BigInt(pos.noShares);
                  const sold = BigInt(shares.toString());
                  pos.noShares = (current > sold ? current - sold : BigInt(0)).toString();
                }
              }
            }

            // Get current positions from contract for all traders (more accurate)
            const allTraders = Array.from(traderSet);
            console.log(`Found ${allTraders.length} unique traders from events, fetching current positions...`);
            
            for (const traderAddress of allTraders) {
              try {
                const position = await contracts.predictionMarket.getUserPosition(marketId, traderAddress);
                const yesShares = position.yesShares?.toString() || '0';
                const noShares = position.noShares?.toString() || '0';
                
                // Only include if they still have shares
                if (BigInt(yesShares) > 0n || BigInt(noShares) > 0n) {
                  participants.push({
                    userAddress: traderAddress.toLowerCase(),
                    yesShares: yesShares,
                    noShares: noShares
                  });
                }
              } catch (posErr) {
                console.warn(`Failed to get position for ${traderAddress}:`, posErr);
                // Fall back to event-based calculation
                const eventPos = traderPositions.get(traderAddress);
                if (eventPos && (BigInt(eventPos.yesShares) > 0n || BigInt(eventPos.noShares) > 0n)) {
                  participants.push({
                    userAddress: traderAddress.toLowerCase(),
                    yesShares: eventPos.yesShares,
                    noShares: eventPos.noShares
                  });
                }
              }
            }

            console.log(`✅ Found ${participants.length} participants from blockchain`);
          }
        } catch (blockchainErr) {
          console.error('Failed to fetch participants from blockchain:', blockchainErr);
          // Continue with empty participants array - notifications will just not be sent
        }
      }

      // Get market data to access totalPool for pari-mutuel calculations
      const marketData = await getMarketData(marketId);
      const totalPool = BigInt(marketData.totalPool || '0');
      const totalYesShares = BigInt(marketData.totalYesShares || '0');
      const totalNoShares = BigInt(marketData.totalNoShares || '0');

      // Create notifications for all participants
      const outcomeName = outcome === 1 ? 'YES' : outcome === 2 ? 'NO' : 'INVALID';
      let notificationsCreated = 0;

      console.log(`Creating notifications for ${participants.length} participants...`);
      console.log(`Market total pool: ${totalPool.toString()}, YES shares: ${totalYesShares.toString()}, NO shares: ${totalNoShares.toString()}`);

      for (const participant of participants) {
        const yesShares = BigInt(participant.yesShares || '0');
        const noShares = BigInt(participant.noShares || '0');
        const hasYesShares = yesShares > 0n;
        const hasNoShares = noShares > 0n;

        if (!hasYesShares && !hasNoShares) {
          console.log(`Skipping ${participant.userAddress} - no shares`);
          continue; // Skip if no shares
        }

        let won = false;
        let shares = '0';
        let amountWon = '0'; // Amount in wei (will be calculated from totalPool)
        
        if (outcome === 1 && hasYesShares) {
          // YES won and user has YES shares - calculate pari-mutuel payout
          won = true;
          shares = (yesShares / BigInt(1e18)).toString();
          
          // Pari-mutuel: payout = (totalPool * userShares) / totalWinningShares
          if (totalYesShares > 0n && totalPool > 0n) {
            amountWon = (totalPool * yesShares / totalYesShares).toString();
          }
          console.log(`✅ ${participant.userAddress} WON with ${shares} YES shares = ${(BigInt(amountWon) / BigInt(1e18)).toString()} ETH from pool`);
        } else if (outcome === 2 && hasNoShares) {
          // NO won and user has NO shares - calculate pari-mutuel payout
          won = true;
          shares = (noShares / BigInt(1e18)).toString();
          
          // Pari-mutuel: payout = (totalPool * userShares) / totalWinningShares
          if (totalNoShares > 0n && totalPool > 0n) {
            amountWon = (totalPool * noShares / totalNoShares).toString();
          }
          console.log(`✅ ${participant.userAddress} WON with ${shares} NO shares = ${(BigInt(amountWon) / BigInt(1e18)).toString()} ETH from pool`);
        } else if (outcome === 1 && hasNoShares) {
          // YES won but user has NO shares - lost
          won = false;
          shares = (noShares / BigInt(1e18)).toString();
          console.log(`❌ ${participant.userAddress} LOST with ${shares} NO shares`);
        } else if (outcome === 2 && hasYesShares) {
          // NO won but user has YES shares - lost
          won = false;
          shares = (yesShares / BigInt(1e18)).toString();
          console.log(`❌ ${participant.userAddress} LOST with ${shares} YES shares`);
        } else {
          // Shouldn't happen, but log it
          console.warn(`⚠️ Unexpected state for ${participant.userAddress}:`, { outcome, hasYesShares, hasNoShares });
          continue;
        }

        // Format amount with proper decimals (convert from wei to ETH)
        const amountWonETH = (BigInt(amountWon) / BigInt(1e18)).toString();
        const formattedAmount = parseFloat(amountWonETH).toFixed(6);
        const formattedShares = parseFloat(shares).toFixed(4);
        const formattedPool = (totalPool / BigInt(1e18)).toString();

        // Create notification
        try {
          const notificationData = {
            recipient: participant.userAddress.toLowerCase(),
            type: 'MARKET_RESOLVED',
            title: won ? `You Won! 🎉` : 'Market Resolved - You Lost',
            message: won
              ? `Market "${market.question}" resolved to ${outcomeName}. You won ${formattedAmount} ETH from the total pool of ${formattedPool} ETH (${formattedShares} shares). Claim your winnings now!`
              : `Market "${market.question}" resolved to ${outcomeName}. Your ${formattedShares} shares lost.`,
            marketId: marketId.toString()
          };

          console.log(`Creating notification for ${participant.userAddress}:`, notificationData);

          const notifResponse = await fetch(`${apiBaseUrl}/api/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notificationData)
          });

          if (!notifResponse.ok) {
            const errorText = await notifResponse.text();
            throw new Error(`HTTP ${notifResponse.status}: ${errorText}`);
          }

          const notifResult = await notifResponse.json();
          console.log(`✅ Notification created for ${participant.userAddress}:`, notifResult);
          notificationsCreated++;
        } catch (notifErr) {
          console.error(`❌ Failed to create notification for ${participant.userAddress}:`, notifErr);
        }
      }

      console.log(`✅ Created ${notificationsCreated} notifications for market ${marketId} (out of ${participants.length} participants)`);

      // Create activity event for market resolution
      try {
        await fetch(`${apiBaseUrl}/api/activity/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'MARKET_RESOLVED',
            marketId: marketId.toString(),
            outcome: outcome,
            resolver: account,
            txHash: receipt?.transactionHash || tx.hash || null,
            blockNumber: receipt?.blockNumber?.toString() || null,
            marketQuestion: market?.question || null,
          })
        });
        console.log('✅ Activity event created for market resolution');
      } catch (activityErr) {
        console.error('⚠️ Failed to create activity event for resolution:', activityErr);
      }

      showGlassToast({ 
        title: `Market resolved as ${outcomeName}. ${notificationsCreated} notifications sent.`, 
        icon: '✅' 
      });
      await loadMarkets();
    } catch (err) {
      console.error('Failed to resolve market', err);
      showGlassToast({ title: err?.message || 'Failed to resolve market', icon: '❌' });
    } finally {
      setResolvingId(null);
    }
  };

  if (!isConnected || !account) {
    return (
      <div className="min-h-screen bg-[#050505] text-white">
        <WormStyleNavbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          <div className="glass-card rounded-[24px] border border-white/10 bg-white/5 px-6 sm:px-8 py-12 text-center">
            <h1 className="text-2xl font-semibold text-white mb-4">Connect Wallet Required</h1>
            <p className="text-white/60 mb-6">Please connect your admin wallet to access the resolution dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <WormStyleNavbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 space-y-8">
        <div className="glass-card rounded-[24px] border border-white/10 bg-white/5 px-6 sm:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60 mb-2">Resolution Desk</p>
              <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-3">Announce Market Winners</h1>
              <p className="text-gray-300 max-w-2xl">
                Resolve completed markets by selecting the winning side. Winners split the total pool proportionally based on their shares. Losers forfeit their
                stake.
              </p>
            </div>
            <button
              onClick={() => history.push('/admin/pending')}
              className="px-5 py-2.5 rounded-full border border-white/10 bg-white/5 text-sm font-medium text-white hover:text-black hover:bg-white/90 transition-all"
            >
              Review Pending Submissions
            </button>
          </div>
        </div>

        <section className="glass-card rounded-[20px] border border-white/10 bg-white/5 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Markets Awaiting Resolution</h2>
            <span className="text-sm text-white/60">{actionableMarkets.length} ready</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-white/60">Loading markets...</div>
          ) : actionableMarkets.length === 0 ? (
            <div className="py-12 text-center text-white/60">No markets ready for resolution yet.</div>
          ) : (
            <div className="space-y-5">
              {actionableMarkets.map((market) => {
                const yesShares = Number(market.totalYesShares) / 1e18;
                const noShares = Number(market.totalNoShares) / 1e18;
                return (
                  <div
                    key={market.id}
                    className="rounded-[18px] border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-white/50">{market.category}</p>
                        <h3 className="text-2xl font-semibold">{market.question}</h3>
                        <p className="text-white/60 text-sm">
                          Resolution window began{' '}
                          {new Date(Number(market.resolutionTime) * 1000).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
                        <div className="rounded-[14px] border border-white/10 bg-white/5 px-4 py-2 text-center">
                          <p className="text-xs uppercase tracking-wide text-white/50">YES Pool</p>
                          <p className="text-xl font-semibold">{yesShares.toFixed(2)}</p>
                        </div>
                        <div className="rounded-[14px] border border-white/10 bg-white/5 px-4 py-2 text-center">
                          <p className="text-xs uppercase tracking-wide text-white/50">NO Pool</p>
                          <p className="text-xl font-semibold">{noShares.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleResolve(market.id, 1)}
                        disabled={resolvingId === market.id}
                        className="flex-1 px-5 py-3 rounded-[14px] bg-gradient-to-r from-green-400 to-green-500 text-black font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resolvingId === market.id ? 'Resolving...' : 'Declare YES Winner'}
                      </button>
                      <button
                        onClick={() => handleResolve(market.id, 2)}
                        disabled={resolvingId === market.id}
                        className="flex-1 px-5 py-3 rounded-[14px] border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resolvingId === market.id ? 'Resolving...' : 'Declare NO Winner'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-card rounded-[20px] border border-white/10 bg-white/3 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recently Resolved</h2>
            <span className="text-sm text-white/60">{resolvedMarkets.length} markets</span>
          </div>

          {resolvedMarkets.length === 0 ? (
            <div className="py-8 text-center text-white/50 text-sm">No resolved markets in this session.</div>
          ) : (
            <div className="space-y-4">
              {resolvedMarkets.map((market) => (
                <div key={market.id} className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-white/50">#{market.id}</p>
                      <p className="font-semibold">{market.question}</p>
                    </div>
                    <span
                      className={`px-4 py-1 rounded-full text-xs font-semibold ${
                        market.outcome === 1
                          ? 'bg-green-500/15 text-green-300'
                          : market.outcome === 2
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-yellow-500/15 text-yellow-300'
                      }`}
                    >
                      {market.outcome === 1 ? 'YES Won' : market.outcome === 2 ? 'NO Won' : 'Invalid'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminResolution;
