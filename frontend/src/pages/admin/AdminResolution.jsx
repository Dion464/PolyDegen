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
      showGlassToast({ title: 'Failed to load markets' });
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
      showGlassToast({ title: 'Connect an admin wallet to resolve markets' });
      return;
    }

    try {
      setResolvingId(marketId);
      showGlassToast({ title: 'Submitting resolution...' });
      
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

      // Get market data to access pools for pari-mutuel calculations
      const marketData = await getMarketData(marketId);
      const totalPool = BigInt(marketData.totalPool || '0');
      const yesPool = BigInt(marketData.yesPool || '0');
      const noPool = BigInt(marketData.noPool || '0');
      const totalYesShares = BigInt(marketData.totalYesShares || '0');
      const totalNoShares = BigInt(marketData.totalNoShares || '0');

      // Create notifications for all participants
      const outcomeName = outcome === 1 ? 'YES' : outcome === 2 ? 'NO' : 'INVALID';
      let notificationsCreated = 0;

      console.log(`Creating notifications for ${participants.length} participants...`);
      console.log(`Market pools - Total: ${totalPool.toString()}, YES: ${yesPool.toString()}, NO: ${noPool.toString()}`);
      console.log(`Market shares - YES: ${totalYesShares.toString()}, NO: ${totalNoShares.toString()}`);

      for (const participant of participants) {
        const yesShares = BigInt(participant.yesShares || '0');
        const noShares = BigInt(participant.noShares || '0');
        const hasYesShares = yesShares > 0n;
        const hasNoShares = noShares > 0n;

        if (!hasYesShares && !hasNoShares) {
          console.log(`Skipping ${participant.userAddress} - no shares`);
          continue; // Skip if no shares
        }

        // Get user's position to find their investment
        let userYesInvested = BigInt(0);
        let userNoInvested = BigInt(0);
        try {
          const position = await contracts.predictionMarket.getUserPosition(marketId, participant.userAddress);
          // getUserPosition returns (yesShares, noShares, totalInvested, yesInvested, noInvested)
          userYesInvested = BigInt(position.yesInvested?.toString() || '0');
          userNoInvested = BigInt(position.noInvested?.toString() || '0');
          console.log(`Position for ${participant.userAddress}: yesInvested=${userYesInvested}, noInvested=${userNoInvested}`);
        } catch (err) {
          console.warn(`Could not get position for ${participant.userAddress}, using participant data`);
          // Fallback: use participant data if available, otherwise use shares as rough estimate
          userYesInvested = BigInt(participant.yesInvested || '0');
          userNoInvested = BigInt(participant.noInvested || '0');
        }

        let won = false;
        let shares = '0';
        let grossPayout = '0'; // Investment + losing pool share (before fee)
        let netPayout = '0';   // After 2% platform fee
        
        if (outcome === 1 && hasYesShares) {
          // YES won - user gets share of NO pool only (pari-mutuel: winners only split losing pool)
          won = true;
          shares = (yesShares / BigInt(1e18)).toString();
          
          // Calculate: (NO pool * user YES shares / total YES shares) - winners only get losing pool
          let losingPoolShare = BigInt(0);
          if (totalYesShares > 0n && noPool > 0n) {
            losingPoolShare = (noPool * yesShares) / totalYesShares;
          }
          // Gross payout is ONLY the losing pool share (not investment + losing pool)
          grossPayout = losingPoolShare.toString();
          
          // Apply 2% platform fee
          const platformFee = (BigInt(grossPayout) * BigInt(200)) / BigInt(10000);
          netPayout = (BigInt(grossPayout) - platformFee).toString();
          
          console.log(`✅ ${participant.userAddress} WON with ${shares} YES shares = ${(BigInt(netPayout) / BigInt(1e18)).toString()} TCENT (gross: ${(BigInt(grossPayout) / BigInt(1e18)).toString()}, fee: ${(platformFee / BigInt(1e18)).toString()})`);
        } else if (outcome === 2 && hasNoShares) {
          // NO won - user gets share of YES pool only (pari-mutuel: winners only split losing pool)
          won = true;
          shares = (noShares / BigInt(1e18)).toString();
          
          // Calculate: (YES pool * user NO shares / total NO shares) - winners only get losing pool
          let losingPoolShare = BigInt(0);
          if (totalNoShares > 0n && yesPool > 0n) {
            losingPoolShare = (yesPool * noShares) / totalNoShares;
          }
          // Gross payout is ONLY the losing pool share (not investment + losing pool)
          grossPayout = losingPoolShare.toString();
          
          // Apply 2% platform fee
          const platformFee = (BigInt(grossPayout) * BigInt(200)) / BigInt(10000);
          netPayout = (BigInt(grossPayout) - platformFee).toString();
          
          console.log(`✅ ${participant.userAddress} WON with ${shares} NO shares = ${(BigInt(netPayout) / BigInt(1e18)).toString()} TCENT (gross: ${(BigInt(grossPayout) / BigInt(1e18)).toString()}, fee: ${(platformFee / BigInt(1e18)).toString()})`);
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

        // Format amount with proper decimals (convert from wei to TCENT)
        const netPayoutTCENT = (BigInt(netPayout) / BigInt(1e18)).toString();
        const formattedAmount = parseFloat(netPayoutTCENT).toFixed(6);
        const formattedShares = parseFloat(shares).toFixed(4);
        const formattedPool = (totalPool / BigInt(1e18)).toString();

        // Create notification
        try {
          const notificationData = {
            recipient: participant.userAddress.toLowerCase(),
            type: 'MARKET_RESOLVED',
            title: won ? `You Won! 🎉` : 'Market Resolved - You Lost',
            message: won
              ? `Market "${market.question}" resolved to ${outcomeName}. You won ${formattedAmount} TCENT (${formattedShares} shares, after 2% platform fee). Claim your winnings now!`
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

      // Batch payout all winners in one transaction
      const winners = participants.filter(p => {
        const yesShares = BigInt(p.yesShares || '0');
        const noShares = BigInt(p.noShares || '0');
        if (outcome === 1 && yesShares > 0n) return true;
        if (outcome === 2 && noShares > 0n) return true;
        if (outcome === 3 && (yesShares > 0n || noShares > 0n)) return true;
        return false;
      }).map(p => p.userAddress);

      if (winners.length > 0) {
        try {
          console.log(`💰 Batch paying ${winners.length} winners in one transaction...`);
          showGlassToast({ 
            title: `Paying ${winners.length} winners...`, 
            icon: '💰' 
          });
          
          // Process in batches of 200 (gas limit protection)
          const BATCH_SIZE = 200;
          let totalPaid = 0;
          let totalFees = 0;
          
          for (let i = 0; i < winners.length; i += BATCH_SIZE) {
            const batch = winners.slice(i, i + BATCH_SIZE);
            const batchTx = await contracts.predictionMarket.batchPayoutWinners(marketId, batch, {
              gasLimit: 5000000 // Higher gas limit for batch operations
            });
            
            showTransactionToast({ title: `Batch payout ${Math.floor(i/BATCH_SIZE) + 1}`, txHash: batchTx.hash });
            const batchReceipt = await batchTx.wait();
            
            // Parse events to get payout amounts (ethers v5 format)
            let batchTotalPaid = 0;
            let batchTotalFees = 0;
            
            // Try to find the event in the receipt
            if (batchReceipt.events) {
              const batchPayoutEvent = batchReceipt.events.find(e => 
                e.event === 'BatchPayoutCompleted' || 
                (e.eventSignature && e.eventSignature.includes('BatchPayoutCompleted'))
              );
              if (batchPayoutEvent && batchPayoutEvent.args) {
                batchTotalPaid = parseFloat(batchPayoutEvent.args.totalPaid?.toString() || '0') / 1e18;
                batchTotalFees = parseFloat(batchPayoutEvent.args.totalFees?.toString() || '0') / 1e18;
              }
            }
            
            // Alternative: parse from logs
            if (batchTotalPaid === 0 && batchReceipt.logs) {
              try {
                const iface = contracts.predictionMarket.interface;
                for (const log of batchReceipt.logs) {
                  try {
                    const parsed = iface.parseLog(log);
                    if (parsed.name === 'BatchPayoutCompleted') {
                      batchTotalPaid = parseFloat(parsed.args.totalPaid?.toString() || '0') / 1e18;
                      batchTotalFees = parseFloat(parsed.args.totalFees?.toString() || '0') / 1e18;
                      break;
                    }
                  } catch (e) {
                    // Not the event we're looking for
                  }
                }
              } catch (e) {
                console.warn('Could not parse batch payout event:', e);
              }
            }
            
            totalPaid += batchTotalPaid;
            totalFees += batchTotalFees;
            
            console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1} paid: ${batch.length} winners, ${batchTotalPaid.toFixed(6)} TCENT`);
          }
          
          console.log(`✅ All winners paid! Total: ${totalPaid.toFixed(6)} TCENT, Fees: ${totalFees.toFixed(6)} TCENT`);
          showGlassToast({ 
            title: `✅ All ${winners.length} winners paid in one transaction!`, 
            icon: '🎉' 
          });
        } catch (batchErr) {
          console.error('❌ Batch payout failed:', batchErr);
          showGlassToast({ 
            title: `Batch payout failed. Winners can claim individually.`, 
            icon: '⚠️' 
          });
          // Don't throw - allow individual claims to still work
        }
      }

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
      showGlassToast({ title: err?.message || 'Failed to resolve market' });
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
