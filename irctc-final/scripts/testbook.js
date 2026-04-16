const { ethers } = require("hardhat");
async function main() {
  const addrs   = require("../backend/contractAddresses.json");
  const abiBook = require("../frontend/src/abi/BookingContractV2.json");
  const abiPric = require("../frontend/src/abi/DynamicPricingContract.json");
  const [deployer] = await ethers.getSigners();

  const pricing  = await ethers.getContractAt(abiPric, addrs.DynamicPricingContract, deployer);
  const booking  = await ethers.getContractAt(abiBook, addrs.BookingContractV2, deployer);

  const journeyTs = BigInt(Math.floor(Date.now()/1000) + 86400 * 30);
  const [price]   = await pricing.previewPrice("NDLS","MMCT","3A",false,journeyTs);
  console.log("Contract price:", ethers.formatEther(price), "ETH");

  const tx = await booking.bookTicket(
    "12951","Mumbai Rajdhani","NDLS","MMCT","3A",1,"B1",journeyTs,false,
    { value: price + ethers.parseEther("0.001") }
  );
  const rcpt = await tx.wait();
  console.log("✅ Booking SUCCESS! tx:", tx.hash);
  console.log("Active bookings after:", (await booking.activeBookingCount(deployer.address)).toString());
  console.log("Next ticket ID:", (await booking.nextTicketId()).toString());
}
main().catch(console.error);
