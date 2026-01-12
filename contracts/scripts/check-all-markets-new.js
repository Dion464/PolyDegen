const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking ALL Markets on NEW Contract...\n");

  const contractAddress = '0x1391b2B2eBDF166480b964c16c51c9B0DEe96404';

  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = ETHPredictionMarket.attach(contractAddress);

  console.log("Contract:", contractAddress);
  
  const balance = await ethers.provider.getBalance(contractAddress);
  console.log("Contract Balance:", ethers.utils.formatEther(balance), "TCENT\n");

  // Get next market ID
  const nextMarketId = await contract.nextMarketId();
  console.log("Total markets:", nextMarketId.sub(1).toString());

  // Check ALL markets (1 to nextMarketId-1)
  for (let i = 1; i < nextMarketId.toNumber(); i++) {
    console.log(`\n========== Market ${i} ==========`);
    
    try {
      const market = await contract.getMarket(i);
      console.log(`Question: ${market.question}`);
      console.log(`Resolved: ${market.resolved}`);
      console.log(`Outcome: ${market.outcome} (1=YES, 2=NO, 3=INVALID)`);
      console.log(`Active: ${market.active}`);
      console.log(`Total YES Shares: ${ethers.utils.formatEther(market.totalYesShares)}`);
      console.log(`Total NO Shares: ${ethers.utils.formatEther(market.totalNoShares)}`);
      console.log(`YES Pool: ${ethers.utils.formatEther(market.yesPool)} TCENT`);
      console.log(`NO Pool: ${ethers.utils.formatEther(market.noPool)} TCENT`);
      console.log(`Total Pool: ${ethers.utils.formatEther(market.totalPool)} TCENT`);
      console.log(`Total YES Invested: ${ethers.utils.formatEther(market.totalYesInvested)} TCENT`);
      console.log(`Total NO Invested: ${ethers.utils.formatEther(market.totalNoInvested)} TCENT`);
      console.log(`Creator: ${market.creator}`);
      
      // Check if pools look corrupted
      const yesPool = parseFloat(ethers.utils.formatEther(market.yesPool));
      const noPool = parseFloat(ethers.utils.formatEther(market.noPool));
      if (yesPool > 1000000000 || noPool > 1000000000) {
        console.log(`⚠️ WARNING: Pool values look corrupted!`);
      }
      
      // Try to get positions for common test addresses
      const testAddresses = [
        '0xed27C34A8434ADc188A2D7503152024F64967B61',
      ];
      
      for (const addr of testAddresses) {
        try {
          const position = await contract.getUserPosition(i, addr);
          const hasPosition = !position.yesShares.isZero() || !position.noShares.isZero();
          if (hasPosition) {
            console.log(`\n  --- Position for ${addr.slice(0,10)}... ---`);
            console.log(`  YES Shares: ${ethers.utils.formatEther(position.yesShares)}`);
            console.log(`  NO Shares: ${ethers.utils.formatEther(position.noShares)}`);
            console.log(`  YES Invested: ${ethers.utils.formatEther(position.yesInvested)} TCENT`);
            console.log(`  NO Invested: ${ethers.utils.formatEther(position.noInvested)} TCENT`);
            
            // Calculate expected payout
            if (market.resolved) {
              let payout = ethers.BigNumber.from(0);
              if (market.outcome == 1 && !position.yesShares.isZero()) {
                const inv = position.yesInvested;
                let losingShare = ethers.BigNumber.from(0);
                if (!market.totalYesShares.isZero() && !market.noPool.isZero()) {
                  losingShare = market.noPool.mul(position.yesShares).div(market.totalYesShares);
                }
                payout = inv.add(losingShare);
                console.log(`  WINNER (YES) - Expected gross: ${ethers.utils.formatEther(payout)} TCENT`);
              } else if (market.outcome == 2 && !position.noShares.isZero()) {
                const inv = position.noInvested;
                let losingShare = ethers.BigNumber.from(0);
                if (!market.totalNoShares.isZero() && !market.yesPool.isZero()) {
                  losingShare = market.yesPool.mul(position.noShares).div(market.totalNoShares);
                }
                payout = inv.add(losingShare);
                console.log(`  WINNER (NO) - Expected gross: ${ethers.utils.formatEther(payout)} TCENT`);
              } else {
                console.log(`  LOSER - No payout`);
              }
            }
          }
        } catch (e) {
          // No position or error
        }
      }
      
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

