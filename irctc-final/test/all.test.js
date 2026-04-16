const { expect } = require("chai");
const { ethers }  = require("hardhat");

const FUTURE  = () => Math.floor(Date.now() / 1000) + 86400 * 60;
const ETH     = (n) => ethers.parseEther(String(n));
const TICKET  = ETH("0.01");

// ─────────────────────────────────────────────────────────────────
describe("BookingContract (v1 — original)", function () {
  let booking, owner, u1, u2, u3;

  before(async () => {
    [owner, u1, u2, u3] = await ethers.getSigners();
    booking = await (await ethers.getContractFactory("BookingContract")).deploy();
    await booking.verifyUser(u1.address);
    await booking.verifyUser(u2.address);
    await booking.setBookingWindow(u1.address, 0);
    await booking.setBookingWindow(u2.address, 0);
  });

  it("books a ticket successfully", async () => {
    await booking.connect(u1).bookTicket("12345","SL",45,FUTURE(),{value:TICKET});
    const ids = await booking.getUserTickets(u1.address);
    expect(ids.length).to.equal(1);
  });

  it("enforces max 2 tickets per wallet", async () => {
    await booking.connect(u1).bookTicket("12345","SL",46,FUTURE(),{value:TICKET});
    await expect(
      booking.connect(u1).bookTicket("12345","SL",47,FUTURE(),{value:TICKET})
    ).to.be.revertedWith("Booking limit reached");
  });

  it("rejects unverified user", async () => {
    await expect(
      booking.connect(u3).bookTicket("12345","SL",45,FUTURE(),{value:TICKET})
    ).to.be.revertedWith("User not KYC verified");
  });

  it("rejects wrong payment amount", async () => {
    await expect(
      booking.connect(u2).bookTicket("12345","SL",45,FUTURE(),{value:ETH("0.005")})
    ).to.be.revertedWith("Incorrect payment amount");
  });

  it("rejects booking before window opens", async () => {
    await booking.setBookingWindow(u2.address, Math.floor(Date.now()/1000)+86400);
    await expect(
      booking.connect(u2).bookTicket("12345","SL",45,FUTURE(),{value:TICKET})
    ).to.be.revertedWith("Booking window not open yet");
    await booking.setBookingWindow(u2.address, 0);
  });

  it("cancels and refunds correctly", async () => {
    const before = await ethers.provider.getBalance(u1.address);
    const tx     = await booking.connect(u1).cancelTicket(1);
    const rcpt   = await tx.wait();
    const gas    = rcpt.gasUsed * rcpt.gasPrice;
    const after  = await ethers.provider.getBalance(u1.address);
    expect(after + gas - before).to.equal(TICKET);
  });

  it("records audit trail on-chain", async () => {
    const [owners, actions] = await booking.getSeatHistory(1);
    expect(actions).to.include("BOOKED");
    expect(actions).to.include("CANCELLED");
  });

  it("prevents cancelling another user's ticket", async () => {
    await expect(booking.connect(u3).cancelTicket(2)).to.be.revertedWith("Not ticket owner");
  });

  it("scans QR (TTE verification)", async () => {
    await booking.scanQR(2);
    const t = await booking.getTicket(2);
    expect(t.qrScanned).to.be.true;
  });
});

// ─────────────────────────────────────────────────────────────────
describe("WLQueueContract", function () {
  let wl, owner, u1, u2;

  before(async () => {
    [owner, u1, u2] = await ethers.getSigners();
    wl = await (await ethers.getContractFactory("WLQueueContract")).deploy();
  });

  it("adds user to WL", async () => {
    await wl.connect(u1).joinWaitingList("12951","3A");
    expect(await wl.getWaitingListLength("12951")).to.equal(1n);
  });

  it("blocks duplicate WL entry", async () => {
    await expect(wl.connect(u1).joinWaitingList("12951","3A")).to.be.revertedWith("Already in WL");
  });

  it("upgrades first in line (FIFO)", async () => {
    await wl.connect(u2).joinWaitingList("12951","3A");
    const next = await wl.upgradeNextInLine.staticCall("12951");
    expect(next).to.equal(u1.address);
  });
});

// ─────────────────────────────────────────────────────────────────
describe("SwapContract", function () {
  let swap, owner, u1, u2;

  before(async () => {
    [owner, u1, u2] = await ethers.getSigners();
    swap = await (await ethers.getContractFactory("SwapContract")).deploy();
  });

  it("creates and executes an official swap", async () => {
    await swap.connect(u1).requestSwap(1, 2, u2.address);
    await swap.connect(u2).approveSwap(1);
    await swap.connect(owner).executeSwap(1);
    expect((await swap.getSwapRequest(1)).executed).to.be.true;
  });

  it("blocks swap without both approvals", async () => {
    await swap.connect(u1).requestSwap(3, 4, u2.address);
    await expect(swap.connect(owner).executeSwap(2)).to.be.revertedWith("Not approved by both");
  });
});

// ─────────────────────────────────────────────────────────────────
describe("DynamicPricingContract", function () {
  let pricing, owner;

  before(async () => {
    [owner] = await ethers.getSigners();
    pricing = await (await ethers.getContractFactory("DynamicPricingContract")).deploy();
  });

  it("prices NDLS→MMCT SL correctly", async () => {
    const [price, dist] = await pricing.previewPrice("NDLS","MMCT","SL",false,FUTURE());
    expect(Number(dist)).to.equal(1384);
    expect(price).to.be.gt(0n);
  });

  it("3A = 1.5x SL", async () => {
    const [sl] = await pricing.previewPrice("NDLS","MMCT","SL",false,FUTURE());
    const [a3] = await pricing.previewPrice("NDLS","MMCT","3A",false,FUTURE());
    expect(Number(a3 * 100n / sl)).to.be.closeTo(150, 5);
  });

  it("tatkal = +50%", async () => {
    const [norm] = await pricing.previewPrice("NDLS","MMCT","3A",false,FUTURE());
    const [tatk] = await pricing.previewPrice("NDLS","MMCT","3A",true, FUTURE());
    expect(Number(tatk * 100n / norm)).to.be.closeTo(150, 5);
  });

  it("returns 0 for unknown route", async () => {
    const [p] = await pricing.previewPrice("XYZ","ABC","SL",false,FUTURE());
    expect(p).to.equal(0n);
  });

  it("owner can add custom route", async () => {
    await pricing.setDistance("CUST1","CUST2",999);
    expect(await pricing.getDistance("CUST1","CUST2")).to.equal(999n);
  });
});

// ─────────────────────────────────────────────────────────────────
describe("NFTTicketContract (ERC-721)", function () {
  let nft, owner, u1;

  before(async () => {
    [owner, u1] = await ethers.getSigners();
    nft = await (await ethers.getContractFactory("NFTTicketContract")).deploy();
    await nft.setBookingContract(owner.address);
    await nft.setSwapContract(owner.address);
  });

  it("mints NFT with correct metadata", async () => {
    await nft.mintTicket(u1.address,"12951","Mumbai Rajdhani",
      "NDLS","MMCT","3A",45,"B1",FUTURE(),ETH("0.01"),"PNR12345678");
    const m = await nft.ticketData(1);
    expect(m.trainNumber).to.equal("12951");
    expect(m.pnr).to.equal("PNR12345678");
    expect(m.isValid).to.be.true;
  });

  it("tokenURI returns valid base64 JSON with SVG", async () => {
    const uri  = await nft.tokenURI(1);
    expect(uri).to.include("data:application/json;base64,");
    const json = JSON.parse(Buffer.from(uri.split(",")[1],"base64").toString());
    expect(json.name).to.include("PNR12345678");
    expect(json.image).to.include("data:image/svg+xml;base64,");
    const svg = Buffer.from(json.image.split(",")[1],"base64").toString();
    expect(svg).to.include("<svg");
    expect(svg).to.include("PNR12345678");
  });

  it("owner is u1 (wallet-bound)", async () => {
    expect(await nft.ownerOf(1)).to.equal(u1.address);
  });

  it("blocks transfer outside SwapContract", async () => {
    await expect(
      nft.connect(u1).transferFrom(u1.address, owner.address, 1)
    ).to.be.revertedWith("Tickets only transferable via SwapContract");
  });

  it("invalidates ticket on cancel", async () => {
    await nft.invalidateTicket(1,"Test cancel");
    expect((await nft.ticketData(1)).isValid).to.be.false;
  });

  it("lookup by PNR works", async () => {
    const nft2 = await (await ethers.getContractFactory("NFTTicketContract")).deploy();
    await nft2.setBookingContract(owner.address);
    await nft2.mintTicket(u1.address,"12951","MR","NDLS","MMCT","3A",1,"B1",FUTURE(),ETH("0.01"),"PNR99999999");
    const [m,id] = await nft2.getTicketByPNR("PNR99999999");
    expect(Number(id)).to.equal(1);
  });
});

// ─────────────────────────────────────────────────────────────────
describe("MultisigAdminWallet (2-of-3)", function () {
  let ms, o1, o2, o3, attacker;

  before(async () => {
    [o1, o2, o3, attacker] = await ethers.getSigners();
    ms = await (await ethers.getContractFactory("MultisigAdminWallet")).deploy(
      o1.address, o2.address, o3.address
    );
  });

  it("has 3 owners", async () => {
    expect(await ms.owners(0)).to.equal(o1.address);
    expect(await ms.owners(1)).to.equal(o2.address);
    expect(await ms.owners(2)).to.equal(o3.address);
  });

  it("non-owner cannot submit", async () => {
    await expect(
      ms.connect(attacker).submitTransaction(attacker.address,"0x",0,"Attack")
    ).to.be.revertedWith("Not owner");
  });

  it("executes after 2 signatures (2-of-3)", async () => {
    const id = await ms.connect(o1).submitTransaction.staticCall(o1.address,"0x",0,"Test");
    await ms.connect(o1).submitTransaction(o1.address,"0x",0,"Test");
    let [,,,,done] = await ms.getTransaction(id);
    expect(done).to.be.false;
    await ms.connect(o2).signTransaction(id);
    [,,,,done] = await ms.getTransaction(id);
    expect(done).to.be.true;
  });

  it("can revoke signature before execution", async () => {
    await ms.connect(o1).submitTransaction(o1.address,"0x",0,"Revoke test");
    const pending = await ms.getPendingTransactions();
    const id = pending[pending.length-1];
    await ms.connect(o1).revokeSignature(id);
    const [,,,,, ,] = await ms.getTransaction(id);
    const [,,,,sc] = await ms.getTransaction(id);
    expect(Number(sc)).to.equal(0);
  });
});

// ─────────────────────────────────────────────────────────────────
describe("BookingContractV2 (full integration)", function () {
  let bv2, nft, wl, pricing, swap;
  let owner, u1, u2, u3;

  before(async () => {
    [owner, u1, u2, u3] = await ethers.getSigners();

    pricing = await (await ethers.getContractFactory("DynamicPricingContract")).deploy();
    nft     = await (await ethers.getContractFactory("NFTTicketContract")).deploy();
    wl      = await (await ethers.getContractFactory("WLQueueContract")).deploy();
    swap    = await (await ethers.getContractFactory("SwapContract")).deploy();
    bv2     = await (await ethers.getContractFactory("BookingContractV2")).deploy();

    await bv2.setNFTContract(await nft.getAddress());
    await bv2.setWLContract(await wl.getAddress());
    await bv2.setPricingContract(await pricing.getAddress());
    await nft.setBookingContract(await bv2.getAddress());
    await nft.setSwapContract(await swap.getAddress());
    await wl.transferOwnership(await bv2.getAddress());

    await bv2.verifyUser(u1.address);
    await bv2.verifyUser(u2.address);
    await bv2.setBookingWindow(u1.address, 0);
    await bv2.setBookingWindow(u2.address, 0);

    const seats = Array.from({length:64},(_,i)=>i+1);
    const types = Array.from({length:64},(_,i)=>["LB","MB","UB","LB","MB","UB","SL","SU"][i%8]);
    await bv2.initCoach("12951","B1",seats,types);
  });

  it("books ticket with dynamic price and mints NFT", async () => {
    const [price] = await pricing.previewPrice("NDLS","MMCT","3A",false,FUTURE());
    const tx = await bv2.connect(u1).bookTicket(
      "12951","Mumbai Rajdhani","NDLS","MMCT","3A",1,"B1",FUTURE(),false,
      {value: price + ETH("0.001")}
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs
      .map(l=>{try{return bv2.interface.parseLog(l)}catch{return null}})
      .find(e=>e?.name==="TicketBooked");
    expect(ev).to.not.be.null;
    expect(ev.args[4]).to.match(/^\d{10}$/);
    expect(Number(ev.args[1])).to.be.gt(0); // nftTokenId
    console.log(`    PNR: ${ev.args[4]}, NFT: #${ev.args[1]}`);
  });

  it("seat map shows BOOKED after booking", async () => {
    const [statuses] = await bv2.getCoachSeatMap("12951","B1",[1,2,3]);
    expect(Number(statuses[0])).to.equal(1); // BOOKED
    expect(Number(statuses[1])).to.equal(0); // AVAILABLE
  });

  it("cancels with auto refund, triggers WL if applicable", async () => {
    const bal0 = await ethers.provider.getBalance(u1.address);
    const tx   = await bv2.connect(u1).cancelTicket(1);
    const rcpt = await tx.wait();
    const gas  = rcpt.gasUsed * rcpt.gasPrice;
    const bal1 = await ethers.provider.getBalance(u1.address);
    expect(bal1 + gas).to.be.gt(bal0); // got refund
  });

  it("seat is CANCELLED_AVAILABLE after cancel with no WL", async () => {
    const [st] = await bv2.getCoachSeatMap("12951","B1",[1]);
    expect(Number(st[0])).to.be.oneOf([1,2]); // BOOKED(WL took it) or CANCELLED_AVAILABLE
  });

  it("enforces booking limit = 2", async () => {
    const [price] = await pricing.previewPrice("NDLS","MMCT","3A",false,FUTURE());
    await bv2.connect(u1).bookTicket("12951","MR","NDLS","MMCT","3A",2,"B1",FUTURE(),false,{value:price+ETH("0.001")});
    await bv2.connect(u1).bookTicket("12951","MR","NDLS","MMCT","3A",3,"B1",FUTURE(),false,{value:price+ETH("0.001")});
    await expect(
      bv2.connect(u1).bookTicket("12951","MR","NDLS","MMCT","3A",4,"B1",FUTURE(),false,{value:price+ETH("0.001")})
    ).to.be.revertedWith("Booking limit reached");
  });

  it("blocks unverified user", async () => {
    const [price] = await pricing.previewPrice("NDLS","MMCT","3A",false,FUTURE());
    await expect(
      bv2.connect(u3).bookTicket("12951","MR","NDLS","MMCT","3A",5,"B1",FUTURE(),false,{value:price+ETH("0.001")})
    ).to.be.revertedWith("KYC not verified");
  });

  it("QR scan works and marks NFT as boarded", async () => {
    const ids = await bv2.getUserTickets(u2.address);
    if (ids.length === 0) {
      const [price] = await pricing.previewPrice("NDLS","MMCT","3A",false,FUTURE());
      await bv2.verifyUser(u2.address);
      await bv2.setBookingWindow(u2.address,0);
      await bv2.connect(u2).bookTicket("12951","MR","NDLS","MMCT","3A",10,"B1",FUTURE(),false,{value:price+ETH("0.001")});
    }
    const freshIds = await bv2.getUserTickets(u2.address);
    const tid = freshIds[freshIds.length-1];
    await bv2.connect(owner).scanQR(tid);
    const t = await bv2.getTicket(tid);
    expect(t.qrScanned).to.be.true;
  });
});
