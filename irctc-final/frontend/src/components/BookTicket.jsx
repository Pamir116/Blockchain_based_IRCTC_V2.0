import React, { useState, useEffect, useRef } from "react";
import { ethers }       from "ethers";
import { connectWallet } from "../utils/web3";
import { addresses, BookingV2ABI, PricingABI } from "../utils/contract";
import SeatMap           from "./SeatMap";
import axios             from "axios";

const BACKEND  = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const LOCK_TTL = 5 * 60; // 5 minutes in seconds

export default function BookTicket({ walletAddress }) {
  const [step,       setStep]       = useState(1);
  const [selInfo,    setSelInfo]    = useState(null);
  const [status,     setStatus]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [pnr,        setPNR]        = useState(null);
  const [lockSecs,   setLockSecs]   = useState(null);  // countdown seconds, null = no lock
  const [lockExpired,setLockExpired]= useState(false);
  const timerRef = useRef(null);

  // Start countdown when step 2 opens with a valid lock
  useEffect(() => {
    if (step === 2 && lockSecs !== null && lockSecs > 0) {
      setLockExpired(false);
      timerRef.current = setInterval(() => {
        setLockSecs(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setLockExpired(true);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [step, lockSecs !== null]); // eslint-disable-line

  function fmtCountdown(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  async function handleSeatSelect(info) {
    if (!info) return;
    // Lock the seat on the backend for 5 minutes
    try {
      const journeyTs = info.date
        ? Math.floor(new Date(info.date).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400 * 30;
      const dateKey = Math.floor(journeyTs / 86400) * 86400;

      const res = await axios.post(`${BACKEND}/api/seatlock/lock`, {
        train: info.train, coach: info.coach,
        seat: info.number, dateKey,
        wallet: walletAddress,
      });

      if (!res.data.ok) {
        // Seat locked by someone else
        alert(`Seat is reserved by another passenger. Try again in ${res.data.remainingSecs}s.`);
        return;
      }
      setSelInfo({ ...info, dateKey, lockId: res.data.lockId });
      setLockSecs(LOCK_TTL);
      setLockExpired(false);
      setStep(2);
    } catch {
      // If backend lock fails (network issue), still allow booking
      setSelInfo(info);
      setLockSecs(null);
      setStep(2);
    }
  }

  async function releaseAndGoBack() {
    if (selInfo?.dateKey) {
      axios.delete(`${BACKEND}/api/seatlock/unlock`, {
        data: { train: selInfo.train, coach: selInfo.coach,
                seat: selInfo.number, dateKey: selInfo.dateKey,
                wallet: walletAddress }
      }).catch(() => {});
    }
    clearInterval(timerRef.current);
    setStep(1); setSelInfo(null); setStatus(""); setLockSecs(null); setLockExpired(false);
  }

  async function handleBook() {
    if (!selInfo || !walletAddress) return;
    try {
      setLoading(true);
      setStatus("🔍 Checking KYC...");
      const kycRes = await axios.get(`${BACKEND}/api/kyc/status/${walletAddress}`);
      if (!kycRes.data.isVerified) { setStatus("❌ Not KYC verified. Go to KYC tab first."); return; }

      const { signer, provider } = await connectWallet();
      const contract   = new ethers.Contract(addresses.BookingContractV2, BookingV2ABI, signer);
      const journeyTs  = selInfo.date ? Math.floor(new Date(selInfo.date).getTime()/1000) : Math.floor(Date.now()/1000)+86400*30;
      const trainName  = selInfo.trainName || selInfo.train;
      const fromSt     = selInfo.from  || "NDLS";
      const toSt       = selInfo.to    || "BCT";
      const seatClass  = selInfo.class || selInfo.berthType || "3A";

      // Fetch actual price from the pricing contract on-chain
      setStatus("💰 Fetching price from contract...");
      let priceWei = ethers.parseEther("0.05"); // safe fallback
      try {
        if (addresses.DynamicPricingContract) {
          const pricing = new ethers.Contract(addresses.DynamicPricingContract, PricingABI, provider);
          const [p] = await pricing.previewPrice(fromSt, toSt, seatClass, selInfo.tatkal || false, BigInt(journeyTs));
          if (p > 0n) priceWei = p;
          setStatus(`💰 Price: ${ethers.formatEther(priceWei)} ETH — confirm in MetaMask`);
        }
      } catch(priceErr) {
        setStatus(`💰 Using fallback price: 0.05 ETH — confirm in MetaMask`);
        console.warn("Price fetch failed:", priceErr.message);
      }

      const totalValue = priceWei + ethers.parseEther("0.001");
      console.log("Booking params:", { train: selInfo.train, seat: selInfo.number, coach: selInfo.coach, fromSt, toSt, seatClass, journeyTs, value: ethers.formatEther(totalValue) });

      const tx = await contract.bookTicket(
        selInfo.train, trainName,
        fromSt, toSt,
        seatClass,
        selInfo.number,
        selInfo.coach,
        journeyTs,
        selInfo.tatkal || false,
        { value: totalValue }
      );
      setStatus("⏳ Waiting for blockchain...");
      const rcpt = await tx.wait();

      let bookedPNR = "Check My Tickets tab";
      const iface  = new ethers.Interface(BookingV2ABI);
      for (const log of rcpt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "TicketBooked") { bookedPNR = parsed.args[4]; break; }
        } catch {}
      }
      // Release the backend lock — seat is now on-chain booked
      if (selInfo?.dateKey) {
        axios.delete(`${BACKEND}/api/seatlock/unlock`, {
          data: { train: selInfo.train, coach: selInfo.coach,
                  seat: selInfo.number, dateKey: selInfo.dateKey,
                  wallet: walletAddress }
        }).catch(() => {});
      }
      clearInterval(timerRef.current);
      setPNR(bookedPNR);
      setStatus(`✅ Booked! PNR: ${bookedPNR}`);
      setStep(3);
    } catch (err) {
      console.error("Booking error full:", err);
      const msg = err?.reason || err?.data?.message || err?.message || "Unknown error";
      if (msg.includes("Booking limit"))      setStatus("❌ Max 2 active tickets reached");
      else if (msg.includes("KYC"))           setStatus("❌ KYC not verified on-chain");
      else if (msg.includes("rejected"))      setStatus("❌ Transaction rejected in MetaMask");
      else if (msg.includes("Seat not"))      setStatus("❌ Seat already booked — pick another seat");
      else if (msg.includes("Insufficient"))  setStatus("❌ Insufficient payment — refreshing price, try again");
      else if (msg.includes("nonce"))         setStatus("❌ Nonce error — reset MetaMask account (Settings→Advanced→Reset Account)");
      else if (msg.includes("window"))        setStatus("❌ Booking window not open yet");
      else setStatus(`❌ ${msg.slice(0, 120)}`);
    } finally { setLoading(false); }
  }

  // ── Step 1: Seat Map ──────────────────────────────────────────────
  if (step === 1) return (
    <div>
      <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10,
                    padding:"10px 16px", marginBottom:14, fontSize:13, color:"#1d4ed8" }}>
        🗺️ <strong>Step 1:</strong> Select train → coach → click an available seat → click "Book This Seat →"
      </div>
      <SeatMap walletAddress={walletAddress} onSeatSelect={handleSeatSelect} />
    </div>
  );

  // ── Step 2: Confirm ───────────────────────────────────────────────
  if (step === 2 && selInfo) return (
    <div style={{ maxWidth:500, margin:"0 auto" }}>
      <button onClick={releaseAndGoBack} style={{ marginBottom:16, padding:"6px 14px", background:"#f3f4f6",
        border:"1px solid #d1d5db", borderRadius:6, cursor:"pointer", fontSize:13 }}>
        ← Back to Seat Map
      </button>

      {/* Seat lock countdown */}
      {lockSecs !== null && !lockExpired && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                      background:"#fff7ed", border:"2px solid #f97316", borderRadius:10,
                      padding:"10px 16px", marginBottom:14, fontSize:13 }}>
          <div>
            <span style={{ fontWeight:700, color:"#c2410c" }}>🔒 Seat reserved for you</span>
            <span style={{ color:"#9a3412", marginLeft:8 }}>Complete payment before time runs out</span>
          </div>
          <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:700,
                        color: lockSecs <= 60 ? "#dc2626" : "#ea580c",
                        background:"#ffedd5", borderRadius:6, padding:"2px 12px" }}>
            {fmtCountdown(lockSecs)}
          </div>
        </div>
      )}
      {lockExpired && (
        <div style={{ background:"#fef2f2", border:"2px solid #f87171", borderRadius:10,
                      padding:"10px 16px", marginBottom:14, fontSize:13, color:"#991b1b",
                      display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span>⏰ Seat reservation expired — seat may have been taken.</span>
          <button onClick={releaseAndGoBack} style={{ padding:"4px 12px", background:"#dc2626",
            color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
            Pick Again
          </button>
        </div>
      )}

      {/* Ticket preview */}
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#1e40af)", borderRadius:16,
                    padding:22, color:"#fff", marginBottom:16 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", letterSpacing:2, marginBottom:10 }}>BOOKING SUMMARY</div>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{selInfo.trainName||selInfo.train}</div>
        <div style={{ fontSize:13, color:"#93c5fd", marginBottom:16 }}>Train {selInfo.train}</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18 }}>
          <div><div style={{ fontSize:10, color:"rgba(255,255,255,0.5)" }}>FROM</div>
               <div style={{ fontSize:24, fontWeight:700 }}>{selInfo.from||"—"}</div></div>
          <div style={{ fontSize:22, color:"#93c5fd" }}>→</div>
          <div style={{ textAlign:"right" }}><div style={{ fontSize:10, color:"rgba(255,255,255,0.5)" }}>TO</div>
               <div style={{ fontSize:24, fontWeight:700 }}>{selInfo.to||"—"}</div></div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
          {[["DATE",selInfo.date||"—"],["CLASS",selInfo.class||selInfo.berthType],["SEAT",`${selInfo.coach}-${selInfo.number}`]].map(([l,v])=>(
            <div key={l} style={{ background:"rgba(255,255,255,0.1)", borderRadius:8, padding:"8px 10px" }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.5)" }}>{l}</div>
              <div style={{ fontSize:14, fontWeight:700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Price breakdown */}
      {selInfo.price && (
        <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:13 }}>
            <span>Base fare ({selInfo.price.km} km, {selInfo.class})</span>
            <span>{selInfo.price.matic} MATIC</span>
          </div>
          {selInfo.tatkal && (
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#dc2626", marginBottom:4 }}>
              <span>Tatkal surcharge (+50%)</span><span>included</span>
            </div>
          )}
          <div style={{ borderTop:"1px solid #bbf7d0", paddingTop:8, display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontWeight:700 }}>Total</span>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:20, fontWeight:700, color:"#166534" }}>{selInfo.price.matic} MATIC</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>≈ ₹{selInfo.price.inr}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:10,
                    padding:12, marginBottom:16, fontSize:13, color:"#7c3aed" }}>
        🎨 Your ticket will be minted as an <strong>ERC-721 NFT</strong> on blockchain — viewable in MetaMask & OpenSea.
      </div>

      <button onClick={handleBook} disabled={loading || lockExpired} style={{
        width:"100%", padding:"14px 0",
        background: (loading || lockExpired) ? "#9ca3af" : "linear-gradient(135deg,#2563eb,#1e40af)",
        color:"#fff", border:"none", borderRadius:10,
        cursor: (loading || lockExpired) ? "not-allowed" : "pointer", fontSize:16, fontWeight:700,
      }}>
        {loading ? "⏳ Processing on Blockchain..." : lockExpired ? "⏰ Reservation Expired — Go Back" : "🎟️ Confirm & Book (Mint NFT)"}
      </button>

      {status && (
        <div style={{ marginTop:12, padding:"10px 14px", borderRadius:8, fontSize:13,
          background: status.startsWith("✅")?"#f0fdf4":status.startsWith("❌")?"#fef2f2":"#fffbeb" }}>
          {status}
        </div>
      )}
    </div>
  );

  // ── Step 3: Success ───────────────────────────────────────────────
  if (step === 3) return (
    <div style={{ textAlign:"center", padding:"2rem 1rem" }}>
      <div style={{ fontSize:60, marginBottom:16 }}>🎉</div>
      <h2 style={{ color:"#166534", margin:"0 0 8px" }}>Ticket Booked!</h2>
      <p style={{ color:"#6b7280", marginBottom:20 }}>Your NFT ticket has been minted on the blockchain.</p>
      <div style={{ background:"#f0fdf4", border:"2px solid #22c55e", borderRadius:14,
                    padding:20, marginBottom:24, display:"inline-block" }}>
        <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>YOUR PNR NUMBER</div>
        <div style={{ fontSize:30, fontWeight:700, color:"#166534", letterSpacing:4, fontFamily:"monospace" }}>{pnr}</div>
        <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>Save this PNR — use it to view your NFT ticket</div>
      </div>
      <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
        <button onClick={()=>{setStep(1);setSelInfo(null);setStatus("");setPNR(null);}}
          style={{ padding:"10px 20px", background:"#2563eb", color:"#fff",
            border:"none", borderRadius:8, cursor:"pointer", fontWeight:600 }}>
          Book Another Ticket
        </button>
      </div>
    </div>
  );

  return null;
}
