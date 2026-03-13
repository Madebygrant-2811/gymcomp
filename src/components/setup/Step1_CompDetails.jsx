import { useState, useRef, useEffect } from "react";
import { generateId, isFutureOrToday, todayStr } from "../../lib/utils.js";
import { UK_LEVELS, APPARATUS_GROUPS } from "../../lib/constants.js";

import AddressLookup from "../shared/AddressLookup.jsx";
import ClubPicker from "../shared/ClubPicker.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";

function Step1_CompDetails({ data, setData, onNext, onSaveExit, syncStatus, onSave, isExisting }) {
  const [pendingRemove, setPendingRemove] = useState(null);
  const [roundCount, setRoundCount] = useState(data.rounds.length || 1);
  const [newLevel, setNewLevel] = useState("");
  const [newAgeRange, setNewAgeRange] = useState("");
  const [editingAgeIdx, setEditingAgeIdx] = useState(null);
  const [editingAgeVal, setEditingAgeVal] = useState("");
  const [showWarnings, setShowWarnings] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const el = document.querySelector(".app-main");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      if (y > 60) setTopbarHidden(true);
      else setTopbarHidden(false);
      lastScrollY.current = y;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  // Seed Round 1 on first load if rounds array is empty
  useEffect(() => {
    if (data.rounds.length === 0) {
      setData(d => ({ ...d, rounds: [{ id: generateId(), name: "Round 1", start: "", end: "" }] }));
    }
  }, []);
  const [customLevel, setCustomLevel] = useState("");
  const [dateError, setDateError] = useState("");

  const handleDate = (val) => {
    setDateError(!val ? "" : !isFutureOrToday(val) ? "Competition date must be today or a future date." : "");
    setData(d => ({ ...d, date: val }));
  };

  const addAgeRange = () => {
    const val = newAgeRange.trim();
    if (!val) return;
    const existing = data.ageRanges || [];
    if (existing.find(a => a.toLowerCase() === val.toLowerCase())) return;
    setData(d => ({ ...d, ageRanges: [...(d.ageRanges || []), val] }));
    setNewAgeRange("");
  };

  const saveAgeEdit = (idx) => {
    const val = editingAgeVal.trim();
    if (!val) return;
    setData(d => {
      const updated = [...(d.ageRanges || [])];
      updated[idx] = val;
      return { ...d, ageRanges: updated };
    });
    setEditingAgeIdx(null);
  };

  const removeAgeRange = (idx) => {
    setData(d => ({ ...d, ageRanges: (d.ageRanges || []).filter((_, i) => i !== idx) }));
  };

  // Build/sync rounds when roundCount changes — preserve existing round times
  const syncRounds = (count) => {
    const n = Math.max(1, Math.min(10, parseInt(count) || 1));
    setRoundCount(n);
    setData(d => {
      const existing = d.rounds;
      const rounds = Array.from({ length: n }, (_, i) => {
        const prev = existing[i];
        return prev
          ? { ...prev, name: `Round ${i + 1}` }
          : { id: generateId(), name: `Round ${i + 1}`, start: "", end: "" };
      });
      return { ...d, rounds };
    });
  };

  const updateRoundTime = (id, field, value) => {
    setData(d => ({ ...d, rounds: d.rounds.map(r => r.id === id ? { ...r, [field]: value } : r) }));
  };

  const toggleApparatus = (a, currentlyOn) => {
    if (currentlyOn) {
      setPendingRemove({ type: "apparatus", id: a, msg: `Remove apparatus "${a}"? All judges assigned to it will also be removed.` });
    } else {
      setData(d => ({ ...d, apparatus: [...d.apparatus, a] }));
    }
  };

  const addLevel = (nameOverride) => {
    const name = (nameOverride || customLevel).trim();
    if (!name) return;
    if (data.levels.find(l => l.name.toLowerCase() === name.toLowerCase())) return;
    setData(d => ({ ...d, levels: [...d.levels, { id: generateId(), name, rankBy: "level" }] }));
    setNewLevel("");
    setCustomLevel("");
  };

  const addLevelFromDropdown = (val) => {
    if (!val || val === "__custom__") return;
    addLevel(val);
    setNewLevel("");
  };

  const updateLevelRank = (id, rankBy) =>
    setData(d => ({ ...d, levels: d.levels.map(l => l.id === id ? { ...l, rankBy } : l) }));

  const doRemove = () => {
    const { type, id } = pendingRemove;
    if (type === "round") setData(d => ({ ...d, rounds: d.rounds.filter(r => r.id !== id) }));
    if (type === "apparatus") setData(d => ({ ...d, apparatus: d.apparatus.filter(a => a !== id), judges: d.judges.filter(j => j.apparatus !== id) }));
    if (type === "level") setData(d => ({ ...d, levels: d.levels.filter(l => l.id !== id) }));
    setPendingRemove(null);
  };

  const overallTime = () => {
    if (!data.rounds.length) return null;
    const starts = data.rounds.map(r => r.start).sort();
    const ends = data.rounds.map(r => r.end).sort();
    return `${starts[0]} – ${ends[ends.length - 1]}`;
  };

  const canProceed = data.name && data.date && !dateError &&
    data.rounds.length > 0 &&
    data.apparatus.length > 0 && data.levels.length > 0 &&
    data.dataConsentConfirmed;

  const missingFields = [
    ...(!data.name ? ["Competition name"] : []),
    ...(!data.date ? ["Date"] : []),
    ...(dateError ? ["Valid date (must be today or future)"] : []),
    ...(data.rounds.length === 0 ? ["At least one round"] : []),
    ...(data.apparatus.length === 0 ? ["At least one apparatus"] : []),
    ...(data.levels.length === 0 ? ["At least one level"] : []),
  ];

  const canSave = !!data.name;

  const handleSaveAndExit = () => {
    if (canProceed) {
      // All fields complete — full save & continue (PIN flow + dashboard)
      setShowWarnings(false);
      onNext();
    } else if (canSave) {
      // Partial save — persist what we have and go back to dashboard
      setShowWarnings(false);
      if (onSaveExit) onSaveExit();
    } else {
      // No name — show what's missing
      setShowWarnings(true);
    }
  };

  const topbar = (
    <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`} style={{ margin: "0 24px" }}>
      <div className="setup-topbar-left">
        {data.name && <span className="setup-topbar-name">{data.name}</span>}
        {data.date && <span className="setup-topbar-meta">{new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
        {data.venue && <span className="setup-topbar-meta">{data.venue}</span>}
        {!data.name && !data.date && !data.venue && <span className="setup-topbar-name" style={{ opacity: 0.6 }}>New Competition</span>}
      </div>
      <div className="setup-topbar-right">
        <span className="setup-topbar-sync">Draft</span>
        <button className="btn btn-sm" onClick={handleSaveAndExit} disabled={!canSave}
          style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.3)" }}>
          {canProceed ? (isExisting ? "Save & Update →" : "Save & Create →") : "Save & Exit →"}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {topbar}

      <div className="setup-content" style={{ padding: "40px", maxWidth: 1200 }}>
      {/* Intro */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          Create your competition
        </div>
        <div style={{ fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.6, fontFamily: "var(--font-display)" }}>
          Set up your event details below. Once complete, you'll be able to add gymnasts, assign levels, and get everything ready for competition day.
        </div>
      </div>

      {/* Basic Info */}
      <div className="card" id="setup-basic">
        <div className="card-title">Basic Information</div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Competition Name</label>
            <input className="input" placeholder="e.g. Spring Invitational 2025"
              value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Competition Holder's Name</label>
            <input className="input" placeholder="e.g. Sarah Mitchell"
              value={data.holder || ""} onChange={e => setData(d => ({ ...d, holder: e.target.value }))} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Date</label>
            <input className={`input ${dateError ? "error" : ""}`} type="date" min={todayStr()}
              value={data.date} onChange={e => handleDate(e.target.value)} />
            {dateError && <div className="field-error">{dateError}</div>}
          </div>
          <div className="field">
            <label className="label">Venue</label>
            <AddressLookup
              value={data.venue || ""}
              onChange={v => setData(d => ({ ...d, venue: v, location: v }))}
              placeholder="Search by venue name, address or postcode…"
            />
          </div>
        </div>
        <div className="field">
          <label className="label">Organising Club / Organisation Name</label>
          <ClubPicker
            value={data.organiserName || ""}
            onChange={v => setData(d => ({ ...d, organiserName: v }))}
            placeholder="e.g. Midlands Gymnastics Club"
          />
        </div>
      </div>

      {/* Skill Levels */}
      <div className="card" id="setup-levels">
        <div className="card-title">Skill Levels</div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Add from UK Gymnastics list</label>
          <select className="select" value={newLevel}
            onChange={e => { setNewLevel(e.target.value); if (e.target.value && e.target.value !== "__custom__") addLevelFromDropdown(e.target.value); }}>
            <option value="">— Select a level —</option>
            {UK_LEVELS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.options.filter(o => !data.levels.find(l => l.name === o)).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {newLevel !== "__custom__"
          ? <button className="btn btn-ghost" style={{ alignSelf: "flex-start", marginBottom: 12 }} onClick={() => setNewLevel("__custom__")}>＋ Add custom level</button>
          : <div className="inline-row" style={{ marginBottom: 12 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <input className="input" placeholder="Custom level name" value={customLevel}
                  onChange={e => setCustomLevel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addLevel()}
                  autoFocus />
              </div>
              <button className="btn btn-secondary" onClick={() => addLevel()}>Add</button>
              <button className="btn btn-ghost" onClick={() => { setNewLevel(""); setCustomLevel(""); }}>Cancel</button>
            </div>
        }
        {data.levels.map(l => (
          <div className="list-item list-item-level" key={l.id}>
            <div className="list-item-content" style={{ flex: "1 1 auto", minWidth: 0 }}><strong>{l.name}</strong></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Rank by:</span>
              <select className="select" style={{ width: "auto", padding: "4px 32px 4px 12px", fontSize: 12 }}
                value={l.rankBy} onChange={e => updateLevelRank(l.id, e.target.value)}>
                <option value="level">Level only</option>
                <option value="level+age">Level + Age</option>
              </select>
            </div>
            <button className="btn-icon" onClick={() => setPendingRemove({ type: "level", id: l.id, msg: `Remove level "${l.name}"? Gymnasts assigned will lose their level.` })}>×</button>
          </div>
        ))}
        {!data.levels.length && <div className="empty">No levels added yet</div>}
      </div>

      {/* Apparatus */}
      <div className="card" id="setup-apparatus">
        <div className="card-title">Apparatus</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {APPARATUS_GROUPS.map(group => {
            const tag = group.label.split(" ")[0]; // WAG or MAG
            return (
              <div key={group.label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", fontFamily: "var(--font-display)", marginBottom: 8 }}>{group.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {group.items.map(a => {
                    const key = `${a} (${tag})`;
                    const checked = data.apparatus.includes(key);
                    return (
                      <label key={key} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                        background: checked ? "rgba(0,13,255,0.04)" : "var(--bg)",
                        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "var(--radius)", cursor: "pointer", fontSize: 13,
                        color: checked ? "var(--accent)" : "var(--text)", transition: "all 0.2s", userSelect: "none"
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleApparatus(key, checked)} style={{ display: "none" }} />
                        {a}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {data.apparatus.length >= 2 && (
          <>
            <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Apparatus Order</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Set the starting rotation order. Groups will cascade automatically from this sequence.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.apparatus.map((a, i) => (
                <div key={a} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: "var(--muted)", fontSize: 12, minWidth: 20 }}>{i + 1}</span>
                  <span style={{ flex: 1 }}>{a}</span>
                  <button className="btn btn-sm btn-secondary" style={{ padding: "2px 6px", fontSize: 11, visibility: i === 0 ? "hidden" : "visible" }}
                    onClick={() => setData(d => { const arr = [...d.apparatus]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return { ...d, apparatus: arr }; })}>↑</button>
                  <button className="btn btn-sm btn-secondary" style={{ padding: "2px 6px", fontSize: 11, visibility: i === data.apparatus.length - 1 ? "hidden" : "visible" }}
                    onClick={() => setData(d => { const arr = [...d.apparatus]; [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; return { ...d, apparatus: arr }; })}>↓</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Age Ranges */}
      <div className="card" id="setup-ages">
        <div className="card-title">Age Ranges</div>
        <div className="inline-row" style={{ marginBottom: 14 }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <input className="input" placeholder="e.g. Under 9, Junior, 9-10 years"
              value={newAgeRange}
              onChange={e => setNewAgeRange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addAgeRange(); }} />
          </div>
          <button className="btn btn-secondary" onClick={addAgeRange}>Add</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(data.ageRanges || []).map((a, idx) => (
            <div key={idx} className="chip">
              {editingAgeIdx === idx ? (
                <>
                  <input className="club-edit-input" value={editingAgeVal}
                    onChange={e => setEditingAgeVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveAgeEdit(idx); if (e.key === "Escape") setEditingAgeIdx(null); }}
                    autoFocus />
                  <button onClick={() => saveAgeEdit(idx)} style={{ color: "var(--success)" }}>✓</button>
                  <button onClick={() => setEditingAgeIdx(null)}>×</button>
                </>
              ) : (
                <>
                  <span>{a}</span>
                  <button onClick={() => { setEditingAgeIdx(idx); setEditingAgeVal(a); }}
                    style={{ fontSize: 12, color: "var(--muted)" }}>✏️</button>
                  <button onClick={() => removeAgeRange(idx)}>×</button>
                </>
              )}
            </div>
          ))}
          {!(data.ageRanges || []).length && (
            <span style={{ color: "var(--muted)", fontSize: 13 }}>No age ranges added yet</span>
          )}
        </div>
      </div>

      {/* Rounds */}
      <div className="card" id="setup-rounds">
        <div className="card-title">Rounds &amp; Times</div>
        <div className="field" style={{ maxWidth: 200 }}>
          <label className="label">Number of Rounds</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn-icon" style={{ fontSize: 18 }}
              onClick={() => syncRounds(roundCount - 1)} disabled={roundCount <= 1}>−</button>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 32, minWidth: 32, textAlign: "center", color: "var(--accent)" }}>{roundCount}</span>
            <button className="btn-icon" style={{ fontSize: 18 }}
              onClick={() => syncRounds(roundCount + 1)} disabled={roundCount >= 10}>+</button>
          </div>
        </div>
        {data.rounds.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Set times for each round</div>
            {data.rounds.map((r, i) => (
              <div key={r.id} className="round-time-row" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ width: 80, fontWeight: 600, fontSize: 14 }}>Round {i + 1}</div>
                <div className="field" style={{ margin: 0, flex: "1 1 100px" }}>
                  <label className="label">Start</label>
                  <input className="input" type="time" value={r.start}
                    onChange={e => updateRoundTime(r.id, "start", e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0, flex: "1 1 100px" }}>
                  <label className="label">End</label>
                  <input className="input" type="time" value={r.end}
                    onChange={e => updateRoundTime(r.id, "end", e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        )}
        {overallTime() && <div className="summary-box" style={{ marginTop: 10 }}>Overall: {overallTime()}</div>}
      </div>

      {showWarnings && missingFields.length > 0 && (
        <div style={{ margin: "0 0 16px", padding: "14px 18px", borderRadius: 12,
          background: "rgba(229,62,62,0.06)", border: "1px solid rgba(229,62,62,0.25)",
          fontSize: 13, color: "#c53030" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Enter a competition name to save your progress</div>
        </div>
      )}

      {/* Data consent */}
      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "16px 18px",
        background: data.dataConsentConfirmed ? "rgba(0,13,255,0.03)" : "var(--surface2)",
        border: `1px solid ${data.dataConsentConfirmed ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12, cursor: "pointer", userSelect: "none", marginBottom: 16, transition: "all 0.2s"
      }}>
        <input type="checkbox" checked={!!data.dataConsentConfirmed}
          onChange={e => setData(d => ({ ...d, dataConsentConfirmed: e.target.checked }))}
          style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0, width: 16, height: 16 }} />
        <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--font-display)", lineHeight: 1.5 }}>
          I confirm I have obtained permission to enter competitor data for this event in accordance with data protection requirements.
        </span>
      </label>

      <div className="step-nav">
        <div />
        <button className="btn btn-primary" onClick={handleSaveAndExit} disabled={!canSave}>
          {canProceed ? (isExisting ? "Save & Update →" : "Save & Create →") : "Save & Exit →"}
        </button>
      </div>

      {pendingRemove && (
        <ConfirmModal message={pendingRemove.msg} onConfirm={doRemove} onCancel={() => setPendingRemove(null)} />
      )}
      </div>
    </div>
  );
}

export default Step1_CompDetails;
