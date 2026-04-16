# 🚂 IRCTC Blockchain — Combined v1 + v2

**Blockchain-based fraud-free Indian railway ticket booking system.**
Full stack: Solidity + React + Node.js + MongoDB + Polygon.

---

## ✅ What's in this project

| Feature | Contract / File |
|---|---|
| Core ticket booking (v1) | `BookingContract.sol` |
| NFT tickets (ERC-721) | `NFTTicketContract.sol` |
| Dynamic pricing (distance + class + tatkal) | `DynamicPricingContract.sol` |
| Waiting list FIFO auto-upgrade | `WLQueueContract.sol` |
| Official swap only (no black market) | `SwapContract.sol` |
| Payment escrow | `PaymentContract.sol` |
| 2-of-3 multisig admin | `MultisigAdminWallet.sol` |
| Visual 3-Tier AC seat map | `SeatMap.jsx` |
| Book ticket (3-step flow) | `BookTicket.jsx` |
| My tickets + QR codes + audit trail | `MyTickets.jsx` |
| NFT ticket art viewer | `AllComponents.jsx → NFTViewer` |
| Waiting list UI | `AllComponents.jsx → WaitingList` |
| Swap ticket UI | `AllComponents.jsx → SwapTicket` |
| TTE QR scanner | `AllComponents.jsx → TTEScanner` |
| Multisig admin panel | `AllComponents.jsx → MultisigAdmin` |
| DigiLocker KYC (mock in dev) | `backend/services/digilocker.js` |
| Auto WL upgrade event listener | `backend/listeners/wlUpgrader.js` |
| Train search (20 real routes) | `backend/routes/trains.js` |

---

## 🚀 COMPLETE SETUP — STEP BY STEP

### PREREQUISITES

Install these before starting:

```
1. Node.js v18+      → https://nodejs.org
   Verify: node --version   (must show v18 or higher)

2. MetaMask          → https://metamask.io  (Chrome/Firefox/Brave extension)

3. MongoDB           → https://www.mongodb.com/try/download/community
   (optional — app still works on blockchain without it)

4. Git               → https://git-scm.com
```

---

### STEP 1 — Enter the project folder

```bash
cd irctc-blockchain-combined
```

---

### STEP 2 — Install root (Hardhat) dependencies

```bash
npm install
```

Expected: installs Hardhat, OpenZeppelin, toolbox.

---

### STEP 3 — Set up your .env file

```bash
cp .env.example .env
```

Now open `.env` and fill in `PRIVATE_KEY`:

**How to get PRIVATE_KEY from MetaMask:**
```
1. Open MetaMask browser extension
2. Click the 3-dot menu ⋮ next to your account name
3. Click "Account Details"
4. Click "Show Private Key"
5. Type your MetaMask password
6. Copy the key shown (starts with 0x...)
7. In .env, set:  PRIVATE_KEY=0x...paste_here...
```

⚠️ NEVER share this key. Never commit .env to git.

---

### STEP 4 — Compile the smart contracts

```bash
npx hardhat compile
```

Expected output:
```
Compiled 8 Solidity files successfully (evm target: paris).
```

If errors appear:
```bash
npm install @openzeppelin/contracts
npx hardhat compile
```

---

### STEP 5 — Run all tests

```bash
npx hardhat test
```

Expected: **All tests passing**
```
BookingContract (v1)       8 passing
WLQueueContract            3 passing
SwapContract               2 passing
DynamicPricingContract     5 passing
NFTTicketContract (ERC-721) 6 passing
MultisigAdminWallet        4 passing
BookingContractV2          6 passing
                    ──────────────
                    34 tests passing
```

---

### STEP 6 — Start the local blockchain

Open a **new terminal window** (keep it open the whole time):

```bash
npx hardhat node
```

You will see test accounts with 10,000 ETH each. Copy the first private key shown — you'll use it in MetaMask.

---

### STEP 7 — Add Hardhat network to MetaMask

```
1. Open MetaMask
2. Click the network dropdown (top center, shows "Ethereum Mainnet")
3. Click "Add Network" → "Add Network Manually"
4. Fill these exact values:
   Network Name:    Hardhat Localhost
   RPC URL:         http://127.0.0.1:8545
   Chain ID:        1337
   Currency Symbol: ETH
5. Click Save
6. Switch MetaMask to "Hardhat Localhost"

7. Import test account:
   - Click your account icon (top right of MetaMask)
   - Click "Import Account"
   - Choose "Private Key"
   - Paste the FIRST private key from `npx hardhat node` output:
     0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   - Click Import
   → You now have 10,000 test ETH
```

---

### STEP 8 — Deploy all contracts

In your **original terminal** (not the hardhat node terminal):

```bash
npx hardhat run scripts/deploy.js --network localhost
```

Expected output:
```
═══════════════════════════════════════════════════════════
  IRCTC Blockchain — Combined v1 + v2 Full Deployment
═══════════════════════════════════════════════════════════
  Deploying DynamicPricingContract... ✅ 0x5FbDB...
  Deploying NFTTicketContract...      ✅ 0xe7f17...
  Deploying WLQueueContract...        ✅ 0x9fE46...
  Deploying BookingContract...        ✅ 0xCf7Ed...
  Deploying BookingContractV2...      ✅ 0xDc64a...
  Deploying SwapContract...           ✅ 0x5FC8d...
  Deploying MultisigAdminWallet...    ✅ 0xa513E...
  Deploying PaymentContract...        ✅ 0x2279B...

  Wiring contracts together...
  ✅ BookingV2 → NFT + WL + Pricing
  ✅ NFT → BookingV2 + Swap
  ✅ WLQueue ownership → BookingV2

  Seeding coach data...
  Train 12951 Coach B1 (64 seats) ✅
  Train 12951 Coach B2 (64 seats) ✅
  Train 12951 Coach A1 (64 seats) ✅
  Train 12301 Coach B1 (64 seats) ✅
  Train 12621 Coach S1 (64 seats) ✅
  Train 12621 Coach B1 (64 seats) ✅

  ✅ 8 ABIs saved to frontend/src/abi/
  ✅ Addresses saved to frontend/src/abi/addresses.json
  ✅ Addresses saved to backend/contractAddresses.json

  ALL CONTRACTS DEPLOYED, WIRED & SEEDED
═══════════════════════════════════════════════════════════
```

---

### STEP 9 — Install and start the backend

Open a **new terminal**:

```bash
cd backend
npm install
node server.js
```

Expected:
```
═══════════════════════════════════════════════════════════
  IRCTC Blockchain — Backend  :5000
═══════════════════════════════════════════════════════════
✅ MongoDB connected
[WLUpgrader] 🎧 Listening for TicketCancelled events...
```

If MongoDB is not installed, the warning is fine. KYC still works via blockchain.

---

### STEP 10 — Install and start the frontend

Open a **new terminal**:

```bash
cd frontend
npm install
npm start
```

Browser opens at: **http://localhost:3000**

---

## 🎯 HOW TO USE THE APP

### Full booking flow:

```
1. 🔐 KYC TAB
   → Enter name, Aadhaar (any 12 digits for testing), date of birth
   → Click "Verify KYC via Aadhaar"
   → Approve MetaMask transaction
   → Wait for ✅ confirmation

2. 🗺️ SEAT MAP TAB  
   → Train "12951" is pre-seeded with coaches B1, B2, A1
   → Green seats = available, grey = booked, yellow = just freed
   → Click any available seat to select it

3. 🎟️ BOOK TAB
   → Set from/to station (NDLS, MMCT, MAS, etc.)
   → Select class (SL, 3A, 2A, 1A)
   → Pick date
   → Click an available seat on the map
   → Click "Book This Seat →"
   → Review price (calculated dynamically from distance + class)
   → Click "Confirm & Book (Mint NFT)"
   → Approve MetaMask → Wait for blockchain
   → PNR number shown 🎉

4. 📋 MY TICKETS TAB
   → See all your tickets with QR codes
   → View on-chain audit trail
   → Cancel ticket (refund sent automatically)

5. 🎨 NFT TAB
   → Enter your PNR
   → See your beautiful on-chain SVG ticket art
   → Load all your NFTs in the collection view

6. ⏳ WAITING LIST TAB
   → Enter train number, click "Join Waiting List"
   → See your position in the FIFO queue
   → When someone cancels → you auto-upgrade instantly

7. 🔄 SWAP TAB
   → Enter your ticket ID + other party's ticket + their wallet
   → They approve → admin executes
   → Official transfer only, no black market possible

8. 📱 TTE TAB
   → Paste QR payload from passenger's QR code
   → Verifies on blockchain — only scannable once
   → Detects duplicates automatically

9. 🔑 MULTISIG TAB (owner wallets only)
   → Propose admin actions (KYC verify, booking windows)
   → Requires 2 of 3 owners to sign before execution
```

---

## 🌐 DEPLOY TO POLYGON AMOY TESTNET

### Get free test MATIC:
```
1. https://faucet.polygon.technology  (select "Polygon Amoy")
2. https://www.alchemy.com/faucets/polygon-amoy
3. Paste your MetaMask address → receive 0.5 MATIC (free)
```

### Add Amoy to MetaMask:
```
Network Name:  Polygon Amoy Testnet
RPC URL:       https://rpc-amoy.polygon.technology
Chain ID:      80002
Symbol:        MATIC
Explorer:      https://amoy.polygonscan.com
```

### Deploy:
```bash
# In .env, set POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
# Make sure PRIVATE_KEY is your real MetaMask key with MATIC

npx hardhat run scripts/deploy.js --network amoy
```

---

## 📁 PROJECT STRUCTURE

```
irctc-blockchain-combined/
├── contracts/
│   ├── BookingContract.sol          v1 original — flat ticket booking
│   ├── BookingContractV2.sol        v2 — NFT + seat map + dynamic price + auto WL
│   ├── NFTTicketContract.sol        ERC-721 — on-chain SVG ticket art
│   ├── DynamicPricingContract.sol   On-chain price formula
│   ├── WLQueueContract.sol          FIFO auto-upgrade waiting list
│   ├── SwapContract.sol             Official ticket transfer only
│   ├── PaymentContract.sol          Escrow: hold → release/refund
│   └── MultisigAdminWallet.sol      2-of-3 — no single corrupt admin
├── scripts/
│   └── deploy.js                   Deploys all 8 + wires + seeds 6 coaches
├── test/
│   └── all.test.js                 34 tests — all contracts
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── App.jsx                 9 tabs, wallet connection
│       ├── components/
│       │   ├── KYCVerify.jsx       DigiLocker KYC form
│       │   ├── BookTicket.jsx      3-step booking with seat map
│       │   ├── SeatMap.jsx         Visual 3AC seat map (live status)
│       │   ├── MyTickets.jsx       Tickets + QR + audit trail
│       │   └── AllComponents.jsx   NFTViewer, WaitingList, SwapTicket,
│       │                           TTEScanner, MultisigAdmin
│       └── utils/
│           ├── web3.js             MetaMask connect + network switch
│           └── contract.js         All contract instances
├── backend/
│   ├── server.js                   Express app
│   ├── routes/
│   │   ├── kyc.js                  DigiLocker + on-chain verify
│   │   ├── qr.js                   QR generate + TTE verify
│   │   └── trains.js               20 real Indian train routes
│   ├── services/
│   │   └── digilocker.js           KYC service (mock in dev)
│   ├── listeners/
│   │   └── wlUpgrader.js           Auto WL event listener
│   └── models/
│       └── User.js                 MongoDB user model
├── hardhat.config.js
├── package.json
└── .env.example
```

---

## 🔧 TROUBLESHOOTING

**MetaMask not connecting:**
→ Make sure you switched to "Hardhat Localhost" (Chain ID: 1337)
→ Make sure `npx hardhat node` is still running in its terminal

**"Contract not deployed" error:**
→ Run `npx hardhat run scripts/deploy.js --network localhost` again
→ Contracts reset every time hardhat node restarts

**"KYC not verified" when booking:**
→ Complete KYC in the 🔐 tab first
→ Make sure backend is running on port 5000

**"Insufficient funds" in MetaMask:**
→ Import the test account private key from hardhat node output

**After restarting hardhat node:**
→ Redeploy: `npx hardhat run scripts/deploy.js --network localhost`
→ Reset MetaMask: Settings → Advanced → Reset Account

**MongoDB warning:**
→ Optional — install from https://www.mongodb.com/try/download/community
→ App works without it (blockchain operations don't need it)

**Frontend not seeing contracts:**
→ Check `frontend/src/abi/addresses.json` exists (created by deploy)
→ If missing, redeploy contracts

---

## 🛡️ FRAUD PREVENTION — HOW EACH ATTACK IS STOPPED

| Attack | Prevention | Where |
|---|---|---|
| Agent bulk booking | MAX 2 per verified wallet | `BookingContractV2.sol:45` |
| Bot booking at window open | Randomized `bookingWindowOpen` | `BookingContractV2.sol:52` |
| Fake cancellations | Tamper-proof on-chain `cancelTicket()` | `BookingContractV2.sol:92` |
| Multiple fake accounts | 1 Aadhaar hash = 1 wallet | `kyc.js:isDuplicateAadhaar()` |
| Black market resale | NFT wallet-bound, SwapContract only | `NFTTicketContract.sol:_update()` |
| Chart manipulation | WL auto-upgraded by event, no human | `WLQueueContract.sol + wlUpgrader.js` |
| Corrupt single admin | 2-of-3 multisig required | `MultisigAdminWallet.sol` |
| No audit trail | Every action in `SeatHistory` | `BookingContractV2.sol:SeatHistory` |
| Seat opacity | Live visual seat map on-chain state | `SeatMap.jsx` |
| Price manipulation | Formula locked in contract | `DynamicPricingContract.sol` |
| Ticket duplication | Wallet-linked QR + on-chain `scanQR()` | `qr.js + BookingContractV2.sol` |
| No-show hoarding | 20% penalty post-departure | `BookingContract.sol:applyNoShowPenalty()` |
