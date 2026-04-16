const { ethers } = require("ethers");
const path = require("path");

let BookingV2ABI, addresses;
try {
  BookingV2ABI = require(path.join(__dirname,"../../frontend/src/abi/BookingContractV2.json"));
  addresses    = require(path.join(__dirname,"../contractAddresses.json"));
} catch { BookingV2ABI = null; addresses = null; }

async function notifyPassenger(wallet, train, msg) {
  // Replace with Twilio SMS / Firebase in production
  console.log(`[WL-Notify] 📱 ${wallet.slice(0,10)}... Train:${train} — ${msg}`);
}

async function startWLUpgrader() {
  if (!addresses?.BookingContractV2 || !BookingV2ABI) {
    console.log("[WLUpgrader] Contracts not deployed yet — skipping listener");
    return;
  }
  if (!process.env.PRIVATE_KEY) {
    console.log("[WLUpgrader] No PRIVATE_KEY — skipping event listener");
    return;
  }

  const rpc      = process.env.POLYGON_RPC_URL || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpc);
  const contract = new ethers.Contract(addresses.BookingContractV2, BookingV2ABI, provider);

  console.log("[WLUpgrader] 🎧 Listening for TicketCancelled + WLAutoUpgraded events...");

  // Use polling instead of eth_getFilterChanges (avoids ethers v6 + Hardhat null-result bug)
  let lastBlock = await provider.getBlockNumber();

  const iface = new ethers.Interface(BookingV2ABI);
  const topics = {
    TicketCancelled:   iface.getEvent("TicketCancelled").topicHash,
    WLAutoUpgraded:    iface.getEvent("WLAutoUpgraded").topicHash,
    SeatStatusChanged: iface.getEvent("SeatStatusChanged").topicHash,
  };
  const labels = ["AVAILABLE","BOOKED","CANCELLED_AVAILABLE","WL"];

  async function pollEvents() {
    try {
      const current = await provider.getBlockNumber();
      if (current <= lastBlock) return;

      const logs = await provider.getLogs({
        address:   addresses.BookingContractV2,
        fromBlock: lastBlock + 1,
        toBlock:   current,
      });

      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;

          if (parsed.name === "TicketCancelled") {
            const [ticketId, passenger, refund, upgraded] = parsed.args;
            console.log(`[WLUpgrader] 🔔 Ticket #${ticketId} cancelled by ${passenger.slice(0,10)}...`);
            console.log(`[WLUpgrader]    Refund: ${ethers.formatEther(refund)} MATIC`);
            if (upgraded && upgraded !== ethers.ZeroAddress) {
              console.log(`[WLUpgrader] ✅ WL auto-upgraded: ${upgraded}`);
              await notifyPassenger(upgraded, "unknown", "Your WL ticket is now CONFIRMED!");
            }
          } else if (parsed.name === "WLAutoUpgraded") {
            const [trainNumber, passenger] = parsed.args;
            console.log(`[WLUpgrader] 🎯 Train ${trainNumber} → ${passenger.slice(0,10)}...`);
            await notifyPassenger(passenger, trainNumber,
              `Your WL seat on train ${trainNumber} is now CONFIRMED!`);
          } else if (parsed.name === "SeatStatusChanged") {
            const [train, coach, seat, status] = parsed.args;
            console.log(`[WLUpgrader] 🪑 ${train}/${coach}/seat${seat} → ${labels[Number(status)]}`);
          }
        } catch { /* skip unparseable logs */ }
      }

      lastBlock = current;
    } catch (e) {
      console.error("[WLUpgrader] Poll error:", e.message.slice(0, 60));
    }
  }

  // Poll every 15 seconds for new events
  setInterval(pollEvents, 15000);

  // Heartbeat every 60 seconds
  setInterval(async () => {
    try {
      const block = await provider.getBlockNumber();
      console.log(`[WLUpgrader] 💓 block #${block}`);
    } catch (e) {
      console.error("[WLUpgrader] Provider lost:", e.message);
    }
  }, 60000);
}

module.exports = { startWLUpgrader };
