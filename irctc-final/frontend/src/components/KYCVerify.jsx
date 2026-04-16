import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

export default function KYCVerify({ walletAddress }) {
  const [step,     setStep]     = useState(1);   // 1=form, 2=otp, 3=done
  const [form,     setForm]     = useState({ name: "", aadhaar: "", dob: "" });
  const [otp,      setOtp]      = useState(["","","","","",""]);
  const [masked,   setMasked]   = useState("");
  const [devOtp,   setDevOtp]   = useState("");
  const [status,   setStatus]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [kycData,  setKycData]  = useState(null);
  const [timer,    setTimer]    = useState(0);
  const timerRef = useRef(null);
  const otpRefs  = useRef([]);

  useEffect(() => {
    if (walletAddress) checkStatus();
  }, [walletAddress]);

  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setTimeout(() => setTimer(t => t - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [timer]);

  async function checkStatus() {
    try {
      const { data } = await axios.get(`${BACKEND}/api/kyc/status/${walletAddress}`);
      if (data.isVerified) { setKycData(data); setStep(3); }
    } catch {}
  }

  // ── Step 1: Send OTP ─────────────────────────────────────────────
  async function handleSendOtp() {
    if (!walletAddress)   return setStatus("❌ Connect wallet first");
    if (!form.name.trim()) return setStatus("❌ Enter your full name");
    const clean = form.aadhaar.replace(/\s/g, "");
    if (clean.length !== 12 || isNaN(clean)) return setStatus("❌ Aadhaar must be 12 digits");
    if (!form.dob)        return setStatus("❌ Enter date of birth");

    setLoading(true); setStatus("⏳ Sending OTP...");
    try {
      const { data } = await axios.post(`${BACKEND}/api/kyc/send-otp`, {
        walletAddress, aadhaarNumber: clean, name: form.name, dob: form.dob,
      });

      if (data.alreadyVerified) {
        await checkStatus();
        return;
      }

      setMasked(data.maskedAadhaar);
      setStatus("");
      setTimer(300); // 5 min countdown
      setStep(2);

      // Dev mode: auto-fill OTP
      if (data.devOtp) {
        setDevOtp(data.devOtp);
        const digits = data.devOtp.split("");
        setOtp(digits);
        setTimeout(() => otpRefs.current[5]?.focus(), 100);
      } else {
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch (err) {
      setStatus(`❌ ${err.response?.data?.error || err.message}`);
    }
    setLoading(false);
  }

  // ── Step 2: Verify OTP ───────────────────────────────────────────
  async function handleVerifyOtp() {
    const otpStr = otp.join("");
    if (otpStr.length !== 6) return setStatus("❌ Enter all 6 digits");

    setLoading(true); setStatus("⏳ Verifying OTP on blockchain...");
    try {
      const { data } = await axios.post(`${BACKEND}/api/kyc/verify`, {
        walletAddress, aadhaarNumber: form.aadhaar.replace(/\s/g,""),
        name: form.name, dob: form.dob, otp: otpStr,
      });
      setKycData(data);
      setStep(3);
      setStatus("");
    } catch (err) {
      setStatus(`❌ ${err.response?.data?.error || err.message}`);
    }
    setLoading(false);
  }

  async function resendOtp() {
    setOtp(["","","","","",""]); setDevOtp(""); setStatus("");
    await handleSendOtp();
  }

  // OTP input handler
  function handleOtpInput(i, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i+1]?.focus();
  }
  function handleOtpKey(i, e) {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i-1]?.focus();
  }

  const fmt = ts => new Date(Number(ts)*1000).toLocaleDateString("en-IN");
  const inp = { width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #d1d5db",
                fontSize:14, marginBottom:12, boxSizing:"border-box", background:"#fff" };
  const lbl = { display:"block", marginBottom:4, fontSize:13, fontWeight:600, color:"#374151" };
  const mins = String(Math.floor(timer/60)).padStart(2,"0");
  const secs = String(timer%60).padStart(2,"0");

  // ── Verified ─────────────────────────────────────────────────────
  if (step === 3 && kycData) return (
    <div style={{ maxWidth:480, margin:"0 auto" }}>
      <div style={{ background:"linear-gradient(135deg,#166534,#15803d)", borderRadius:16,
                    padding:24, color:"#fff", textAlign:"center", marginBottom:20 }}>
        <div style={{ fontSize:56, marginBottom:8 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:700 }}>KYC Verified</div>
        <div style={{ fontSize:13, opacity:.75, marginTop:4 }}>
          Identity confirmed via Aadhaar OTP
        </div>
      </div>
      <div style={{ background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0", padding:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {[
            ["Name",         kycData.name || "Verified"],
            ["Aadhaar",      kycData.maskedAadhaar || "XXXX XXXX ????"],
            ["Wallet",       walletAddress?.slice(0,14)+"..."],
            ["Method",       "Aadhaar OTP"],
            ["Status",       "✅ On-chain confirmed"],
            ["Verified at",  kycData.verifiedAt ? fmt(new Date(kycData.verifiedAt).getTime()/1000) : "Just now"],
          ].map(([l,v]) => (
            <div key={l}>
              <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em" }}>{l}</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#111827" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:14, padding:"10px 12px", background:"#eff6ff",
                      borderRadius:8, fontSize:12, color:"#1d4ed8" }}>
          🔐 Aadhaar number was hashed with SHA-256. Raw number is never stored.
        </div>
      </div>
    </div>
  );

  // ── Step 1: Details form ─────────────────────────────────────────
  if (step === 1) return (
    <div style={{ maxWidth:480, margin:"0 auto" }}>
      <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10,
                    padding:"12px 16px", marginBottom:16 }}>
        <p style={{ margin:0, fontSize:13, color:"#1d4ed8" }}>
          <strong>Step 1 of 2:</strong> Enter your details. An OTP will be sent to the mobile
          number linked with your Aadhaar.
        </p>
      </div>

      {/* Dev note */}
      <div style={{ background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:10,
                    padding:"10px 14px", marginBottom:20 }}>
        <p style={{ margin:0, fontSize:12, color:"#7c3aed" }}>
          🧪 <strong>Dev mode:</strong> OTP prints to the backend console and is shown on screen.
          In production this sends a real SMS via UIDAI/Twilio.
        </p>
      </div>

      <label style={lbl}>Full Name (as per Aadhaar)</label>
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
        placeholder="Rajesh Kumar" style={inp} />

      <label style={lbl}>Aadhaar Number (12 digits)</label>
      <input value={form.aadhaar}
        onChange={e=>setForm({...form,aadhaar:e.target.value.replace(/\D/g,"").slice(0,12)})}
        placeholder="123456789012" maxLength={12}
        style={{ ...inp, fontFamily:"monospace", letterSpacing:3, fontSize:18 }} />
      <div style={{ fontSize:11, color:"#9ca3af", marginTop:-8, marginBottom:12 }}>
        {form.aadhaar.length}/12 digits
      </div>

      <label style={lbl}>Date of Birth</label>
      <input type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})} style={inp} />

      <div style={{ background:"#f9fafb", borderRadius:8, padding:"10px 12px",
                    marginBottom:16, fontSize:12, color:"#6b7280" }}>
        <strong>Wallet:</strong> {walletAddress || "Not connected"}
      </div>

      <button onClick={handleSendOtp} disabled={loading||!walletAddress} style={{
        width:"100%", padding:"13px 0",
        background: loading||!walletAddress ? "#9ca3af" : "#2563eb",
        color:"#fff", border:"none", borderRadius:10,
        cursor: loading||!walletAddress ? "not-allowed" : "pointer",
        fontSize:15, fontWeight:700,
      }}>
        {loading ? "⏳ Sending OTP..." : "📱 Send OTP to Aadhaar Mobile"}
      </button>

      {status && (
        <div style={{ marginTop:12, padding:"10px 14px", borderRadius:8, fontSize:13,
          background:"#fef2f2", border:"1px solid #fca5a5", color:"#dc2626" }}>
          {status}
        </div>
      )}
    </div>
  );

  // ── Step 2: OTP entry ─────────────────────────────────────────────
  return (
    <div style={{ maxWidth:480, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#1e40af)", borderRadius:14,
                    padding:20, color:"#fff", textAlign:"center", marginBottom:20 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>📱</div>
        <div style={{ fontSize:18, fontWeight:700 }}>Enter OTP</div>
        <div style={{ fontSize:13, opacity:.75, marginTop:4 }}>
          Sent to mobile linked with Aadhaar <strong>{masked}</strong>
        </div>
      </div>

      {/* Dev OTP banner */}
      {devOtp && (
        <div style={{ background:"#fef9c3", border:"2px dashed #fbbf24", borderRadius:10,
                      padding:"12px 16px", marginBottom:16, textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#92400e", marginBottom:4 }}>
            🧪 DEV MODE — OTP (would be sent via SMS in production)
          </div>
          <div style={{ fontSize:34, fontWeight:800, letterSpacing:8, color:"#92400e",
                        fontFamily:"monospace" }}>
            {devOtp}
          </div>
        </div>
      )}

      {/* 6-box OTP input */}
      <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:20 }}>
        {otp.map((digit, i) => (
          <input key={i}
            ref={el => otpRefs.current[i] = el}
            type="text" inputMode="numeric" maxLength={1}
            value={digit}
            onChange={e => handleOtpInput(i, e.target.value)}
            onKeyDown={e => handleOtpKey(i, e)}
            style={{
              width:52, height:60, textAlign:"center", fontSize:26, fontWeight:700,
              borderRadius:10, border: digit ? "2px solid #2563eb" : "2px solid #d1d5db",
              outline:"none", background: digit ? "#eff6ff" : "#fff",
              color:"#1e40af", fontFamily:"monospace",
            }}
          />
        ))}
      </div>

      {/* Timer */}
      <div style={{ textAlign:"center", marginBottom:16, fontSize:13, color:"#6b7280" }}>
        {timer > 0
          ? <span>OTP expires in <strong style={{ color: timer < 60 ? "#dc2626" : "#374151" }}>
              {mins}:{secs}
            </strong></span>
          : <span style={{ color:"#dc2626" }}>OTP expired —&nbsp;
              <button onClick={resendOtp} style={{ background:"none", border:"none",
                color:"#2563eb", cursor:"pointer", fontWeight:700, fontSize:13, padding:0 }}>
                Resend OTP
              </button>
            </span>
        }
      </div>

      {/* Verify button */}
      <button onClick={handleVerifyOtp}
        disabled={loading || otp.join("").length !== 6 || timer === 0} style={{
        width:"100%", padding:"13px 0",
        background: loading || otp.join("").length !== 6 || timer === 0 ? "#9ca3af" : "#10b981",
        color:"#fff", border:"none", borderRadius:10,
        cursor: loading || otp.join("").length !== 6 || timer === 0 ? "not-allowed" : "pointer",
        fontSize:15, fontWeight:700, marginBottom:12,
      }}>
        {loading ? "⏳ Verifying..." : "✅ Verify OTP & Complete KYC"}
      </button>

      {/* Back + Resend */}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={() => { setStep(1); setStatus(""); setOtp(["","","","","",""]); setDevOtp(""); }}
          style={{ flex:1, padding:"10px 0", background:"#f3f4f6", border:"1px solid #d1d5db",
                   borderRadius:8, cursor:"pointer", fontSize:13, color:"#374151" }}>
          ← Change Details
        </button>
        {timer > 0 && (
          <button onClick={resendOtp} disabled={loading}
            style={{ flex:1, padding:"10px 0", background:"#fff", border:"1px solid #2563eb",
                     borderRadius:8, cursor:"pointer", fontSize:13, color:"#2563eb", fontWeight:600 }}>
            Resend OTP
          </button>
        )}
      </div>

      {status && (
        <div style={{ marginTop:14, padding:"10px 14px", borderRadius:8, fontSize:13,
          background: status.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${status.startsWith("✅") ? "#86efac" : "#fca5a5"}`,
          color: status.startsWith("✅") ? "#166534" : "#dc2626" }}>
          {status}
        </div>
      )}
    </div>
  );
}
