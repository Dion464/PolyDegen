const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const contractAddress = '0xB09FADEE5E095fDC9238445FB5d3188B26c2f4B2';
  
  console.log("🔍 Debugging Market State...\n");
  
  // Check contract balance
  const balance = await ethers.provider.getBalance(contractAddress);
  console.log("Contract Balance:", ethers.utils.formatEther(balance), "TCENT");
  
  // Connect to contract
  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  const contract = ETHPredictionMarket.attach(contractAddress);
  
  // Get market 1 (first market)
  try {
    const market = await contract.getMarket(1);
    console.log("\n📊 Market 1 State:");
    console.log("  Question:", market.question);
    console.log("  Resolved:", market.resolved);
    console.log("  Outcome:", market.outcome, "(1=YES, 2=NO, 3=INVALID)");
    console.log("  Total YES Shares:", ethers.utils.formatEther(market.totalYesShares));
    console.log("  Total NO Shares:", ethers.utils.formatEther(market.totalNoShares));
    console.log("  YES Pool:", ethers.utils.formatEther(market.yesPool), "TCENT");
    console.log("  NO Pool:", ethers.utils.formatEther(market.noPool), "TCENT");
    console.log("  Total Pool:", ethers.utils.formatEther(market.totalPool), "TCENT");
    console.log("  Total YES Invested:", ethers.utils.formatEther(market.totalYesInvested), "TCENT");
    console.log("  Total NO Invested:", ethers.utils.formatEther(market.totalNoInvested), "TCENT");
  } catch (e) {
    console.log("Market 1 not found or error:", e.message);
  }
  
  // Get all trades from events to find participants
  console.log("\n📜 Getting trades from events...");
  const filter = contract.filters.SharesPurchased(1); // marketId = 1
  const events = await contract.queryFilter(filter);
  console.log("Found", events.length, "buy events");
  
  const participants = new Set();
  for (const event of events) {
    participants.add(event.args.buyer);
    console.log(`  Trade: ${event.args.buyer} bought ${event.args.isYes ? 'YES' : 'NO'} - ${ethers.utils.formatEther(event.args.shares)} shares for ${ethers.utils.formatEther(event.args.cost)} TCENT`);
  }
  
  // Check all participant addresses
  const testAddresses = Array.from(participants);
  
  console.log("\n👤 Checking positions...");
  for (const addr of testAddresses) {
    try {
      const pos = await contract.getUserPosition(1, addr);
      console.log(`\n  ${addr}:`);
      console.log(`    YES Shares: ${ethers.utils.formatEther(pos.yesShares)}`);
      console.log(`    NO Shares: ${ethers.utils.formatEther(pos.noShares)}`);
      console.log(`    Total Invested: ${ethers.utils.formatEther(pos.totalInvested)} TCENT`);
      console.log(`    YES Invested: ${ethers.utils.formatEther(pos.yesInvested)} TCENT`);
      console.log(`    NO Invested: ${ethers.utils.formatEther(pos.noInvested)} TCENT`);
    } catch (e) {
      console.log(`  ${addr}: Error - ${e.message}`);
    }
  }
  
  // Check batch payout events
  console.log("\n💰 Checking BatchPayoutCompleted events...");
  const payoutFilter = contract.filters.BatchPayoutCompleted(1);
  const payoutEvents = await contract.queryFilter(payoutFilter);
  if (payoutEvents.length === 0) {
    console.log("  No batch payouts found");
  }
  for (const event of payoutEvents) {
    console.log(`  Batch payout: ${event.args.winnersCount} winners, total=${ethers.utils.formatEther(event.args.totalPayout)} TCENT, fees=${ethers.utils.formatEther(event.args.platformFees)} TCENT`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
