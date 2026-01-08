// Auto-generated contract configuration
// Generated at: 2026-01-08T14:07:39.788Z
// Network: incentiv (Chain ID: 28802)

export const CONTRACT_ADDRESS = "0xcF6DF13E40a2AFfFd8992c5f9e733FE9e97C7399";
export const CHAIN_ID = 28802;
export const MARKET_CREATION_FEE = "0.01";
export const PLATFORM_FEE_BPS = 200;
export const RPC_URL = "https://rpc-testnet.incentiv.io/";
export const NETWORK_NAME = "Incentiv Testnet";
export const BLOCK_EXPLORER_URL = "https://testnet.incentiv.io";

export const CONTRACT_ABI = [
  "function createMarket(string memory _question, string memory _description, string memory _category, uint256 _resolutionTime, uint256 _endTime) payable returns (uint256)",
  "function getMarket(uint256 _marketId) view returns (uint256 id, string memory question, string memory description, string memory category, uint256 resolutionTime, uint256 createdAt, uint256 endTime, bool resolved, uint8 outcome, uint256 totalYesShares, uint256 totalNoShares, uint256 totalPool, uint256 totalVolume, bool active)",
  "function getActiveMarkets() view returns (uint256[] memory)",
  "function getCurrentPrice(uint256 _marketId, bool _isYes) view returns (uint256)",
  "function getSharesAmount(uint256 _marketId, bool _isYes, uint256 _investAmount) view returns (uint256)",
  "function buyShares(uint256 _marketId, bool _isYes) payable",
  "function sellShares(uint256 _marketId, bool _isYes, uint256 _sharesToSell)",
  "function resolveMarket(uint256 _marketId, uint8 _outcome)",
  "function claimWinnings(uint256 _marketId)",
  "function getUserPosition(uint256 _marketId, address _user) view returns (uint256 yesShares, uint256 noShares, uint256 invested)",
  "function marketCreationFee() view returns (uint256)",
  "event MarketCreated(uint256 indexed id, string question, string category, uint256 resolutionTime, uint256 endTime, address indexed creator, uint256 creationFee)",
  "event SharesPurchased(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 shares, uint256 cost, uint256 newPrice)",
  "event SharesSold(uint256 indexed marketId, address indexed seller, bool isYes, uint256 shares, uint256 payout, uint256 newPrice)",
  "event MarketResolved(uint256 indexed marketId, uint8 outcome, uint256 totalPayout)"
];
