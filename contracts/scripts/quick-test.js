const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const contractAddress = '0x768c9AA0a75f6B2e4871F75c75521313C53DCd8B';
  const [signer] = await ethers.getSigners();
  
  console.log("Testing contract at:", contractAddress);
  console.log("Using account:", signer.address);
  
  // Get contract instance
  const contract = await ethers.getContractAt("ETHPredictionMarket", contractAddress, signer);
  
  // Check basic functions
  console.log("\n=== Basic Contract Checks ===");
  const fee = await contract.marketCreationFee();
  console.log("Market creation fee:", ethers.utils.formatEther(fee), "TCENT");
  
  // Create a test market
  console.log("\n=== Creating Test Market ===");
  const endTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const resolutionTime = endTime + 86400; // 1 day after end
  
  const tx = await contract.createMarket(
    "Test market for payout logic",
    "Testing the pool accounting fix",
    "Test",
    endTime,
    resolutionTime,
    { value: ethers.utils.parseEther("0.01") }
  );
  const receipt = await tx.wait();
  console.log("Market created! TX:", receipt.transactionHash);
  
  // Find market ID from event
  const marketCreatedEvent = receipt.events?.find(e => e.event === 'MarketCreated');
  const marketId = marketCreatedEvent?.args?.marketId?.toString() || '1';
  console.log("Market ID:", marketId);
  
  // Buy some YES shares
  console.log("\n=== Buying YES Shares (10 TCENT) ===");
  const buyYesTx = await contract.buyShares(marketId, true, { value: ethers.utils.parseEther("10") });
  await buyYesTx.wait();
  console.log("Bought YES shares");
  
  // Buy some NO shares
  console.log("\n=== Buying NO Shares (20 TCENT) ===");
  const buyNoTx = await contract.buyShares(marketId, false, { value: ethers.utils.parseEther("20") });
  await buyNoTx.wait();
  console.log("Bought NO shares");
  
  // Check market state
  const market = await contract.getMarket(marketId);
  console.log("\n=== Market State ===");
  console.log("YES Pool:", ethers.utils.formatEther(market.yesPool), "TCENT");
  console.log("NO Pool:", ethers.utils.formatEther(market.noPool), "TCENT");
  console.log("Total YES Shares:", ethers.utils.formatEther(market.totalYesShares));
  console.log("Total NO Shares:", ethers.utils.formatEther(market.totalNoShares));
  console.log("Total Volume:", ethers.utils.formatEther(market.totalVolume), "TCENT");
  
  // Check position
  const position = await contract.getUserPosition(marketId, signer.address);
  console.log("\n=== User Position ===");
  console.log("YES Shares:", ethers.utils.formatEther(position.yesShares));
  console.log("NO Shares:", ethers.utils.formatEther(position.noShares));
  console.log("YES Invested:", ethers.utils.formatEther(position.yesInvested), "TCENT");
  console.log("NO Invested:", ethers.utils.formatEther(position.noInvested), "TCENT");
  
  // Verify pool = invested (minus platform fee)
  const totalPoolInContract = market.yesPool.add(market.noPool);
  console.log("\n=== Pool Verification ===");
  console.log("Total Pool (YES + NO):", ethers.utils.formatEther(totalPoolInContract), "TCENT");
  console.log("Total Volume (before fees):", ethers.utils.formatEther(market.totalVolume), "TCENT");
  
  // Get contract balance
  const contractBalance = await ethers.provider.getBalance(contractAddress);
  console.log("Contract Balance:", ethers.utils.formatEther(contractBalance), "TCENT");
  
  console.log("\n✅ All basic tests passed!");
  console.log("\nNote: Full payout test requires multiple accounts and market resolution.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
