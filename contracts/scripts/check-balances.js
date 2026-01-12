const { ethers } = require("hardhat");

async function main() {
  console.log("💰 Checking contract balances...\n");

  // Check multiple possible contract addresses
  const contracts = [
    { name: 'New Contract (with fix)', address: '0x1391b2B2eBDF166480b964c16c51c9B0DEe96404' },
    { name: 'Old Contract 1', address: '0xDe33759b16D40e49ab825B1faecac7bEBD62267D' },
    { name: 'Old Contract 2', address: '0x8cF17Ff1Abe81B5c74f78edb62b0AeF31936642C' },
  ];

  for (const contract of contracts) {
    try {
      const balance = await ethers.provider.getBalance(contract.address);
      console.log(`${contract.name}:`);
      console.log(`  Address: ${contract.address}`);
      console.log(`  Balance: ${ethers.utils.formatEther(balance)} TCENT`);
      console.log('');
    } catch (err) {
      console.log(`${contract.name}: Error - ${err.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

