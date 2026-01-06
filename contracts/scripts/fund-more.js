const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const contractAddress = '0xB09FADEE5E095fDC9238445FB5d3188B26c2f4B2';
  const fundAmount = ethers.utils.parseEther("300");
  
  const [signer] = await ethers.getSigners();
  console.log("Funding contract with 300 more TCENT...");
  
  const balBefore = await ethers.provider.getBalance(contractAddress);
  console.log("Before:", ethers.utils.formatEther(balBefore), "TCENT");
  
  const tx = await signer.sendTransaction({ to: contractAddress, value: fundAmount });
  await tx.wait();
  
  const balAfter = await ethers.provider.getBalance(contractAddress);
  console.log("After:", ethers.utils.formatEther(balAfter), "TCENT");
  console.log("✅ Done!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
