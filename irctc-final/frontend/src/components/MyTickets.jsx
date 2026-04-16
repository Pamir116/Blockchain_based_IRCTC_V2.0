import React, { useState, useEffect } from "react";
import { ethers }       from "ethers";
import { connectWallet } from "../utils/web3";
import { addresses, BookingV2ABI } from "../utils/contract";
import QRCode            from "qrcode";
import axios             from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

export default function MyTickets({ walletAddress }) {
  const [tickets,  setTickets]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [cancelMsg,setCancelMsg]= useState("");
  const [expanded, setExpanded] = useState(null);

  async function getContract(write=false) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const s = write ? await provider.getSigner() : provider;
    return new ethers.Contract(addresses.BookingContractV2, BookingV2ABI, s);
  }

  async function load() {
    if (!walletAddress || !addresses.BookingContractV2 || !window.ethereum) return;
    setLoading(true);
    try {
      const c   = await getContract();
      const ids = await c.getUserTickets(walletAddress);
      const out = [];
      for (const id of [...ids].reverse()) {
        const t = await c.getTicket(id);
        const [owners, actions, timestamps] = await c.getSeatHistory(id);

        let qrImg = "";
        try {
          const { data } = await axios.post(`${BACKEND}/api/qr/generate`, {
            ticketId: id.toString(), walletAddress,
            trainNumber: t.trainNumber, pnr: t.pnr,
            seatNumber: t.seatNumber.toString(), coachNumber: t.coachNumber,
          });
          qrImg = data.qrImage;
        } catch {
          qrImg = await QRCode.toDataURL(
            JSON.stringify({ ticketId:id.toString(), pnr:t.pnr, passenger:t.passenger }),
            { width:140, color:{ dark:"#1e3a5f" } }
          );
        }

        out.push({
          id: id.toString(), nftTokenId: t.nftTokenId?.toString(),
          passenger: t.passenger, trainNumber: t.trainNumber,
          fromStation: t.fromStation, toStation: t.toStation,
          seatType: t.seatType, seatNumber: t.seatNumber.toString(),
          coachNumber: t.coachNumber,
          journeyDate: t.journeyDate > 0n
            ? new Date(Number(t.journeyDate)*1000).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})
            : "—",
          pricePaid: ethers.formatEther(t.pricePaid),
          isConfirmed: t.isConfirmed, isCancelled: t.isCancelled,
          qrScanned: t.qrScanned, isTatkal: t.isTatkal,
          pnr: t.pnr || "—", qrImg,
          history: actions.map((a,i)=>({
            action:a, owner:owners[i],
            time: new Date(Number(timestamps[i])*1000).toLocaleString("en-IN"),
          })),
        });
      }
      setTickets(out);
    } catch (e) { console.error("Load tickets:", e.message); }
    setLoading(false);
  }

  async function cancel(id) {
    if (!window.confirm("Cancel this ticket? Refund sent instantly to your wallet.")) return;
    setCancelMsg("⏳ Cancelling...");
    try {
      const c  = await getContract(true);
      const tx = await c.cancelTicket(id);
      setCancelMsg("⏳ Waiting for blockchain...");
      await tx.wait();
      setCancelMsg(`✅ Ticket #${id} cancelled. Refund sent!`);
      load();
    } catch (e) { setCancelMsg(`❌ ${e.message.slice(0,70)}`); }
  }

  useEffect(()=>{ load(); }, [walletAddress]);

  if (!walletAddress) return <p style={{ color:"#9ca3af" }}>Connect wallet to view tickets.</p>;

  function badge(t) {
    if (t.isCancelled) return { label:"Cancelled",  bg:"#fee2e2", color:"#dc2626" };
    if (t.qrScanned)   return { label:"Boarded ✓",  bg:"#dcfce7", color:"#16a34a" };
    if (t.isTatkal)    return { label:"Tatkal",      bg:"#fef3c7", color:"#d97706" };
    if (t.isConfirmed) return { label:"Confirmed",   bg:"#dbeafe", color:"#2563eb" };
    return               { label:"Pending",           bg:"#f3f4f6", color:"#6b7280" };
  }

  return (
    <div>
      {cancelMsg && (
        <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:14, fontSize:13,
          background: cancelMsg.startsWith("✅")?"#f0fdf4":cancelMsg.startsWith("❌")?"#fef2f2":"#fffbeb" }}>
          {cancelMsg}
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:13, color:"#6b7280" }}>{tickets.length} ticket(s)</span>
        <button onClick={load} style={{ padding:"5px 12px", fontSize:12, background:"#f3f4f6",
          border:"1px solid #d1d5db", borderRadius:6, cursor:"pointer" }}>
          {loading?"Loading...":"↻ Refresh"}
        </button>
      </div>

      {tickets.length===0 && !loading && (
        <div style={{ textAlign:"center", padding:"3rem", color:"#9ca3af" }}>
          No tickets yet. Go to "🗺️ Book" tab to book your first ticket!
        </div>
      )}

      {tickets.map(t => {
        const b = badge(t);
        const exp = expanded===t.id;
        return (
          <div key={t.id} style={{ border:"1px solid #e5e7eb", borderRadius:14,
            marginBottom:14, background:"#fff", opacity:t.isCancelled?0.72:1 }}>
            {/* Header */}
            <div style={{
              background: t.isCancelled?"#f9fafb":"linear-gradient(135deg,#1e3a5f,#1e40af)",
              padding:"14px 16px", borderRadius:"14px 14px 0 0",
              display:"flex", justifyContent:"space-between", alignItems:"flex-start",
            }}>
              <div>
                <div style={{ fontSize:12, color:t.isCancelled?"#6b7280":"rgba(255,255,255,0.6)", marginBottom:2 }}>
                  Train {t.trainNumber}
                </div>
                <div style={{ fontSize:18, fontWeight:700, color:t.isCancelled?"#111":"#fff" }}>
                  {t.fromStation||"—"} → {t.toStation||"—"}
                </div>
                <div style={{ fontSize:12, color:t.isCancelled?"#6b7280":"rgba(255,255,255,0.65)", marginTop:2 }}>
                  {t.journeyDate} · {t.coachNumber}-{t.seatNumber} ({t.seatType})
                  {t.isTatkal && " · Tatkal"}
                </div>
              </div>
              <span style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700,
                              background:b.bg, color:b.color, whiteSpace:"nowrap" }}>
                {b.label}
              </span>
            </div>

            {/* PNR + QR row */}
            <div style={{ padding:"12px 16px", display:"flex", gap:14, alignItems:"center" }}>
              <img src={t.qrImg} alt="QR" style={{ width:76, height:76, borderRadius:6,
                border:"1px solid #e5e7eb", flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, color:"#9ca3af", marginBottom:2 }}>PNR NUMBER</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#1e3a5f", letterSpacing:2,
                               fontFamily:"monospace", wordBreak:"break-all" }}>
                  {t.pnr}
                </div>
                <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>
                  Paid: {parseFloat(t.pricePaid).toFixed(4)} MATIC
                  {t.nftTokenId && t.nftTokenId!=="0" && ` · NFT #${t.nftTokenId}`}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                {!t.isCancelled && !t.qrScanned && (
                  <button onClick={()=>cancel(t.id)} style={{ padding:"6px 12px",
                    background:"#fef2f2", border:"1px solid #fca5a5", color:"#dc2626",
                    borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                    Cancel
                  </button>
                )}
                <button onClick={()=>setExpanded(exp?null:t.id)} style={{ padding:"6px 12px",
                  background:"#f3f4f6", border:"1px solid #d1d5db",
                  borderRadius:6, cursor:"pointer", fontSize:12 }}>
                  {exp?"Hide":"Details"}
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {exp && (
              <div style={{ borderTop:"1px solid #f1f5f9", padding:"12px 16px", background:"#f8fafc" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                  {[
                    ["Ticket ID",   `#${t.id}`],
                    ["NFT Token",   t.nftTokenId&&t.nftTokenId!=="0"?`#${t.nftTokenId}`:"—"],
                    ["Passenger",   t.passenger.slice(0,14)+"..."],
                    ["Coach-Seat",  `${t.coachNumber}-${t.seatNumber} (${t.seatType})`],
                    ["Journey",     t.journeyDate],
                    ["Price Paid",  `${parseFloat(t.pricePaid).toFixed(4)} MATIC`],
                  ].map(([l,v])=>(
                    <div key={l}>
                      <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase" }}>{l}</div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:6 }}>
                  🔒 On-Chain Audit Trail
                </div>
                {t.history.map((h,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between",
                    padding:"4px 8px", background:"#fff", borderRadius:4, marginBottom:3,
                    fontSize:11, border:"1px solid #e5e7eb" }}>
                    <span style={{ fontWeight:700, color:h.action==="BOOKED"?"#2563eb":h.action==="CANCELLED"?"#dc2626":"#374151" }}>
                      {h.action}
                    </span>
                    <span style={{ color:"#6b7280" }}>{h.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
