const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  walletAddress: { type:String, required:true, unique:true, lowercase:true, trim:true },
  name:          { type:String, trim:true },
  aadhaarHash:   { type:String, unique:true, sparse:true },   // SHA-256 only, never raw
  maskedAadhaar: { type:String },                              // "XXXX XXXX 1234"
  isKYCVerified: { type:Boolean, default:false },
  kycVerifiedAt: { type:Date },
  kycProvider:   { type:String, enum:["DigiLocker","Mock"], default:"DigiLocker" },
  verificationId:{ type:String },
  onchainTxHash: { type:String },
  phone:         { type:String },
  email:         { type:String, lowercase:true },
}, { timestamps:true });

module.exports = mongoose.model("User", userSchema);
