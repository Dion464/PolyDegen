import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { CONTRACT_ADDRESS, CHAIN_ID, CONTRACT_ABI, RPC_URL, NETWORK_NAME } from '../contracts/eth-config';

// Environment configuration loaded - log for debugging on Vercel
console.log('🔧 Web3 Config:', { 
  CONTRACT_ADDRESS: CONTRACT_ADDRESS || 'NOT SET', 
  CHAIN_ID: CHAIN_ID || 'NOT SET',
  RPC_URL: RPC_URL ? 'SET' : 'NOT SET',
  NETWORK_NAME: NETWORK_NAME || 'NOT SET'
});

const ETH_PREDICTION_MARKET_ABI = CONTRACT_ABI;

// PricingAMM ABI (simplified for price calculation)
const PRICING_AMM_ABI = [
  "function calculatePrice(uint256 marketId) external view returns (uint256 yesPrice, uint256 noPrice)",
  "function getMarketState(uint256 marketId) external view returns (uint256 yesShares, uint256 noShares, uint256 liquidity, uint256 yesPrice, uint256 noPrice)",
  "function calculateSharesToGive(uint256 marketId, bool isYes, uint256 amount) external view returns (uint256)"
];

// Contract addresses - dynamically set from environment variables
// Guard against undefined/NaN CHAIN_ID
const VALID_CHAIN_ID = CHAIN_ID && !isNaN(CHAIN_ID) ? CHAIN_ID : 28802; // Fallback to Incentiv testnet

const CONTRACT_ADDRESSES = {
  [VALID_CHAIN_ID]: {
    ETH_PREDICTION_MARKET: CONTRACT_ADDRESS,
    PRICING_AMM: "0x0000000000000000000000000000000000000000",
  }
};

const Web3Context = createContext();

const normalizeMarketId = (rawMarketId) => {
  
  if (rawMarketId === null || rawMarketId === undefined) {
    throw new Error("Market ID is missing");
  }

  // Convert empty string or weird values to a number
  let cleaned = rawMarketId.toString().trim();

  if (cleaned === "") {
    throw new Error("Market ID cannot be empty");
  }

  let marketId;
  try {
    marketId = ethers.BigNumber.from(cleaned);
  } catch (err) {
    throw new Error(`Invalid market id: ${cleaned}`);
  }

  if (marketId.lte(0)) {
    throw new Error("Market ID must be greater than zero");
  }

  return marketId;
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};

export const Web3Provider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [web3Provider, setWeb3Provider] = useState(null);
  
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [contracts, setContracts] = useState({});
  const [ethBalance, setEthBalance] = useState('0');
  
  // Refs to prevent infinite loops
  const connectingRef = useRef(false);
  const autoConnectedRef = useRef(false);

  // Network info - use environment variable
  const getNetworkName = (chainId) => {
    if (chainId === CHAIN_ID) {
      return NETWORK_NAME || `Chain ${chainId}`;
    }
    return `Chain ${chainId}`;
  };
  const networkName = getNetworkName(chainId);

  // Initialize contracts
  const initializeContracts = useCallback(async (web3Signer) => {
    try {
      const network = await web3Signer.provider.getNetwork();
      const networkChainId = network.chainId;
      
      // Try to find addresses for the connected network, fallback to configured chain
      let addresses = CONTRACT_ADDRESSES[networkChainId];
      if (!addresses && CONTRACT_ADDRESS) {
        // If network doesn't match but we have a contract address, use it anyway
        // This handles cases where env vars might not be perfectly synced
        console.warn(`Network ${networkChainId} not in CONTRACT_ADDRESSES, using configured CONTRACT_ADDRESS`);
        addresses = {
          ETH_PREDICTION_MARKET: CONTRACT_ADDRESS,
          PRICING_AMM: "0x0000000000000000000000000000000000000000"
        };
      }
      if (!addresses) {
        throw new Error(`Unsupported network: ${networkChainId}. Please switch to ${NETWORK_NAME} (Chain ID: ${CHAIN_ID}).`);
      }

      if (!addresses.ETH_PREDICTION_MARKET) {
        throw new Error(`Prediction market address missing for chain ${chainId}`);
      }

      if (!ethers.utils.isAddress(addresses.ETH_PREDICTION_MARKET) || addresses.ETH_PREDICTION_MARKET === ethers.constants.AddressZero) {
        throw new Error(`Invalid prediction market address for chain ${chainId}: ${addresses.ETH_PREDICTION_MARKET}`);
      }

      if (!Array.isArray(ETH_PREDICTION_MARKET_ABI) || ETH_PREDICTION_MARKET_ABI.length === 0) {
        throw new Error('Prediction market ABI is missing or empty');
      }

      let predictionMarketInterface;
      try {
        predictionMarketInterface = new ethers.utils.Interface(ETH_PREDICTION_MARKET_ABI);
      } catch (abiError) {
        throw new Error(`Invalid prediction market ABI: ${abiError.message}`);
      }

      const hasFunction = (signature) =>
        Boolean(
          predictionMarketInterface.functions[signature] ||
          predictionMarketInterface.functions[`${signature} payable`]
        );

      if (!hasFunction('getMarket(uint256)')) {
        throw new Error('Prediction market ABI is missing required getMarket(uint256) function');
      }
      if (!hasFunction('buyShares(uint256,bool)')) {
        throw new Error('Prediction market ABI is missing required buyShares(uint256,bool) function');
      }


      // Skip contract code verification for speed - assume it exists if ABI is correct
      // const contractCode = await web3Signer.provider.getCode(addresses.ETH_PREDICTION_MARKET);
      // if (!contractCode || contractCode === '0x' || contractCode === '0x0') {
      //   throw new Error(`No contract deployed at ${addresses.ETH_PREDICTION_MARKET} on chain ${chainId}`);
      // }

      const predictionMarket = new ethers.Contract(
        addresses.ETH_PREDICTION_MARKET,
        ETH_PREDICTION_MARKET_ABI,
        web3Signer
      );

      // Skip PricingAMM initialization for speed (not used in current implementation)
      let pricingAMM = null;

      setContracts({
        predictionMarket,
        pricingAMM,
      });

      return { predictionMarket, pricingAMM };
    } catch (err) {
      console.error('Failed to initialize contracts:', err);
      setError(err.message);
      return {};
    }
  }, []);

  // Get ETH balance - optimized for speed (single attempt, no retries)
  const updateEthBalance = useCallback(async () => {
    if (!provider || !account) {
      return;
    }

    try {
      const balance = await provider.getBalance(account);
      const formattedBalance = ethers.utils.formatEther(balance);
      setEthBalance(formattedBalance);
    } catch (err) {
      console.error('Failed to update ETH balance:', err.message);
      // Don't set to '0' on error - keep previous value
    }
  }, [provider, account]);

  // Get MetaMask provider only - strict MetaMask-only connection
  const getEthereumProvider = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.ethereum === 'undefined') {
      return null;
    }

    // If multiple providers exist, find MetaMask only
    if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
      // Strictly find MetaMask - ignore all other wallets
      const metamaskProvider = window.ethereum.providers.find(
        (p) => p.isMetaMask && !p.isBraveWallet
      );
      if (metamaskProvider) {
        return metamaskProvider;
      }
      // MetaMask not found in providers array - return null
      return null;
    }

    // If it's MetaMask directly, use it
    if (window.ethereum.isMetaMask) {
      return window.ethereum;
    }

    // Not MetaMask - return null to reject connection
    return null;
  }, []);

  // Add network to MetaMask - optimized for speed
  const addNetwork = useCallback(async (targetChainId = CHAIN_ID) => {
    const ethereumProvider = getEthereumProvider();
    if (!ethereumProvider) {
      return false;
    }

    try {
      // Check current chain first - skip if already on correct network
      const currentChainId = await ethereumProvider.request({ method: 'eth_chainId' });
      if (parseInt(currentChainId, 16) === targetChainId) {
        return true; // Already on correct network, no need to switch
      }

      // Use environment variables for network configuration
      const config = {
        chainId: `0x${targetChainId.toString(16)}`,
        chainName: NETWORK_NAME || 'Incentiv Testnet',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: ['https://explorer-testnet.incentiv.io'],
      };

      if (!RPC_URL || !NETWORK_NAME) {
        return false;
      }
      
      // Try to switch to the network first
      try {
        await ethereumProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: config.chainId }],
        });
        return true;
      } catch (switchError) {
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          await ethereumProvider.request({
            method: 'wallet_addEthereumChain',
            params: [config],
          });
          return true;
        }
        throw switchError;
      }
    } catch (error) {
      return false;
    }
  }, [getEthereumProvider]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (connectingRef.current || isConnecting) {
      return false;
    }
    
    // Get MetaMask provider only
    const ethereumProvider = getEthereumProvider();
    
    if (!ethereumProvider) {
      // On mobile, try to open MetaMask app
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const dappUrl = window.location.href.replace(/^https?:\/\//, '');
        const metamaskAppDeepLink = `https://metamask.app.link/dapp/${dappUrl}`;
        window.location.href = metamaskAppDeepLink;
        return false;
      }
      
      // Check if other wallets are installed but MetaMask is not
      if (typeof window.ethereum !== 'undefined') {
        const hasOtherWallets = (window.ethereum.providers && window.ethereum.providers.length > 0) || 
                                (!window.ethereum.isMetaMask);
        if (hasOtherWallets) {
          setError('MetaMask not found. Please install or enable MetaMask extension. Other wallet extensions are not supported.');
          toast.error('Only MetaMask is supported. Please install or enable the MetaMask extension.');
          return false;
        }
      }
      
      setError('MetaMask not detected. Please install MetaMask to continue.');
      toast.error('MetaMask is required. Please install the MetaMask browser extension.');
      return false;
    }

    connectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
      // Request account access first (fastest)
      const accounts = await ethereumProvider.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const web3Provider = new ethers.providers.Web3Provider(ethereumProvider);
      const network = await web3Provider.getNetwork();
      const web3Signer = web3Provider.getSigner();

      // Set state immediately for faster UI update
      setProvider(web3Provider);
      setChainId(network.chainId);
      setAccount(accounts[0]);
      setSigner(web3Signer);
      setIsConnected(true);

      // Switch network first if needed (faster to do before contract init)
      if (network.chainId !== CHAIN_ID) {
        await addNetwork(CHAIN_ID);
        // Re-check network after switch
        const updatedNetwork = await web3Provider.getNetwork();
        if (updatedNetwork.chainId !== CHAIN_ID) {
          toast.error(`Please switch to ${NETWORK_NAME} (Chain ID: ${CHAIN_ID})`);
          setIsConnecting(false);
          connectingRef.current = false;
          return false;
        }
      }

      // Initialize contracts (only after network is confirmed)
      await initializeContracts(web3Signer);
      
      // Update ETH balance asynchronously (non-blocking)
      updateEthBalance();
      
      toast.success('✅ Wallet connected!');
      return true;
    } catch (err) {
      console.error('Wallet connection error:', err);
      
      // Handle various error types
      let errorMessage = err.message || 'Unknown error occurred';
      
      // Check if it's a circuit breaker error
      if (errorMessage.includes('circuit breaker')) {
        errorMessage = 'MetaMask circuit breaker is open. Please reset MetaMask or wait a few seconds and try again.';
        toast.error(errorMessage);
      } 
      // Check for extension selection errors (like evmAsk errors)
      else if (errorMessage.includes('Unexpected error') || errorMessage.includes('selectExtension') || err.code === -32002) {
        errorMessage = 'Wallet connection error. Please disable other wallet extensions and use only MetaMask.';
        toast.error(errorMessage);
      }
      // Check if user rejected the request
      else if (err.code === 4001 || errorMessage.includes('User rejected') || errorMessage.includes('user rejected')) {
        errorMessage = 'Connection request was rejected. Please try again and approve the connection.';
        toast.error(errorMessage);
      }
      // Generic error
      else {
        toast.error(`Failed to connect wallet: ${errorMessage}`);
      }
      
      setError(errorMessage);
      setIsConnecting(false);
      connectingRef.current = false;
      return false;
    } finally {
      setIsConnecting(false);
      connectingRef.current = false;
    }
  }, [initializeContracts, addNetwork, updateEthBalance, isConnecting, getEthereumProvider]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setIsConnected(false);
    setContracts({});
    setEthBalance('0');
    setError(null);
  }, []);


  // Buy shares with ETH - optimized decimal normalization
  const normalizeDecimal = (value) => {
    if (value === null || value === undefined || value === '') {
      throw new Error('Invalid amount: value cannot be empty');
    }
    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value) || value <= 0) {
        throw new Error('Invalid amount: must be a positive number');
      }
      return value.toString();
    }
    const trimmed = String(value).trim().replace(/,/g, '.');
    if (!trimmed || trimmed === '.' || trimmed === '0' || trimmed === '0.') {
      throw new Error('Invalid amount: value cannot be zero or empty');
    }
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
      throw new Error('Invalid amount: must be a positive number');
    }
    return trimmed;
  };

  // Buy shares - optimized for speed with fixed gas
  const buyShares = useCallback(async (marketId, isYes, ethAmount) => {
    if (!contracts.predictionMarket || !signer) {
      throw new Error('Contracts not initialized');
    }

    try {
      // Use fixed gas limit for speed (skip estimation)
      const tx = await contracts.predictionMarket.buyShares(marketId, isYes, {
        value: ethers.utils.parseUnits(normalizeDecimal(ethAmount), 18),
        gasLimit: 500000 // Fixed gas limit - faster than estimation
      });

      const receipt = await tx.wait();

      // Update balance asynchronously (non-blocking)
      updateEthBalance();
      return receipt;
    } catch (err) {
      console.error('Buy transaction failed:', err.message);
      throw err;
    }
  }, [contracts.predictionMarket, signer, updateEthBalance]);

  // Sell shares - optimized for speed with fixed gas and validation
  const sellShares = useCallback(async (marketId, isYes, shares) => {
    if (!contracts.predictionMarket || !signer) {
      throw new Error('Contracts not initialized');
    }

    // Validate shares parameter before processing
    if (shares === null || shares === undefined || shares === '') {
      throw new Error('Invalid shares: amount cannot be empty. Please enter a valid number of shares to sell.');
    }

    try {
      // Normalize and validate shares amount
      const normalizedShares = normalizeDecimal(shares);
      const sharesInWei = ethers.utils.parseUnits(normalizedShares, 18);
      
      // Additional validation: ensure shares > 0
      if (sharesInWei.isZero()) {
        throw new Error('Invalid shares: amount must be greater than zero');
      }

      // Use fixed gas limit for speed (skip estimation)
      const tx = await contracts.predictionMarket.sellShares(
        marketId,
        isYes,
        sharesInWei,
        {
          gasLimit: 300000 // Fixed gas limit - faster than estimation
        }
      );

      const receipt = await tx.wait();

      // Update balance asynchronously (non-blocking)
      updateEthBalance();
      return receipt;
    } catch (err) {
      // Provide user-friendly error messages
      if (err.message.includes('Invalid shares') || err.message.includes('Invalid amount')) {
        throw err;
      }
      if (err.message.includes('user rejected')) {
        throw new Error('Transaction was rejected');
      }
      throw new Error(`Sell failed: ${err.message}`);
    }
  }, [contracts.predictionMarket, signer, updateEthBalance]);

  // Get user position
  const getUserPosition = useCallback(async (marketId) => {
    if (!contracts.predictionMarket || !account) {
      throw new Error('Contracts not initialized or no account');
    }

    try {
      const position = await contracts.predictionMarket.getUserPosition(marketId, account);
      return {
        yesShares: ethers.utils.formatEther(position.yesShares),
        noShares: ethers.utils.formatEther(position.noShares),
        totalInvested: ethers.utils.formatEther(position.totalInvested)
      };
    } catch (err) {
      console.error('Failed to get user position:', err);
      throw err;
    }
  }, [contracts.predictionMarket, account]);

  // Place a limit order - optimized for speed
  const placeLimitOrder = useCallback(async (marketId, isYes, priceCents, ethAmount) => {
    if (!contracts.predictionMarket || !signer) {
      throw new Error('Contracts not initialized');
    }

    // Convert price from cents to basis points (50¢ -> 5000 basis points)
    const priceBps = Math.round(priceCents * 100);
    if (priceBps <= 0 || priceBps > 10000) {
      throw new Error('Price must be between 1¢ and 100¢');
    }

    try {
      // Use fixed gas limit for speed (skip estimation)
      const tx = await contracts.predictionMarket.placeLimitOrder(
        marketId,
        isYes,
        priceBps,
        {
          value: ethers.utils.parseUnits(normalizeDecimal(ethAmount), 18),
          gasLimit: 500000 // Fixed gas limit - faster than estimation
        }
      );

      console.log('Limit order transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Limit order transaction confirmed:', receipt);

      // Update balance asynchronously (non-blocking)
      updateEthBalance();
      return receipt;
    } catch (err) {
      console.error('Limit order transaction failed:', err.message);
      throw err;
    }
  }, [contracts.predictionMarket, signer, updateEthBalance]);

  // Get user's limit orders for a market (uses hybrid order API)
  const getUserLimitOrders = useCallback(async (marketId) => {
    if (!account) {
      return [];
    }

    try {
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
      const response = await fetch(
        `${API_BASE}/api/orders?user=${account}&marketId=${marketId}`
      );

      if (!response.ok) {
        console.warn('Failed to fetch user orders from API');
        return [];
      }

      const data = await response.json();
      const orders = (data.orders || []).map(order => {
        const priceTicks = order.priceTicks ?? order.price_ticks ?? order.priceTicks;
        const priceCents = typeof priceTicks === 'number' ? priceTicks / 100 : 0;
        const totalAmount = order.amount ?? (order.sizeWei ? parseFloat(ethers.utils.formatEther(order.sizeWei)) : 0);
        const remainingAmount = order.remainingAmount ?? (order.remainingWei ? parseFloat(ethers.utils.formatEther(order.remainingWei)) : totalAmount);
        const filledAmount = totalAmount - remainingAmount;

        return {
          orderId: order.id?.toString?.() ?? order.orderId ?? '',
          marketId: order.marketId?.toString?.() ?? '',
          isYes: order.outcomeId === '0' || order.outcomeId === 0,
          price: priceCents,
          amount: Number.isFinite(totalAmount) ? totalAmount : 0,
          filled: Number.isFinite(filledAmount) ? filledAmount : 0,
          remaining: Number.isFinite(remainingAmount) ? remainingAmount : 0,
          timestamp: order.createdAt || new Date().toISOString(),
          status: order.status || 'open'
        };
      });

      // Filter to only open and partially filled orders
      return orders.filter(o => o.status === 'open' || o.status === 'partially_filled');
    } catch (err) {
      console.error('Failed to get user limit orders:', err);
      return [];
    }
  }, [account]);

  // Get market data
  const getMarketData = useCallback(async (marketId) => {
    if (!contracts.predictionMarket) {
      throw new Error('Contracts not initialized');
    }

    try {
      const normalizedMarketId = normalizeMarketId(marketId);

      const market = await contracts.predictionMarket.getMarket(normalizedMarketId);

      if (!market?.id || !ethers.BigNumber.isBigNumber(market.id) || market.id.isZero()) {
        throw new Error(`Market ${normalizedMarketId.toString()} does not exist`);
      }

      // Get prices directly from chain using getCurrentPrice
      let yesPrice = 50; // Default 50¢
      let noPrice = 50; // Default 50¢

      try {
        // Prices come as basis points from contract (5000 = 50%)
        const yesPriceBps = await contracts.predictionMarket.getCurrentPrice(normalizedMarketId, true);
        const noPriceBps = await contracts.predictionMarket.getCurrentPrice(normalizedMarketId, false);
        yesPrice = parseFloat(yesPriceBps.toString()) / 100; // Convert to cents
        noPrice = parseFloat(noPriceBps.toString()) / 100; // Convert to cents
      } catch (err) {
        // Use default prices if fetch fails
      }

      const toNumber = (value) => {
        if (value === null || value === undefined) return 0;
        if (ethers.BigNumber.isBigNumber(value)) {
          return Number(value.toString());
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      return {
        id: market.id.toString(),
        question: market.question,
        description: market.description,
        category: market.category,
        endTime: market.endTime.toString(),
        resolutionTime: market.resolutionTime.toString(),
        resolved: market.resolved,
        outcome: toNumber(market.outcome),
        totalYesShares: market.totalYesShares.toString(),
        totalNoShares: market.totalNoShares.toString(),
        totalVolume: market.totalVolume.toString(),
        creator: market.creator,
        createdAt: market.createdAt.toString(),
        active: market.active,
        yesPrice: yesPrice,
        noPrice: noPrice,
        totalPool: (parseInt(market.totalYesShares.toString()) + parseInt(market.totalNoShares.toString())).toString()
      };
    } catch (err) {
      console.error('Failed to get market data:', err);
      throw err;
    }
  }, [contracts.predictionMarket, contracts.pricingAMM]);

  // Create market - optimized for speed with fixed gas
  const createMarket = useCallback(async (question, description, category, endTime, resolutionTime) => {
    if (!contracts.predictionMarket || !signer) {
      throw new Error('Contracts not initialized');
    }

    try {
      const marketCreationFee = await contracts.predictionMarket.marketCreationFee();
      
      // Use fixed gas limit for speed (skip estimation)
      const tx = await contracts.predictionMarket.createMarket(
        question,
        description,
        category,
        endTime,
        resolutionTime,
        {
          value: marketCreationFee,
          gasLimit: 2000000 // Fixed gas limit - faster than estimation
        }
      );

      const receipt = await tx.wait();

      // Update balance asynchronously (non-blocking)
      updateEthBalance();
      return receipt;
    } catch (err) {
      console.error('Failed to create market:', err);
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to create market';
      
      if (err.message) {
        if (err.message.includes('Insufficient market creation fee')) {
          errorMessage = 'Insufficient fee. Please ensure you have enough ETH.';
        } else if (err.message.includes('End time must be in future')) {
          errorMessage = 'End time must be in the future. Please check your dates.';
        } else if (err.message.includes('Resolution time must be after end time')) {
          errorMessage = 'Resolution time must be after end time.';
        } else if (err.message.includes('user rejected')) {
          errorMessage = 'Transaction was rejected. Please try again.';
        } else if (err.message.includes('Internal JSON-RPC error')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }, [contracts.predictionMarket, signer, updateEthBalance]);

  // Get user markets
  const getUserMarkets = useCallback(async () => {
    if (!contracts.predictionMarket || !account || typeof contracts.predictionMarket.getUserMarkets !== 'function') {
      return [];
    }

    try {
      const marketsForUser = await contracts.predictionMarket.getUserMarkets(account);
      return marketsForUser.map(id => Number(id.toString()));
    } catch (err) {
      console.error('Failed to get user markets:', err);
      return [];
    }
  }, [contracts.predictionMarket, account]);

  // Get active markets
  const getActiveMarkets = useCallback(async () => {
    if (!contracts.predictionMarket) {
      return [];
    }

    try {
      const ids = await contracts.predictionMarket.getActiveMarkets();
      return ids.map(id => Number(id.toString()));
    } catch (err) {
      console.error('Failed to get active markets:', err);
      return [];
    }
  }, [contracts.predictionMarket]);

  // Claim winnings
  const claimWinnings = useCallback(async (marketId) => {
    if (!contracts.predictionMarket || !signer) {
      throw new Error('Contracts not initialized');
    }

    try {
      const tx = await contracts.predictionMarket.claimWinnings(marketId, {
        gasLimit: 200000
      });

      console.log('Claim winnings transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Claim winnings transaction confirmed:', receipt);

      // Update balance asynchronously (non-blocking)
      updateEthBalance();

      return receipt;
    } catch (err) {
      console.error('Failed to claim winnings:', err);
      throw err;
    }
  }, [contracts.predictionMarket, signer, updateEthBalance]);

  // Update balances when account or contracts change
  useEffect(() => {
    if (isConnected && account && provider) {
      updateEthBalance();
    }
  }, [isConnected, account, provider, updateEthBalance]);

  // Event-driven balance updates - listen for user's trades
  useEffect(() => {
    if (!contracts.predictionMarket || !account) return;

    const contract = contracts.predictionMarket;

    // Update balance when current user buys or sells
    const handleUserTrade = (marketId, trader) => {
      if (trader.toLowerCase() !== account.toLowerCase()) return;
      // Balance changed - update it
      updateEthBalance();
    };

    // Listen for user's trades (filtered by account)
    const purchaseFilter = contract.filters.SharesPurchased(null, account);
    const sellFilter = contract.filters.SharesSold(null, account);

    contract.on(purchaseFilter, handleUserTrade);
    contract.on(sellFilter, handleUserTrade);

    // Fallback: update balance every 5 minutes
    const fallbackInterval = setInterval(updateEthBalance, 300000);

    return () => {
      contract.off(purchaseFilter, handleUserTrade);
      contract.off(sellFilter, handleUserTrade);
      clearInterval(fallbackInterval);
    };
  }, [contracts.predictionMarket, account, updateEthBalance]);

  // Listen for account changes
  useEffect(() => {
    const ethereumProvider = getEthereumProvider();
    if (ethereumProvider) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (accounts[0] !== account) {
          setAccount(accounts[0]);
        }
      };

      const handleChainChanged = (chainId) => {
        setChainId(parseInt(chainId, 16));
        window.location.reload(); // Reload to reinitialize contracts
      };

      ethereumProvider.on('accountsChanged', handleAccountsChanged);
      ethereumProvider.on('chainChanged', handleChainChanged);

      return () => {
        if (ethereumProvider.removeListener) {
          ethereumProvider.removeListener('accountsChanged', handleAccountsChanged);
          ethereumProvider.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [account, disconnectWallet, getEthereumProvider]);

  // Auto-connect if previously connected (only once on mount)
  useEffect(() => {
    // Only auto-connect once, and only if not already connected
    if (autoConnectedRef.current || isConnected || connectingRef.current) {
      return;
    }

    const autoConnect = async () => {
      const ethereumProvider = getEthereumProvider();
      if (ethereumProvider) {
        try {
          const accounts = await ethereumProvider.request({ method: 'eth_accounts' });
          if (accounts.length > 0 && !isConnected && !connectingRef.current) {
            autoConnectedRef.current = true;
            await connectWallet();
          }
        } catch (err) {
          console.error('Auto-connect failed:', err);
        }
      }
    };

    autoConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  const value = {
    // Connection state
    provider,
    signer,
    account,
    chainId,
    networkName,
    isConnected,
    isConnecting,
    error,

    // Contracts
    contracts,

    // Balances
    ethBalance,

    // Actions
    connectWallet,
    disconnectWallet,
    buyShares,
    sellShares,
    getUserPosition,
    getMarketData,
    getUserMarkets,
    getActiveMarkets,
    createMarket,
    claimWinnings,
    placeLimitOrder,
    getUserLimitOrders,
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
};
