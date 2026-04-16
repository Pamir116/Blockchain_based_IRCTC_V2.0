const express    = require("express");
const QRCode     = require("qrcode");
const { ethers } = require("ethers");
const router     = express.Router();

const fs   = require("fs");
const path = require("path");

function getContract() {
  try {
    if (!process.env.PRIVATE_KEY) return null;
    const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, "../contractAddresses.json"), "utf8"));
    const ABI       = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/src/abi/BookingContractV2.json"), "utf8"));
    if (!addresses?.BookingContractV2) return null;
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "http://127.0.0.1:8545");
    const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    return new ethers.Contract(addresses.BookingContractV2, ABI, wallet);
  } catch { return null; }
}

// POST /api/qr/generate
router.post("/generate", async (req, res) => {
  const { ticketId, walletAddress, trainNumber, pnr, seatNumber, coachNumber } = req.body;
  if (!ticketId || !walletAddress) return res.status(400).json({ error: "ticketId and walletAddress required" });
  const payload = JSON.stringify({ ticketId, walletAddress, trainNumber, pnr, seatNumber, coachNumber, ts: Date.now(), v:"v2" });
  try {
    const qrImage = await QRCode.toDataURL(payload, { width:300, margin:2, color:{ dark:"#1e3a5f", light:"#ffffff" } });
    res.json({ qrImage, payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qr/verify — TTE app
router.post("/verify", async (req, res) => {
  const { qrPayload } = req.body;
  if (!qrPayload) return res.status(400).json({ error: "qrPayload required" });
  try {
    const data     = typeof qrPayload === "string" ? JSON.parse(qrPayload) : qrPayload;
    const contract = getContract();
    if (!contract) return res.json({ valid:true, offlineMode:true, data });

    const ticket = await contract.getTicket(data.ticketId);
    if (ticket.isCancelled) return res.json({ valid:false, reason:"Ticket cancelled" });
    if (ticket.qrScanned)   return res.json({ valid:false, reason:"Already scanned — possible duplicate" });
    if (ticket.passenger.toLowerCase() !== data.walletAddress.toLowerCase())
      return res.json({ valid:false, reason:"Wallet mismatch — counterfeit ticket" });

    const tx = await contract.scanQR(data.ticketId);
    await tx.wait();
    res.json({
      valid: true,
      ticket: {
        ticketId:    data.ticketId,
        pnr:         data.pnr || ticket.pnr,
        passenger:   ticket.passenger,
        trainNumber: ticket.trainNumber,
        seatType:    ticket.seatType,
        seatNumber:  ticket.seatNumber.toString(),
        coachNumber: ticket.coachNumber,
        journeyDate: new Date(Number(ticket.journeyDate)*1000).toLocaleDateString("en-IN"),
      },
      scanTxHash: tx.hash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
