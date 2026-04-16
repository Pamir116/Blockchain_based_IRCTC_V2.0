const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const owner2   = signers[1] || signers[0];
  const owner3   = signers[2] || signers[0];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  IRCTC Blockchain — Combined v1 + v2 Full Deployment");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Deployer :", deployer.address);
  console.log("Balance  :", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const D = {}; // deployed addresses

  async function deploy(name, ...args) {
    process.stdout.write(`  Deploying ${name}... `);
    const F = await ethers.getContractFactory(name);
    const c = await F.deploy(...args);
    await c.waitForDeployment();
    D[name] = await c.getAddress();
    console.log("✅", D[name]);
    return c;
  }

  // ── 1. Shared contracts ───────────────────────────────────────────
  console.log("\n[1/3] Shared contracts");
  const pricing  = await deploy("DynamicPricingContract");
  const nft      = await deploy("NFTTicketContract");
  const wlQueue  = await deploy("WLQueueContract");
  const swap     = await deploy("SwapContract");
  const payment  = await deploy("PaymentContract");
  const multisig = await deploy("MultisigAdminWallet",
    deployer.address, owner2.address, owner3.address);

  // ── 2. Booking contracts ──────────────────────────────────────────
  console.log("\n[2/3] Booking contracts");
  const bookingV1 = await deploy("BookingContract");
  const bookingV2 = await deploy("BookingContractV2");

  // ── 3. Wire up ────────────────────────────────────────────────────
  console.log("\n[3/3] Wiring contracts together...");

  await (await bookingV2.setNFTContract(D.NFTTicketContract)).wait();
  await (await bookingV2.setWLContract(D.WLQueueContract)).wait();
  await (await bookingV2.setPricingContract(D.DynamicPricingContract)).wait();
  console.log("  ✅ BookingV2 → NFT + WL + Pricing");

  await (await nft.setBookingContract(D.BookingContractV2)).wait();
  await (await nft.setSwapContract(D.SwapContract)).wait();
  console.log("  ✅ NFT → BookingV2 + Swap");

  await (await wlQueue.transferOwnership(D.BookingContractV2)).wait();
  console.log("  ✅ WLQueue ownership → BookingV2");

  // ── Seed train coaches (multiple coaches for demo) ────────────────
  console.log("\n  Seeding coach data...");
  const berths8 = ["LB","MB","UB","LB","MB","UB","SL","SU"];

  async function seedCoach(train, coach) {
    const seats = []; const types = [];
    for (let bay = 0; bay < 8; bay++) {
      for (let b = 0; b < 8; b++) {
        seats.push(bay * 8 + b + 1);
        types.push(berths8[b]);
      }
    }
    await (await bookingV2.initCoach(train, coach, seats, types)).wait();
    process.stdout.write(`    Train ${train} Coach ${coach} (64 seats) ✅\n`);
  }

  await seedCoach("12951", "B1");
  await seedCoach("12951", "B2");
  await seedCoach("12951", "A1");
  await seedCoach("12301", "B1");
  await seedCoach("12621", "S1");
  await seedCoach("12621", "B1");
  console.log("  ✅ 6 coaches seeded across 3 trains");

  // ── Save addresses ────────────────────────────────────────────────
  const network = (await ethers.provider.getNetwork()).name;
  const output  = {
    ...D,
    network,
    deployedAt:     new Date().toISOString(),
    deployer:       deployer.address,
    multisigOwners: [deployer.address, owner2.address, owner3.address],
  };

  const frontendAbi = path.join(__dirname, "../frontend/src/abi");
  const backendDir  = path.join(__dirname, "../backend");
  if (!fs.existsSync(frontendAbi)) fs.mkdirSync(frontendAbi, { recursive: true });
  if (!fs.existsSync(backendDir))  fs.mkdirSync(backendDir,  { recursive: true });

  fs.writeFileSync(path.join(frontendAbi, "addresses.json"), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(backendDir,  "contractAddresses.json"), JSON.stringify(output, null, 2));

  // Copy ABIs to frontend
  const contracts = [
    "BookingContract","BookingContractV2","NFTTicketContract",
    "WLQueueContract","SwapContract","PaymentContract",
    "DynamicPricingContract","MultisigAdminWallet",
  ];
  let abiCount = 0;
  for (const name of contracts) {
    const ap = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
    if (fs.existsSync(ap)) {
      const abi = JSON.parse(fs.readFileSync(ap, "utf8")).abi;
      fs.writeFileSync(path.join(frontendAbi, `${name}.json`), JSON.stringify(abi, null, 2));
      abiCount++;
    }
  }

  console.log(`\n  ✅ ${abiCount} ABIs saved to frontend/src/abi/`);
  console.log("  ✅ Addresses saved to frontend/src/abi/addresses.json");
  console.log("  ✅ Addresses saved to backend/contractAddresses.json");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ALL CONTRACTS DEPLOYED, WIRED & SEEDED");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
