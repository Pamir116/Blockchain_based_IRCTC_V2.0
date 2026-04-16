const crypto = require("crypto");

/**
 * DigiLocker / Aadhaar KYC service
 * DEV mode: mock accepts any 12-digit Aadhaar
 * PROD mode: set DIGILOCKER_CLIENT_ID + SECRET in .env
 */
async function verifyKYC(aadhaarNumber, name, dob) {
  if (!aadhaarNumber || aadhaarNumber.replace(/\s/g,"").length !== 12) {
    return { verified: false, error: "Aadhaar must be 12 digits" };
  }
  const clean = aadhaarNumber.replace(/\s/g,"");
  if (isNaN(clean)) return { verified: false, error: "Aadhaar must contain only digits" };

  const salt       = process.env.KYC_SALT || "irctc_blockchain_salt";
  const aadhaarHash = crypto.createHash("sha256").update(clean + salt).digest("hex");

  // In production: replace this block with real DigiLocker OAuth2 API call
  const isProd = process.env.NODE_ENV === "production"
              && process.env.DIGILOCKER_CLIENT_ID
              && process.env.DIGILOCKER_CLIENT_ID !== "";

  if (isProd) {
    // TODO: real DigiLocker OAuth2 flow
    // 1. Redirect user to getAuthorizationURL()
    // 2. Exchange code for token
    // 3. Fetch Aadhaar XML
    // 4. Parse and verify
    return { verified: false, error: "Production DigiLocker not configured" };
  }

  // Development/Demo mock
  console.log(`[KYC] MOCK verify: ${clean.slice(0,4)}XXXX${clean.slice(-4)} → hash:${aadhaarHash.slice(0,12)}...`);
  return {
    verified:       true,
    aadhaarHash,
    maskedAadhaar:  `XXXX XXXX ${clean.slice(-4)}`,
    name:           name || "Verified User",
    verificationId: "MOCK_" + Date.now(),
  };
}

async function isDuplicateAadhaar(aadhaarHash, UserModel) {
  try {
    const found = await UserModel.findOne({ aadhaarHash });
    return !!found;
  } catch { return false; }
}

module.exports = { verifyKYC, isDuplicateAadhaar };
