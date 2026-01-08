const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying ETH Prediction Market...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId);

  // Deploy ETHPredictionMarket
  console.log("\n📄 Deploying ETHPredictionMarket...");
  
  const marketCreationFee = ethers.utils.parseEther("0.01"); // 0.01 ETH
  const platformFeeBasisPoints = 200; // 2%
  const feeRecipient = deployer.address; // Fee recipient = deployer
  
  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = await ETHPredictionMarket.deploy(marketCreationFee, platformFeeBasisPoints, feeRecipient);
  await contract.deployed();
  
  console.log("✅ ETHPredictionMarket deployed to:", contract.address);
  console.log("   Market creation fee:", ethers.utils.formatEther(marketCreationFee), "ETH");
  console.log("   Platform fee:", platformFeeBasisPoints / 100, "%");

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      ETHPredictionMarket: contract.address
    },
    config: {
      marketCreationFee: marketCreationFee.toString(),
      platformFeeBasisPoints
    }
  };

  // Save to JSON
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, `eth-${network.chainId}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n📁 Deployment info saved to:", deploymentFile);

  // Generate frontend config
  const frontendConfig = `// Auto-generated contract configuration
// Generated at: ${new Date().toISOString()}
// Network: ${network.name} (Chain ID: ${network.chainId})

export const CONTRACT_ADDRESS = "${contract.address}";
export const CHAIN_ID = ${network.chainId};
export const MARKET_CREATION_FEE = "${ethers.utils.formatEther(marketCreationFee)}";
export const PLATFORM_FEE_BPS = ${platformFeeBasisPoints};

export const CONTRACT_ABI = ${JSON.stringify([
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
], null, 2)};
`;

  const frontendConfigDir = path.join(__dirname, "..", "..", "frontend", "src", "contracts");
  if (!fs.existsSync(frontendConfigDir)) {
    fs.mkdirSync(frontendConfigDir, { recursive: true });
  }
  
  const frontendConfigFile = path.join(frontendConfigDir, "eth-config.js");
  fs.writeFileSync(frontendConfigFile, frontendConfig);
  console.log("📁 Frontend config saved to:", frontendConfigFile);

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📋 Next steps:");
  console.log("1. Update useWeb3.jsx to use this contract address");
  console.log("2. Run: npx hardhat run scripts/create-simple-markets.js --network localhost");
  console.log("3. Refresh the frontend");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

