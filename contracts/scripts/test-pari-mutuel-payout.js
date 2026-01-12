const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("🧪 Testing Pari-Mutuel Payout Logic (Winners Only Get Losing Pool)\n");

  // Get signers
  const [owner, user1, user2, user3] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("User1 (NO winner):", user1.address);
  console.log("User2 (NO winner):", user2.address);
  console.log("User3 (YES loser):", user3.address);

  // Deploy fresh contract
  console.log("\n📦 Deploying fresh contract...");
  const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
  
  const contract = await ETHPredictionMarket.deploy(
    ethers.utils.parseEther("0.01"), // market creation fee
    200, // 2% platform fee
    owner.address // fee recipient
  );
  await contract.deployed();
  console.log("Contract deployed to:", contract.address);

  // Create a market
  console.log("\n📊 Creating market...");
  const endTime = Math.floor(Date.now() / 1000) + 3600;
  const resolutionTime = endTime + 86400;
  
  const tx = await contract.createMarket(
    "Test Market - Pari-Mutuel",
    "Testing that winners only get losing pool",
    "Test",
    endTime,
    resolutionTime,
    { value: ethers.utils.parseEther("0.01") }
  );
  await tx.wait();
  const marketId = 1;
  console.log("Market created (ID:", marketId, ")");

  // ============ SCENARIO ============
  // User1 buys 10 TCENT on NO
  // User2 buys 10 TCENT on NO  
  // User3 buys 10 TCENT on YES (loser)
  // NO wins - User1 and User2 should split YES pool (10 TCENT) proportionally
  // They should NOT get their investment back - only the losing pool share

  console.log("\n" + "=".repeat(70));
  console.log("SCENARIO: Testing Pari-Mutuel (Winners Only Get Losing Pool)");
  console.log("=".repeat(70));

  // User1 buys 10 TCENT on NO
  console.log("\n💰 User1 buying 10 TCENT on NO...");
  const tx1 = await contract.connect(user1).buyShares(marketId, false, { value: ethers.utils.parseEther("10") });
  await tx1.wait();
  let market = await contract.getMarket(marketId);
  console.log("   NO Pool:", ethers.utils.formatEther(market.noPool), "TCENT");

  // User2 buys 10 TCENT on NO
  console.log("\n💰 User2 buying 10 TCENT on NO...");
  const tx2 = await contract.connect(user2).buyShares(marketId, false, { value: ethers.utils.parseEther("10") });
  await tx2.wait();
  market = await contract.getMarket(marketId);
  console.log("   NO Pool:", ethers.utils.formatEther(market.noPool), "TCENT");

  // User3 buys 10 TCENT on YES (will lose)
  console.log("\n💰 User3 buying 10 TCENT on YES (will lose)...");
  const tx3 = await contract.connect(user3).buyShares(marketId, true, { value: ethers.utils.parseEther("10") });
  await tx3.wait();
  market = await contract.getMarket(marketId);
  console.log("   YES Pool:", ethers.utils.formatEther(market.yesPool), "TCENT");
  console.log("   NO Pool:", ethers.utils.formatEther(market.noPool), "TCENT");

  // Check market state before resolution
  console.log("\n📈 Market State before resolution:");
  market = await contract.getMarket(marketId);
  const yesPool = market.yesPool;
  const noPool = market.noPool;
  console.log("  YES Pool (LOSING):", ethers.utils.formatEther(yesPool), "TCENT");
  console.log("  NO Pool (WINNING):", ethers.utils.formatEther(noPool), "TCENT");
  console.log("  Total YES Shares:", ethers.utils.formatEther(market.totalYesShares));
  console.log("  Total NO Shares:", ethers.utils.formatEther(market.totalNoShares));

  // Check positions
  console.log("\n👤 Positions:");
  const pos1 = await contract.getUserPosition(marketId, user1.address);
  const pos2 = await contract.getUserPosition(marketId, user2.address);
  const pos3 = await contract.getUserPosition(marketId, user3.address);
  
  console.log("  User1 (NO): shares=", ethers.utils.formatEther(pos1.noShares), "invested=", ethers.utils.formatEther(pos1.noInvested), "TCENT");
  console.log("  User2 (NO): shares=", ethers.utils.formatEther(pos2.noShares), "invested=", ethers.utils.formatEther(pos2.noInvested), "TCENT");
  console.log("  User3 (YES): shares=", ethers.utils.formatEther(pos3.yesShares), "invested=", ethers.utils.formatEther(pos3.yesInvested), "TCENT");

  // Resolve market - NO wins (outcome = 2)
  console.log("\n⚖️ Resolving market - NO wins...");
  await contract.resolveMarket(marketId, 2);
  market = await contract.getMarket(marketId);
  console.log("  Market resolved:", market.resolved);
  console.log("  Outcome:", market.outcome, "(2 = NO)");

  // Calculate expected payouts (NEW LOGIC: Only losing pool share)
  const totalNoShares = market.totalNoShares;
  const user1Shares = pos1.noShares;
  const user2Shares = pos2.noShares;
  
  // Winners split YES pool (losing pool) proportionally by shares
  const user1LosingPoolShare = (yesPool.mul(user1Shares)).div(totalNoShares);
  const user2LosingPoolShare = (yesPool.mul(user2Shares)).div(totalNoShares);
  
  // Apply 2% platform fee
  const platformFeePercent = 200; // 2%
  const user1PlatformFee = (user1LosingPoolShare.mul(platformFeePercent)).div(10000);
  const user2PlatformFee = (user2LosingPoolShare.mul(platformFeePercent)).div(10000);
  
  const user1NetPayout = user1LosingPoolShare.sub(user1PlatformFee);
  const user2NetPayout = user2LosingPoolShare.sub(user2PlatformFee);

  console.log("\n📋 Expected Payout Calculation (NEW LOGIC - Only Losing Pool):");
  console.log("  YES Pool (losing):", ethers.utils.formatEther(yesPool), "TCENT");
  console.log("  Total NO shares:", ethers.utils.formatEther(totalNoShares));
  console.log("");
  console.log("  User1: " + ethers.utils.formatEther(user1Shares) + " shares");
  console.log("    Share of YES pool: " + ethers.utils.formatEther(user1LosingPoolShare) + " TCENT");
  console.log("    Platform fee (2%): " + ethers.utils.formatEther(user1PlatformFee) + " TCENT");
  console.log("    Net payout: " + ethers.utils.formatEther(user1NetPayout) + " TCENT");
  console.log("");
  console.log("  User2: " + ethers.utils.formatEther(user2Shares) + " shares");
  console.log("    Share of YES pool: " + ethers.utils.formatEther(user2LosingPoolShare) + " TCENT");
  console.log("    Platform fee (2%): " + ethers.utils.formatEther(user2PlatformFee) + " TCENT");
  console.log("    Net payout: " + ethers.utils.formatEther(user2NetPayout) + " TCENT");
  console.log("");
  console.log("  ⚠️  IMPORTANT: Winners do NOT get their investment back!");
  console.log("  ⚠️  They ONLY get their share of the losing pool (YES pool)");

  // Check contract balance before claims
  const contractBalanceBefore = await ethers.provider.getBalance(contract.address);
  console.log("\n💰 Contract balance before claims:", ethers.utils.formatEther(contractBalanceBefore), "TCENT");

  // User1 claims
  console.log("\n🎉 User1 claiming winnings...");
  const balBefore1 = await user1.getBalance();
  const claimTx1 = await contract.connect(user1).claimWinnings(marketId);
  const receipt1 = await claimTx1.wait();
  const balAfter1 = await user1.getBalance();
  const gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
  const actualPayout1 = balAfter1.sub(balBefore1).add(gasCost1);
  
  console.log("  User1 ACTUALLY received:", ethers.utils.formatEther(actualPayout1), "TCENT");
  console.log("  User1 EXPECTED:", ethers.utils.formatEther(user1NetPayout), "TCENT");

  // User2 claims
  console.log("\n🎉 User2 claiming winnings...");
  const balBefore2 = await user2.getBalance();
  const claimTx2 = await contract.connect(user2).claimWinnings(marketId);
  const receipt2 = await claimTx2.wait();
  const balAfter2 = await user2.getBalance();
  const gasCost2 = receipt2.gasUsed.mul(receipt2.effectiveGasPrice);
  const actualPayout2 = balAfter2.sub(balBefore2).add(gasCost2);
  
  console.log("  User2 ACTUALLY received:", ethers.utils.formatEther(actualPayout2), "TCENT");
  console.log("  User2 EXPECTED:", ethers.utils.formatEther(user2NetPayout), "TCENT");

  // User3 (loser) tries to claim
  console.log("\n❌ User3 (YES loser) trying to claim...");
  try {
    const balBefore3 = await user3.getBalance();
    const claimTx3 = await contract.connect(user3).claimWinnings(marketId);
    const receipt3 = await claimTx3.wait();
    const balAfter3 = await user3.getBalance();
    const gasCost3 = receipt3.gasUsed.mul(receipt3.effectiveGasPrice);
    const actualPayout3 = balAfter3.sub(balBefore3).add(gasCost3);
    console.log("  User3 received:", ethers.utils.formatEther(actualPayout3), "TCENT (should be 0)");
  } catch (e) {
    console.log("  User3 claim failed (expected):", e.message.substring(0, 100));
  }

  // Check contract balance after claims
  const contractBalanceAfter = await ethers.provider.getBalance(contract.address);
  console.log("\n💰 Contract balance after claims:", ethers.utils.formatEther(contractBalanceAfter), "TCENT");
  console.log("  Balance change:", ethers.utils.formatEther(contractBalanceBefore.sub(contractBalanceAfter)), "TCENT");

  // Verify payouts match expectations
  console.log("\n" + "=".repeat(70));
  console.log("✅ VERIFICATION:");
  console.log("=".repeat(70));
  
  const p1 = parseFloat(ethers.utils.formatEther(actualPayout1));
  const p2 = parseFloat(ethers.utils.formatEther(actualPayout2));
  const expected1 = parseFloat(ethers.utils.formatEther(user1NetPayout));
  const expected2 = parseFloat(ethers.utils.formatEther(user2NetPayout));
  
  const diff1 = Math.abs(p1 - expected1);
  const diff2 = Math.abs(p2 - expected2);
  
  console.log("  User1 ACTUAL:   " + p1.toFixed(6) + " TCENT");
  console.log("  User1 EXPECTED: " + expected1.toFixed(6) + " TCENT");
  console.log("  Difference:    " + diff1.toFixed(6) + " TCENT");
  console.log("");
  console.log("  User2 ACTUAL:   " + p2.toFixed(6) + " TCENT");
  console.log("  User2 EXPECTED: " + expected2.toFixed(6) + " TCENT");
  console.log("  Difference:    " + diff2.toFixed(6) + " TCENT");
  console.log("");
  
  // Verify total payout doesn't exceed losing pool
  const totalPayout = actualPayout1.add(actualPayout2);
  const totalPlatformFee = user1PlatformFee.add(user2PlatformFee);
  const totalGrossPayout = totalPayout.add(totalPlatformFee);
  
  console.log("  Total gross payout (before fee):", ethers.utils.formatEther(totalGrossPayout), "TCENT");
  console.log("  Total platform fee:", ethers.utils.formatEther(totalPlatformFee), "TCENT");
  console.log("  Total net payout:", ethers.utils.formatEther(totalPayout), "TCENT");
  console.log("  YES Pool (losing):", ethers.utils.formatEther(yesPool), "TCENT");
  console.log("");
  
  if (totalGrossPayout.lte(yesPool)) {
    console.log("  ✅ PASS: Total payout does NOT exceed losing pool!");
  } else {
    console.log("  ❌ FAIL: Total payout exceeds losing pool!");
  }
  
  if (diff1 < 0.01 && diff2 < 0.01) {
    console.log("  ✅ PASS: Payouts match expected (winners only get losing pool)!");
    console.log("  ✅ Winners do NOT get their investment back - only losing pool share!");
  } else {
    console.log("  ❌ FAIL: Payouts don't match expected!");
    console.log("  Diff1: " + diff1.toFixed(6) + ", Diff2: " + diff2.toFixed(6));
  }

  // Verify positions are cleared
  console.log("\n🔍 Verifying positions are cleared:");
  const pos1After = await contract.getUserPosition(marketId, user1.address);
  const pos2After = await contract.getUserPosition(marketId, user2.address);
  console.log("  User1 shares after claim:", ethers.utils.formatEther(pos1After.noShares), "(should be 0)");
  console.log("  User2 shares after claim:", ethers.utils.formatEther(pos2After.noShares), "(should be 0)");
  
  if (pos1After.noShares.eq(0) && pos2After.noShares.eq(0)) {
    console.log("  ✅ PASS: Positions cleared correctly!");
  } else {
    console.log("  ❌ FAIL: Positions not cleared!");
  }

  console.log("\n✅ Test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

