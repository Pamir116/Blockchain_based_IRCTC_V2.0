const { ethers } = require("hardhat");
async function main() {
  const wallet = process.env.TARGET_WALLET || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const addrs  = require("../backend/contractAddresses.json");
  const abi    = require("../frontend/src/abi/BookingContractV2.json");
  const [deployer] = await ethers.getSigners();
  const c = await ethers.getContractAt(abi, addrs.BookingContractV2, deployer);

  console.log("Granting on-chain KYC for:", wallet);
  const tx1 = await c.verifyUser(wallet);
  await tx1.wait();
  console.log("verifyUser tx:", tx1.hash);

  const tx2 = await c.setBookingWindow(wallet, 0);
  await tx2.wait();
  console.log("setBookingWindow tx:", tx2.hash);

  console.log("isKYCVerified now:", await c.verifiedUsers(wallet));
}
main().catch(console.error);
