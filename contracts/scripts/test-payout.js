const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("🧪 Testing Payout Logic with PRICE IMPACT...\n");

  // Get signers
  const [owner, user1, user2, user3] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("User1 (NO - buys FIRST at low price):", user1.address);
  console.log("User2 (NO - buys SECOND at higher price):", user2.address);
  console.log("User3 (YES investor - LOSER):", user3.address);

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
    "Test Market",
    "Test Description",
    "Test",
    endTime,
    resolutionTime,
    { value: ethers.utils.parseEther("0.01") }
  );
  await tx.wait();
  const marketId = 1;
  console.log("Market created (ID:", marketId, ")");

  // ============ SCENARIO: Price Impact Test ============
  // User1 buys 10 TCENT on NO FIRST (gets more shares at lower price)
  // User3 buys 10 TCENT on YES (this shifts price)
  // User2 buys 10 TCENT on NO SECOND (gets fewer shares at higher price)
  // NO wins - User1 and User2 should split YES pool based on their TCENT invested

  console.log("\n" + "=".repeat(60));
  console.log("SCENARIO: Testing with price impact");
  console.log("=".repeat(60));

  // User1 buys 10 TCENT on NO FIRST
  console.log("\n💰 User1 buying 10 TCENT on NO (FIRST - low price)...");
  await contract.connect(user1).buyShares(marketId, false, { value: ethers.utils.parseEther("10") });
  let market = await contract.getMarket(marketId);
  console.log("   Price after: YES=", market.lastTradedPrice.toString(), "basis points");

  // User3 buys 10 TCENT on YES (shifts price)
  console.log("\n💰 User3 buying 10 TCENT on YES (shifts price)...");
  await contract.connect(user3).buyShares(marketId, true, { value: ethers.utils.parseEther("10") });
  market = await contract.getMarket(marketId);
  console.log("   Price after: YES=", market.lastTradedPrice.toString(), "basis points");

  // User2 buys 10 TCENT on NO SECOND (higher price = fewer shares)
  console.log("\n💰 User2 buying 10 TCENT on NO (SECOND - higher price)...");
  await contract.connect(user2).buyShares(marketId, false, { value: ethers.utils.parseEther("10") });
  market = await contract.getMarket(marketId);
  console.log("   Price after: YES=", market.lastTradedPrice.toString(), "basis points");

  // Check market state
  console.log("\n📈 Market State after all buys:");
  market = await contract.getMarket(marketId);
  console.log("  Total YES Shares:", ethers.utils.formatEther(market.totalYesShares));
  console.log("  Total NO Shares:", ethers.utils.formatEther(market.totalNoShares));
  console.log("  YES Pool (LOSING):", ethers.utils.formatEther(market.yesPool), "TCENT");
  console.log("  NO Pool (WINNING):", ethers.utils.formatEther(market.noPool), "TCENT");
  console.log("  Total YES Invested:", ethers.utils.formatEther(market.totalYesInvested), "TCENT");
  console.log("  Total NO Invested:", ethers.utils.formatEther(market.totalNoInvested), "TCENT");
  console.log("  Total Pool:", ethers.utils.formatEther(market.totalPool), "TCENT");

  // Check positions - NOTE: Different shares despite same investment!
  console.log("\n👤 Positions (note different shares for same 10 TCENT investment!):");
  const pos1 = await contract.getUserPosition(marketId, user1.address);
  const pos2 = await contract.getUserPosition(marketId, user2.address);
  const pos3 = await contract.getUserPosition(marketId, user3.address);
  
  console.log("  User1 (NO-FIRST):  shares=", ethers.utils.formatEther(pos1.noShares).padEnd(25), "invested=", ethers.utils.formatEther(pos1.totalInvested), "TCENT");
  console.log("  User2 (NO-SECOND): shares=", ethers.utils.formatEther(pos2.noShares).padEnd(25), "invested=", ethers.utils.formatEther(pos2.totalInvested), "TCENT");
  console.log("  User3 (YES-LOSER): shares=", ethers.utils.formatEther(pos3.yesShares).padEnd(25), "invested=", ethers.utils.formatEther(pos3.totalInvested), "TCENT");

  // Resolve market - NO wins (outcome = 2)
  console.log("\n⚖️ Resolving market - NO wins...");
  await contract.resolveMarket(marketId, 2);

  // Expected calculation - based on SHARES percentage
  const yesPool = parseFloat(ethers.utils.formatEther(market.yesPool));
  const user1Shares = parseFloat(ethers.utils.formatEther(pos1.noShares));
  const user2Shares = parseFloat(ethers.utils.formatEther(pos2.noShares));
  const totalNoShares = parseFloat(ethers.utils.formatEther(market.totalNoShares));
  
  const user1SharePercent = user1Shares / totalNoShares * 100;
  const user2SharePercent = user2Shares / totalNoShares * 100;
  
  const user1LosingPoolShare = yesPool * (user1Shares / totalNoShares);
  const user2LosingPoolShare = yesPool * (user2Shares / totalNoShares);
  
  console.log("\n📋 Expected Payout Calculation (SHARE-based):");
  console.log("  YES Pool (losing):", yesPool.toFixed(2), "TCENT");
  console.log("  Total NO shares:", totalNoShares.toFixed(2));
  console.log("");
  console.log("  User1: " + user1Shares.toFixed(2) + " shares = " + user1SharePercent.toFixed(2) + "% of NO pool");
  console.log("  User1 investment back: ~9.8 TCENT");
  console.log("  User1 share of YES pool: " + user1LosingPoolShare.toFixed(4) + " TCENT (" + user1SharePercent.toFixed(2) + "% of " + yesPool.toFixed(2) + ")");
  console.log("  User1 gross: " + (9.8 + user1LosingPoolShare).toFixed(4) + " TCENT");
  console.log("  User1 after 2% fee: " + ((9.8 + user1LosingPoolShare) * 0.98).toFixed(4) + " TCENT");
  console.log("");
  console.log("  User2: " + user2Shares.toFixed(2) + " shares = " + user2SharePercent.toFixed(2) + "% of NO pool");
  console.log("  User2 investment back: ~9.8 TCENT");
  console.log("  User2 share of YES pool: " + user2LosingPoolShare.toFixed(4) + " TCENT (" + user2SharePercent.toFixed(2) + "% of " + yesPool.toFixed(2) + ")");
  console.log("  User2 gross: " + (9.8 + user2LosingPoolShare).toFixed(4) + " TCENT");
  console.log("  User2 after 2% fee: " + ((9.8 + user2LosingPoolShare) * 0.98).toFixed(4) + " TCENT");

  // User1 claims
  console.log("\n🎉 User1 claiming winnings...");
  const balBefore1 = await user1.getBalance();
  const claimTx1 = await contract.connect(user1).claimWinnings(marketId);
  const receipt1 = await claimTx1.wait();
  const balAfter1 = await user1.getBalance();
  const gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
  const actualPayout1 = balAfter1.sub(balBefore1).add(gasCost1);
  
  console.log("  User1 ACTUALLY received:", ethers.utils.formatEther(actualPayout1), "TCENT");

  // User2 claims
  console.log("\n🎉 User2 claiming winnings...");
  const balBefore2 = await user2.getBalance();
  const claimTx2 = await contract.connect(user2).claimWinnings(marketId);
  const receipt2 = await claimTx2.wait();
  const balAfter2 = await user2.getBalance();
  const gasCost2 = receipt2.gasUsed.mul(receipt2.effectiveGasPrice);
  const actualPayout2 = balAfter2.sub(balBefore2).add(gasCost2);
  
  console.log("  User2 ACTUALLY received:", ethers.utils.formatEther(actualPayout2), "TCENT");

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

  // Verify payouts match expectations
  console.log("\n" + "=".repeat(60));
  console.log("✅ VERIFICATION (SHARE-based payout):");
  console.log("=".repeat(60));
  const p1 = parseFloat(ethers.utils.formatEther(actualPayout1));
  const p2 = parseFloat(ethers.utils.formatEther(actualPayout2));
  const expected1 = (9.8 + user1LosingPoolShare) * 0.98;
  const expected2 = (9.8 + user2LosingPoolShare) * 0.98;
  
  console.log("  User1 has " + user1SharePercent.toFixed(2) + "% of shares → should get LESS of losing pool");
  console.log("  User2 has " + user2SharePercent.toFixed(2) + "% of shares → should get MORE of losing pool");
  console.log("");
  console.log("  User1 ACTUAL:   " + p1.toFixed(4) + " TCENT");
  console.log("  User1 EXPECTED: " + expected1.toFixed(4) + " TCENT");
  console.log("");
  console.log("  User2 ACTUAL:   " + p2.toFixed(4) + " TCENT");
  console.log("  User2 EXPECTED: " + expected2.toFixed(4) + " TCENT");
  console.log("");
  
  const diff1 = Math.abs(p1 - expected1);
  const diff2 = Math.abs(p2 - expected2);
  
  if (diff1 < 0.01 && diff2 < 0.01) {
    console.log("  ✅ PASS: Payouts match expected (SHARE-based)!");
    console.log("  User with MORE shares got MORE of the losing pool!");
  } else {
    console.log("  ❌ FAIL: Payouts don't match expected!");
    console.log("  Diff1: " + diff1.toFixed(4) + ", Diff2: " + diff2.toFixed(4));
  }

  console.log("\n✅ Test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

