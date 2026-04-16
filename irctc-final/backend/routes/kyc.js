const express    = require("express");
const { ethers } = require("ethers");
const crypto     = require("crypto");
const User       = require("../models/User");
const { verifyKYC, isDuplicateAadhaar } = require("../services/digilocker");
const router     = express.Router();

// In-memory OTP store: aadhaarHash -> { otp, name, dob, expiresAt }
const otpStore = new Map();

const fs   = require("fs");
const path = require("path");

// Re-read files on every call so redeployment doesn't require a backend restart
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

// POST /api/kyc/send-otp  — Step 1: generate & send OTP
router.post("/send-otp", async (req, res) => {
  const { walletAddress, aadhaarNumber, name, dob } = req.body;
  if (!walletAddress || !aadhaarNumber)
    return res.status(400).json({ error: "walletAddress and aadhaarNumber required" });
  if (!ethers.isAddress(walletAddress))
    return res.status(400).json({ error: "Invalid wallet address" });

  const clean = aadhaarNumber.replace(/\s/g, "");
  if (clean.length !== 12 || isNaN(clean))
    return res.status(400).json({ error: "Aadhaar must be exactly 12 digits" });
  if (!name?.trim())
    return res.status(400).json({ error: "Name is required" });
  if (!dob)
    return res.status(400).json({ error: "Date of birth is required" });

  try {
    // Already verified?
    const existing = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    if (existing?.isKYCVerified)
      return res.json({ success: true, alreadyVerified: true,
        message: "Already KYC verified", maskedAadhaar: existing.maskedAadhaar });

    const salt        = process.env.KYC_SALT || "irctc_blockchain_salt";
    const aadhaarHash = crypto.createHash("sha256").update(clean + salt).digest("hex");

    // Check duplicate Aadhaar across wallets
    const dup = await User.findOne({ aadhaarHash });
    if (dup && dup.walletAddress !== walletAddress.toLowerCase())
      return res.status(400).json({ error: "Aadhaar already linked to another wallet" });

    // Generate 6-digit OTP, expire in 5 minutes
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(aadhaarHash, { otp, name: name.trim(), dob, walletAddress: walletAddress.toLowerCase(),
                                aadhaarHash, clean, expiresAt: Date.now() + 5 * 60 * 1000 });

    // In production: send SMS via UIDAI API or Twilio/MSG91
    // In dev: print to console
    const masked = `XXXX XXXX ${clean.slice(-4)}`;
    console.log(`\n┌─────────────────────────────────────┐`);
    console.log(`│  AADHAAR OTP (DEV — would be SMS)   │`);
    console.log(`│  Wallet : ${walletAddress.slice(0,16)}...   │`);
    console.log(`│  Aadhaar: ${masked}              │`);
    console.log(`│  OTP    : ${otp}   (expires 5 min)  │`);
    console.log(`└─────────────────────────────────────┘\n`);

    return res.json({ success: true, maskedAadhaar: masked,
      message: `OTP sent to mobile linked with Aadhaar ${masked}`,
      // In dev mode expose OTP so frontend can show it (remove in production!)
      devOtp: process.env.NODE_ENV !== "production" ? otp : undefined });
  } catch (err) {
    console.error("[KYC OTP] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/verify  — Step 2: verify OTP and complete KYC
router.post("/verify", async (req, res) => {
  const { walletAddress, aadhaarNumber, name, dob, otp } = req.body;
  if (!walletAddress || !aadhaarNumber)
    return res.status(400).json({ error: "walletAddress and aadhaarNumber required" });
  if (!ethers.isAddress(walletAddress))
    return res.status(400).json({ error: "Invalid wallet address" });

  try {
    // Already verified in DB?
    const existing = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    if (existing?.isKYCVerified) {
      // Re-sync on-chain in case contracts were redeployed
      const contract = getContract();
      if (contract) {
        const onChain = await contract.verifiedUsers(walletAddress).catch(() => false);
        if (!onChain) {
          try {
            const tx = await contract.verifyUser(walletAddress);
            await tx.wait();
            await contract.setBookingWindow(walletAddress, 0).then(t => t.wait()).catch(()=>{});
            console.log(`[KYC] Re-synced on-chain for ${walletAddress}`);
          } catch (e) { console.warn("[KYC] Re-sync failed:", e.message); }
        }
      }
      return res.json({ success:true, message:"Already KYC verified", alreadyVerified:true,
                        maskedAadhaar: existing.maskedAadhaar, name: existing.name });
    }

    // OTP-based verification
    const clean = aadhaarNumber.replace(/\s/g, "");
    const salt        = process.env.KYC_SALT || "irctc_blockchain_salt";
    const aadhaarHash = crypto.createHash("sha256").update(clean + salt).digest("hex");

    if (otp) {
      // Verify OTP from store
      const stored = otpStore.get(aadhaarHash);
      if (!stored)
        return res.status(400).json({ error: "OTP not found — please request a new OTP" });
      if (Date.now() > stored.expiresAt)
        return res.status(400).json({ error: "OTP has expired — please request a new one" });
      if (stored.otp !== otp.trim())
        return res.status(400).json({ error: "Incorrect OTP — please try again" });
      if (stored.walletAddress !== walletAddress.toLowerCase())
        return res.status(400).json({ error: "OTP was not issued for this wallet" });

      // OTP valid — clear it
      otpStore.delete(aadhaarHash);

      // Check duplicate Aadhaar
      if (await isDuplicateAadhaar(aadhaarHash, User))
        return res.status(400).json({ error: "Aadhaar already linked to another wallet" });

      // Build kyc object from stored data
      var kyc = { verified: true, aadhaarHash,
        maskedAadhaar: `XXXX XXXX ${clean.slice(-4)}`,
        name: stored.name, verificationId: "OTP_" + Date.now() };
    } else {
      // Fallback: original DigiLocker mock (no OTP provided)
      const kyc2 = await verifyKYC(aadhaarNumber, name, dob);
      if (!kyc2.verified) return res.status(400).json({ error: kyc2.error });
      if (await isDuplicateAadhaar(kyc2.aadhaarHash, User))
        return res.status(400).json({ error: "Aadhaar already linked to another wallet" });
      var kyc = kyc2;
    }

    // On-chain
    let txHash = null;
    const contract = getContract();
    if (contract) {
      try {
        const tx  = await contract.verifyUser(walletAddress);
        await tx.wait();
        txHash = tx.hash;
        const tx2 = await contract.setBookingWindow(walletAddress, 0);
        await tx2.wait();
        console.log(`[KYC] On-chain verified: ${walletAddress} tx:${txHash}`);
      } catch (e) {
        console.warn("[KYC] Contract call failed (may already be verified):", e.message);
      }
    }

    // Save to DB
    await User.findOneAndUpdate(
      { walletAddress: walletAddress.toLowerCase() },
      { walletAddress: walletAddress.toLowerCase(), name: name||kyc.name,
        aadhaarHash: kyc.aadhaarHash, maskedAadhaar: kyc.maskedAadhaar,
        isKYCVerified: true, kycVerifiedAt: new Date(),
        kycProvider: "DigiLocker", verificationId: kyc.verificationId,
        onchainTxHash: txHash },
      { upsert:true, new:true }
    );

    return res.json({
      success: true, message: "KYC verified and recorded on blockchain",
      walletAddress, maskedAadhaar: kyc.maskedAadhaar,
      name: name||kyc.name, txHash,
      aadhaarHashPreview: kyc.aadhaarHash.slice(0,16)+"...",
    });
  } catch (err) {
    console.error("[KYC] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/status/:wallet
router.get("/status/:wallet", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  try {
    const user     = await User.findOne({ walletAddress: wallet });
    const contract = getContract();
    if (user?.isKYCVerified) {
      // Auto re-sync on-chain if contracts were redeployed
      if (contract) {
        const onChain = await contract.verifiedUsers(wallet).catch(() => false);
        if (!onChain) {
          try {
            await (await contract.verifyUser(wallet)).wait();
            await (await contract.setBookingWindow(wallet, 0)).wait();
            console.log(`[KYC] Auto re-synced on-chain for ${wallet}`);
          } catch (e) { console.warn("[KYC] Re-sync skipped:", e.message.slice(0,60)); }
        }
      }
      return res.json({ wallet, isVerified:true, name:user.name,
                        maskedAadhaar:user.maskedAadhaar,
                        verifiedAt:user.kycVerifiedAt, source:"database" });
    }
    if (contract) {
      const onChain = await contract.verifiedUsers(wallet);
      return res.json({ wallet, isVerified:onChain, source:"blockchain" });
    }
    res.json({ wallet, isVerified:false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
