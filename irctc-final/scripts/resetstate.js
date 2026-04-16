const { ethers } = require("hardhat");
async function main() {
  const addrs   = require("../backend/contractAddresses.json");
  const abiBook = require("../frontend/src/abi/BookingContractV2.json");
  const [deployer] = await ethers.getSigners();
  const c = await ethers.getContractAt(abiBook, addrs.BookingContractV2, deployer);

  // Cancel ticket #1 (the test booking we made)
  try {
    const ticket = await c.getTicket(1);
    if (!ticket.isCancelled && ticket.passenger.toLowerCase() === deployer.address.toLowerCase()) {
      const tx = await c.cancelTicket(1);
      await tx.wait();
      console.log("✅ Cancelled test ticket #1");
    } else {
      console.log("Ticket #1 already cancelled or not ours");
    }
  } catch(e) { console.log("Cancel error:", e.message.slice(0,100)); }

  console.log("Active bookings now:", (await c.activeBookingCount(deployer.address)).toString());
  console.log("nextTicketId:", (await c.nextTicketId()).toString());
}
main().catch(console.error);
