// Contract configuration - uses environment variables only
// No fallback to localhost - must set VITE_* environment variables

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
export const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID);
export const MARKET_CREATION_FEE = import.meta.env.VITE_MARKET_CREATION_FEE;
export const PLATFORM_FEE_BPS = parseInt(import.meta.env.VITE_PLATFORM_FEE_BPS);
export const RPC_URL = import.meta.env.VITE_RPC_URL;
export const NETWORK_NAME = import.meta.env.VITE_NETWORK_NAME;
export const BLOCK_EXPLORER_URL = (import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://testnet.incentiv.io').trim();

export const CONTRACT_ABI = [
  // Market functions
  "function createMarket(string memory _question, string memory _description, string memory _category, uint256 _endTime, uint256 _resolutionTime) payable returns (uint256)",
  "function getMarket(uint256 _marketId) view returns (tuple(uint256 id, string question, string description, string category, uint256 endTime, uint256 resolutionTime, bool resolved, uint8 outcome, uint256 totalYesShares, uint256 totalNoShares, uint256 totalVolume, address creator, uint256 createdAt, bool active, uint256 lastTradedPrice, uint256 yesBidPrice, uint256 yesAskPrice, uint256 noBidPrice, uint256 noAskPrice, uint256 totalPool, uint256 yesPool, uint256 noPool))",
  "function getActiveMarkets() view returns (uint256[] memory)",
  "function getCurrentPrice(uint256 _marketId, bool _isYes) view returns (uint256)",
  "function getSharesAmount(uint256 _marketId, bool _isYes, uint256 _investAmount) view returns (uint256)",
  
  // Trading functions
  "function buyShares(uint256 _marketId, bool _isYes) payable",
  "function sellShares(uint256 _marketId, bool _isYes, uint256 _sharesToSell)",
  
  // Sell order functions (NEW - User-to-user trading)
  "function placeSellOrder(uint256 _marketId, bool _isYes, uint256 _shares, uint256 _pricePerShare)",
  "function buyFromSellOrder(uint256 _orderId) payable",
  "function cancelSellOrder(uint256 _orderId)",
  "function getMarketSellOrders(uint256 _marketId) view returns (tuple(uint256 id, uint256 marketId, address seller, bool isYes, uint256 shares, uint256 pricePerShare, uint256 timestamp, bool filled, bool cancelled)[] memory)",
  "function getUserSellOrders(address _user) view returns (tuple(uint256 id, uint256 marketId, address seller, bool isYes, uint256 shares, uint256 pricePerShare, uint256 timestamp, bool filled, bool cancelled)[] memory)",
  "function getSellOrder(uint256 _orderId) view returns (tuple(uint256 id, uint256 marketId, address seller, bool isYes, uint256 shares, uint256 pricePerShare, uint256 timestamp, bool filled, bool cancelled))",
  
  // Limit order functions (NEW - Automatic matching)
  "function placeLimitOrder(uint256 _marketId, bool _isYes, uint256 _price, uint256 _amount) payable",
  
  // Resolution functions
  "function resolveMarket(uint256 _marketId, uint8 _outcome)",
  "function claimWinnings(uint256 _marketId)",
  "function batchPayoutWinners(uint256 _marketId, address[] calldata _winners) returns (uint256 totalPaid, uint256 totalFees)",
  
  // View functions
  "function getUserPosition(uint256 _marketId, address _user) view returns (tuple(uint256 yesShares, uint256 noShares, uint256 totalInvested, uint256 yesInvested, uint256 noInvested))",
  "function marketCreationFee() view returns (uint256)",
  
  // Events
  "event MarketCreated(uint256 indexed marketId, address indexed creator, string question, string category, uint256 endTime)",
  "event SharesPurchased(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 shares, uint256 cost, uint256 newPrice)",
  "event SharesSold(uint256 indexed marketId, address indexed seller, bool isYes, uint256 shares, uint256 payout, uint256 newPrice)",
  "event MarketResolved(uint256 indexed marketId, uint8 outcome, uint256 totalPayout)",
  "event SellOrderPlaced(uint256 indexed orderId, uint256 indexed marketId, address indexed seller, bool isYes, uint256 shares, uint256 pricePerShare)",
  "event SellOrderMatched(uint256 indexed orderId, uint256 indexed marketId, address indexed buyer, address seller, uint256 shares, uint256 totalPrice)",
  "event SellOrderCancelled(uint256 indexed orderId, uint256 indexed marketId, address indexed seller)",
  "event LimitOrderPlaced(uint256 indexed marketId, address indexed trader, bool isYes, uint256 price, uint256 amount)"
];
