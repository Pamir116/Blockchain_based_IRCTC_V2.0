/**
 * Patches missing station distances on the already-deployed DynamicPricingContract.
 * Run: npx hardhat run scripts/patchdistances.js --network localhost
 */
const { ethers } = require("hardhat");

const ROUTES = [
  // Delhi -> Mumbai (BCT = Mumbai Central in new dataset)
  ["NDLS","BCT",1384], ["NZM","BCT",1400], ["DEE","BDTS",1430],
  // Delhi -> other cities
  ["NDLS","MAS",2175], ["NZM","MAS",2200],
  ["NDLS","HWH",1447], ["NZM","HWH",1450],
  ["NDLS","SBC",2150], ["NZM","SBC",2150],
  ["NDLS","HYB",1661], ["NZM","HYB",1661],
  ["NDLS","PNBE",1001],["NDLS","LKO",498],
  ["NDLS","JP",308],   ["NDLS","ADI",935],
  ["NDLS","BPL",702],  ["NDLS","SDAH",1453],
  ["NDLS","CDG",243],  ["NDLS","AGC",195],
  ["NDLS","ASR",447],  ["NDLS","CNB",440],
  ["NDLS","GKP",762],  ["NDLS","DBG",1082],
  // Mumbai -> other cities
  ["BCT","MAS",1279],  ["BCT","SBC",1006],
  ["BCT","PUNE",192],  ["BCT","HYB",711],
  ["BDTS","DEE",1430], ["BDTS","NZM",1430],
  // South India
  ["MAS","SBC",362],   ["MAS","HYB",794],
  ["SBC","HYB",574],   ["MAS","ERS",640],
  // East India
  ["HWH","PNBE",530],
  // Jaipur -> Mumbai
  ["JP","BCT",1207],   ["JP","BDTS",1220],
  ["JP","PUNE",1399],  ["JP","SBC",2060],
  ["JP","MAS",2174],
];

async function main() {
  const addresses = require("../backend/contractAddresses.json");
  const [deployer] = await ethers.getSigners();

  const contract = await ethers.getContractAt(
    "DynamicPricingContract",
    addresses.DynamicPricingContract,
    deployer
  );

  console.log(`Patching distances on ${addresses.DynamicPricingContract}...`);

  for (const [from, to, km] of ROUTES) {
    const existing = await contract.getDistance(from, to);
    if (existing.toString() === "0") {
      const tx = await contract.setDistance(from, to, km);
      await tx.wait();
      console.log(`  ✅ ${from} <-> ${to}: ${km} km`);
    } else {
      console.log(`  ⏭  ${from} <-> ${to}: already set (${existing} km)`);
    }
  }

  console.log("\nDone. Testing a few prices:");
  const ts = Math.floor(Date.now() / 1000);
  for (const [from, to] of [["NDLS","BCT"],["JP","BCT"],["NZM","SBC"]]) {
    const [price] = await contract.previewPrice(from, to, "3A", false, ts);
    console.log(`  ${from} -> ${to} 3A: ${ethers.formatEther(price)} MATIC`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
