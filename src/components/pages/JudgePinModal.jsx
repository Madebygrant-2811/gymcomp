import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { hashPin, isHashed } from "../../lib/utils.js";
import { getApparatusIcon } from "../../lib/pdf.js";

// ============================================================
// JUDGE PIN MODAL — competition ID + PIN + role + apparatus
// ============================================================
function JudgePinModal({ onResume, onClose }) {
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  // Post-PIN steps
  const [modalStep, setModalStep] = useState("pin"); // "pin" | "role" | "apparatus"
  const [validatedId, setValidatedId] = useState("");

  // Reset to step 1 if ID changes after check
  const handleIdChange = (e) => {
    setResumeId(e.target.value);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  // After PIN validated (or no PIN), go to role selection
  const proceedToRole = (id, data) => {
    setFetchedData(data);
    setValidatedId(id);
    setModalStep("role");
  };

  // Step 1: check competition ID
  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setChecking(true);
    const { data, error } = await supabase.from("competitions").select("*").eq("id", id).maybeSingle();
    setChecking(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      proceedToRole(id, data.data);
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
    proceedToRole(resumeId.trim(), fetchedData);
  };

  // Role selection
  const handleRoleSelect = (role) => {
    if (role === "scorekeeper") {
      onResume(validatedId, fetchedData, "scorekeeper", null);
    } else {
      const apparatus = (fetchedData.compData?.apparatus || []).filter(a => a !== "Rest");
      if (apparatus.length === 1) {
        onResume(validatedId, fetchedData, "judge", apparatus[0]);
      } else {
        setModalStep("apparatus");
      }
    }
  };

  // Apparatus selection
  const handleApparatusSelect = (app) => {
    onResume(validatedId, fetchedData, "judge", app);
  };

  const apparatus = (fetchedData?.compData?.apparatus || []).filter(a => a !== "Rest");

  return (
    <>
      <style>{`
        .jpm-header { font-weight: 700; font-size: 16px; color: var(--text); margin-bottom: 4px; }
        .jpm-sub { font-size: 12px; color: var(--muted); line-height: 1.5; margin-bottom: 8px; }
        .jpm-error { font-size: 12px; color: var(--danger); margin-top: -4px; }
        .jpm-roles { display: flex; gap: 10px; margin-top: 4px; }
        .jpm-role-card { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 12px; border-radius: 12px; border: 1.5px solid var(--border); background: var(--surface); cursor: pointer; transition: border-color 0.15s, background 0.15s, box-shadow 0.15s; }
        .jpm-role-card:hover { border-color: var(--accent); background: rgba(0,13,255,0.03); box-shadow: 0 2px 8px rgba(0,13,255,0.08); }
        .jpm-role-icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(0,13,255,0.06); display: flex; align-items: center; justify-content: center; }
        .jpm-role-label { font-weight: 700; font-size: 14px; color: var(--text); }
        .jpm-role-desc { font-size: 11px; color: var(--muted); text-align: center; line-height: 1.4; }
        .jpm-app-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .jpm-app-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px 20px; border-radius: 56px; border: 1.5px solid var(--border); background: var(--surface); font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--text); cursor: pointer; transition: border-color 0.15s, background 0.15s, box-shadow 0.15s; }
        .jpm-app-btn:hover { border-color: var(--accent); background: rgba(0,13,255,0.03); box-shadow: 0 2px 8px rgba(0,13,255,0.08); }
        .jpm-back { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 12px; color: var(--muted); padding: 6px 0; align-self: center; margin-top: 4px; }
        .jpm-back:hover { color: var(--text); }
      `}</style>

      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>

          {/* ── PIN entry step ── */}
          {modalStep === "pin" && (<>
            <div className="jpm-header">Enter Competition</div>
            <div className="jpm-sub">
              {compChecked && compHasPin
                ? "This competition requires a PIN. Please enter the PIN provided by the organiser."
                : "Enter the Competition ID to join as a Judge or Scorekeeper."}
            </div>

            <div className="field">
              <label className="label">Competition ID</label>
              <input
                className="input"
                placeholder="e.g. abc123"
                value={resumeId}
                onChange={handleIdChange}
                onKeyDown={e => e.key === "Enter" && (!compChecked ? handleCheck() : handlePinSubmit())}
                autoFocus={!compChecked}
              />
            </div>

            {compChecked && compHasPin && (
              <div className="field">
                <label className="label">PIN</label>
                <input
                  className="input"
                  placeholder="Enter PIN"
                  type="password"
                  maxLength={4}
                  value={resumePin}
                  onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
                  onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
                  autoFocus
                />
              </div>
            )}

            {resumeError && <div className="jpm-error">{resumeError}</div>}

            {!compChecked ? (
              <button
                className="btn btn-primary"
                onClick={handleCheck}
                disabled={checking || !resumeId.trim()}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {checking ? "Checking…" : "Continue"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handlePinSubmit}
                disabled={!resumePin.trim()}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Enter Competition
              </button>
            )}
          </>)}

          {/* ── Role selection step ── */}
          {modalStep === "role" && (<>
            <div className="jpm-header">What is your role?</div>
            <div className="jpm-sub">Select how you'll be using the competition.</div>

            <div className="jpm-roles">
              <button className="jpm-role-card" onClick={() => handleRoleSelect("judge")}>
                <div className="jpm-role-icon">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14V3a1 1 0 00-1-1H5a1 1 0 00-1 1v11M6 5h4M6 8h4M6 11h2"/></svg>
                </div>
                <div className="jpm-role-label">Judge</div>
                <div className="jpm-role-desc">Locked to one apparatus</div>
              </button>
              <button className="jpm-role-card" onClick={() => handleRoleSelect("scorekeeper")}>
                <div className="jpm-role-icon">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 2v12"/></svg>
                </div>
                <div className="jpm-role-label">Scorekeeper</div>
                <div className="jpm-role-desc">Full access to all apparatus</div>
              </button>
            </div>

            <button className="jpm-back" onClick={() => { setModalStep("pin"); setCompChecked(false); setCompHasPin(false); setResumePin(""); }}>
              ← Back
            </button>
          </>)}

          {/* ── Apparatus selection step (Judge only) ── */}
          {modalStep === "apparatus" && (<>
            <div className="jpm-header">Which apparatus?</div>
            <div className="jpm-sub">You'll be locked to this apparatus for the session.</div>

            <div className="jpm-app-list">
              {apparatus.map(app => (
                <button key={app} className="jpm-app-btn" onClick={() => handleApparatusSelect(app)}>
                  {getApparatusIcon(app)} {app}
                </button>
              ))}
            </div>

            <button className="jpm-back" onClick={() => setModalStep("role")}>
              ← Back
            </button>
          </>)}
        </div>
      </div>
    </>
  );
}


export default JudgePinModal;
