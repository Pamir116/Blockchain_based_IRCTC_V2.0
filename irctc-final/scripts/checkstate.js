const { ethers } = require("hardhat");
async function main() {
  const wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const addrs  = require("../backend/contractAddresses.json");
  const abi    = require("../frontend/src/abi/BookingContractV2.json");
  const c      = await ethers.getContractAt(abi, addrs.BookingContractV2);
  console.log("activeBookingCount :", (await c.activeBookingCount(wallet)).toString());
  console.log("isKYCVerified      :", await c.verifiedUsers(wallet));
  console.log("bookingWindowOpen  :", (await c.bookingWindowOpen(wallet)).toString());
  console.log("nextTicketId       :", (await c.nextTicketId()).toString());
}
main().catch(console.error);
