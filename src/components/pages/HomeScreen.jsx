import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { isHashed, hashPin } from "../../lib/utils.js";
import GymCompLogo from "../../assets/GymComp-Logo.svg";
import LaptopSignUp from "../../assets/Laptop-sign-up.png";

function HomeScreen({ onNew, onResume }) {
  const [recentComps, setRecentComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [resuming, setResuming] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (inSandbox) { setLoading(false); return; }
    let cancelled = false;
    supabase.from("competitions").select("id, data->compData->>name, data->compData->>date, data->compData->>location, created_at").order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      if (cancelled) return;
      setRecentComps(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleIdChange = (val) => {
    setResumeId(val);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setResuming(true);
    const { data, error } = await supabase.from("competitions").select("*").eq("id", id).maybeSingle();
    setResuming(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      onResume(id, data.data);
    }
  };

  const handlePinSubmit = async () => {
    if (!fetchedData) return;
    const storedPin = fetchedData.pin;
    // Legacy plaintext PINs: compare directly; hashed PINs: hash input first
    const match = isHashed(storedPin)
      ? storedPin === await hashPin(resumePin)
      : storedPin === resumePin;
    if (!match) { setResumeError("Incorrect PIN."); return; }
    onResume(resumeId.trim(), fetchedData);
  };

  const handleResume = compChecked ? handlePinSubmit : handleCheck;

  return (
    <div className="home-wrap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, minHeight: "calc(100vh - 65px)" }}>
      <div style={{ width: "100%", maxWidth: 700 }}>

        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="home-logo" style={{ fontFamily: "var(--font-display)", fontSize: 72, letterSpacing: 4, lineHeight: 1, color: "var(--accent)" }}>GYMCOMP</div>
          <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 15 }}>Competition management & live results</div>
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "16px 24px", marginBottom: 24 }}
          onClick={onNew}>
          + New Competition
        </button>

        <div className="card">
          <div className="card-title">Resume Existing Competition</div>
          <div className="home-resume-row" style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="input" placeholder="Competition ID" style={{ flex: 2, minWidth: 160 }}
              value={resumeId} onChange={e => handleIdChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResume()} />
            {compChecked && compHasPin && (
              <input className="input" placeholder="Enter PIN" style={{ flex: 1, minWidth: 100 }}
                type="password" maxLength={4} autoFocus
                value={resumePin} onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePinSubmit()} />
            )}
            <button className="btn btn-secondary" onClick={handleResume} disabled={resuming || !resumeId.trim() || (compChecked && compHasPin && !resumePin.trim())}>
              {resuming ? "Checking…" : compChecked && compHasPin ? "Enter →" : "Continue →"}
            </button>
          </div>
          {resumeError && <div className="error-box" style={{ marginTop: 8 }}>{resumeError}</div>}
        </div>

        {!inSandbox && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">Recent Competitions</div>
            {loading && <div className="empty">Loading…</div>}
            {!loading && recentComps.length === 0 && <div className="empty">No competitions yet</div>}
            {recentComps.map(c => (
              <div key={c.id} className="list-item" style={{ cursor: "pointer" }}
                onClick={() => { setResumeId(c.id); }}>
                <div className="list-item-content">
                  <strong>{c.name || "Untitled"}</strong>
                  {c.date && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 10 }}>
                    {new Date(c.date + "T12:00:00").toLocaleDateString("en-GB")}
                  </span>}
                  {c.location && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>· {c.location}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{c.id}</div>
              </div>
            ))}
          </div>
        )}

        {inSandbox && (
          <div className="warn-box" style={{ marginTop: 20, textAlign: "center" }}>
            ⚪ Running in preview mode — deploy to enable Supabase sync & recent competitions list
          </div>
        )}
      </div>
    </div>
  );
}


export default HomeScreen;
