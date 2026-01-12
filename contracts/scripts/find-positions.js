const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Finding positions on Market 3...\n");

  const contractAddress = '0x1391b2B2eBDF166480b964c16c51c9B0DEe96404';

  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = ETHPredictionMarket.attach(contractAddress);

  // Check multiple possible user addresses
  const addresses = [
    '0xed27C34A8434ADc188A2D7503152024F64967B61', // deployer
    '0x886CF7767C96E7cc565e654cDe5FcC34e31522ca', // market creator
    '0x5EC37a1ECEd4503cfe4f0B4Bf5B4b19Af249A92B', // market 1 creator
  ];

  const market = await contract.getMarket(3);
  console.log("Market 3:", market.question);
  console.log("Resolved:", market.resolved, "| Outcome:", market.outcome, "(2=NO won)");
  console.log("YES Pool:", ethers.utils.formatEther(market.yesPool), "TCENT");
  console.log("NO Pool:", ethers.utils.formatEther(market.noPool), "TCENT");
  console.log("Total NO Shares:", ethers.utils.formatEther(market.totalNoShares));
  console.log("");

  for (const addr of addresses) {
    try {
      const position = await contract.getUserPosition(3, addr);
      console.log(`\n--- ${addr} ---`);
      console.log(`YES Shares: ${ethers.utils.formatEther(position.yesShares)}`);
      console.log(`NO Shares: ${ethers.utils.formatEther(position.noShares)}`);
      console.log(`YES Invested: ${ethers.utils.formatEther(position.yesInvested)} TCENT`);
      console.log(`NO Invested: ${ethers.utils.formatEther(position.noInvested)} TCENT`);
      
      const hasPosition = !position.noShares.isZero() || !position.yesShares.isZero();
      if (hasPosition && market.resolved && market.outcome == 2) {
        // NO won - check if user has NO shares
        if (!position.noShares.isZero()) {
          const inv = position.noInvested;
          let losingShare = ethers.BigNumber.from(0);
          if (!market.totalNoShares.isZero() && !market.yesPool.isZero()) {
            losingShare = market.yesPool.mul(position.noShares).div(market.totalNoShares);
          }
          const gross = inv.add(losingShare);
          const fee = gross.mul(200).div(10000);
          const net = gross.sub(fee);
          console.log(`\n🎉 WINNER! Expected payout:`);
          console.log(`  Investment back: ${ethers.utils.formatEther(inv)} TCENT`);
          console.log(`  Share of YES pool: ${ethers.utils.formatEther(losingShare)} TCENT`);
          console.log(`  Gross: ${ethers.utils.formatEther(gross)} TCENT`);
          console.log(`  Net (after 2% fee): ${ethers.utils.formatEther(net)} TCENT`);
        } else {
          console.log(`LOSER (had YES shares)`);
        }
      }
    } catch (e) {
      console.log(`${addr}: Error - ${e.message.slice(0, 50)}`);
    }
  }

  // Also check market 2
  console.log("\n\n========== Market 2 (active) ==========");
  const market2 = await contract.getMarket(2);
  console.log("Question:", market2.question);
  console.log("Resolved:", market2.resolved);
  
  for (const addr of addresses) {
    try {
      const position = await contract.getUserPosition(2, addr);
      const hasPosition = !position.noShares.isZero() || !position.yesShares.isZero();
      if (hasPosition) {
        console.log(`\n--- ${addr} ---`);
        console.log(`YES Shares: ${ethers.utils.formatEther(position.yesShares)}`);
        console.log(`NO Shares: ${ethers.utils.formatEther(position.noShares)}`);
      }
    } catch (e) {}
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

