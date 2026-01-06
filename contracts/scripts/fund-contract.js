const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const contractAddress = '0xB09FADEE5E095fDC9238445FB5d3188B26c2f4B2';
  const fundAmount = ethers.utils.parseEther("200"); // Send 200 TCENT
  
  console.log("💰 Funding contract with TCENT...\n");
  
  const [signer] = await ethers.getSigners();
  console.log("Sender:", signer.address);
  console.log("Sender balance:", ethers.utils.formatEther(await signer.getBalance()), "TCENT");
  
  // Check contract balance before
  const balanceBefore = await ethers.provider.getBalance(contractAddress);
  console.log("\nContract balance BEFORE:", ethers.utils.formatEther(balanceBefore), "TCENT");
  
  // Send TCENT to contract
  console.log("\nSending", ethers.utils.formatEther(fundAmount), "TCENT to contract...");
  const tx = await signer.sendTransaction({
    to: contractAddress,
    value: fundAmount
  });
  await tx.wait();
  console.log("Transaction hash:", tx.hash);
  
  // Check contract balance after
  const balanceAfter = await ethers.provider.getBalance(contractAddress);
  console.log("\nContract balance AFTER:", ethers.utils.formatEther(balanceAfter), "TCENT");
  
  console.log("\n✅ Contract funded! Claims should work now.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

