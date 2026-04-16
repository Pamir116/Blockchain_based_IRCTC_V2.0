// ─── NFTViewer ────────────────────────────────────────────────────
import React, { useState } from "react";
import { ethers } from "ethers";
import { addresses, NFTABI } from "../utils/contract";

export function NFTViewer({ walletAddress }) {
  const [pnr,     setPnr]     = useState("");
  const [ticket,  setTicket]  = useState(null);
  const [svg,     setSvg]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [myNFTs,  setMyNFTs]  = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);

  async function getNFT() {
    if (!addresses.NFTTicketContract || !window.ethereum) return null;
    const provider = new ethers.BrowserProvider(window.ethereum);
    return new ethers.Contract(addresses.NFTTicketContract, NFTABI, provider);
  }

  async function lookup() {
    if (!pnr.trim()) return;
    setLoading(true); setError(""); setSvg(""); setTicket(null);
    try {
      const c = await getNFT();
      if (!c) throw new Error("NFT contract not deployed");
      const [meta, id] = await c.getTicketByPNR(pnr.trim());
      setTicket({ ...meta, tokenId: id.toString() });
      const uri  = await c.tokenURI(id);
      const json = JSON.parse(atob(uri.split(",")[1]));
      if (json.image?.startsWith("data:image/svg+xml;base64,")) {
        setSvg(atob(json.image.split(",")[1]));
      }
    } catch (e) { setError("PNR not found: " + e.message.slice(0,80)); }
    setLoading(false);
  }

  async function loadMyNFTs() {
    if (!walletAddress || !window.ethereum) return;
    setLoadingAll(true);
    try {
      const c     = await getNFT();
      const total = await c.totalSupply();
      const mine  = [];
      for (let i = 1; i <= Number(total); i++) {
        try {
          const owner = await c.ownerOf(i);
          if (owner.toLowerCase() === walletAddress.toLowerCase()) {
            mine.push({ ...(await c.ticketData(i)), tokenId: i.toString() });
          }
        } catch {}
      }
      setMyNFTs(mine);
    } catch (e) { setError(e.message.slice(0,70)); }
    setLoadingAll(false);
  }

  const fmt = ts => ts > 0n ? new Date(Number(ts)*1000).toLocaleDateString("en-IN") : "—";

  return (
    <div>
      {/* PNR lookup */}
      <div style={{ background:"#1e3a5f", borderRadius:12, padding:16, marginBottom:20 }}>
        <p style={{ color:"rgba(255,255,255,0.65)", fontSize:12, margin:"0 0 10px" }}>
          Enter PNR to view your on-chain NFT ticket with SVG art
        </p>
        <div style={{ display:"flex", gap:8 }}>
          <input value={pnr} onChange={e=>setPnr(e.target.value)} placeholder="Enter 10-digit PNR"
            style={{ flex:1, padding:"10px 14px", borderRadius:8, border:"none", fontSize:14,
                     fontFamily:"monospace", letterSpacing:2 }} />
          <button onClick={lookup} disabled={loading} style={{ padding:"10px 20px", background:"#f97316",
            color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700 }}>
            {loading ? "..." : "Find NFT"}
          </button>
        </div>
      </div>

      {error && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8,
        padding:"8px 14px", marginBottom:16, fontSize:13, color:"#dc2626" }}>{error}</div>}

      {/* SVG ticket art */}
      {svg && (
        <div style={{ marginBottom:24 }}>
          <div style={{ borderRadius:16, overflow:"hidden", boxShadow:"0 8px 32px rgba(30,58,95,0.25)",
                        maxWidth:480, margin:"0 auto" }}
            dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      )}

      {/* My NFT collection */}
      <div style={{ borderTop:"1px solid #e5e7eb", paddingTop:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <h3 style={{ margin:0, fontSize:15 }}>My NFT Ticket Collection</h3>
          <button onClick={loadMyNFTs} disabled={loadingAll||!walletAddress} style={{
            padding:"6px 14px", background:"#f3f4f6", border:"1px solid #d1d5db",
            borderRadius:6, cursor:"pointer", fontSize:13 }}>
            {loadingAll ? "Loading..." : "Load My NFTs"}
          </button>
        </div>
        {myNFTs.length===0 && !loadingAll && (
          <p style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:"1.5rem 0" }}>
            Click "Load My NFTs" to see your collection
          </p>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
          {myNFTs.map(t => (
            <div key={t.tokenId} style={{
              background: t.isValid?"linear-gradient(135deg,#1e3a5f,#1e40af)":"#374151",
              borderRadius:12, padding:14, color:"#fff",
              border: t.isBoarded?"2px solid #22c55e":"1px solid transparent",
            }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginBottom:4 }}>
                NFT #{t.tokenId} · {t.pnr}
              </div>
              <div style={{ fontSize:16, fontWeight:700 }}>{t.trainNumber}</div>
              <div style={{ fontSize:12, color:"#93c5fd", marginBottom:8 }}>
                {t.fromStation} → {t.toStation}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                <span>{t.seatType} · {t.coachNumber}-{t.seatNumber?.toString()}</span>
                <span style={{ padding:"2px 7px", borderRadius:10, fontSize:10, fontWeight:700,
                  background: t.isValid?(t.isBoarded?"#16a34a":"#1d4ed8"):"#dc2626", color:"#fff" }}>
                  {t.isValid?(t.isBoarded?"BOARDED":"CONFIRMED"):"CANCELLED"}
                </span>
              </div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:6 }}>{fmt(t.journeyDate)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WaitingList ──────────────────────────────────────────────────
import { addresses as addr2, WLQueueABI } from "../utils/contract";
import { connectWallet } from "../utils/web3";

export function WaitingList({ walletAddress }) {
  const [train,   setTrain]   = useState("12951");
  const [cls,     setCls]     = useState("3A");
  const [status,  setStatus]  = useState("");
  const [loading, setLoading] = useState(false);
  const [info,    setInfo]    = useState(null);

  async function getWL(write=false) {
    if (!addr2.WLQueueContract) throw new Error("WLQueue not deployed");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const s = write ? await provider.getSigner() : provider;
    return new ethers.Contract(addr2.WLQueueContract, WLQueueABI, s);
  }

  async function join() {
    if (!train) return setStatus("❌ Enter train number");
    setLoading(true);
    try {
      const c  = await getWL(true);
      setStatus("📝 Confirm in MetaMask...");
      const tx = await c.joinWaitingList(train, cls);
      await tx.wait();
      setStatus(`✅ Added to WL for train ${train}! Auto-upgraded when seat frees.`);
      checkWL();
    } catch (e) {
      setStatus(e.message.includes("Already in WL") ? "❌ Already in WL for this train" : `❌ ${e.message.slice(0,70)}`);
    }
    setLoading(false);
  }

  async function checkWL() {
    if (!train) return setStatus("❌ Enter train number");
    try {
      const c    = await getWL();
      const len  = await c.getWaitingListLength(train);
      const list = await c.getWaitingList(train);
      const myPos = walletAddress
        ? list.findIndex(e=>e.passenger.toLowerCase()===walletAddress.toLowerCase()) : -1;
      setInfo({ total:len.toString(), myPos: myPos===-1?null:myPos+1, inList:myPos!==-1,
        list: list.map((e,i)=>({ pos:i+1, passenger:e.passenger, cls:e.seatType,
          upgraded:e.upgraded, isMe:e.passenger.toLowerCase()===walletAddress?.toLowerCase() })) });
    } catch (e) { setStatus(`❌ ${e.message.slice(0,70)}`); }
  }

  const sel = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #d1d5db", fontSize:14 };

  return (
    <div>
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10,
                    padding:"12px 16px", marginBottom:18 }}>
        <p style={{ margin:0, fontSize:13, color:"#92400e" }}>
          🤖 <strong>Auto-upgrade:</strong> When a confirmed passenger cancels, the first person
          in this WL is <strong>automatically</strong> upgraded by the smart contract — no human step.
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        <div>
          <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:4 }}>Train Number</label>
          <input value={train} onChange={e=>setTrain(e.target.value)} style={sel} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:4 }}>Class</label>
          <select value={cls} onChange={e=>setCls(e.target.value)} style={sel}>
            {["SL","3A","2A","1A","CC"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <button onClick={checkWL} style={{ flex:1, padding:"10px", background:"#f3f4f6",
          border:"1px solid #d1d5db", borderRadius:8, cursor:"pointer", fontSize:14 }}>
          Check WL Status
        </button>
        <button onClick={join} disabled={loading||!walletAddress} style={{
          flex:1, padding:"10px", background:loading||!walletAddress?"#9ca3af":"#f59e0b",
          color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:700 }}>
          {loading?"⏳ Joining...":"Join Waiting List"}
        </button>
      </div>

      {status && <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:14, fontSize:13,
        background:status.startsWith("✅")?"#f0fdf4":status.startsWith("❌")?"#fef2f2":"#fffbeb" }}>
        {status}</div>}

      {info && (
        <div style={{ background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0", padding:16 }}>
          <div style={{ display:"flex", gap:20, marginBottom:14 }}>
            <div><div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase" }}>Total in WL</div>
              <div style={{ fontSize:24, fontWeight:700 }}>{info.total}</div></div>
            {info.inList && <div><div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase" }}>Your Position</div>
              <div style={{ fontSize:24, fontWeight:700, color:"#2563eb" }}>#{info.myPos}</div></div>}
          </div>
          {info.list.slice(0,10).map(e=>(
            <div key={e.pos} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"5px 10px", background:e.isMe?"#eff6ff":e.upgraded?"#f0fdf4":"#fff",
              border:`1px solid ${e.isMe?"#bfdbfe":"#e5e7eb"}`,
              borderRadius:6, marginBottom:3, fontSize:12 }}>
              <span style={{ fontWeight:e.isMe?700:400, color:e.isMe?"#1d4ed8":"#374151" }}>
                #{e.pos} — {e.passenger.slice(0,10)}...{e.isMe?" (YOU)":""}
              </span>
              <span style={{ fontSize:10, padding:"2px 6px", borderRadius:8,
                background:e.upgraded?"#dcfce7":"#e5e7eb",
                color:e.upgraded?"#16a34a":"#374151", fontWeight:e.upgraded?700:400 }}>
                {e.upgraded ? "✓ Upgraded" : e.cls}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SwapTicket ───────────────────────────────────────────────────
import { addresses as addr3, SwapABI } from "../utils/contract";

export function SwapTicket({ walletAddress }) {
  const [myTicket,    setMyTicket]    = useState("");
  const [theirTicket, setTheirTicket] = useState("");
  const [theirWallet, setTheirWallet] = useState("");
  const [swapId,      setSwapId]      = useState("");
  const [status,      setStatus]      = useState("");
  const [loading,     setLoading]     = useState(false);

  async function getSwap(write=false) {
    if (!addr3.SwapContract) throw new Error("SwapContract not deployed");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const s = write ? await provider.getSigner() : provider;
    return new ethers.Contract(addr3.SwapContract, SwapABI, s);
  }

  async function requestSwap() {
    if (!myTicket||!theirTicket||!theirWallet) return setStatus("❌ Fill all fields");
    setLoading(true);
    try {
      const c  = await getSwap(true);
      setStatus("📝 Confirm in MetaMask...");
      const tx = await c.requestSwap(Number(myTicket), Number(theirTicket), theirWallet);
      const rcpt = await tx.wait();
      const ev = rcpt.logs.map(l=>{try{return c.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==="SwapRequested");
      const id = ev?.args[0].toString() || "?";
      setSwapId(id);
      setStatus(`✅ Swap #${id} requested! Other party must call approveSwap(${id}).`);
    } catch (e) { setStatus(`❌ ${e.message.slice(0,70)}`); }
    setLoading(false);
  }

  async function approveSwap() {
    if (!swapId) return setStatus("❌ Enter Swap ID");
    setLoading(true);
    try {
      const c  = await getSwap(true);
      setStatus("📝 Confirm in MetaMask...");
      const tx = await c.approveSwap(Number(swapId));
      await tx.wait();
      setStatus(`✅ Swap #${swapId} approved! Both parties have signed.`);
    } catch (e) { setStatus(`❌ ${e.message.slice(0,70)}`); }
    setLoading(false);
  }

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #d1d5db", fontSize:14, marginBottom:12, boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:13, fontWeight:600, marginBottom:4, color:"#374151" };

  return (
    <div style={{ maxWidth:500 }}>
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10,
                    padding:"12px 16px", marginBottom:20 }}>
        <p style={{ margin:0, fontSize:13, color:"#92400e" }}>
          🔄 <strong>Official swap only:</strong> Both parties must sign. NFT tickets are wallet-bound
          — this is the only way to transfer a ticket. No black market resale possible.
        </p>
      </div>

      <h3 style={{ fontSize:15, margin:"0 0 14px" }}>Request a Swap</h3>
      <label style={lbl}>Your Ticket ID</label>
      <input type="number" value={myTicket} onChange={e=>setMyTicket(e.target.value)} placeholder="e.g. 1" style={inp} />
      <label style={lbl}>Their Ticket ID</label>
      <input type="number" value={theirTicket} onChange={e=>setTheirTicket(e.target.value)} placeholder="e.g. 2" style={inp} />
      <label style={lbl}>Their Wallet Address</label>
      <input value={theirWallet} onChange={e=>setTheirWallet(e.target.value)} placeholder="0x..." style={inp} />
      <button onClick={requestSwap} disabled={loading} style={{
        width:"100%", padding:"11px 0", background:loading?"#9ca3af":"#2563eb",
        color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:14, marginBottom:20 }}>
        {loading?"⏳ Processing...":"Request Swap"}
      </button>

      <hr style={{ border:"none", borderTop:"1px solid #e5e7eb", marginBottom:20 }} />
      <h3 style={{ fontSize:15, margin:"0 0 14px" }}>Approve a Swap (Other Party)</h3>
      <label style={lbl}>Swap ID (shared by requester)</label>
      <input type="number" value={swapId} onChange={e=>setSwapId(e.target.value)} placeholder="Swap ID" style={inp} />
      <button onClick={approveSwap} disabled={loading} style={{
        width:"100%", padding:"11px 0", background:loading?"#9ca3af":"#10b981",
        color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:14 }}>
        {loading?"⏳ Processing...":"Approve Swap"}
      </button>

      {status && <div style={{ marginTop:14, padding:"10px 14px", borderRadius:8, fontSize:13,
        background:status.startsWith("✅")?"#f0fdf4":status.startsWith("❌")?"#fef2f2":"#fffbeb" }}>
        {status}</div>}
    </div>
  );
}

// ─── TTEScanner ───────────────────────────────────────────────────
import axios from "axios";
import jsQR  from "jsqr";

export function TTEScanner({ walletAddress }) {
  const [mode,     setMode]     = useState("camera"); // "camera" | "image" | "paste"
  const [input,    setInput]    = useState("");
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [camError, setCamError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [camMsg,   setCamMsg]   = useState("Point camera at QR code");

  const videoRef   = React.useRef(null);
  const canvasRef  = React.useRef(null);
  const streamRef  = React.useRef(null);
  const rafRef     = React.useRef(null);
  const fileRef    = React.useRef(null);

  const BACK = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

  // ── Verify payload ────────────────────────────────────────────────
  async function verify(payload) {
    const raw = (payload || input).trim();
    if (!raw) return;
    setLoading(true); setResult(null);
    try {
      const { data } = await axios.post(`${BACK}/api/qr/verify`, { qrPayload: raw });
      setResult(data);
    } catch (e) { setResult({ valid:false, reason:e.response?.data?.error||e.message }); }
    setLoading(false);
  }

  // ── Camera scan ───────────────────────────────────────────────────
  async function startCamera() {
    setCamError(""); setResult(null); setCamMsg("Starting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal:1280 }, height: { ideal:720 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      setCamMsg("Point camera at QR code");
      scanFrame();
    } catch (e) {
      setCamError("Camera error: " + e.message + ". Try the Image Upload mode instead.");
    }
  }

  function stopCamera() {
    if (rafRef.current)   cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
    setCamMsg("Point camera at QR code");
  }

  function scanFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts:"dontInvert" });
      if (code?.data) {
        setCamMsg("✅ QR detected!");
        stopCamera();
        setInput(code.data);
        verify(code.data);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }

  // cleanup on unmount
  React.useEffect(() => () => stopCamera(), []);

  // ── Image upload ──────────────────────────────────────────────────
  function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code?.data) {
        setInput(code.data);
        verify(code.data);
      } else {
        setResult({ valid:false, reason:"No QR code found in the image. Try a clearer photo." });
      }
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }

  const tabBtn = (id, icon, label) => (
    <button onClick={() => { stopCamera(); setMode(id); setResult(null); setCamError(""); }} style={{
      flex:1, padding:"10px 0", border:"none", borderRadius:8, cursor:"pointer",
      fontWeight:700, fontSize:13,
      background: mode===id ? "#1e3a5f" : "#f3f4f6",
      color:      mode===id ? "#fff"    : "#374151",
    }}>{icon} {label}</button>
  );

  return (
    <div style={{ maxWidth:520 }}>
      <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10,
                    padding:"12px 16px", marginBottom:16, fontSize:13, color:"#1d4ed8" }}>
        📱 <strong>TTE Verification:</strong> Scan the passenger's QR code via camera or image upload.
        Each ticket can only be scanned once — duplicate detection built-in.
      </div>

      {/* Mode tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:18 }}>
        {tabBtn("camera", "📷", "Camera")}
        {tabBtn("image",  "🖼️", "Upload Image")}
        {tabBtn("paste",  "📋", "Paste Text")}
      </div>

      {/* ── Camera mode ── */}
      {mode === "camera" && (
        <div>
          {/* Video preview */}
          <div style={{ position:"relative", background:"#000", borderRadius:12,
                        overflow:"hidden", marginBottom:12, aspectRatio:"4/3" }}>
            <video ref={videoRef} playsInline muted
              style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            {/* Scan overlay */}
            {scanning && (
              <div style={{ position:"absolute", inset:0, display:"flex",
                            alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                <div style={{ width:200, height:200, border:"3px solid #22c55e",
                              borderRadius:12, boxShadow:"0 0 0 9999px rgba(0,0,0,0.45)" }} />
              </div>
            )}
            {!scanning && (
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
                            alignItems:"center", justifyContent:"center", color:"#fff" }}>
                <div style={{ fontSize:48, marginBottom:8 }}>📷</div>
                <div style={{ fontSize:14 }}>Camera not started</div>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} style={{ display:"none" }} />

          {camError && (
            <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8,
                          padding:"8px 14px", marginBottom:10, fontSize:13, color:"#dc2626" }}>
              {camError}
            </div>
          )}

          <div style={{ textAlign:"center", marginBottom:10, fontSize:13, color:"#6b7280" }}>
            {camMsg}
          </div>

          <div style={{ display:"flex", gap:8 }}>
            {!scanning ? (
              <button onClick={startCamera} style={{
                flex:1, padding:"12px 0", background:"#16a34a", color:"#fff",
                border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:15 }}>
                📷 Start Camera
              </button>
            ) : (
              <button onClick={stopCamera} style={{
                flex:1, padding:"12px 0", background:"#dc2626", color:"#fff",
                border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:15 }}>
                ⏹ Stop Camera
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Image upload mode ── */}
      {mode === "image" && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImage}
            style={{ display:"none" }} />
          <div onClick={() => fileRef.current?.click()}
            style={{ border:"2px dashed #93c5fd", borderRadius:12, padding:"40px 20px",
                     textAlign:"center", cursor:"pointer", background:"#eff6ff",
                     marginBottom:12, transition:"border-color 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#2563eb"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#93c5fd"}>
            <div style={{ fontSize:48, marginBottom:8 }}>🖼️</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#1e40af" }}>Click to upload QR image</div>
            <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>PNG, JPG, or screenshot of the QR code</div>
          </div>
          <button onClick={() => fileRef.current?.click()} style={{
            width:"100%", padding:"12px 0", background:"#2563eb", color:"#fff",
            border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:15 }}>
            📂 Choose Image File
          </button>
        </div>
      )}

      {/* ── Paste mode ── */}
      {mode === "paste" && (
        <div>
          <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:6 }}>
            Paste QR Payload (JSON)
          </label>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            placeholder='{"ticketId":"1","walletAddress":"0x...","pnr":"1234567890",...}'
            rows={5} style={{ width:"100%", padding:"10px 12px", borderRadius:8,
              border:"1px solid #d1d5db", fontSize:12, fontFamily:"monospace",
              marginBottom:12, boxSizing:"border-box", resize:"vertical" }} />
          <button onClick={() => verify()} disabled={loading||!input.trim()} style={{
            width:"100%", padding:"12px 0",
            background: loading||!input.trim() ? "#9ca3af" : "#1e3a5f",
            color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:15 }}>
            {loading ? "⏳ Verifying..." : "🔍 Verify Ticket"}
          </button>
        </div>
      )}

      {/* ── Result ── */}
      {loading && (
        <div style={{ marginTop:16, textAlign:"center", padding:16, background:"#fffbeb",
                      borderRadius:12, border:"1px solid #fde68a", fontSize:14, color:"#92400e" }}>
          ⏳ Verifying on blockchain...
        </div>
      )}

      {result && !loading && (
        <div style={{ marginTop:16, padding:16, borderRadius:12,
          background:result.valid?"#f0fdf4":"#fef2f2",
          border:`2px solid ${result.valid?"#22c55e":"#ef4444"}` }}>
          <div style={{ fontSize:22, fontWeight:700,
                        color:result.valid?"#16a34a":"#dc2626", marginBottom:12 }}>
            {result.valid ? "✅ VALID TICKET — Allow Boarding" : "❌ INVALID TICKET — Deny Boarding"}
          </div>
          {result.valid && result.ticket ? (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                ["PNR",       result.ticket.pnr],
                ["Train",     result.ticket.trainNumber],
                ["Passenger", result.ticket.passenger?.slice(0,14)+"..."],
                ["Seat",      `${result.ticket.coachNumber}-${result.ticket.seatNumber} (${result.ticket.seatType})`],
                ["Journey",   result.ticket.journeyDate],
                ["Scan TX",   result.scanTxHash?.slice(0,14)+"..."],
              ].map(([l,v])=>(
                <div key={l} style={{ background:"rgba(22,101,52,0.08)", borderRadius:6, padding:"6px 10px" }}>
                  <div style={{ fontSize:10, color:"#6b7280", textTransform:"uppercase" }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#166534" }}>{v||"—"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:14, color:"#dc2626" }}>{result.reason || "Verification failed"}</div>
          )}
          <button onClick={() => { setResult(null); setInput(""); if(mode==="camera") setCamMsg("Point camera at QR code"); }}
            style={{ marginTop:14, padding:"8px 18px", background:"#374151", color:"#fff",
                     border:"none", borderRadius:6, cursor:"pointer", fontSize:13 }}>
            Scan Next Ticket
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MultisigAdmin ────────────────────────────────────────────────
import { addresses as addr4, MultisigABI, BookingV2ABI as bv2ABI } from "../utils/contract";

export function MultisigAdmin({ walletAddress }) {
  const [isOwner,  setIsOwner]  = useState(false);
  const [owners,   setOwners]   = useState([]);
  const [pending,  setPending]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [status,   setStatus]   = useState("");
  const [tab,      setTab]      = useState("pending");
  const [kycWallet,setKycWallet]= useState("");

  async function getMS(write=false) {
    if (!addr4.MultisigAdminWallet) throw new Error("Multisig not deployed");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const s = write ? await provider.getSigner() : provider;
    return new ethers.Contract(addr4.MultisigAdminWallet, MultisigABI, s);
  }

  React.useEffect(()=>{ if(walletAddress) init(); },[walletAddress]);

  async function init() {
    try {
      const ms = await getMS();
      const os = await Promise.all([ms.owners(0),ms.owners(1),ms.owners(2)]);
      setOwners(os);
      setIsOwner(os.map(o=>o.toLowerCase()).includes(walletAddress.toLowerCase()));
      await loadPending(ms, os);
    } catch {}
  }

  async function loadPending(ms, os) {
    setLoading(true);
    try {
      const _ms = ms || await getMS();
      const _os = os || owners;
      const ids = await _ms.getPendingTransactions();
      const txs = await Promise.all(ids.map(async id => {
        const tx   = await _ms.getTransaction(id);
        const sigs = await Promise.all(_os.map(o=>_ms.hasSigned(id,o)));
        return { id:id.toString(), target:tx[0], executed:tx[3], sigCount:Number(tx[4]),
                 desc:tx[5], createdAt:new Date(Number(tx[6])*1000).toLocaleString("en-IN"),
                 sigs: _os.map((o,i)=>({ owner:o, signed:sigs[i] })) };
      }));
      setPending(txs);
    } catch {}
    setLoading(false);
  }

  async function proposeKYC() {
    if (!kycWallet) return setStatus("❌ Enter wallet address");
    setStatus("⏳ Submitting to multisig...");
    try {
      const ms      = await getMS(true);
      const iface   = new ethers.Interface(bv2ABI);
      const calldata = iface.encodeFunctionData("verifyUser",[kycWallet]);
      const tx = await ms.submitTransaction(addr4.BookingContractV2, calldata, 0,
        `KYC: Verify ${kycWallet.slice(0,10)}...`);
      await tx.wait();
      setStatus("✅ Proposed! Needs 1 more owner signature.");
      setKycWallet(""); loadPending();
    } catch (e) { setStatus(`❌ ${e.message.slice(0,70)}`); }
  }

  async function sign(id) {
    setStatus(`⏳ Signing tx #${id}...`);
    try {
      const ms = await getMS(true);
      const tx = await ms.signTransaction(id);
      await tx.wait();
      setStatus(`✅ Tx #${id} signed!`);
      loadPending();
    } catch (e) { setStatus(`❌ ${e.message.slice(0,70)}`); }
  }

  if (!walletAddress) return <p style={{ color:"#9ca3af" }}>Connect wallet to access admin panel.</p>;

  const tagSty = signed => ({
    padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:600,
    background:signed?"#f0fdf4":"#f9fafb", color:signed?"#16a34a":"#9ca3af",
    border:`1px solid ${signed?"#86efac":"#e5e7eb"}`,
  });

  return (
    <div>
      {/* Owner status */}
      <div style={{ background:isOwner?"#f0fdf4":"#fff7ed",
        border:`1px solid ${isOwner?"#86efac":"#fde68a"}`,
        borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <p style={{ margin:0, fontSize:13, color:isOwner?"#166534":"#92400e" }}>
          {isOwner?"✅ You are a multisig owner.":"⚠️ Not an owner — view only."}
        </p>
        <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
          {owners.map((o,i)=>(
            <span key={i} style={{ fontSize:11, padding:"2px 10px", borderRadius:10,
              background:o.toLowerCase()===walletAddress.toLowerCase()?"#1e3a5f":"#e5e7eb",
              color:o.toLowerCase()===walletAddress.toLowerCase()?"#fff":"#374151" }}>
              Owner {i+1}: {o.slice(0,8)}...{o.toLowerCase()===walletAddress.toLowerCase()?" (you)":""}
            </span>
          ))}
        </div>
      </div>

      <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10,
                    padding:"10px 14px", marginBottom:16, fontSize:13, color:"#1d4ed8" }}>
        🔐 <strong>2-of-3 Multisig:</strong> Every admin action requires 2 out of 3 railway
        authority owners to sign. No single corrupt official can act alone.
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", marginBottom:18 }}>
        {[["pending",`Pending (${pending.length})`],["kyc","KYC Verify"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:"8px 18px", border:"none", background:"transparent",
            borderBottom:tab===id?"2px solid #2563eb":"2px solid transparent",
            color:tab===id?"#2563eb":"#6b7280", cursor:"pointer", fontSize:13, fontWeight:tab===id?700:400 }}>
            {lbl}
          </button>
        ))}
      </div>

      {status && <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:14, fontSize:13,
        background:status.startsWith("✅")?"#f0fdf4":status.startsWith("❌")?"#fef2f2":"#fffbeb" }}>
        {status}</div>}

      {/* Pending transactions */}
      {tab==="pending" && (
        <div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
            <button onClick={()=>loadPending()} style={{ padding:"5px 12px", fontSize:12,
              background:"#f3f4f6", border:"1px solid #d1d5db", borderRadius:6, cursor:"pointer" }}>
              ↻ Refresh
            </button>
          </div>
          {pending.length===0&&!loading&&<p style={{ color:"#9ca3af", textAlign:"center", padding:"2rem 0", fontSize:13 }}>No pending transactions</p>}
          {pending.map(tx=>(
            <div key={tx.id} style={{ border:"1px solid #e5e7eb", borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>#{tx.id} — {tx.desc}</span>
                <span style={{ padding:"3px 10px", borderRadius:10, fontSize:11,
                  background:tx.sigCount>=2?"#f0fdf4":"#fffbeb",
                  color:tx.sigCount>=2?"#16a34a":"#92400e" }}>
                  {tx.sigCount}/2 signatures
                </span>
              </div>
              <div style={{ fontSize:11, color:"#6b7280", marginBottom:8 }}>
                Target: {tx.target.slice(0,16)}... · {tx.createdAt}
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                {tx.sigs.map((s,i)=>(
                  <span key={i} style={tagSty(s.signed)}>
                    {s.signed?"✓":"○"} Owner {i+1}: {s.owner.slice(0,8)}...
                  </span>
                ))}
              </div>
              {isOwner && !tx.sigs.find(s=>s.owner.toLowerCase()===walletAddress.toLowerCase())?.signed && (
                <button onClick={()=>sign(tx.id)} style={{ padding:"6px 16px", background:"#2563eb",
                  color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:13 }}>
                  Sign This Transaction
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KYC propose */}
      {tab==="kyc" && isOwner && (
        <div style={{ border:"1px solid #e5e7eb", borderRadius:10, padding:16 }}>
          <h4 style={{ margin:"0 0 6px", fontSize:14 }}>Propose KYC Verification</h4>
          <p style={{ margin:"0 0 12px", fontSize:12, color:"#6b7280" }}>
            After DigiLocker verification on backend, use multisig to record on-chain. Requires 2-of-3 signatures.
          </p>
          <input value={kycWallet} onChange={e=>setKycWallet(e.target.value)}
            placeholder="0x passenger wallet address"
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #d1d5db",
                     fontSize:13, marginBottom:10, boxSizing:"border-box" }} />
          <button onClick={proposeKYC} disabled={!kycWallet} style={{
            padding:"9px 20px", background:kycWallet?"#10b981":"#9ca3af", color:"#fff",
            border:"none", borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:700 }}>
            Propose KYC → Multisig
          </button>
        </div>
      )}
      {tab==="kyc" && !isOwner && (
        <p style={{ color:"#9ca3af", fontSize:13 }}>Only multisig owners can propose KYC verification.</p>
      )}
    </div>
  );
}
