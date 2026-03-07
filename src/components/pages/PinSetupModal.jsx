import { useState } from "react";
import { hashPin } from "../../lib/utils.js";

// ============================================================
// PIN SETUP MODAL
// ============================================================
function PinSetupModal({ onSet, onSkip }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const handleSet = async () => {
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits."); return; }
    if (pin !== confirm) { setErr("PINs don't match."); return; }
    onSet(await hashPin(pin));
  };

  return (
    <>
    <style>{`
      .pin-input{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-light);font-family:var(--font-display);font-size:14px;color:var(--text-primary);outline:none;box-sizing:border-box;transition:border-color 0.15s;}
      .pin-input:focus{border-color:var(--brand-01);}
      .pin-input::placeholder{color:var(--text-tertiary);}
      .pin-label{font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px;}
    `}</style>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--background-light)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, fontFamily: "var(--font-display)" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Set a PIN</div>
        <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 24, lineHeight: 1.5 }}>
          Set a PIN to restrict score entry to authorised judges and scorers. Anyone entering scores will need this PIN to access the competition.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label className="pin-label">PIN (4 digits)</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} placeholder="e.g. 1234"
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,""))} />
          </div>
          <div>
            <label className="pin-label">Confirm PIN</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} placeholder="Repeat PIN"
              value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g,""))}
              onKeyDown={e => e.key === "Enter" && handleSet()} />
          </div>
          {err && <div style={{ fontSize: 13, color: "#e53e3e", padding: "10px 16px", background: "#fff5f5", borderRadius: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSet}
              style={{
                flex: 1, padding: "14px", borderRadius: 56, background: "var(--brand-01)", border: "none",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-alternate)",
              }}
            >Set PIN</button>
            <button
              onClick={onSkip}
              style={{
                flex: 1, padding: "14px", borderRadius: 56, background: "none", border: "1px solid #e4e4e4",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
              }}
            >Skip — no PIN</button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}


export default PinSetupModal;
