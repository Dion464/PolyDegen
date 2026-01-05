import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { showGlassToast } from '../../utils/toastUtils';
import HowItWorksModal from '../modal/HowItWorksModal';

const WormStyleNavbar = () => {
  const history = useHistory();
  const {
    account,
    isConnected,
    connectWallet,
    disconnectWallet,
    isConnecting,
    getUserMarkets,
    getMarketData,
    getUserPosition,
    claimWinnings,
    ethBalance
  } = useWeb3();

  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [claimedMarkets, setClaimedMarkets] = useState(new Set());
  const [claimingMarket, setClaimingMarket] = useState(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreateClick = () => {
    history.push('/create');
  };

  const handleConnectClick = () => {
    if (isConnected && account) {
      setWalletDropdownOpen(!walletDropdownOpen);
      setNotificationsOpen(false); // Close notifications when opening wallet dropdown
    } else {
      connectWallet();
    }
  };

  const handleDisconnect = () => {
    setWalletDropdownOpen(false);
    disconnectWallet();
  };

  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExplorer = () => {
    if (account) {
      window.open(`https://testnet.incentiv.io/address/${account}`, '_blank');
    }
  };

  // Format balance for display
  const formattedBalance = useMemo(() => {
    const bal = parseFloat(ethBalance || '0');
    if (bal >= 1000000) return `${(bal / 1000000).toFixed(1)}M`;
    if (bal >= 1000) return `${(bal / 1000).toFixed(1)}K`;
    return bal.toFixed(bal < 10 ? 3 : 0);
  }, [ethBalance]);


  const buildNotification = (market, position) => {
    if (!market || !position) return null;
    const yesShares = parseFloat(position.yesShares || '0');
    const noShares = parseFloat(position.noShares || '0');
    const holdsShares = yesShares > 0 || noShares > 0;
    if (!holdsShares) return null;

    const endTimeMs = Number(market.endTime) * 1000;
    const resolved = Boolean(market.resolved);
    const outcome = Number(market.outcome || 0);
    const now = Date.now();

    if (!resolved) {
      if (now >= endTimeMs) {
        return {
          marketId: Number(market.id),
          question: market.question,
          status: 'pending_resolution',
          message: 'Market ended. Awaiting winner announcement.',
          claimable: false,
          shares: yesShares + noShares,
          updatedAt: endTimeMs
        };
      }
      return null;
    }

    if (outcome === 3) {
      return {
        marketId: Number(market.id),
        question: market.question,
        status: 'invalid',
        message: 'Market marked invalid. Claim refund if available.',
        claimable: yesShares + noShares > 0,
        shares: yesShares + noShares,
        updatedAt: Date.now()
      };
    }

    const userWinningShares = outcome === 1 ? yesShares : noShares;
    const lostShares = outcome === 1 ? noShares : yesShares;

    if (userWinningShares > 0) {
      return {
        marketId: Number(market.id),
        question: market.question,
        status: 'won',
        message: `You won! ${userWinningShares.toFixed(2)} TCENT ready to claim.`,
        claimable: true,
        shares: userWinningShares,
        updatedAt: Date.now()
      };
    }

    if (lostShares > 0) {
      return {
        marketId: Number(market.id),
        question: market.question,
        status: 'lost',
        message: 'Market resolved against you. Shares were forfeited.',
        claimable: false,
        shares: lostShares,
        updatedAt: Date.now()
      };
    }

    return null;
  };

  // Resolve API base URL (use deployed Vercel API for local dev)
  const resolveApiBase = useCallback(() => {
    const envBase = import.meta.env.VITE_API_BASE_URL;
    
    // Ignore placeholder URLs
    if (envBase && (envBase.includes('your-backend-api.com') || envBase.includes('example.com') || envBase.includes('placeholder'))) {
      console.warn('Ignoring placeholder API URL:', envBase);
    } else if (envBase && !/localhost:8080|127\.0\.0\.1:8080/i.test(envBase)) {
      // Valid non-local API URL
      return envBase;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      // In production (Vercel), use same origin (Vercel will serve /api)
      if (!/localhost|127\.0\.0\.1/i.test(origin)) {
        return origin;
      }
      // In local dev, use the deployed Vercel API
      return 'https://polydegen.vercel.app';
    }
    
    // Fallback to current origin if available
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    
    return '';
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!isConnected || !account) {
      setNotifications([]);
      return;
    }

    try {
      setLoadingNotifications(true);
      const allNotifications = [];

      // Load database notifications (approval/rejection)
      try {
        const apiBaseUrl = resolveApiBase();
        const dbResponse = await fetch(`${apiBaseUrl}/api/notifications?recipient=${account.toLowerCase()}`);
        if (dbResponse.ok) {
          const dbData = await dbResponse.json();
          if (dbData.success && dbData.notifications) {
            // Build claimed markets set from database
            const claimedFromDb = new Set();
            dbData.notifications.forEach(n => {
              if (n.claimed && n.marketId) {
                claimedFromDb.add(Number(n.marketId));
              }
            });
            setClaimedMarkets(prev => new Set([...prev, ...claimedFromDb]));

            const dbNotifs = dbData.notifications
              .filter(n => !n.read)
              .map((n) => {
                let shares = 0;
                let payoutAmount = 0; // Actual payout amount in TCENT
                
                // Extract shares and payout amount from message for MARKET_RESOLVED notifications
                if (n.type === 'MARKET_RESOLVED' && n.message) {
                  // Try to extract from new format: "You won X.XXXX TCENT from the total pool... (Y.YYYY shares)"
                  const newFormatMatch = n.message.match(/You won ([\d.]+) TCENT.*?\(([\d.]+) shares\)/);
                  if (newFormatMatch) {
                    payoutAmount = parseFloat(newFormatMatch[1]) || 0; // Extract payout amount (first match)
                    shares = parseFloat(newFormatMatch[2]) || 0; // Extract shares from parentheses (second match)
                  } else {
                    // Fallback: try old format "You won X.XXXX TCENT"
                    const amountMatch = n.message.match(/You won ([\d.]+) TCENT/);
                    if (amountMatch) {
                      payoutAmount = parseFloat(amountMatch[1]) || 0;
                      shares = payoutAmount; // In old format, amount = shares
                    } else {
                      // Fallback: try to extract from "(X.XXXX shares × 1 TCENT per share)" format (old format)
                      const sharesMatch = n.message.match(/\(([\d.]+) shares/);
                      if (sharesMatch) {
                        shares = parseFloat(sharesMatch[1]) || 0;
                        payoutAmount = shares; // Old format: 1 TCENT per share
                      } else {
                        // Last fallback: try "have X winning shares" format
                        const fallbackMatch = n.message.match(/have ([\d.]+) winning shares/);
                        if (fallbackMatch) {
                          shares = parseFloat(fallbackMatch[1]) || 0;
                          payoutAmount = shares; // Assume 1 TCENT per share for old format
                        }
                      }
                    }
                  }
                }
                
                return {
                  id: n.id,
                  type: 'db',
                  title: n.title,
                  message: n.message,
                  question: n.message.split('"')[1] || n.title,
                  status: n.type === 'MARKET_RESOLVED' ? (n.message.includes('won') ? 'won' : 'lost') : n.type === 'MARKET_APPROVED' ? 'approved' : n.type === 'MARKET_REJECTED' ? 'rejected' : 'info',
                  claimable: n.type === 'MARKET_RESOLVED' && n.message.includes('won') && !n.claimed,
                  claimed: n.claimed || false,
                  shares: shares,
                  payoutAmount: payoutAmount, // Store actual payout amount
                  marketId: n.marketId ? Number(n.marketId) : null,
                  pendingMarketId: n.pendingMarketId ? Number(n.pendingMarketId) : null,
                  updatedAt: new Date(n.createdAt).getTime()
                };
              });
            allNotifications.push(...dbNotifs);
          }
        }
      } catch (dbErr) {
        console.error('Failed to load database notifications:', dbErr);
      }

      // Load chain-based notifications (market resolution)
      if (getUserMarkets) {
        try {
          const marketIds = await getUserMarkets();
          if (marketIds && marketIds.length > 0) {
            const chainEntries = await Promise.all(
              marketIds.map(async (id) => {
                try {
                  const market = await getMarketData(id);
                  if (!market) return null;
                  const position = await getUserPosition(id);
                  return buildNotification(market, position);
                } catch (err) {
                  console.error('Failed to build notification', err);
                  return null;
                }
              })
            );
            const chainNotifs = chainEntries.filter(Boolean);
            allNotifications.push(...chainNotifs);
          }
        } catch (chainErr) {
          console.error('Failed to load chain notifications:', chainErr);
        }
      }

      // Sort by most recent
      const formatted = allNotifications.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setNotifications(formatted);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isConnected, account, getUserMarkets, getMarketData, getUserPosition, resolveApiBase]);

  useEffect(() => {
    if (!isConnected) {
      setNotifications([]);
      return;
    }

    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [isConnected, account, loadNotifications]);

  // Close notifications/menu/wallet dropdown on escape key and prevent body scroll on mobile
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (notificationsOpen) setNotificationsOpen(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
        if (walletDropdownOpen) setWalletDropdownOpen(false);
      }
    };

    const isOpen = notificationsOpen || mobileMenuOpen || walletDropdownOpen;
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when menu/notifications are open (mainly for mobile)
      const isMobile = window.innerWidth < 768; // md breakpoint
      if (isMobile) {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
          document.removeEventListener('keydown', handleEscape);
          document.body.style.overflow = originalOverflow;
        };
      }
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [notificationsOpen, mobileMenuOpen, walletDropdownOpen]);

  // Count only unclaimed notifications for the badge
  const notificationCount = notifications.filter(n => {
    // If it's a claimable notification and already claimed, don't count it
    if (n.claimable && n.marketId && (claimedMarkets.has(n.marketId) || n.claimed)) {
      return false;
    }
    return true;
  }).length;

  const statusStyles = useMemo(() => ({
    won: 'text-green-300',
    lost: 'text-red-300',
    pending_resolution: 'text-yellow-300',
    invalid: 'text-white',
    approved: 'text-green-300',
    rejected: 'text-red-300',
    info: 'text-white/70',
    
  }), []);

  const markAsRead = useCallback(async (notificationId) => {
    if (!isConnected || !account || !notificationId) return;
    
    try {
      const apiBaseUrl = resolveApiBase();
      await fetch(`${apiBaseUrl}/api/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: account.toLowerCase(),
          notificationIds: [notificationId.toString()]
        })
      });
      // Reload notifications to update UI
      loadNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, [isConnected, account, resolveApiBase, loadNotifications]);

  const handleClaim = async (marketId) => {
    if (claimingMarket === marketId) return; // Prevent double-click
    
    try {
      setClaimingMarket(marketId);
      await claimWinnings(marketId);
      
      // Mark this market as claimed locally
      setClaimedMarkets(prev => new Set([...prev, marketId]));
      
      // Save claimed state to database
      try {
        const apiBaseUrl = resolveApiBase();
        await fetch(`${apiBaseUrl}/api/notifications`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: account.toLowerCase(),
            markClaimed: true,
            marketId: marketId
          })
        });
      } catch (dbErr) {
        console.error('Failed to save claimed state to database:', dbErr);
      }
      
      showGlassToast({ title: 'Winnings claimed successfully!' });
      loadNotifications();
    } catch (err) {
      console.error('Failed to claim winnings', err);
      showGlassToast({ title: err?.message || 'Failed to claim winnings' });
    } finally {
      setClaimingMarket(null);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050505] border-b border-[#1E1E1E] backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="py-2 sm:py-3 min-h-[56px] sm:min-h-[64px] flex items-center gap-2 sm:gap-4">
          {/* Left: logo + primary nav */}
          <div className="flex items-center gap-3 sm:gap-6 flex-shrink-0">
            <button
              onClick={() => history.push('/')}
              className="flex items-center gap-2 hover:opacity-90 transition-opacity"
              aria-label="Go to homepage"
            >
              <img 
                src="/logopd.svg" 
                alt="PolyDegen Logo" 
                width={26} 
                height={34}
                className="flex-shrink-0"
              />
              <span className=" font-medium text-[24.5px]" style={{ fontFamily: '"Clash Grotesk", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                PolyDegen
              </span>
            </button>

            <div
              className="hidden md:flex items-center gap-5 text-sm"
              style={{ fontFamily: '"Clash Grotesk", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              <button
                className="text-[#FFFFFF] hover:text-[#FFE600] font-medium mt-1 ml-8"
                onClick={() => history.push('/activity')}
              >
                Activity
              </button>
            </div>
          </div>

          {/* Center: search */}
          <div className="flex-1 hidden md:flex rounded-xl justify-center ml-8">
            <div className="w-[500px] h-[40px] max-w-3xl">
              <div
                className="glass-card background box-shadow relative flex items-center gap-3 px-4 py-2.5"
                style={{
                  borderRadius: '14px',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  backgroundColor: 'rgba(58, 58, 58, 0.2)',
                }}
              >
                <svg
                  className="w-4 h-4 text-white/60 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-4.35-4.35m0 0A7 7 0 1010.65 5.65a7 7 0 005.99 11.0z" />
                </svg>
                <input
                  type="search"
                  placeholder="Search polydegen"
                  className="w-full bg-transparent outline-none text-xs sm:text-sm text-white placeholder:text-white"
                  style={{
                    fontFamily: '"Clash Grotesk", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0 ml-auto">
            {/* Info icon - clickable on mobile to open How It Works */}
            <button
              onClick={() => setHowItWorksOpen(true)}
              className="p-1.5 sm:p-0"
              aria-label="Learn how it works"
            >
              <img src="/iicon.svg" alt="" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              onClick={() => setHowItWorksOpen(true)}
              className="hidden lg:inline-block text-[14px] font-medium text-[#FFE600] hover:text-[#FFE600] transition-colors"
            >
              How it works
            </button>

            <button
              onClick={handleCreateClick}
              disabled={isConnecting}
              className="hidden sm:inline-block px-4 py-2 text-[14px] font-medium text-[#FFE600]"
            >
              Create
            </button>

            {/* Notifications icon, compact */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setWalletDropdownOpen(false); // Close wallet dropdown when opening notifications
                }}
                className="p-1.5 sm:px-2.5 sm:py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center relative"
              >
                <span className="sr-only">Notifications</span>
                <svg 
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2C9.79086 2 8 3.79086 8 6V6.34195C5.67392 7.16559 4 9.39023 4 12V17L2 19V20H22V19L20 17V12C20 9.39023 18.3261 7.16559 16 6.34195V6C16 3.79086 14.2091 2 12 2Z"
                    stroke="#FFE600"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#FFE600] text-black text-[8px] sm:text-[9px] font-bold rounded-full w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <>
                  {/* Backdrop for mobile */}
                  <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 sm:hidden"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  {/* Notification dropdown */}
                  <div className="fixed sm:absolute right-0 left-0 sm:left-auto top-[64px] sm:top-auto sm:mt-3 sm:w-80 w-full sm:max-w-[90vw] rounded-t-[20px] sm:rounded-[16px] border border-white/20 bg-[#0a0a0a] backdrop-blur-xl shadow-2xl z-50 p-4 sm:p-4 space-y-3 max-h-[calc(100vh-88px)] sm:max-h-[80vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 10, 10, 0.98)' }}>
                    <div className="flex items-center justify-between mb-2 sm:mb-0">
                      <p className="text-base sm:text-sm font-semibold text-white">Notifications</p>
                      <div className="flex items-center gap-3">
                        {loadingNotifications && <span className="text-xs text-white/50">Refreshing...</span>}
                        <button
                          onClick={() => setNotificationsOpen(false)}
                          className="sm:hidden text-white/70 hover:text-white p-1 -mr-2"
                          aria-label="Close notifications"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-sm sm:text-xs text-white/70 py-6 sm:py-4 text-center">No updates yet.</p>
                    ) : (
                      <div className="space-y-2.5 sm:space-y-3">
                        {notifications.map((notif) => (
                          <div key={notif.id || `${notif.marketId}-${notif.status}`} className="rounded-[14px] sm:rounded-[12px] border border-white/20 bg-[#1a1a1a]/80 backdrop-blur-sm px-4 sm:px-4 py-3.5 sm:py-3 space-y-2.5 sm:space-y-2 active:bg-[#252525] transition-colors" style={{ backgroundColor: 'rgba(26, 26, 26, 0.9)' }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-base sm:text-sm font-semibold text-white leading-tight break-words">
                                  {notif.title || notif.question}
                                </p>
                                <p className={`text-sm sm:text-xs mt-1.5 sm:mt-1 leading-relaxed break-words ${statusStyles[notif.status] || 'text-white/80'}`}>
                                  {notif.message}
                                </p>
                              </div>
                              {notif.type === 'db' && notif.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notif.id);
                                  }}
                                  className="flex-shrink-0 text-white/50 hover:text-white/80 active:text-white text-lg sm:text-base p-1.5 sm:p-1 -mt-1 -mr-1 touch-manipulation"
                                  title="Mark as read"
                                  aria-label="Mark as read"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            {notif.claimable && notif.marketId && (
                              claimedMarkets.has(notif.marketId) || notif.claimed ? (
                                <div className="w-full text-sm sm:text-xs font-semibold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-full py-2.5 sm:py-2 text-center">
                                  ✓ Claimed
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClaim(notif.marketId);
                                  }}
                                  disabled={claimingMarket === notif.marketId}
                                  className="w-full text-sm sm:text-xs font-semibold text-black bg-[#FFE600] hover:bg-[#FFD700] active:bg-[#FFC700] rounded-full py-2.5 sm:py-2 touch-manipulation transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {claimingMarket === notif.marketId ? 'Claiming...' : `Claim ${((notif.payoutAmount || notif.shares || 0) > 0 ? (notif.payoutAmount || notif.shares).toFixed(2) : '0.00')} TCENT`}
                                </button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Connect/Wallet button */}
            <div className="relative">
              {isConnected && account ? (
                /* Connected state - show balance and profile with yellow gradient */
                <button
                  onClick={handleConnectClick}
                  className="flex items-center gap-0 rounded-full transition-all overflow-hidden"
                  style={{ 
                    fontFamily: '"Clash Grotesk", system-ui, sans-serif',
                    background: 'linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 50%, rgba(255, 230, 0, 0.15) 100%)',
                    border: '1px solid #2A2A2A'
                  }}
                >
                  {/* Balance display */}
                  <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5">
                    <span className="text-white font-medium text-[14px] sm:text-[12px]">
                      {formattedBalance}
                    </span>
                    <span className="text-white/80 text-[11px] sm:text-[12px]">TCENT</span>
                    <img 
                      src="/incentivelogocircle.png" 
                      alt="CENT" 
                      className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
                    />
                  </div>
                  
                  {/* Divider */}
                  <div className="w-[1px] h-5 bg-white/20"></div>
                  
                  {/* Profile icon with dropdown indicator */}
                  <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5">
                    {/* Profile circle - just the icon, no letter */}
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#FFE600] flex items-center justify-center">
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-black" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    </div>
                    <svg 
                      className={`w-2.5 h-2.5 text-white/60 transition-transform ${walletDropdownOpen ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
              ) : (
                /* Not connected state */
                <button
                  onClick={handleConnectClick}
                  disabled={isConnecting}
                  className="px-3 sm:px-5 py-1.5 sm:py-2 bg-[#FFE600] hover:bg-[#FFD700] text-black rounded-full transition-all font-space-grotesk font-semibold text-[11px] sm:text-sm shadow-[0_0_0_1px_rgba(0,0,0,0.4)] disabled:opacity-60 whitespace-nowrap"
                >
                  {isConnecting ? '...' : 'Connect'}
                </button>
              )}

              {/* Wallet Dropdown */}
              {walletDropdownOpen && isConnected && account && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setWalletDropdownOpen(false)}
                  />
                  
                  {/* Dropdown panel */}
                  <div 
                    className="absolute right-0 top-full mt-3 w-[300px] rounded-[20px] border border-[#2A2A2A] bg-[#0D0D0D] shadow-2xl z-50 overflow-hidden"
                    style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
                  >
                    <div className="p-5 space-y-5">
                      {/* Balance Section */}
                      <div>
                        <p className="text-white/50 text-[13px] mb-2">Balance</p>
                        <div className="flex items-center gap-3">
                          <img 
                            src="/incentivelogocircle.png" 
                            alt="CENT" 
                            className="w-8 h-8"
                          />
                          <div>
                            <p className="text-white text-[20px] font-semibold">
                              {parseFloat(ethBalance || '0').toLocaleString('en-US', { maximumFractionDigits: 3 })} TCENT
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Connected Wallet Section */}
                      <div>
                        <p className="text-white/50 text-[13px] mb-3">Connected Wallet</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Avatar - profile icon */}
                            <div className="w-10 h-10 rounded-full bg-[#FFE600] flex items-center justify-center">
                              <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            </div>
                            <p className="text-white text-[15px] font-medium">
                              {account.slice(0, 6)}...{account.slice(-4)}
                            </p>
                          </div>
                          
                          {/* Action buttons */}
                          <div className="flex items-center gap-2">
                            {/* Copy button */}
                            <button
                              onClick={copyAddress}
                              className="p-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#252525] transition-colors"
                              title="Copy address"
                            >
                              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            {/* External link button */}
                            <button
                              onClick={openExplorer}
                              className="p-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#252525] transition-colors"
                              title="View on explorer"
                            >
                              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Disconnect Button - 300px width, 48px height, 10px radius, 1px border */}
                      <button
                        onClick={handleDisconnect}
                        className="w-full py-3 rounded-full border border-[#FFE600] text-[#FFE600] font-semibold text-[15px] hover:bg-[#FFE600]/10 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile menu icon */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex md:hidden items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
            >
              <span className="sr-only">Open menu</span>
              {mobileMenuOpen ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <div className="space-y-1 sm:space-y-1.5">
                  <span className="block w-3.5 sm:w-4 h-[1.5px] bg-white"></span>
                  <span className="block w-3.5 sm:w-4 h-[1.5px] bg-white"></span>
                  <span className="block w-3.5 sm:w-4 h-[1.5px] bg-white"></span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div 
            className="fixed top-[56px] left-0 right-0 bg-[#0a0a0a] border-b border-white/10 z-50 md:hidden"
            style={{ backgroundColor: 'rgba(10, 10, 10, 0.98)' }}
          >
            <div className="px-4 py-4 space-y-1">
              {/* Activity Link */}
              <button
                onClick={() => {
                  history.push('/activity');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-white hover:bg-white/5 rounded-xl transition-colors flex items-center gap-3"
                style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
              >
                <svg className="w-5 h-5 text-[#FFE600]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Activity
              </button>

              {/* Create Market Link  */} 
              <button
                onClick={() => {
                  history.push('/create');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-white hover:bg-white/5 rounded-xl transition-colors flex items-center gap-3"
                style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
              >
                <svg className="w-5 h-5 text-[#FFE600]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                Create Market
              </button>

              {/* How it Works */}
              <button
                onClick={() => {
                  setHowItWorksOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-white hover:bg-white/5 rounded-xl transition-colors flex items-center gap-3"
                style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
              >
                <svg className="w-5 h-5 text-[#FFE600]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                How it Works
              </button>

              {/* Home Link */}
              <button
                onClick={() => {
                  history.push('/');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-white hover:bg-white/5 rounded-xl transition-colors flex items-center gap-3"
                style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
              >
                <svg className="w-5 h-5 text-[#FFE600]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Home
              </button>

              {/* Divider */}
              <div className="border-t border-white/10 my-2"></div>

              {/* Profile/Connect - if connected */}
              {isConnected && account ? (
                <button
                  onClick={() => {
                    history.push(`/user/${account}`);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-[#FFE600] hover:bg-[#FFE600]/10 rounded-xl transition-colors flex items-center gap-3"
                  style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile ({account.slice(0, 6)}...{account.slice(-4)})
                </button>
              ) : (
                <button
                  onClick={() => {
                    connectWallet();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 bg-[#FFE600] text-black font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  style={{ fontFamily: '"Clash Grotesk", system-ui, sans-serif' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* How It Works Modal */}
      <HowItWorksModal 
        isOpen={howItWorksOpen} 
        onClose={() => setHowItWorksOpen(false)} 
      />
    </nav>
  );
};

export default WormStyleNavbar;
