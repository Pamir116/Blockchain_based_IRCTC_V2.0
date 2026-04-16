import React, { useState, useEffect, useCallback, useRef } from "react";
import { ethers }    from "ethers";
import axios         from "axios";
import { addresses, BookingV2ABI, PricingABI } from "../utils/contract";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

const STATUS = { AVAILABLE:0, BOOKED:1, CANCELLED_AVAILABLE:2, WAITING_LIST:3 };

const BERTH = {
  LB: { color:"#22c55e", bg:"#f0fdf4", border:"#86efac", label:"Lower"      },
  MB: { color:"#f97316", bg:"#fff7ed", border:"#fdba74", label:"Middle"     },
  UB: { color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd", label:"Upper"      },
  SL: { color:"#ec4899", bg:"#fdf2f8", border:"#f9a8d4", label:"Side Lower" },
  SU: { color:"#8b5cf6", bg:"#f5f3ff", border:"#c4b5fd", label:"Side Upper" },
};

const TYPE_BADGE = {
  Rajdhani:  { bg:"#fef3c7", color:"#92400e", border:"#fcd34d" },
  Shatabdi:  { bg:"#ede9fe", color:"#5b21b6", border:"#c4b5fd" },
  Duronto:   { bg:"#ecfdf5", color:"#065f46", border:"#6ee7b7" },
  Express:   { bg:"#eff6ff", color:"#1e40af", border:"#93c5fd" },
  Mail:      { bg:"#fdf2f8", color:"#9d174d", border:"#f9a8d4" },
  Intercity: { bg:"#f0fdf4", color:"#166534", border:"#86efac" },
};

function buildLayout() {
  const berths = ["LB","MB","UB","LB","MB","UB","SL","SU"];
  return Array.from({ length:8 }, (_, bay) =>
    Array.from({ length:8 }, (_, b) => ({
      number: bay*8+b+1, berthType: berths[b],
      isMain: b < 6, isSide: b >= 6,
    }))
  );
}

// Station autocomplete input
function StationInput({ label, value, onChange, placeholder }) {
  const [query,       setQuery]       = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open,        setOpen]        = useState(false);
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    if (!query || query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await axios.get(`${BACKEND}/api/trains/stations?q=${encodeURIComponent(query)}`);
        setSuggestions(r.data.slice(0, 8));
        setOpen(true);
      } catch { setSuggestions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(s) {
    setQuery(s.code);
    onChange(s.code);
    setOpen(false);
    setSuggestions([]);
  }

  const inp = { padding:"8px 10px", borderRadius:6, border:"1px solid #475569", fontSize:13,
                background:"rgba(255,255,255,0.12)", color:"#fff", width:"100%",
                outline:"none", boxSizing:"border-box" };

  return (
    <div ref={ref} style={{ position:"relative", minWidth:120 }}>
      <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, marginBottom:3 }}>{label}</div>
      <input value={query} placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value.toUpperCase()); }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        style={inp} />
      {open && suggestions.length > 0 && (
        <div style={{ position:"absolute", top:"100%", left:0, zIndex:100, background:"#fff",
                      border:"1px solid #d1d5db", borderRadius:8, boxShadow:"0 4px 12px rgba(0,0,0,0.15)",
                      minWidth:200, maxHeight:220, overflowY:"auto", marginTop:2 }}>
          {suggestions.map(s => (
            <div key={s.code} onClick={() => pick(s)}
              style={{ padding:"8px 12px", cursor:"pointer", fontSize:13,
                       borderBottom:"1px solid #f3f4f6", color:"#1f2937" }}
              onMouseEnter={e => e.currentTarget.style.background="#f0f9ff"}
              onMouseLeave={e => e.currentTarget.style.background="#fff"}>
              <span style={{ fontWeight:700, color:"#1e40af", marginRight:8, fontFamily:"monospace" }}>{s.code}</span>
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Calculate arrival time from departure time + duration string ("17h 20m")
function calcArrival(departs, duration) {
  if (!departs || !duration) return null;
  const [depH, depM] = departs.split(":").map(Number);
  const hMatch = duration.match(/(\d+)h/);
  const mMatch = duration.match(/(\d+)m/);
  if (!hMatch) return null;
  const durH = parseInt(hMatch[1]);
  const durM = mMatch ? parseInt(mMatch[1]) : 0;
  const totalMins = depH * 60 + depM + durH * 60 + durM;
  const arrH   = Math.floor(totalMins / 60) % 24;
  const arrM   = totalMins % 60;
  const days   = Math.floor(totalMins / (60 * 24));
  const time   = `${String(arrH).padStart(2,"0")}:${String(arrM).padStart(2,"0")}`;
  return days > 0 ? `${time} (+${days})` : time;
}

// Train search result card
function TrainCard({ train, onSelect }) {
  const badge   = TYPE_BADGE[train.type] || TYPE_BADGE.Express;
  const arrival = calcArrival(train.departs, train.duration);

  return (
    <div onClick={() => onSelect(train)}
      style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 16px",
               cursor:"pointer", transition:"all 0.15s", marginBottom:8 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor="#3b82f6"; e.currentTarget.style.boxShadow="0 2px 8px rgba(59,130,246,0.2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.boxShadow="none"; }}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
            <span style={{ fontWeight:700, fontSize:15, color:"#1e3a5f" }}>{train.name}</span>
            <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10,
                           background:badge.bg, color:badge.color, border:`1px solid ${badge.border}`,
                           fontWeight:600 }}>{train.type}</span>
          </div>
          <span style={{ fontSize:12, color:"#6b7280", fontFamily:"monospace" }}>#{train.number}</span>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:12, color:"#6b7280" }}>{train.duration}</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>{train.km} km</div>
        </div>
      </div>

      {/* Route timing */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#1e3a5f", lineHeight:1 }}>{train.departs}</div>
          <div style={{ fontSize:11, color:"#6b7280" }}>{train.boardStop?.name || train.fromName}</div>
          <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{train.from}</div>
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ fontSize:10, color:"#94a3b8", marginBottom:3 }}>{train.duration}</div>
          <div style={{ width:"100%", height:2, background:"linear-gradient(90deg,#3b82f6,#1e40af)", borderRadius:2 }} />
        </div>
        <div style={{ textAlign:"center" }}>
          {arrival && (
            <div style={{ fontSize:18, fontWeight:700, color:"#1e3a5f", lineHeight:1 }}>{arrival}</div>
          )}
          <div style={{ fontSize:11, color:"#6b7280" }}>{train.alightStop?.name || train.toName}</div>
          <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{train.to}</div>
        </div>
      </div>

      {/* Classes + days */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:6 }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {(train.classes || []).map(c => (
            <span key={c} style={{ padding:"2px 8px", background:"#f0f9ff", border:"1px solid #bfdbfe",
                                   borderRadius:6, fontSize:11, color:"#1e40af", fontWeight:600 }}>{c}</span>
          ))}
        </div>
        <div style={{ fontSize:10, color:"#6b7280" }}>
          {(train.days || []).length === 7 ? "Daily" : (train.days || []).join(", ")}
        </div>
      </div>
    </div>
  );
}

export default function SeatMap({ walletAddress, onSeatSelect }) {
  // Search pane
  const [searchFrom,   setSearchFrom]   = useState("NDLS");
  const [searchTo,     setSearchTo]     = useState("");
  const [searchDate,   setSearchDate]   = useState("");
  const [searchClass,  setSearchClass]  = useState("");
  const [searchResults,setSearchResults]= useState(null);
  const [searching,    setSearching]    = useState(false);
  const [showSearch,   setShowSearch]   = useState(true);

  // Seat map pane
  const [train,    setTrain]    = useState("12951");
  const [coach,    setCoach]    = useState("B1");
  const [seatClass,setSeatClass]= useState("3A");
  const [from,     setFrom]     = useState("NDLS");
  const [to,       setTo]       = useState("BCT");
  const [date,     setDate]     = useState("");
  const [tatkal,   setTatkal]   = useState(false);
  const [coachList,setCoachList]= useState(["B1","B2","B3","A1","A2","S1","S2","C1","C2"]);
  const [statuses, setStatuses] = useState({});
  const [selected, setSelected] = useState(null);
  const [price,    setPrice]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [trainName,setTrainName]= useState("");

  const bays    = buildLayout();
  const allNums = bays.flatMap(b => b.map(s => s.number));

  const getProvider = () => {
    if (!window.ethereum) throw new Error("MetaMask not found");
    return new ethers.BrowserProvider(window.ethereum);
  };

  async function handleSearch() {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchFrom)  params.set("from",  searchFrom);
      if (searchTo)    params.set("to",    searchTo);
      if (searchDate)  params.set("date",  searchDate);
      if (searchClass) params.set("class", searchClass);
      const r = await axios.get(`${BACKEND}/api/trains/search?${params.toString()}`);
      setSearchResults(r.data.results || []);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectTrain(t) {
    setTrain(t.number);
    setTrainName(t.name);
    setFrom(t.from);
    setTo(t.to);
    if (searchDate) setDate(searchDate);
    if (searchClass && t.classes?.includes(searchClass)) setSeatClass(searchClass);
    else if (t.classes?.length > 0) setSeatClass(t.classes[0]);
    // Set coach list from real data
    const cl = t.coachList?.length > 0 ? t.coachList : ["B1","B2","A1","S1","C1"];
    setCoachList(cl);
    setCoach(cl[0] || "B1");
    setShowSearch(false);
    setSelected(null);
    setPrice(null);
    setStatuses({});
  }

  const loadMap = useCallback(async () => {
    if (!addresses.BookingContractV2) return;
    setLoading(true); setError("");
    try {
      const provider  = getProvider();
      const contract  = new ethers.Contract(addresses.BookingContractV2, BookingV2ABI, provider);
      const dateTs = date
        ? BigInt(Math.floor(new Date(date).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 86400);
      const [sts] = await contract.getCoachSeatMap(train, coach, allNums, dateTs);
      // Always derive berth type from seat position in coach layout (LB/MB/UB/SL/SU)
      // Contract value is unreliable for uninitialised coaches — all return "LB"
      const BERTH_PATTERN = ["LB","MB","UB","LB","MB","UB","SL","SU"];
      const map = {};
      allNums.forEach((n,i) => {
        map[n] = { status: Number(sts[i]), berthType: BERTH_PATTERN[(n - 1) % 8] };
      });
      setStatuses(map);
    } catch (e) { setError("Could not load seat map: " + e.message.slice(0,80)); }
    setLoading(false);
  }, [train, coach, date]);

  const loadPrice = useCallback(async () => {
    if (!addresses.DynamicPricingContract || !date) return;
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(addresses.DynamicPricingContract, PricingABI, provider);
      const ts = Math.floor(new Date(date).getTime()/1000);
      const [p, km] = await contract.previewPrice(from, to, seatClass, tatkal, ts);
      setPrice({ wei: p.toString(), matic: parseFloat(ethers.formatEther(p)).toFixed(4),
                 inr: Math.round(parseFloat(ethers.formatEther(p))*83*100)/100, km: km.toString() });
    } catch { setPrice(null); }
  }, [from, to, seatClass, tatkal, date]);

  useEffect(() => { if (!showSearch) loadMap(); },   [loadMap, showSearch]);
  useEffect(() => { if (!showSearch) loadPrice(); }, [loadPrice, showSearch]);

  function handleClick(seat) {
    const s = statuses[seat.number];
    if (!s) return;
    if (s.status === STATUS.BOOKED || s.status === STATUS.WAITING_LIST) return;
    if (selected?.number === seat.number) { setSelected(null); onSeatSelect?.(null); return; }
    setSelected(seat);
  }

  function renderSeat(seat) {
    const s      = statuses[seat.number] || { status:STATUS.AVAILABLE, berthType:seat.berthType };
    const berth  = BERTH[s.berthType] || BERTH.LB;
    const isBook = s.status === STATUS.BOOKED;
    const isFree = s.status === STATUS.CANCELLED_AVAILABLE;
    const isSel  = selected?.number === seat.number;
    const avail  = s.status === STATUS.AVAILABLE || isFree;

    let bg     = isBook ? "#e5e7eb" : isFree ? "#fef9c3" : berth.bg;
    let border = isBook ? "#9ca3af" : isFree ? "#facc15" : berth.border;
    let color  = isBook ? "#9ca3af" : "#374151";
    if (isSel) { bg="#1e40af"; border="#1e40af"; color="#fff"; }

    return (
      <div key={seat.number}
        onClick={() => avail && handleClick(seat)}
        title={`Seat ${seat.number} (${berth.label}) — ${isBook?"Booked":isFree?"Just freed!":"Available"}`}
        style={{
          width:42, height:34, background:bg, border:`2px solid ${border}`,
          borderRadius:6, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          cursor: avail ? "pointer" : "not-allowed",
          flexShrink:0, position:"relative", transition:"all 0.15s",
          userSelect:"none",
        }}>
        <span style={{ fontSize:11, fontWeight:700, color, lineHeight:1 }}>{seat.number}</span>
        <span style={{ fontSize:8, color: isSel?"rgba(255,255,255,0.7)":"#9ca3af", lineHeight:1 }}>
          {s.berthType || seat.berthType}
        </span>
        {isFree && !isSel && (
          <div style={{ position:"absolute", top:-4, right:-4, width:8, height:8,
            borderRadius:"50%", background:"#22c55e", border:"1px solid white" }} />
        )}
        {isBook && (
          <div style={{ position:"absolute", inset:0, borderRadius:4,
            background:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.06) 4px,rgba(0,0,0,0.06) 8px)" }} />
        )}
      </div>
    );
  }

  const stats = Object.values(statuses).reduce(
    (a,s) => { if(s.status===0) a.available++; else if(s.status===1) a.booked++; return a; },
    { available:0, booked:0 }
  );

  const inp = { padding:"7px 10px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, background:"#fff" };

  // ── TRAIN SEARCH VIEW ──────────────────────────────────────────────────────
  if (showSearch) return (
    <div>
      {/* Search header */}
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#1e40af)", borderRadius:12,
                    padding:"16px 18px", marginBottom:14 }}>
        <div style={{ color:"rgba(255,255,255,0.7)", fontSize:12, marginBottom:10 }}>Search Trains</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-end" }}>
          <StationInput label="From" value={searchFrom} onChange={setSearchFrom} placeholder="NDLS" />
          <StationInput label="To"   value={searchTo}   onChange={setSearchTo}   placeholder="e.g. BCT" />
          <div>
            <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, marginBottom:3 }}>Date</div>
            <input type="date" value={searchDate}
              onChange={e=>setSearchDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{ padding:"8px 10px", borderRadius:6, border:"1px solid #475569",
                       fontSize:13, background:"rgba(255,255,255,0.12)", color:"#fff" }} />
          </div>
          <div>
            <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, marginBottom:3 }}>Class</div>
            <select value={searchClass} onChange={e=>setSearchClass(e.target.value)}
              style={{ padding:"8px 10px", borderRadius:6, border:"1px solid #475569",
                       fontSize:13, background:"rgba(255,255,255,0.12)", color:"#fff" }}>
              <option value="">Any</option>
              {["SL","3A","2A","1A","CC","EC"].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={handleSearch} disabled={searching}
            style={{ padding:"8px 20px", background:"#f97316", color:"#fff",
                     border:"none", borderRadius:6, cursor:searching?"not-allowed":"pointer",
                     fontWeight:700, fontSize:13, height:38, alignSelf:"flex-end" }}>
            {searching ? "Searching..." : "Search Trains"}
          </button>
        </div>
      </div>

      {/* Results */}
      {searchResults === null && (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#6b7280" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🚂</div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Find Your Train</div>
          <div style={{ fontSize:13 }}>Enter origin and destination stations, then click Search Trains</div>
        </div>
      )}

      {searchResults !== null && searchResults.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#6b7280" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>😔</div>
          <div style={{ fontSize:15, fontWeight:600 }}>No trains found</div>
          <div style={{ fontSize:13, marginTop:6 }}>Try different stations or a different date</div>
        </div>
      )}

      {searchResults !== null && searchResults.length > 0 && (
        <div>
          <div style={{ fontSize:13, color:"#6b7280", marginBottom:10 }}>
            {searchResults.length} train{searchResults.length!==1?"s":""} found
            {searchFrom && searchTo ? ` · ${searchFrom} → ${searchTo}` : ""}
          </div>
          {searchResults.map(t => (
            <TrainCard key={t.number} train={t} onSelect={selectTrain} />
          ))}
        </div>
      )}
    </div>
  );

  // ── SEAT MAP VIEW ──────────────────────────────────────────────────────────
  return (
    <div>
      {/* Back + train info bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <button onClick={()=>{setShowSearch(true);setSelected(null);}}
          style={{ padding:"6px 14px", background:"#f3f4f6", border:"1px solid #d1d5db",
                   borderRadius:6, cursor:"pointer", fontSize:13 }}>
          ← Train Search
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f" }}>{trainName || train}</div>
          <div style={{ fontSize:11, color:"#6b7280" }}>#{train} · {from} → {to}</div>
        </div>
      </div>

      {/* Seat config bar */}
      <div style={{ background:"#1e3a5f", borderRadius:12, padding:"12px 14px", marginBottom:14,
                    display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end" }}>
        <div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, marginBottom:3 }}>Coach</div>
          <select value={coach} onChange={e=>{setCoach(e.target.value);setSelected(null);}}
            style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #475569",
                     fontSize:13, background:"rgba(255,255,255,0.12)", color:"#fff" }}>
            {coachList.map(c=><option key={c} style={{color:"#000"}}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, marginBottom:3 }}>Class</div>
          <select value={seatClass} onChange={e=>setSeatClass(e.target.value)}
            style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #475569",
                     fontSize:13, background:"rgba(255,255,255,0.12)", color:"#fff" }}>
            {["SL","3A","2A","1A","CC","2S"].map(c=><option key={c} style={{color:"#000"}}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, marginBottom:3 }}>Date</div>
          <input type="date" value={date} onChange={e=>{setDate(e.target.value);setSelected(null);}}
            min={new Date().toISOString().split("T")[0]}
            style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #475569",
                     fontSize:13, background:"rgba(255,255,255,0.12)", color:"#fff" }} />
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:5, color:"#fff", fontSize:13, cursor:"pointer" }}>
          <input type="checkbox" checked={tatkal} onChange={e=>setTatkal(e.target.checked)} />
          Tatkal
        </label>
        <button onClick={loadMap} disabled={loading} style={{
          padding:"7px 16px", background:"#f97316", color:"#fff",
          border:"none", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:13,
        }}>
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {/* Price bar */}
      {price && price.matic !== "0.0000" && (
        <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10,
                      padding:"10px 16px", marginBottom:12,
                      display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <span style={{ fontSize:11, color:"#6b7280" }}>Dynamic Price</span>
            <div style={{ fontSize:20, fontWeight:700, color:"#166534" }}>
              {price.matic} MATIC
              <span style={{ fontSize:13, color:"#4b5563", marginLeft:8 }}>≈ ₹{price.inr}</span>
            </div>
          </div>
          <div style={{ fontSize:12, color:"#6b7280" }}>
            {from}→{to} · {price.km} km · {seatClass}
            {tatkal && <span style={{ color:"#dc2626", marginLeft:8 }}>+Tatkal 50%</span>}
          </div>
          {selected && (
            <div style={{ marginLeft:"auto", fontSize:13, fontWeight:700, color:"#1e40af" }}>
              Selected: Seat {selected.number} ({BERTH[selected.berthType]?.label})
            </div>
          )}
        </div>
      )}

      {/* Stats + legend */}
      <div style={{ display:"flex", gap:10, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        {[
          {label:`${stats.available} Available`, color:"#22c55e", bg:"#f0fdf4"},
          {label:`${stats.booked} Booked`,       color:"#6b7280", bg:"#f9fafb"},
        ].map(s=>(
          <div key={s.label} style={{ padding:"4px 12px", borderRadius:16, background:s.bg,
            border:`1px solid ${s.color}30`, display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:s.color }} />
            <span style={{ fontSize:12 }}>{s.label}</span>
          </div>
        ))}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginLeft:8 }}>
          {Object.entries(BERTH).map(([t,c])=>(
            <div key={t} style={{ display:"flex", alignItems:"center", gap:4, padding:"2px 8px",
              borderRadius:10, background:c.bg, border:`1px solid ${c.border}`, fontSize:11 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:c.color }} />
              {c.label}
            </div>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:4, padding:"2px 8px",
            borderRadius:10, background:"#fef9c3", border:"1px solid #facc15", fontSize:11 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:"#facc15" }} />
            Just freed!
          </div>
        </div>
        <button onClick={loadMap} style={{ marginLeft:"auto", padding:"3px 10px", fontSize:11,
          background:"#f3f4f6", border:"1px solid #d1d5db", borderRadius:14, cursor:"pointer" }}>
          ↻ Refresh
        </button>
      </div>

      {error && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8,
        padding:"8px 14px", marginBottom:10, fontSize:13, color:"#dc2626" }}>{error}</div>}

      {/* Coach box */}
      <div style={{ background:"#f8fafc", border:"2px solid #cbd5e1", borderRadius:14,
                    padding:"14px 10px", overflowX:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
          {["🚻 Toilet","🚻 Toilet"].map((t,i)=>(
            <div key={i} style={{ width:90, padding:"5px 0", background:"#e2e8f0",
              borderRadius:8, textAlign:"center", fontSize:11, color:"#64748b" }}>{t}</div>
          ))}
        </div>
        <div style={{ textAlign:"center", marginBottom:12 }}>
          <span style={{ background:"#1e3a5f", color:"#fff", padding:"3px 18px",
            borderRadius:20, fontSize:12, fontWeight:700 }}>
            Train {train} · Coach {coach} · {seatClass}
          </span>
        </div>

        {bays.map((bay, bi) => (
          <div key={bi} style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, color:"#94a3b8", textAlign:"center", marginBottom:3 }}>Bay {bi+1}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 6px", background:"#fff", flex:1 }}>
                <div style={{ display:"flex", gap:3, marginBottom:3 }}>
                  {bay.slice(0,3).map(s=>renderSeat(s))}
                </div>
                <div style={{ display:"flex", gap:3 }}>
                  {bay.slice(3,6).map(s=>renderSeat(s))}
                </div>
              </div>
              <div style={{ width:16, textAlign:"center", fontSize:10, color:"#94a3b8" }}>⌇</div>
              <div style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 5px",
                            background:"#fff", display:"flex", flexDirection:"column", gap:3 }}>
                {bay.slice(6,8).map(s=>renderSeat(s))}
              </div>
            </div>
            {bi < bays.length-1 && <div style={{ borderTop:"1px dashed #e2e8f0", marginTop:8 }} />}
          </div>
        ))}

        <div style={{ display:"flex", justifyContent:"space-between", marginTop:10 }}>
          {["🚻 Toilet","🚻 Toilet"].map((t,i)=>(
            <div key={i} style={{ width:90, padding:"5px 0", background:"#e2e8f0",
              borderRadius:8, textAlign:"center", fontSize:11, color:"#64748b" }}>{t}</div>
          ))}
        </div>
      </div>

      {/* Book button */}
      {selected && (
        <div style={{ marginTop:14, background:"#eff6ff", border:"2px solid #3b82f6",
                      borderRadius:12, padding:"14px 18px",
                      display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1e40af" }}>
              Seat {selected.number} — {BERTH[selected.berthType]?.label}
            </div>
            <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
              Coach {coach} · {price ? `${price.matic} MATIC` : "price loads after date is selected"} · {date || "no date selected"}
            </div>
            {!date && (
              <div style={{ fontSize:11, color:"#d97706", marginTop:4 }}>
                ⚠️ Select a journey date above for dynamic pricing
              </div>
            )}
          </div>
          <button onClick={() => onSeatSelect?.({
            ...selected, coach, train, trainName,
            price: price || { wei: "1000000000000000", matic: "0.0010", inr: "0.08", km: "0" },
            from, to, class: seatClass, tatkal, date,
          })} style={{
            padding:"10px 22px", background:"#2563eb", color:"#fff",
            border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:14, whiteSpace:"nowrap",
          }}>
            Book This Seat →
          </button>
        </div>
      )}
    </div>
  );
}
