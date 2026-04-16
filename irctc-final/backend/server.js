require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const { startWLUpgrader } = require("./listeners/wlUpgrader");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: ["http://localhost:3000","http://127.0.0.1:3000"] }));
app.use(express.json());
app.use((req,_,next) => { console.log(`[${new Date().toTimeString().slice(0,8)}] ${req.method} ${req.path}`); next(); });

app.use("/api/kyc",      require("./routes/kyc"));
app.use("/api/qr",       require("./routes/qr"));
app.use("/api/trains",   require("./routes/trains"));
app.use("/api/seatlock", require("./routes/seatlock"));

app.get("/health", (_,res) => res.json({
  status:"ok", version:"2.0",
  features:["KYC-DigiLocker","NFT-ERC721","DynamicPricing","Multisig","AutoWL","SeatMap"],
  timestamp: new Date().toISOString(),
}));

// MongoDB (optional — blockchain works without it)
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/irctc-blockchain")
  .then(() => console.log("✅ MongoDB connected"))
  .catch(e  => console.warn("⚠️  MongoDB not connected (blockchain still works):", e.message));

app.listen(PORT, async () => {
  console.log("═══════════════════════════════════════════════════");
  console.log(`  IRCTC Blockchain — Backend  :${PORT}`);
  console.log("═══════════════════════════════════════════════════");
  console.log("  POST /api/kyc/verify         KYC via DigiLocker");
  console.log("  GET  /api/kyc/status/:wallet Check KYC status");
  console.log("  POST /api/qr/generate        Generate QR");
  console.log("  POST /api/qr/verify          TTE verify QR");
  console.log("  GET  /api/trains/search      Search trains");
  console.log("  POST /api/seatlock/lock      Lock seat for 5 min");
  console.log("  GET  /health                 Health check");
  console.log("═══════════════════════════════════════════════════");
  await startWLUpgrader().catch(e => console.warn("WL listener:", e.message));
});
