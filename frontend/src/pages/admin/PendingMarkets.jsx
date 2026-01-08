import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BLOCK_EXPLORER_URL, CHAIN_ID, RPC_URL, NETWORK_NAME } from '../../contracts/eth-config';
import { showGlassToast, showTransactionToast } from '../../utils/toastUtils';
import WormStyleNavbar from '../../components/modern/WormStyleNavbar';

const ADMIN_ADDRESSES = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Hardhat account #0
  '0xed27c34a8434adc188a2d7503152024f64967b61', // User's admin wallet
  // Add more admin addresses here
].map(addr => addr.toLowerCase());

const PendingMarkets = () => {
  const history = useHistory();
  const { account, isConnected, signer } = useWeb3();
  const [pendingMarkets, setPendingMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING'); // PENDING, APPROVED, REJECTED, ALL
  const [processingId, setProcessingId] = useState(null);

  const homePageFont = {
    fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  };

  const explorerBase = (BLOCK_EXPLORER_URL || 'https://explorer.incentiv.io/').replace(/\/?$/, '/');

  // Resolve API base URL (use deployed Vercel API for local dev)
  const resolveApiBase = () => {
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
        console.log('Using same origin for API:', origin);
        return origin;
      }
      // In local dev, use the deployed Vercel API
      const deployedUrl = 'https://polydegen.vercel.app';
      console.log('Local dev detected, using deployed API:', deployedUrl);
      return deployedUrl;
    }
    
    // Fallback to current origin if available
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    
    return '';
  };

  // Check if user is admin (wallet-based OR localStorage-based)
  const isWalletAdmin = isConnected && account && ADMIN_ADDRESSES.includes(account.toLowerCase());
  const isLocalStorageAdmin = localStorage.getItem('isAdminLoggedIn') === 'true' && localStorage.getItem('usertype') === 'admin';
  const isAdmin = isWalletAdmin || isLocalStorageAdmin;

  const fetchPendingMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const apiBaseUrl = resolveApiBase();
      const url = filter === 'ALL' 
        ? `${apiBaseUrl}/api/pending-markets`
        : `${apiBaseUrl}/api/pending-markets?status=${filter}`;
      
      console.log('Fetching pending markets from:', url);
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setPendingMarkets(data.pendingMarkets);
      }
    } catch (error) {
      console.error('Error fetching pending markets:', error);
      showGlassToast({ title: 'Failed to fetch pending markets' });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // Allow localStorage admin even without wallet connected
    if (isLocalStorageAdmin) {
      fetchPendingMarkets();
      return;
    }

    // Wait for Web3 to initialize (account might be null initially)
    if (isConnected === false && account === null) {
      // Still initializing, wait a bit
      return;
    }

    // If wallet is connected but not admin, redirect
    if (isConnected && account && !isWalletAdmin && !isLocalStorageAdmin) {
      showGlassToast({ title: 'Access denied. Admin only.' });
      history.push('/');
      return;
    }

    // If wallet admin, fetch markets
    if (isWalletAdmin) {
      fetchPendingMarkets();
    }
  }, [isConnected, account, isWalletAdmin, isLocalStorageAdmin, filter, history, fetchPendingMarkets]);

  const handleApprove = async (pendingMarket) => {
    if (!signer) {
      showGlassToast({ title: 'Please connect your wallet' });
      return;
    }

    setProcessingId(pendingMarket.id);

    try {
      // Check network connection first
      let provider = signer.provider || (window.ethereum ? new ethers.providers.Web3Provider(window.ethereum) : null);
      
      if (!provider) {
        throw new Error('No provider available. Please connect MetaMask.');
      }

      // Check if connected to correct network
      try {
        const network = await provider.getNetwork();
        const currentChainId = network.chainId;
        
        if (currentChainId !== CHAIN_ID) {
          showGlassToast({ 
            title: `Please switch to ${NETWORK_NAME} (Chain ID: ${CHAIN_ID})`
          });
          
          // Try to switch network
          if (window.ethereum) {
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
              });
              // Wait a bit for network to switch
              await new Promise(resolve => setTimeout(resolve, 1000));
              // Re-check network
              const newNetwork = await provider.getNetwork();
              if (newNetwork.chainId !== CHAIN_ID) {
                throw new Error(`Failed to switch to ${NETWORK_NAME}. Please switch manually in MetaMask.`);
              }
            } catch (switchError) {
              // If chain doesn't exist, try to add it
              if (switchError.code === 4902 && RPC_URL) {
                try {
                  await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                      chainId: `0x${CHAIN_ID.toString(16)}`,
                      chainName: NETWORK_NAME,
                      nativeCurrency: {
                        name: 'TCENT',
                        symbol: 'TCENT',
                        decimals: 18
                      },
                      rpcUrls: [RPC_URL],
                      blockExplorerUrls: [BLOCK_EXPLORER_URL]
                    }],
                  });
                  // Wait for network to be added
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (addError) {
                  throw new Error(`Failed to add ${NETWORK_NAME}. Please add it manually in MetaMask.`);
                }
              } else {
                throw switchError;
              }
            }
          } else {
            throw new Error(`Please switch to ${NETWORK_NAME} (Chain ID: ${CHAIN_ID}) in MetaMask.`);
          }
        }
      } catch (networkError) {
        console.error('Network check error:', networkError);
        if (networkError.message.includes('switch') || networkError.message.includes('add')) {
          throw networkError;
        }
        // If it's an RPC error but not a network switch error, continue with warning
        console.warn('Network check failed, but continuing:', networkError.message);
      }

      // Create new signer with updated provider (in case network switched)
      const updatedProvider = window.ethereum ? new ethers.providers.Web3Provider(window.ethereum) : provider;
      const updatedSigner = updatedProvider.getSigner();
      
      // Create market on-chain
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, updatedSigner);
      
      const endTime = Math.floor(new Date(pendingMarket.endTime).getTime() / 1000);
      const resolutionTime = Math.floor(new Date(pendingMarket.resolutionTime).getTime() / 1000);
      
      // Validate timestamps
      const currentTime = Math.floor(Date.now() / 1000);
      if (endTime <= currentTime) {
        throw new Error('End time must be in the future');
      }
      if (resolutionTime <= endTime) {
        throw new Error('Resolution time must be after end time');
      }
      
      showGlassToast({ title: 'Creating market on-chain...' });
      
      // Get market creation fee from contract
      let marketCreationFee = ethers.utils.parseEther('0.01'); // Default fallback
      try {
        const fee = await contract.marketCreationFee();
        marketCreationFee = fee;
      } catch (feeError) {
        console.warn('Could not fetch market creation fee, using default:', feeError);
      }
      
      const tx = await contract.createMarket(
        pendingMarket.question,
        pendingMarket.description || '',
        pendingMarket.category,
        endTime,
        resolutionTime,
        { value: marketCreationFee }
      );

      showGlassToast({ title: 'Transaction submitted. Waiting for confirmation...' });
      const receipt = await tx.wait();

      // Get market ID from event - try multiple methods
      let marketId = null;
      
      // Method 1: Try to find parsed MarketCreated event
      const marketCreatedEvent = receipt.events?.find(e => e.event === 'MarketCreated');
      if (marketCreatedEvent?.args) {
        // Try marketId first, then id (for compatibility)
        marketId = marketCreatedEvent.args.marketId?.toString() || marketCreatedEvent.args.id?.toString() || marketCreatedEvent.args[0]?.toString();
      }
      
      // Method 2: Parse logs manually if event wasn't parsed
      if (!marketId && receipt.logs?.length > 0) {
        try {
          const iface = new ethers.utils.Interface([
            "event MarketCreated(uint256 indexed marketId, address indexed creator, string question, string category, uint256 endTime)"
          ]);
          for (const log of receipt.logs) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed.name === 'MarketCreated') {
                marketId = parsed.args.marketId?.toString() || parsed.args[0]?.toString();
                console.log('Parsed marketId from raw log:', marketId);
                break;
              }
            } catch (parseErr) {
              // Not a MarketCreated event, continue
            }
          }
        } catch (ifaceErr) {
          console.warn('Could not parse logs manually:', ifaceErr);
        }
      }
      
      // Method 3: Try to get from return value (some contracts return the ID)
      if (!marketId && receipt.events?.[0]?.args?.[0]) {
        marketId = receipt.events[0].args[0].toString();
        console.log('Got marketId from first event arg:', marketId);
      }

      if (!marketId) {
        console.error('Failed to get market ID. Receipt:', JSON.stringify(receipt, null, 2));
        throw new Error('Failed to get market ID from transaction. Check console for details.');
      }
      
      console.log('✅ Market created with ID:', marketId);

      showTransactionToast({ 
        title: 'Market created on-chain!', 
        txHash: receipt.transactionHash,
        icon: '✅'
      });

      // Get API base URL for saving image and updating status
      const apiBaseUrl = resolveApiBase();

      // Create activity event for market creation (non-blocking)
      // Use the original creator's address, not the admin's
      fetch(`${apiBaseUrl}/api/activity/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'MARKET_CREATED',
          marketId: marketId,
          creator: pendingMarket.creator,
          question: pendingMarket.question,
          category: pendingMarket.category,
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber?.toString() || null,
          blockTime: new Date().toISOString()
        })
      }).then(r => {
        if (r.ok) console.log('✅ Activity event recorded');
        else console.warn('⚠️ Activity event failed:', r.status);
      }).catch(err => console.warn('⚠️ Activity event error:', err.message));

      // Save image if exists
      if (pendingMarket.imageUrl) {
        try {
          console.log('Saving image for market:', marketId, 'Image URL:', pendingMarket.imageUrl?.substring(0, 50) + '...');
          const imageResponse = await fetch(`${apiBaseUrl}/api/market-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              marketId: marketId,
              imageUrl: pendingMarket.imageUrl
            })
          });

          if (!imageResponse.ok) {
            const errorText = await imageResponse.text();
            console.error('Failed to save image:', imageResponse.status, errorText);
            throw new Error(`Failed to save image: ${errorText.substring(0, 100)}`);
          }

          const imageData = await imageResponse.json();
          console.log('✅ Image saved successfully:', imageData);
        } catch (imgError) {
          console.error('Error saving image:', imgError);
          // Don't throw - image save failure shouldn't block approval
          showGlassToast({ title: 'Market created but image save failed' });
        }
      }

      // Save rules if exists
      if (pendingMarket.rules && pendingMarket.rules.length > 0) {
        try {
          const rulesMap = JSON.parse(localStorage.getItem('marketRules') || '{}');
          rulesMap[marketId] = pendingMarket.rules;
          localStorage.setItem('marketRules', JSON.stringify(rulesMap));
        } catch (rulesError) {
          console.error('Error saving rules:', rulesError);
        }
      }

      // Update pending market status in database
      console.log('Updating pending market status:', {
        url: `${apiBaseUrl}/api/pending-markets/${pendingMarket.id}`,
        status: 'DEPLOYED',
        deployedMarketId: marketId,
        pendingMarketId: pendingMarket.id
      });
      
      const approveResponse = await fetch(`${apiBaseUrl}/api/pending-markets/${pendingMarket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DEPLOYED',
          deployedMarketId: marketId
        })
      });

      console.log('Approve response status:', approveResponse.status, approveResponse.statusText);
      
      if (!approveResponse.ok) {
        const errorText = await approveResponse.text();
        console.error('Approve response error:', approveResponse.status, errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || 'Failed to update pending market status' };
        }
        throw new Error(errorData.error || `HTTP ${approveResponse.status}: Failed to update pending market status`);
      }
      
      const approveData = await approveResponse.json();
      console.log('✅ Pending market status updated:', approveData);

      showGlassToast({ title: 'Market approved and deployed!' });
      fetchPendingMarkets();

    } catch (error) {
      console.error('Error approving market:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to approve market';
      
      if (error.code === -32002) {
        errorMessage = 'RPC endpoint unavailable. Check your network connection or try again.';
      } else if (error.code === -32603) {
        errorMessage = 'Network error. Please check your internet connection and MetaMask.';
      } else if (error.code === 4001) {
        errorMessage = 'Transaction rejected by user.';
      } else if (error.code === 'NETWORK_ERROR' || error.message?.includes('Failed to fetch')) {
        errorMessage = 'Network connection failed. Please check your internet and try again.';
      } else if (error.message?.includes('network') || error.message?.includes('chain')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showGlassToast({ title: errorMessage });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (pendingMarket) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    setProcessingId(pendingMarket.id);

    try {
      const apiBaseUrl = resolveApiBase();
      console.log('Rejecting market via:', `${apiBaseUrl}/api/pending-markets/${pendingMarket.id}`);
      
      console.log('Rejecting pending market:', {
        url: `${apiBaseUrl}/api/pending-markets/${pendingMarket.id}`,
        status: 'REJECTED',
        rejectionReason: reason,
        pendingMarketId: pendingMarket.id
      });
      
      const response = await fetch(`${apiBaseUrl}/api/pending-markets/${pendingMarket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REJECTED',
          rejectionReason: reason
        })
      });

      console.log('Reject response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Rejection response error:', response.status, errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || 'Failed to reject market' };
        }
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to reject market`);
      }

      const data = await response.json();

      if (data.success) {
        showGlassToast({ title: 'Market rejected' });
        fetchPendingMarkets();
      } else {
        throw new Error(data.error || 'Failed to reject market');
      }
    } catch (error) {
      console.error('Error rejecting market:', error);
      showGlassToast({ title: error.message || 'Failed to reject market' });
    } finally {
      setProcessingId(null);
    }
  };

  const statusOptions = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];
  const summary = useMemo(() => (
    statusOptions.map(status => ({
      status,
      count:
        status === 'ALL'
          ? pendingMarkets.length
          : pendingMarkets.filter(pm => pm.status === status).length
    }))
  ), [pendingMarkets]);

  // Show loading state while checking admin status (only if wallet is connecting, not for localStorage admin)
  if (!isLocalStorageAdmin && isConnected === false && account === null) {
    return (
      <div className="min-h-screen bg-[#050505]" style={homePageFont}>
        <WormStyleNavbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          <div className="glass-card rounded-[20px] border border-white/10 bg-white/5 text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFE600] mx-auto mb-4"></div>
            <p className="text-gray-300">Initializing Web3 connection...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show access denied if not admin (only if not localStorage admin AND not wallet admin)
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#050505]" style={homePageFont}>
        <WormStyleNavbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          <div className="glass-card rounded-[20px] border border-white/10 bg-white/5 text-center py-16">
            <p className="text-red-300 text-lg mb-4">Access denied. Admin only.</p>
            <button
              onClick={() => history.push('/admin')}
              className="px-6 py-3 rounded-full bg-[#FFE600] text-black font-semibold"
            >
              Go to Admin Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]" style={homePageFont}>
      <WormStyleNavbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 space-y-8">
        <div className="glass-card rounded-[24px] border border-white/10 bg-white/5 px-6 sm:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60 mb-2">Admin Console</p>
              <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-3">Community Market Submissions</h1>
              <p className="text-gray-300 max-w-2xl">Review user-created markets, verify their rule sets, and push the best ones on-chain. Each submission includes a 1&nbsp;TCENT bond to discourage spam.</p>
            </div>
            <button
              onClick={() => history.push('/admin/resolve')}
              className="px-5 py-2.5 rounded-full border border-white/10 bg-white/5 text-sm font-medium text-white hover:text-black hover:bg-white/90 transition-all"
            >
              Go to Resolution Desk
            </button>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summary.map(item => (
              <div key={item.status} className="rounded-[16px] border border-white/10 bg-white/5 px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-widest text-white/60">{item.status}</p>
                <p className="text-2xl font-semibold text-white">{item.count}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {statusOptions.map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  filter === status
                    ? 'bg-[#FFE600] text-black shadow-lg'
                    : 'text-white/70 border border-white/10 hover:text-white bg-white/5'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="glass-card rounded-[20px] border border-white/10 bg-white/5 text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFE600] mx-auto mb-4"></div>
            <p className="text-gray-300">Loading submissions...</p>
          </div>
        ) : pendingMarkets.length === 0 ? (
          <div className="glass-card rounded-[20px] border border-white/10 bg-white/5 text-center py-16">
            <p className="text-gray-300 text-lg">No {filter.toLowerCase()} markets right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {pendingMarkets.map(market => (
              <div
                key={market.id}
                className="glass-card rounded-[20px] border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 sm:p-7 backdrop-blur-[30px]"
              >
                <div className="flex flex-col md:flex-row gap-6">
                  {market.imageUrl && (
                    <img
                      src={market.imageUrl}
                      alt={market.question}
                      className="w-full md:w-36 h-36 object-cover rounded-[16px] border border-white/10"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                      <div>
                        <p className="text-xs tracking-widest text-white/50 uppercase">{market.category}</p>
                        <h3 className="text-2xl font-semibold">{market.question}</h3>
                      </div>
                      <span className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide ${
                        market.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                        market.status === 'APPROVED' ? 'bg-green-500/20 text-green-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {market.status}
                      </span>
                    </div>

                    {market.description && (
                      <p className="text-gray-300 text-sm mb-4">{market.description}</p>
                    )}

                    {market.feeAmountWei && (
                      <div className="mb-5 flex flex-col gap-2 text-sm">
                        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-[14px] px-4 py-2">
                          <span className="text-white/60">Submission Fee</span>
                          <span className="text-white font-medium">{Number(ethers.utils.formatEther(market.feeAmountWei)).toFixed(4)} TCENT</span>
                        </div>
                        {market.feeTxHash && (
                          <a
                            href={`${explorerBase}tx/${market.feeTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#FFE600] hover:underline"
                          >
                            View fee transaction
                          </a>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm text-white/80">
                      <div><span className="text-white/40">Creator</span><p className="text-white">{market.creator.slice(0, 6)}...{market.creator.slice(-4)}</p></div>
                      <div><span className="text-white/40">End Date</span><p className="text-white">{new Date(market.endTime).toLocaleDateString()}</p></div>
                      <div><span className="text-white/40">Resolution</span><p className="text-white">{new Date(market.resolutionTime).toLocaleDateString()}</p></div>
                      <div><span className="text-white/40">Rules</span><p className="text-white">{market.rules?.length || 0}</p></div>
                    </div>

                    {market.rules && market.rules.length > 0 && (
                      <div className="mb-4 bg-white/5 border border-white/10 rounded-[14px] px-4 py-3">
                        <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Rules</p>
                        <ul className="space-y-1 text-sm text-white/80 list-disc list-inside">
                          {market.rules.map((rule, idx) => (
                            <li key={idx}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {market.rejectionReason && (
                      <div className="mb-4 p-3 rounded-[12px] bg-red-500/10 border border-red-500/20">
                        <p className="text-red-300 text-sm">
                          <strong>Rejection Reason:</strong> {market.rejectionReason}
                        </p>
                      </div>
                    )}

                    {market.status === 'APPROVED' && market.marketId && (
                      <div className="mb-4 p-3 rounded-[12px] bg-green-500/10 border border-green-500/20">
                        <p className="text-green-300 text-sm">
                          <strong>Market ID:</strong> {market.marketId.toString()}
                        </p>
                      </div>
                    )}

                    {market.status === 'PENDING' && (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => handleApprove(market)}
                          disabled={processingId === market.id}
                          className="flex-1 px-6 py-3 rounded-[14px] bg-gradient-to-r from-green-400 to-green-500 text-black font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === market.id ? 'Processing...' : 'Approve & Deploy'}
                        </button>
                        <button
                          onClick={() => handleReject(market)}
                          disabled={processingId === market.id}
                          className="flex-1 px-6 py-3 rounded-[14px] border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingMarkets;
