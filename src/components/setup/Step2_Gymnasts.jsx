import { useState, useRef, useEffect } from "react";
import { generateId, parseCSV, downloadTemplate, normalizeStr, buildRotations } from "../../lib/utils.js";
import ClubPicker from "../shared/ClubPicker.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";

function Step2_Gymnasts({ compData, setCompDataFn, data, setData, onNext, onBack }) {
  const [selectedClub, setSelectedClub] = useState(compData.clubs[0]?.name || "");
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [editId, setEditId] = useState(null);
  const [editModal, setEditModal] = useState(null); // { ...gymnast fields } or null
  const [editModalErrors, setEditModalErrors] = useState({});
  const [editModalWarnings, setEditModalWarnings] = useState([]);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [formWarnings, setFormWarnings] = useState([]);
  const [csvWarnings, setCsvWarnings] = useState({ errors: [], warns: [] });
  const [fieldErrors, setFieldErrors] = useState({});
  const fileRef = useRef(null);

  // Topbar hide-on-scroll
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

  const nextNumber = (gymnasts) => {
    const used = new Set(gymnasts.map(g => parseInt(g.number)).filter(n => !isNaN(n)));
    let n = 1;
    while (used.has(n)) n++;
    return String(n);
  };

  const blankForm = (gymnasts = data) => ({
    name: "", level: "", round: compData.rounds[0]?.id || "",
    number: nextNumber(gymnasts), age: "", group: ""
  });
  const [newG, setNewG] = useState(() => blankForm());

  const allAges = [...new Set(data.map(g => g.age).filter(Boolean))];
  const allGroups = [...new Set(data.map(g => g.group).filter(Boolean))];

  // Helper: pick or add a club, auto-adding to compData.clubs if new
  const pickClub = (clubName, selectCb) => {
    if (!clubName) return;
    const exists = compData.clubs.some(c => c.name === clubName);
    if (!exists) {
      const newClub = { id: Math.random().toString(36).slice(2, 10), name: clubName };
      setCompDataFn(d => ({ ...d, clubs: [...d.clubs, newClub] }));
    }
    selectCb(clubName);
  };

  const validateGymnast = (g, excludeId = null) => {
    const others = data.filter(x => x.id !== excludeId);
    const warns = [];
    if (g.number && others.find(x => x.number === g.number)) {
      warns.push(`Number #${g.number} is already assigned to another gymnast.`);
    }
    if (g.name && g.level && others.find(x =>
      x.name.toLowerCase() === g.name.toLowerCase() && x.level === g.level
    )) {
      warns.push(`"${g.name}" already exists at this level — possible duplicate.`);
    }
    return warns;
  };

  const attemptAdd = () => {
    const errs = {};
    if (!newG.name?.trim()) errs.name = true;
    if (!newG.level) errs.level = true;
    if (!newG.round) errs.round = true;
    if (!newG.age?.trim()) errs.age = true;
    if (!newG.group?.trim()) errs.group = true;
    if (!selectedClub) errs.club = true;
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    const warns = validateGymnast(newG);
    if (warns.length) { setFormWarnings(warns); return; }
    commit();
  };

  const commit = () => {
    const gymnast = { ...newG, name: normalizeStr(newG.name), age: normalizeStr(newG.age), group: normalizeStr(newG.group), club: selectedClub, id: generateId() };
    setData(d => {
      const updated = [...d, gymnast];
      setNewG(blankForm(updated));
      return updated;
    });
    setFormWarnings([]);
    setFieldErrors({});
  };

  const startEdit = (g) => {
    setEditModal({ id: g.id, name: g.name, level: g.level, round: g.round, number: g.number, age: g.age, group: g.group, club: g.club });
    setEditModalErrors({});
    setEditModalWarnings([]);
  };

  const saveEditModal = () => {
    const em = editModal;
    const errs = {};
    if (!em.name?.trim()) errs.name = true;
    if (!em.level) errs.level = true;
    if (!em.round) errs.round = true;
    if (!em.age?.trim()) errs.age = true;
    if (!em.group?.trim()) errs.group = true;
    if (!em.club) errs.club = true;
    if (Object.keys(errs).length) { setEditModalErrors(errs); return; }
    setEditModalErrors({});
    const warns = validateGymnast(em, em.id);
    if (warns.length && editModalWarnings.length === 0) { setEditModalWarnings(warns); return; }
    const normalized = { ...em, name: normalizeStr(em.name), age: normalizeStr(em.age), group: normalizeStr(em.group) };
    setData(d => d.map(g => g.id === em.id ? normalized : g));
    setEditModal(null);
    setEditModalWarnings([]);
  };

  const cancelEdit = () => { setEditId(null); setNewG(blankForm()); setFormWarnings([]); setFieldErrors({}); };

  const doRemove = () => {
    setData(d => d.filter(g => g.id !== pendingRemove.id));
    setPendingRemove(null);
  };

  // CSV
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      const warns = [];   // informational (auto-added clubs)
      const errors = [];  // hard skips
      const toAdd = [];
      const newClubs = []; // clubs from CSV not yet in setup

      rows.forEach((row, i) => {
        const rowNum = i + 2;
        if (!row.name) { errors.push(`Row ${rowNum}: missing Name — skipped`); return; }
        const levelObj = compData.levels.find(l => l.name.toLowerCase() === (row.level || "").toLowerCase());
        if (!levelObj) { errors.push(`Row ${rowNum}: level "${row.level}" not found in setup — skipped`); return; }
        const roundObj = compData.rounds.find(r => r.name.toLowerCase() === (row.round || "").toLowerCase());
        if (!roundObj) { errors.push(`Row ${rowNum}: round "${row.round}" not found in setup — skipped`); return; }
        if (row.number && data.find(x => x.number === row.number)) {
          errors.push(`Row ${rowNum}: number #${row.number} already taken — skipped`); return;
        }

        // Auto-add unknown clubs
        const clubName = (row.club || selectedClub || "").trim();
        if (clubName) {
          const existsInSetup = compData.clubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
          const alreadyQueued = newClubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
          if (!existsInSetup && !alreadyQueued) {
            newClubs.push({ id: generateId(), name: clubName });
            warns.push(`"${clubName}" added to Participating Clubs`);
          }
        }

        toAdd.push({ id: generateId(), name: row.name, number: row.number, club: clubName, level: levelObj.id, round: roundObj.id, age: row.age || "", group: row.group || "" });
      });

      setCsvWarnings({ errors, warns });
      if (newClubs.length) {
        compData.clubs.push(...newClubs); // reflected via setCompData below
        setCompDataFn(d => ({ ...d, clubs: [...d.clubs, ...newClubs] }));
      }
      if (toAdd.length) setData(d => [...d, ...toAdd]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Rotation schedule
  const [rotations, setRotations] = useState({});
  const allGroups2 = [...new Set(data.map(g => g.group).filter(Boolean))].sort();
  useEffect(() => {
    if (allGroups2.length && compData.apparatus.length) {
      setRotations(prev => buildRotations(allGroups2, compData.apparatus, prev));
    } else {
      setRotations({});
    }
  }, [JSON.stringify(allGroups2), JSON.stringify(compData.apparatus)]);

  // Display
  const roundGymnasts = data.filter(g => g.round === activeRound);
  const grouped = {};
  roundGymnasts.forEach(g => {
    const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level;
    if (!grouped[levelName]) grouped[levelName] = {};
    const grp = g.group || "—";
    if (!grouped[levelName][grp]) grouped[levelName][grp] = [];
    grouped[levelName][grp].push(g);
  });

  const errBorder = { borderColor: "#e53e3e", boxShadow: "0 0 0 1px #e53e3e" };

  return (
    <div>
      <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`} style={{ margin: "0 24px" }}>
        <div className="setup-topbar-left">
          {compData.name && <span className="setup-topbar-name">{compData.name}</span>}
          {compData.date && <span className="setup-topbar-meta">{new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          {compData.venue && <span className="setup-topbar-meta">{compData.venue}</span>}
          {!compData.name && <span className="setup-topbar-name" style={{ opacity: 0.6 }}>Manage Gymnasts</span>}
        </div>
        <div className="setup-topbar-right">
          <button className="btn btn-sm" onClick={onBack}
            style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.3)" }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="setup-content" style={{ padding: "40px", maxWidth: 1200 }}>
      <div className="page-header">
        <div className="page-title">Gymnast <span>Details</span></div>
        <div className="page-sub">Add gymnasts club by club, or upload via CSV</div>
      </div>

      {/* CSV Upload */}
      <div className="card">
        <div className="card-title">CSV Upload</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: (csvWarnings.errors.length || csvWarnings.warns.length) ? 12 : 0 }}>
          <div className="csv-zone" style={{ flex: 1 }} onClick={() => fileRef.current.click()}>
            📂 Click to upload CSV file
          </div>
          <button className="btn btn-secondary" onClick={downloadTemplate}>⬇ Download Template</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
        {csvWarnings.errors.length > 0 && (
          <div className="error-box" style={{ marginBottom: 8 }}>
            <strong>⚠ {csvWarnings.errors.length} row{csvWarnings.errors.length > 1 ? "s" : ""} skipped:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {csvWarnings.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {csvWarnings.warns.length > 0 && (
          <div className="warn-box">
            <strong>ℹ Notices:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {csvWarnings.warns.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Manual Add */}
      <div className="card">
        <div className="card-title">Add Gymnast Manually</div>
        <div style={{ marginBottom: 12 }}>
          <label className="label">Club <span style={{ color: "#e53e3e" }}>*</span></label>
          {compData.clubs.length > 0 && (
            <div className="club-pills-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, ...(fieldErrors.club ? { padding: 4, borderRadius: 8, outline: "2px solid #e53e3e" } : {}) }}>
              {compData.clubs.map(c => (
                <button key={c.id} className={`btn btn-sm ${selectedClub === c.name ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => { setSelectedClub(c.name); setFieldErrors(e => { const n = { ...e }; delete n.club; return n; }); }}>{c.name}</button>
              ))}
            </div>
          )}
          <ClubPicker value="" placeholder="Search & add a club…" onSelect={name => { pickClub(name, n => { setSelectedClub(n); setFieldErrors(e => { const ne = { ...e }; delete ne.club; return ne; }); }); }} />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Clubs can be managed in your Event Dashboard</div>
          {fieldErrors.club && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 4 }}>Please select a club</div>}
        </div>
        <div className="grid-3" style={{ marginBottom: 8 }}>
          <div className="field">
            <label className="label">Name <span style={{ color: "#e53e3e" }}>*</span></label>
            <input className="input" placeholder="Full name" value={newG.name} style={fieldErrors.name ? errBorder : {}}
              onChange={e => { setNewG(g => ({ ...g, name: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.name; return n; }); }} />
          </div>
          <div className="field">
            <label className="label">Number</label>
            <input className="input" placeholder="e.g. 42" value={newG.number}
              onChange={e => setNewG(g => ({ ...g, number: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Level <span style={{ color: "#e53e3e" }}>*</span></label>
            <select className="select" value={newG.level} style={fieldErrors.level ? errBorder : {}}
              onChange={e => { setNewG(g => ({ ...g, level: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.level; return n; }); }}>
              <option value="">Select…</option>
              {compData.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Round <span style={{ color: "#e53e3e" }}>*</span></label>
            <select className="select" value={newG.round} style={fieldErrors.round ? errBorder : {}}
              onChange={e => { setNewG(g => ({ ...g, round: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.round; return n; }); }}>
              <option value="">Select…</option>
              {compData.rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Age <span style={{ color: "#e53e3e" }}>*</span></label>
            <input className="input" list="ages-list" placeholder="e.g. 9 years" style={fieldErrors.age ? errBorder : {}}
              value={newG.age} onChange={e => { setNewG(g => ({ ...g, age: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.age; return n; }); }} />
            <datalist id="ages-list">{allAges.map(a => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="field">
            <label className="label">Group <span style={{ color: "#e53e3e" }}>*</span></label>
            <input className="input" list="groups-list" placeholder="e.g. Group A" style={fieldErrors.group ? errBorder : {}}
              value={newG.group} onChange={e => { setNewG(g => ({ ...g, group: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.group; return n; }); }} />
            <datalist id="groups-list">{allGroups.map(g => <option key={g} value={g} />)}</datalist>
          </div>
        </div>

        {formWarnings.length > 0 && (
          <div className="warn-box">
            {formWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="btn btn-warn btn-sm" onClick={commit}>Add anyway</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setFormWarnings([])}>Cancel</button>
            </div>
          </div>
        )}

        {formWarnings.length === 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={attemptAdd}>Add Gymnast</button>
          </div>
        )}
      </div>

      {/* Gymnast List */}
      <div className="card">
        <div className="card-title">Gymnast List — {data.length} total</div>
        <div className="tabs">
          {compData.rounds.map(r => (
            <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
              onClick={() => setActiveRound(r.id)}>
              {r.name} ({data.filter(g => g.round === r.id).length})
            </button>
          ))}
        </div>
        {Object.keys(grouped).length === 0 && <div className="empty">No gymnasts in this round yet</div>}
        {Object.entries(grouped).map(([level, groups]) => (
          <div key={level}>
            <div className="group-header">
              <span className="group-label">{level}</span>
              <div className="group-line" />
            </div>
            {Object.entries(groups).map(([grp, gymnasts]) => (
              <div key={grp} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{grp}</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 52 }}>#</th>
                        <th>Name</th>
                        <th>Club</th>
                        <th style={{ width: 80 }}>Age</th>
                        <th style={{ width: 56, textAlign: "center" }}>DNS</th>
                        <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gymnasts.map(g => (
                        <tr key={g.id} style={{ opacity: g.dns ? 0.45 : 1 }}>
                          <td style={{ fontWeight: 600, color: "var(--muted)", fontSize: 12 }}>{g.number}</td>
                          <td style={{ fontWeight: 600, textDecoration: g.dns ? "line-through" : "none" }}>{g.name}</td>
                          <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.club}</td>
                          <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.age}</td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <button
                                title={g.dns ? "Mark as competing" : "Mark as DNS (Did Not Start)"}
                                onClick={() => setData(d => d.map(x => x.id === g.id ? { ...x, dns: !x.dns } : x))}
                                style={{
                                  width: 26, height: 26, borderRadius: 6, border: "none", cursor: "pointer",
                                  background: g.dns ? "var(--danger)" : "var(--surface2)",
                                  color: g.dns ? "#fff" : "var(--muted)", fontSize: 12, fontWeight: 700,
                                  display: "flex", alignItems: "center", justifyContent: "center"
                                }}>
                                {g.dns ? "✕" : "—"}
                              </button>
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => startEdit(g)}>Edit</button>
                              <button className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: "4px 10px" }}
                                onClick={() => setPendingRemove({ id: g.id, msg: `Remove gymnast "${g.name}"?` })}>Remove</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Rotation Schedule */}
      {allGroups2.length > 0 && compData.apparatus.length > 0 && (
        <div className="card">
          <div className="card-title">Apparatus Rotation Schedule</div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Set the rotation for {allGroups2[0] || "Group 1"} — remaining groups cascade automatically
          </p>
          {compData.rounds.map(round => (
            <div key={round.id}>
              <div className="group-header">
                <span className="group-label">{round.name}</span>
                <div className="group-line" />
              </div>
              <div className="table-wrap" style={{ marginBottom: 20 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Group</th>
                      {compData.apparatus.map((_, i) => <th key={i}>Position {i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {allGroups2.map((group, gi) => (
                      <tr key={group}>
                        <td style={{ fontWeight: 600 }}>{group}</td>
                        {compData.apparatus.map((_, i) => (
                          <td key={i}>
                            {gi === 0 ? (
                              <select className="select" style={{ padding: "4px 8px", fontSize: 12 }}
                                value={rotations[group]?.[i] || ""}
                                onChange={e => {
                                  const newBase = [...(rotations[group] || compData.apparatus)];
                                  newBase[i] = e.target.value;
                                  const cascaded = {};
                                  allGroups2.forEach((g, gIdx) => {
                                    cascaded[g] = newBase.map((_, ai) => newBase[(ai + gIdx) % newBase.length]);
                                  });
                                  setRotations(cascaded);
                                }}>
                                <option value="">—</option>
                                {compData.apparatus.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                {rotations[group]?.[i] || "—"}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="step-nav" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onNext}>
          Done — Back to Dashboard →
        </button>
      </div>

      {/* Edit Gymnast Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}>
          <div className="modal-box" style={{ maxWidth: 520, width: "100%", padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Edit Gymnast</div>
              <button onClick={() => setEditModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", padding: 4 }}>×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="label">Club <span style={{ color: "#e53e3e" }}>*</span></label>
              {compData.clubs.length > 0 && (
                <div className="club-pills-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, ...(editModalErrors.club ? { padding: 4, borderRadius: 8, outline: "2px solid #e53e3e" } : {}) }}>
                  {compData.clubs.map(c => (
                    <button key={c.id} className={`btn btn-sm ${editModal.club === c.name ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => { setEditModal(m => ({ ...m, club: c.name })); setEditModalErrors(e => { const n = { ...e }; delete n.club; return n; }); }}>{c.name}</button>
                  ))}
                </div>
              )}
              <ClubPicker value="" placeholder="Search & add a club…" onSelect={name => { pickClub(name, n => { setEditModal(m => ({ ...m, club: n })); setEditModalErrors(e => { const ne = { ...e }; delete ne.club; return ne; }); }); }} />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Clubs can be managed in your Event Dashboard</div>
              {editModalErrors.club && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 4 }}>Please select a club</div>}
            </div>
            <div className="grid-3" style={{ marginBottom: 8 }}>
              <div className="field">
                <label className="label">Name <span style={{ color: "#e53e3e" }}>*</span></label>
                <input className="input" value={editModal.name} style={editModalErrors.name ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, name: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.name; return n; }); }} autoFocus />
              </div>
              <div className="field">
                <label className="label">Number</label>
                <input className="input" value={editModal.number}
                  onChange={e => setEditModal(m => ({ ...m, number: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Level <span style={{ color: "#e53e3e" }}>*</span></label>
                <select className="select" value={editModal.level} style={editModalErrors.level ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, level: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.level; return n; }); }}>
                  <option value="">Select…</option>
                  {compData.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Round <span style={{ color: "#e53e3e" }}>*</span></label>
                <select className="select" value={editModal.round} style={editModalErrors.round ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, round: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.round; return n; }); }}>
                  <option value="">Select…</option>
                  {compData.rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Age <span style={{ color: "#e53e3e" }}>*</span></label>
                <input className="input" list="edit-ages-list" value={editModal.age} style={editModalErrors.age ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, age: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.age; return n; }); }} />
                <datalist id="edit-ages-list">{allAges.map(a => <option key={a} value={a} />)}</datalist>
              </div>
              <div className="field">
                <label className="label">Group <span style={{ color: "#e53e3e" }}>*</span></label>
                <input className="input" list="edit-groups-list" value={editModal.group} style={editModalErrors.group ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, group: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.group; return n; }); }} />
                <datalist id="edit-groups-list">{allGroups.map(g => <option key={g} value={g} />)}</datalist>
              </div>
            </div>
            {editModalWarnings.length > 0 && (
              <div className="warn-box" style={{ marginBottom: 12 }}>
                {editModalWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button className="btn btn-warn btn-sm" onClick={() => { setData(d => d.map(g => g.id === editModal.id ? { ...editModal } : g)); setEditModal(null); setEditModalWarnings([]); }}>Save anyway</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditModalWarnings([])}>Go back</button>
                </div>
              </div>
            )}
            {editModalWarnings.length === 0 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEditModal}>Save Changes</button>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingRemove && (
        <ConfirmModal message={pendingRemove.msg} onConfirm={doRemove} onCancel={() => setPendingRemove(null)} />
      )}
      </div>
    </div>
  );
}

export default Step2_Gymnasts;
