import { useState, useMemo } from "react";
import { hashPin } from "../../lib/utils.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";

// ============================================================
// COMPETITION CONFIGURATION — setup sections. Foundational
// competition-level settings, embedded in Comp Setup (Step 1):
// scoring mode, vault mode, execution start value, ranking mode
// and the score lock. Writes through the setup draft setter, so
// changes commit with Save & Update like the rest of setup.
// ============================================================
function CompConfigSections({ data, setData, scores = {}, eventStatus }) {
  const [pendingScoringSwitch, setPendingScoringSwitch] = useState(null); // "nga" | "fig" | "simple"
  const [pinModal, setPinModal] = useState(null); // { mode: "enable" | "change", value, confirm, error }
  const [pinSaving, setPinSaving] = useState(false);

  // Any submitted score across the whole competition
  const hasAnyScore = useMemo(
    () => Object.keys(scores).some((k) => parseFloat(scores[k]) > 0),
    [scores]
  );
  // Scoring mode stays editable through setup — it only locks once the
  // competition goes live (and stays locked after).
  const scoringModeLocked = eventStatus === "live" || eventStatus === "completed" || eventStatus === "archived";

  const scoringMode = data.scoringMode || "fig";
  const eScoreStart = data.eScoreStart ?? 10;
  const scoreLockOn = !!data.scoreLockEnabled;

  const doScoringSwitch = (mode) => {
    // Levels are only wiped crossing the NGA boundary — NGA uses its fixed
    // hierarchy, FIG and Simple share custom levels.
    if ((mode === "nga" || scoringMode === "nga") && (data.levels || []).length > 0) {
      setPendingScoringSwitch(mode);
      return;
    }
    setData((d) => ({ ...d, scoringMode: mode }));
  };

  const commitEScoreStart = (raw) => {
    const v = parseFloat(raw);
    setData((d) => ({ ...d, eScoreStart: isNaN(v) || v <= 0 ? 10 : v }));
  };

  const handleScoreLockToggle = () => {
    if (scoreLockOn) {
      setData((d) => ({ ...d, scoreLockEnabled: false }));
    } else if (data.scoreEditPin) {
      setData((d) => ({ ...d, scoreLockEnabled: true }));
    } else {
      // First enable — a score edit PIN must be set
      setPinModal({ mode: "enable", value: "", confirm: "", error: "" });
    }
  };

  const savePinModal = async () => {
    const val = (pinModal.value || "").trim();
    if (!/^\d{4,8}$/.test(val)) {
      setPinModal((m) => ({ ...m, error: "The score edit PIN must be 4–8 digits." }));
      return;
    }
    if (val !== (pinModal.confirm || "").trim()) {
      setPinModal((m) => ({ ...m, error: "The PINs don't match." }));
      return;
    }
    setPinSaving(true);
    const hashed = await hashPin(val);
    setData((d) => ({ ...d, scoreEditPin: hashed, scoreLockEnabled: true }));
    setPinSaving(false);
    setPinModal(null);
  };

  // Option card: the context lives on the card itself, visible before any
  // choice is made — a bare label like "FIG" means nothing on its own.
  const optionCard = ({ key, active, locked, title, desc, onClick }) => (
    <button key={key}
      disabled={locked}
      onClick={() => { if (!active) onClick(); }}
      style={{
        flex: "1 1 220px", minWidth: 200, textAlign: "left", padding: "14px 16px",
        borderRadius: "var(--radius)",
        cursor: locked ? "not-allowed" : "pointer",
        background: active ? "rgba(0,13,255,0.04)" : "var(--surface)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        opacity: locked && !active ? 0.5 : 1,
        fontFamily: "var(--font-display)",
        display: "flex", flexDirection: "column", gap: 6,
        transition: "border-color 0.15s, background 0.15s",
      }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
          border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
          background: active ? "var(--accent)" : "transparent",
          boxShadow: active ? "inset 0 0 0 3px var(--surface)" : "none",
        }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: active ? "var(--accent)" : "var(--text-primary)" }}>{title}</span>
      </span>
      <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>{desc}</span>
    </button>
  );

  const lockNote = (text) => (
    <div style={{
      marginTop: 10, padding: "8px 12px", borderRadius: "var(--radius)",
      background: "var(--background-neutral)", border: "1px solid var(--border)",
      fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, fontFamily: "var(--font-display)",
      display: "flex", gap: 8, alignItems: "flex-start",
    }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        <rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5 7V5a3 3 0 016 0v2" />
      </svg>
      <span>{text}</span>
    </div>
  );

  const toggle = (on, onClick, disabled) => (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        position: "relative", width: 44, height: 24, borderRadius: 12, border: "none",
        cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
        background: on ? "var(--accent)" : "var(--border)", transition: "background 0.2s",
        opacity: disabled ? 0.5 : 1,
      }}>
      <div style={{
        position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: 10,
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
      }} />
    </button>
  );

  return (
    <div id="setup-config">
      {/* ── Scoring Mode ── */}
      <div className="card" id="config-scoring-mode">
        <div className="card-title">Scoring Mode</div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12, fontFamily: "var(--font-display)" }}>
          How routines are scored and totalled. Switching to or from NGA replaces the level list.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            {
              value: "fig",
              title: "FIG Scoring",
              desc: "Open-ended scoring: Difficulty (D) plus Execution (E), with bonuses and penalties. Execution is judged as deductions from the start value below. The standard for British Gymnastics-style events.",
            },
            {
              value: "nga",
              title: "NGA Scoring",
              desc: "Perfect 10 system: start values capped at 10.0, judge deductions subtracted from the start value, lowest possible score 5.0 (courtesy). For NGA UK sanctioned events.",
            },
            {
              value: "simple",
              title: "Simple Scoring",
              desc: "One final score per routine — no D score, E score, bonus or penalty breakdown. Every apparatus (including vault) takes a single score entry. Ideal for club and friendly competitions.",
            },
          ].map((m) => optionCard({
            key: m.value,
            active: scoringMode === m.value,
            locked: scoringModeLocked,
            title: m.title,
            desc: m.desc,
            onClick: () => doScoringSwitch(m.value),
          }))}
        </div>
        {scoringModeLocked && lockNote("Scoring mode is locked once the competition goes live.")}
      </div>

      {/* ── Vault Scoring — FIG only ── */}
      {scoringMode === "fig" && (
        <div className="card" id="config-vault-mode">
          <div className="card-title">Vault Scoring</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12, fontFamily: "var(--font-display)" }}>
            How many vaults each gymnast performs and which score counts.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              {
                value: "single",
                title: "Single Vault",
                desc: "Each gymnast performs one vault and that score counts.",
              },
              {
                value: "average",
                title: "Average",
                desc: "Each gymnast performs two vaults and the average of the two finals counts.",
              },
              {
                value: "highest",
                title: "Highest (Best Counts)",
                desc: "Each gymnast performs two vaults and the higher final counts. Coach and results views show both vaults; the public view shows only the counting score.",
              },
            ].map((m) => optionCard({
              key: m.value,
              active: (data.vaultMode || "single") === m.value,
              locked: hasAnyScore,
              title: m.title,
              desc: m.desc,
              onClick: () => setData((d) => ({ ...d, vaultMode: m.value })),
            }))}
          </div>
          {hasAnyScore && lockNote("Vault scoring is locked because scores have been submitted — changing it now would mix differently-calculated vault results.")}
        </div>
      )}

      {/* ── Execution start value — FIG only ── */}
      {scoringMode === "fig" && (
        <div className="card" id="config-e-start">
          <div className="card-title">Execution Start Value</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12, fontFamily: "var(--font-display)" }}>
            The baseline each execution judge deducts from. An E score is calculated as start value minus the judge's deduction. Standard FIG execution starts from 10.
          </div>
          <div className="field" style={{ maxWidth: 200, margin: 0 }}>
            <label className="label">Start value</label>
            <input className="input" type="number" min="1" step="0.5"
              value={eScoreStart}
              disabled={hasAnyScore}
              onChange={(e) => commitEScoreStart(e.target.value)}
              style={hasAnyScore ? { opacity: 0.5, cursor: "not-allowed" } : undefined} />
          </div>
          {hasAnyScore && lockNote("The execution start value is locked because scores have been submitted — already-entered E scores were calculated from the current baseline.")}
        </div>
      )}

      {/* ── Ranking Mode — always editable ── */}
      <div className="card" id="config-ranking-mode">
        <div className="card-title">Ranking Mode</div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12, fontFamily: "var(--font-display)" }}>
          What happens to the places after a tie. Rankings recalculate immediately, so this stays editable at any time.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            {
              value: "standard",
              title: "Standard (1, 1, 3)",
              desc: "Tied gymnasts share a rank and the places they occupy are skipped — two joint golds mean no silver, and the next gymnast takes bronze.",
            },
            {
              value: "dense",
              title: "Dense (1, 1, 2)",
              desc: "Tied gymnasts share a rank and the next place follows straight on — two joint golds are followed by a silver.",
            },
          ].map((m) => optionCard({
            key: m.value,
            active: (data.rankingMode || "standard") === m.value,
            locked: false,
            title: m.title,
            desc: m.desc,
            onClick: () => setData((d) => ({ ...d, rankingMode: m.value })),
          }))}
        </div>
      </div>

      {/* ── Score Lock ── */}
      <div className="card" id="config-score-lock">
        <div className="card-title">Score Lock</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 2 }}>
              Lock submitted scores
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, fontFamily: "var(--font-display)" }}>
              When on, a submitted score becomes read-only in score entry. Editing it requires the score edit PIN — separate from the judge access PIN — and the score locks again after each edit. Organisers signed in to the full app are never prompted.
            </div>
          </div>
          {toggle(scoreLockOn, handleScoreLockToggle)}
        </div>
        {scoreLockOn && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}>
              Score edit PIN is {data.scoreEditPin ? "set" : "not set"}.
            </span>
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12 }}
              onClick={() => setPinModal({ mode: "change", value: "", confirm: "", error: "" })}>
              {data.scoreEditPin ? "Change score edit PIN" : "Set score edit PIN"}
            </button>
          </div>
        )}
      </div>

      {/* ── Scoring mode switch confirm (NGA boundary wipes levels) ── */}
      {pendingScoringSwitch && (
        <ConfirmModal
          message={pendingScoringSwitch === "nga"
            ? "Switching to NGA mode will replace your custom levels with the NGA level hierarchy. Your current levels will be lost. Continue?"
            : "Switching from NGA mode will clear your NGA levels. You will need to add levels manually. Continue?"}
          onConfirm={() => {
            setData((d) => ({ ...d, scoringMode: pendingScoringSwitch, levels: [] }));
            setPendingScoringSwitch(null);
          }}
          onCancel={() => setPendingScoringSwitch(null)}
        />
      )}

      {/* ── Score edit PIN modal ── */}
      {pinModal && (
        <div className="modal-backdrop" onClick={() => setPinModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, width: "100%", textAlign: "left", fontFamily: "var(--font-display)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {pinModal.mode === "enable" ? "Set a score edit PIN" : "Change score edit PIN"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14, lineHeight: 1.6 }}>
              {pinModal.mode === "enable"
                ? "Turning on the score lock needs a score edit PIN. Scorekeepers enter it to edit a submitted score."
                : "Scorekeepers enter this PIN to edit a submitted score."} It is separate from the judge access PIN.
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="label">Score edit PIN (4–8 digits)</label>
              <input className="input" type="password" inputMode="numeric" autoFocus
                value={pinModal.value}
                onChange={(e) => setPinModal((m) => ({ ...m, value: e.target.value.replace(/\D/g, "").slice(0, 8), error: "" }))} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="label">Confirm PIN</label>
              <input className="input" type="password" inputMode="numeric"
                value={pinModal.confirm}
                onChange={(e) => setPinModal((m) => ({ ...m, confirm: e.target.value.replace(/\D/g, "").slice(0, 8), error: "" }))}
                onKeyDown={(e) => { if (e.key === "Enter") savePinModal(); }} />
            </div>
            {pinModal.error && <div className="field-error" style={{ marginBottom: 10 }}>{pinModal.error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setPinModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePinModal} disabled={pinSaving}>
                {pinSaving ? "Saving…" : pinModal.mode === "enable" ? "Set PIN & enable lock" : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompConfigSections;
