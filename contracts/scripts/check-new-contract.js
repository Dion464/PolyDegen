const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking NEW Contract...\n");

  const contractAddress = '0x1391b2B2eBDF166480b964c16c51c9B0DEe96404';
  const userAddress = '0xed27C34A8434ADc188A2D7503152024F64967B61';

  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = ETHPredictionMarket.attach(contractAddress);

  console.log("Contract:", contractAddress);
  console.log("User:", userAddress);
  
  const balance = await ethers.provider.getBalance(contractAddress);
  console.log("Contract Balance:", ethers.utils.formatEther(balance), "TCENT\n");

  // Get next market ID to see how many markets exist
  try {
    const nextMarketId = await contract.nextMarketId();
    console.log("Next Market ID:", nextMarketId.toString());
    console.log("Total markets created:", nextMarketId.sub(1).toString());
  } catch (e) {
    console.log("Could not get nextMarketId:", e.message);
  }

  // Get user's markets
  try {
    const userMarkets = await contract.getUserMarkets(userAddress);
    console.log("User's markets:", userMarkets.length > 0 ? userMarkets.map(m => m.toString()).join(', ') : 'None');
    
    // Check each market
    for (const marketId of userMarkets) {
      console.log(`\n=== Market ${marketId} ===`);
      
      const market = await contract.getMarket(marketId);
      console.log(`  Question: ${market.question}`);
      console.log(`  Resolved: ${market.resolved}`);
      console.log(`  Outcome: ${market.outcome}`);
      console.log(`  YES Pool: ${ethers.utils.formatEther(market.yesPool)} TCENT`);
      console.log(`  NO Pool: ${ethers.utils.formatEther(market.noPool)} TCENT`);
      console.log(`  Total Pool: ${ethers.utils.formatEther(market.totalPool)} TCENT`);
      
      const position = await contract.getUserPosition(marketId, userAddress);
      console.log(`  User YES Shares: ${ethers.utils.formatEther(position.yesShares)}`);
      console.log(`  User NO Shares: ${ethers.utils.formatEther(position.noShares)}`);
      console.log(`  User YES Invested: ${ethers.utils.formatEther(position.yesInvested)} TCENT`);
      console.log(`  User NO Invested: ${ethers.utils.formatEther(position.noInvested)} TCENT`);
    }
  } catch (e) {
    console.log("Error getting user data:", e.message);
  }

  // Get active markets
  try {
    const activeMarkets = await contract.getActiveMarkets();
    console.log("\nActive markets:", activeMarkets.length > 0 ? activeMarkets.map(m => m.toString()).join(', ') : 'None');
  } catch (e) {
    console.log("Could not get active markets:", e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

