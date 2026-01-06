const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const contractAddress = '0xB09FADEE5E095fDC9238445FB5d3188B26c2f4B2';
  
  console.log("🔍 Checking ALL Markets...\n");
  
  const balance = await ethers.provider.getBalance(contractAddress);
  console.log("Contract Balance:", ethers.utils.formatEther(balance), "TCENT\n");
  
  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = ETHPredictionMarket.attach(contractAddress);
  
  // Check markets 1-5
  for (let i = 1; i <= 5; i++) {
    try {
      const market = await contract.getMarket(i);
      if (market.question && market.question.length > 0) {
        console.log(`\n📊 Market ${i}: "${market.question}"`);
        console.log(`  Resolved: ${market.resolved}, Outcome: ${market.outcome}`);
        console.log(`  YES Pool: ${ethers.utils.formatEther(market.yesPool)} TCENT`);
        console.log(`  NO Pool: ${ethers.utils.formatEther(market.noPool)} TCENT`);
        console.log(`  Total Pool: ${ethers.utils.formatEther(market.totalPool)} TCENT`);
        console.log(`  YES Shares: ${ethers.utils.formatEther(market.totalYesShares)}`);
        console.log(`  NO Shares: ${ethers.utils.formatEther(market.totalNoShares)}`);
      }
    } catch (e) {
      // Market doesn't exist
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

