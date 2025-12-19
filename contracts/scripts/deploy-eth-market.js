const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Deploying ETH Prediction Market Contract...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

    // Deploy ETH Prediction Market
    console.log("\n📊 Deploying ETH Prediction Market...");
    const ETHPredictionMarket = await ethers.getContractFactory("ETHPredictionMarket");
    
    // Constructor arguments: marketCreationFee, platformFeePercent, feeRecipient
    const marketCreationFeeArg = ethers.utils.parseEther("0.01"); // 0.01 TCENT
    const platformFeePercentArg = 200; // 2% in basis points (200 = 2%)
    const feeRecipientArg = process.env.VITE_SUBMISSION_FEE_RECIPIENT || "0xDe33759b16D40e49ab825B1faecac7bEBD62267D";
    
    console.log("Constructor arguments:");
    console.log("  Market Creation Fee:", ethers.utils.formatEther(marketCreationFeeArg), "TCENT");
    console.log("  Platform Fee:", platformFeePercentArg, "basis points (2%)");
    console.log("  Fee Recipient:", feeRecipientArg);
    
    const ethPredictionMarket = await ETHPredictionMarket.deploy(marketCreationFeeArg, platformFeePercentArg, feeRecipientArg);
    await ethPredictionMarket.deployed();

    console.log("✅ ETH Prediction Market deployed to:", ethPredictionMarket.address);

    // Get contract info
    const marketCreationFee = await ethPredictionMarket.marketCreationFee();
    const platformFeePercent = await ethPredictionMarket.platformFeePercent();

    console.log("\n📋 Contract Configuration:");
    console.log("Market Creation Fee:", ethers.utils.formatEther(marketCreationFee), "ETH");
    console.log("Platform Fee:", platformFeePercent.toString(), "basis points (", platformFeePercent.toNumber() / 100, "%)");

    // Get network info
    const network = await ethers.provider.getNetwork();
    
    // Save deployment info
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId,
        contracts: {
            ETHPredictionMarket: {
                address: ethPredictionMarket.address,
                deployer: deployer.address,
                deploymentBlock: ethPredictionMarket.deployTransaction.blockNumber,
                transactionHash: ethPredictionMarket.deployTransaction.hash
            }
        },
        config: {
            marketCreationFee: ethers.utils.formatEther(marketCreationFee),
            platformFeePercent: platformFeePercent.toString()
        },
        timestamp: new Date().toISOString()
    };

    // Save to deployments folder
    const fs = require("fs");
    const path = require("path");
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    const deploymentFile = path.join(deploymentsDir, `eth-${network.chainId}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("📁 Deployment info saved to:", deploymentFile);

    console.log("\n💾 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    console.log("\n🎉 Deployment completed successfully!");
    console.log("\n📝 Next steps:");
    console.log(`   1. Update VITE_CONTRACT_ADDRESS in your .env file: ${ethPredictionMarket.address}`);
    console.log(`   2. Send TCENT to the contract address to provide liquidity for payouts`);
    console.log(`   3. Check contract balance: npx hardhat run scripts/check-contract-balance.js --network incentiv ${ethPredictionMarket.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
