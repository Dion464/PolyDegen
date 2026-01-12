const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Debugging Claim Issue...\n");

  // Old contract that's being used
  const contractAddress = '0xDe33759b16D40e49ab825B1faecac7bEBD62267D';
  const userAddress = '0xed27C34A8434ADc188A2D7503152024F64967B61';

  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = ETHPredictionMarket.attach(contractAddress);

  console.log("Contract:", contractAddress);
  console.log("User:", userAddress);
  console.log("Contract Balance:", ethers.utils.formatEther(await ethers.provider.getBalance(contractAddress)), "TCENT\n");

  // Get user's markets
  let userMarkets;
  try {
    userMarkets = await contract.getUserMarkets(userAddress);
    console.log("User's markets:", userMarkets.map(m => m.toString()).join(', '));
  } catch (e) {
    console.log("Could not get user markets:", e.message);
    return;
  }

  // Check each market
  for (const marketId of userMarkets) {
    try {
      console.log(`\n=== Market ${marketId} ===`);
      
      const market = await contract.getMarket(marketId);
      console.log(`  Question: ${market.question}`);
      console.log(`  Resolved: ${market.resolved}`);
      console.log(`  Outcome: ${market.outcome} (1=YES, 2=NO, 3=INVALID)`);
      console.log(`  Active: ${market.active}`);
      console.log(`  Total YES Shares: ${ethers.utils.formatEther(market.totalYesShares)}`);
      console.log(`  Total NO Shares: ${ethers.utils.formatEther(market.totalNoShares)}`);
      console.log(`  YES Pool: ${ethers.utils.formatEther(market.yesPool)} TCENT`);
      console.log(`  NO Pool: ${ethers.utils.formatEther(market.noPool)} TCENT`);
      console.log(`  Total Pool: ${ethers.utils.formatEther(market.totalPool)} TCENT`);
      console.log(`  Total YES Invested: ${ethers.utils.formatEther(market.totalYesInvested)} TCENT`);
      console.log(`  Total NO Invested: ${ethers.utils.formatEther(market.totalNoInvested)} TCENT`);
      
      const position = await contract.getUserPosition(marketId, userAddress);
      console.log(`  --- User Position ---`);
      console.log(`  YES Shares: ${ethers.utils.formatEther(position.yesShares)}`);
      console.log(`  NO Shares: ${ethers.utils.formatEther(position.noShares)}`);
      console.log(`  YES Invested: ${ethers.utils.formatEther(position.yesInvested)} TCENT`);
      console.log(`  NO Invested: ${ethers.utils.formatEther(position.noInvested)} TCENT`);
      console.log(`  Total Invested: ${ethers.utils.formatEther(position.totalInvested)} TCENT`);
      
      const hasPosition = !position.yesShares.isZero() || !position.noShares.isZero();
      
      // Calculate expected payout if market is resolved and user has position
      if (market.resolved && hasPosition) {
        let grossPayout = ethers.BigNumber.from(0);
        let userInvestment = ethers.BigNumber.from(0);
        let losingPoolShare = ethers.BigNumber.from(0);
        let isWinner = false;
        
        if (market.outcome == 1 && !position.yesShares.isZero()) {
          // YES won
          isWinner = true;
          userInvestment = position.yesInvested;
          if (!market.totalYesShares.isZero() && !market.noPool.isZero()) {
            losingPoolShare = market.noPool.mul(position.yesShares).div(market.totalYesShares);
          }
          grossPayout = userInvestment.add(losingPoolShare);
        } else if (market.outcome == 2 && !position.noShares.isZero()) {
          // NO won
          isWinner = true;
          userInvestment = position.noInvested;
          if (!market.totalNoShares.isZero() && !market.yesPool.isZero()) {
            losingPoolShare = market.yesPool.mul(position.noShares).div(market.totalNoShares);
          }
          grossPayout = userInvestment.add(losingPoolShare);
        }
        
        if (isWinner) {
          const platformFee = grossPayout.mul(200).div(10000); // 2%
          const netPayout = grossPayout.sub(platformFee);
          
          console.log(`  --- WINNER - Expected Payout ---`);
          console.log(`  User Investment: ${ethers.utils.formatEther(userInvestment)} TCENT`);
          console.log(`  Losing Pool Share: ${ethers.utils.formatEther(losingPoolShare)} TCENT`);
          console.log(`  Gross Payout: ${ethers.utils.formatEther(grossPayout)} TCENT`);
          console.log(`  Platform Fee (2%): ${ethers.utils.formatEther(platformFee)} TCENT`);
          console.log(`  Net Payout: ${ethers.utils.formatEther(netPayout)} TCENT`);
          
          // Check if contract has enough
          const contractBalance = await ethers.provider.getBalance(contractAddress);
          const totalNeeded = platformFee.add(netPayout);
          console.log(`  Contract has enough: ${contractBalance.gte(totalNeeded) ? 'YES ✓' : 'NO ✗ (needs ' + ethers.utils.formatEther(totalNeeded) + ')'}`);
          
          // Check for potential issues
          if (userInvestment.isZero()) {
            console.log(`  ⚠️ WARNING: User investment is 0 but has shares!`);
          }
          if (grossPayout.isZero()) {
            console.log(`  ⚠️ WARNING: Gross payout is 0!`);
          }
        } else {
          console.log(`  --- LOSER (no payout) ---`);
        }
      } else if (market.resolved && !hasPosition) {
        console.log(`  --- Position already claimed or no position ---`);
      } else if (!market.resolved) {
        console.log(`  --- Market not resolved yet ---`);
      }
      
    } catch (e) {
      console.log(`  Error reading market: ${e.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
