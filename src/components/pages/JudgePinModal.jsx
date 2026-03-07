import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { hashPin, isHashed } from "../../lib/utils.js";
import { migrateCompData, migrateScoreKeys, migrateGymnasts } from "../../lib/migrate.js";
import { scoresToFlat } from "../../lib/scoring.js";
import GymCompLogo from "../../assets/GymComp-Logo.svg";

// ============================================================
// JUDGE PIN MODAL — competition ID + PIN entry overlay
// ============================================================
function JudgePinModal({ onResume, onClose }) {
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  // Reset to step 1 if ID changes after check
  const handleIdChange = (e) => {
    setResumeId(e.target.value);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  // Step 1: check competition ID
  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setChecking(true);
    const { data, error } = await supabase.fetchOne("competitions", id);
    setChecking(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      // No PIN — proceed directly
      onResume(id, data.data);
    }
  };

  // Step 2: verify PIN
  const handlePinSubmit = async () => {
    if (!fetchedData) return;
    const storedPin = fetchedData.pin;
    const match = isHashed(storedPin)
      ? storedPin === await hashPin(resumePin)
      : storedPin === resumePin;
    if (!match) { setResumeError("Incorrect PIN."); return; }
    onResume(resumeId.trim(), fetchedData);
  };

  const inputStyle = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border)",
    borderRadius: 72, padding: "16px 24px", fontFamily: "inherit",
    fontSize: 16, color: "var(--text-primary)", outline: "none", background: "transparent",
  };

  const btnStyle = (disabled) => ({
    width: "100%", background: "var(--brand-01)", border: "none", borderRadius: 72,
    padding: 16, fontFamily: "inherit", fontWeight: 400,
    fontSize: 16, color: "var(--text-alternate)", textAlign: "center",
    letterSpacing: "0.3px", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--background-light)", borderRadius: 24, padding: 32,
          width: 347, maxWidth: "calc(100vw - 32px)", position: "relative",
          display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box",
          fontFamily: "var(--font-display)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 13, right: 13, width: 25, height: 25,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: "inherit", fontSize: 16, color: "var(--text-tertiary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Close"
        >
          &#x2715;
        </button>

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 18, color: "var(--text-primary)", lineHeight: 1.2 }}>
            Enter Competition
          </div>
          <div style={{ fontFamily: "inherit", fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            {compChecked && compHasPin
              ? "This competition requires a PIN. Please enter the PIN provided by the organiser."
              : "If you are a Judge or someone entering the Scores please enter the Competition ID — if you are unsure please contact your Competition Organiser."}
          </div>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            placeholder="Competition ID"
            value={resumeId}
            onChange={handleIdChange}
            onKeyDown={e => e.key === "Enter" && (!compChecked ? handleCheck() : handlePinSubmit())}
            autoFocus={!compChecked}
            style={inputStyle}
          />
          {compChecked && compHasPin && (
            <input
              placeholder="Enter PIN"
              type="password"
              maxLength={4}
              value={resumePin}
              onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
              onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
              autoFocus
              style={inputStyle}
            />
          )}
          {resumeError && <div style={{ fontSize: 13, color: "#e53e3e", paddingLeft: 24 }}>{resumeError}</div>}
          {!compChecked ? (
            <button
              onClick={handleCheck}
              disabled={checking || !resumeId.trim()}
              style={btnStyle(checking || !resumeId.trim())}
            >
              {checking ? "Checking…" : "Continue →"}
            </button>
          ) : (
            <button
              onClick={handlePinSubmit}
              disabled={!resumePin.trim()}
              style={btnStyle(!resumePin.trim())}
            >
              Enter Competition →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


export default JudgePinModal;
