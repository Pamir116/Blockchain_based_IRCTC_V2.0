import React, { useState, useEffect } from "react";
import KYCVerify  from "./components/KYCVerify";
import BookTicket from "./components/BookTicket";
import MyTickets  from "./components/MyTickets";
import SeatMap    from "./components/SeatMap";
import { NFTViewer, WaitingList, SwapTicket, TTEScanner, MultisigAdmin } from "./components/AllComponents";
import { connectWallet, switchToLocalhost, shortenAddress, getBalance } from "./utils/web3";
import { ethers } from "ethers";
import { addresses } from "./utils/contract";
import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const RPC     = "http://127.0.0.1:8545";

function StatusDashboard({ walletAddress }) {
  const [backend,   setBackend]   = useState(null);
  const [chain,     setChain]     = useState(null);
  const [accounts,  setAccounts]  = useState([]);
  const [loading,   setLoading]   = useState(false);

  const HARDHAT_ACCOUNTS = [
    { label:"#0 Deployer / You",    addr:"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    { label:"#1 Multisig Owner 2",  addr:"0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
    { label:"#2 Multisig Owner 3",  addr:"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
    { label:"#3 Test Passenger",    addr:"0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
    { label:"#4 Test Passenger",    addr:"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" },
    { label:"#5 Test Passenger",    addr:"0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" },
  ];

  const CONTRACTS = [
    { name:"BookingContractV2",       key:"BookingContractV2"       },
    { name:"NFTTicketContract",       key:"NFTTicketContract"       },
    { name:"DynamicPricingContract",  key:"DynamicPricingContract"  },
    { name:"WLQueueContract",         key:"WLQueueContract"         },
    { name:"PaymentContract",         key:"PaymentContract"         },
    { name:"SwapContract",            key:"SwapContract"            },
    { name:"MultisigAdminWallet",     key:"MultisigAdminWallet"     },
    { name:"BookingContract (v1)",    key:"BookingContract"         },
  ];

  async function refresh() {
    setLoading(true);
    // Backend health
    try {
      const { data } = await axios.get(`${BACKEND}/health`);
      setBackend({ ok:true, ...data });
    } catch { setBackend({ ok:false }); }

    // Chain info + balances
    try {
      const provider = new ethers.JsonRpcProvider(RPC);
      const network  = await provider.getNetwork();
      const block    = await provider.getBlockNumber();
      setChain({ chainId: network.chainId.toString(), block });

      const bals = await Promise.all(
        HARDHAT_ACCOUNTS.map(async a => {
          const bal = await provider.getBalance(a.addr);
          return { ...a, bal: parseFloat(ethers.formatEther(bal)).toFixed(2) };
        })
      );
      setAccounts(bals);
    } catch { setChain({ chainId:"—", block:"—" }); }

    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const dot = ok => (
    <span style={{ display:"inline-block", width:10, height:10, borderRadius:"50%",
                   background: ok ? "#22c55e" : "#ef4444", marginRight:6 }} />
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
        <button onClick={refresh} disabled={loading} style={{ padding:"6px 16px", fontSize:13,
          background:"#f3f4f6", border:"1px solid #d1d5db", borderRadius:8, cursor:"pointer" }}>
          {loading ? "⏳ Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {/* Services */}
      <h3 style={{ fontSize:14, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>Services</h3>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
        {[
          { label:"React Frontend",   port:3000, ok:true,          extra:"localhost:3000"  },
          { label:"Express Backend",  port:5000, ok:!!backend?.ok, extra:`v${backend?.version||"?"}` },
          { label:"Hardhat Node",     port:8545, ok:!!chain?.block, extra:`Block #${chain?.block||"?"}` },
        ].map(s => (
          <div key={s.label} style={{ background:"#f8fafc", border:"1px solid #e2e8f0",
                                      borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:4 }}>
              {dot(s.ok)}{s.label}
            </div>
            <div style={{ fontSize:11, color:"#6b7280" }}>Port :{s.port}</div>
            <div style={{ fontSize:11, color: s.ok?"#16a34a":"#dc2626", fontWeight:600 }}>
              {s.ok ? `✅ ${s.extra}` : "❌ Not reachable"}
            </div>
          </div>
        ))}
      </div>

      {/* Chain info */}
      {chain && (
        <>
          <h3 style={{ fontSize:14, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>Blockchain</h3>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
            {[
              ["Chain ID",    chain.chainId],
              ["Block",       `#${chain.block}`],
              ["Network",     "Hardhat Localhost"],
            ].map(([l,v]) => (
              <div key={l} style={{ background:"#f0fdf4", border:"1px solid #86efac",
                                    borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:10, color:"#6b7280", textTransform:"uppercase" }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:700, color:"#166534" }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Contracts */}
      <h3 style={{ fontSize:14, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>
        Deployed Contracts
      </h3>
      <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10,
                    overflow:"hidden", marginBottom:20 }}>
        {CONTRACTS.map((c, i) => (
          <div key={c.key} style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", padding:"9px 14px",
            borderBottom: i < CONTRACTS.length-1 ? "1px solid #f1f5f9" : "none",
            background: i%2===0 ? "#fff" : "#f8fafc" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{c.name}</div>
            <div style={{ fontSize:11, fontFamily:"monospace", color:"#2563eb",
                          background:"#eff6ff", padding:"2px 8px", borderRadius:6 }}>
              {addresses[c.key] ? `${addresses[c.key].slice(0,10)}...${addresses[c.key].slice(-6)}` : "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Accounts */}
      <h3 style={{ fontSize:14, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>
        Hardhat Test Accounts
      </h3>
      <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
        {accounts.map((a, i) => {
          const isActive = walletAddress?.toLowerCase() === a.addr.toLowerCase();
          return (
            <div key={a.addr} style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", padding:"10px 14px",
              borderBottom: i < accounts.length-1 ? "1px solid #f1f5f9" : "none",
              background: isActive ? "#eff6ff" : i%2===0 ? "#fff" : "#f8fafc" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700,
                              color: isActive ? "#1d4ed8" : "#374151" }}>
                  {a.label} {isActive && <span style={{ background:"#2563eb", color:"#fff",
                    fontSize:10, padding:"1px 7px", borderRadius:10, marginLeft:4 }}>YOU</span>}
                </div>
                <div style={{ fontSize:11, fontFamily:"monospace", color:"#6b7280", marginTop:1 }}>
                  {a.addr}
                </div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"#166534",
                            background:"#f0fdf4", padding:"3px 10px", borderRadius:8 }}>
                {a.bal} ETH
              </div>
            </div>
          );
        })}
      </div>

      {/* Backend features */}
      {backend?.ok && backend.features && (
        <div style={{ marginTop:20 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>
            Backend Features
          </h3>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {backend.features.map(f => (
              <span key={f} style={{ background:"#f0fdf4", border:"1px solid #86efac",
                color:"#166534", fontSize:12, fontWeight:600, padding:"4px 12px", borderRadius:20 }}>
                ✓ {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id:"kyc",      icon:"🔐", label:"KYC Verify",    desc:"Step 1: Verify identity"       },
  { id:"seatmap",  icon:"🗺️",  label:"Seat Map",      desc:"Browse live seat availability" },
  { id:"book",     icon:"🎟️", label:"Book Ticket",   desc:"Step 2: Book on blockchain"    },
  { id:"tickets",  icon:"📋", label:"My Tickets",    desc:"View, QR, cancel"              },
  { id:"nft",      icon:"🎨", label:"NFT Tickets",   desc:"View your NFT ticket art"      },
  { id:"wl",       icon:"⏳", label:"Waiting List",  desc:"Auto-upgrade queue"            },
  { id:"swap",     icon:"🔄", label:"Swap Ticket",   desc:"Official transfer only"        },
  { id:"tte",      icon:"📱", label:"TTE Scanner",   desc:"Verify tickets at station"     },
  { id:"admin",    icon:"🔑", label:"Multisig Admin",desc:"2-of-3 admin panel"            },
  { id:"status",   icon:"🖥️", label:"System Status", desc:"Services, contracts, accounts" },
];

const FEATURES = [
  "NFT Tickets (ERC-721)", "Visual Seat Map", "Dynamic Pricing",
  "2-of-3 Multisig", "Auto WL Upgrade", "DigiLocker KYC",
  "On-chain Audit Trail", "Wallet-bound Tickets", "Anti-bot Windows",
  "No-show Penalty", "Official Swap Only", "TTE QR Verify",
];

export default function App() {
  const [tab,     setTab]     = useState("kyc");
  const [wallet,  setWallet]  = useState("");
  const [balance, setBalance] = useState("");
  const [netErr,  setNetErr]  = useState("");

  async function connect() {
    try {
      await switchToLocalhost();
      const { address, provider } = await connectWallet();
      setWallet(address);
      const bal = await provider.getBalance(address);
      const { ethers } = await import("ethers");
      setBalance(parseFloat(ethers.formatEther(bal)).toFixed(4));
      setNetErr("");
    } catch (e) { setNetErr("Connection failed: " + e.message); }
  }

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method:"eth_accounts" })
        .then(accs => { if (accs.length > 0) setWallet(accs[0]); });
      window.ethereum.on("accountsChanged", accs => setWallet(accs[0]||""));
    }
  }, []);

  function renderTab() {
    switch (tab) {
      case "kyc":     return <KYCVerify     walletAddress={wallet} />;
      case "seatmap": return <SeatMap       walletAddress={wallet} onSeatSelect={info=>{ if(info){setTab("book");} }} />;
      case "book":    return <BookTicket    walletAddress={wallet} />;
      case "tickets": return <MyTickets     walletAddress={wallet} />;
      case "nft":     return <NFTViewer     walletAddress={wallet} />;
      case "wl":      return <WaitingList   walletAddress={wallet} />;
      case "swap":    return <SwapTicket    walletAddress={wallet} />;
      case "tte":     return <TTEScanner    walletAddress={wallet} />;
      case "admin":   return <MultisigAdmin  walletAddress={wallet} />;
      case "status":  return <StatusDashboard walletAddress={wallet} />;
      default:        return null;
    }
  }

  const currentTab = TABS.find(t=>t.id===tab);

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", minHeight:"100vh", background:"#f1f5f9" }}>

      {/* Header */}
      <header style={{ background:"linear-gradient(135deg,#1e3a5f 0%,#1e40af 100%)",
                       color:"#fff", padding:"0 1.5rem", display:"flex",
                       justifyContent:"space-between", alignItems:"center", height:60,
                       boxShadow:"0 2px 12px rgba(0,0,0,0.2)", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:22, fontWeight:800 }}>🚂 IRCTC Blockchain</span>
          <span style={{ background:"rgba(255,255,255,0.15)", padding:"2px 10px",
                         borderRadius:20, fontSize:10, border:"1px solid rgba(255,255,255,0.2)" }}>
            v2.0 · Combined
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {wallet ? (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#4ade80" }} />
              <span style={{ fontSize:12 }}>{shortenAddress(wallet)}</span>
              {balance && <span style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{balance} ETH</span>}
            </div>
          ) : (
            <button onClick={connect} style={{ padding:"7px 16px", background:"#f97316",
              border:"none", color:"#fff", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 }}>
              Connect MetaMask
            </button>
          )}
        </div>
      </header>

      {/* Alerts */}
      {!wallet && <div style={{ background:"#fef3c7", padding:"8px 1.5rem", fontSize:13, color:"#92400e",
                                borderBottom:"1px solid #fde68a" }}>
        ⚠️ Connect MetaMask → switch to "Hardhat Localhost" (Chain ID: 1337) → run <code>npx hardhat node</code>
      </div>}
      {netErr && <div style={{ background:"#fef2f2", padding:"8px 1.5rem", fontSize:13, color:"#dc2626",
                               borderBottom:"1px solid #fca5a5" }}>❌ {netErr}</div>}

      <div style={{ display:"flex", maxWidth:1200, margin:"1.5rem auto", gap:20, padding:"0 1rem" }}>

        {/* Sidebar */}
        <aside style={{ width:200, flexShrink:0 }}>
          {/* Wallet card */}
          <div style={{ background:"#fff", borderRadius:12, padding:14,
                        border:"1px solid #e2e8f0", marginBottom:14 }}>
            <p style={{ margin:"0 0 6px", fontSize:10, fontWeight:700, color:"#9ca3af",
                        textTransform:"uppercase", letterSpacing:"0.07em" }}>Wallet</p>
            {wallet
              ? <><p style={{ margin:0, fontSize:11, color:"#374151", wordBreak:"break-all" }}>{wallet}</p>
                  <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#4ade80" }} />
                    <span style={{ fontSize:11, color:"#16a34a" }}>Connected</span>
                  </div></>
              : <p style={{ margin:0, fontSize:12, color:"#9ca3af" }}>Not connected</p>
            }
          </div>

          {/* Nav */}
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
            {TABS.map((t, i) => (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                width:"100%", padding:"10px 12px", textAlign:"left",
                background: tab===t.id ? "#eff6ff" : "transparent",
                border:"none",
                borderBottom: i<TABS.length-1 ? "1px solid #f8fafc" : "none",
                borderLeft: tab===t.id ? "3px solid #2563eb" : "3px solid transparent",
                cursor:"pointer",
              }}>
                <div style={{ fontSize:12, fontWeight:tab===t.id?700:400,
                               color:tab===t.id?"#1d4ed8":"#374151" }}>
                  {t.icon} {t.label}
                </div>
                <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>{t.desc}</div>
              </button>
            ))}
          </div>

          {/* Feature badges */}
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0",
                        padding:12, marginTop:14 }}>
            <p style={{ margin:"0 0 8px", fontSize:10, fontWeight:700, color:"#9ca3af",
                        textTransform:"uppercase" }}>All Features</p>
            {FEATURES.map(f=>(
              <div key={f} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
                <span style={{ color:"#10b981", fontSize:10 }}>✓</span>
                <span style={{ fontSize:10, color:"#374151" }}>{f}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex:1, background:"#fff", borderRadius:12,
                       border:"1px solid #e2e8f0", padding:"1.25rem", minWidth:0 }}>
          <h2 style={{ margin:"0 0 18px", fontSize:17, color:"#111827",
                       borderBottom:"1px solid #f1f5f9", paddingBottom:12,
                       display:"flex", alignItems:"center", gap:8 }}>
            <span>{currentTab?.icon}</span>
            <span>{currentTab?.label}</span>
          </h2>
          {renderTab()}
        </main>
      </div>
    </div>
  );
}
