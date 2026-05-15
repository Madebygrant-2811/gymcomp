import { useState, useRef, useEffect, useMemo } from "react";
import { generateId, generateClubCode, parseCSV, downloadTemplate, normalizeStr } from "../../lib/utils.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";

function Step2_Gymnasts({ compData, setCompDataFn, data, setData, scores = {}, onNext, onBack }) {
  const [selectedClub, setSelectedClub] = useState(compData.clubs[0]?.name || "");
  const [editModal, setEditModal] = useState(null); // { ...gymnast fields } or null
  const [editModalErrors, setEditModalErrors] = useState({});
  const [editModalWarnings, setEditModalWarnings] = useState([]);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [pendingWithdraw, setPendingWithdraw] = useState(null); // { id, msg } or { ids, msg }
  const [formWarnings, setFormWarnings] = useState([]);
  const [csvWarnings, setCsvWarnings] = useState({ errors: [], warns: [] });
  const [fieldErrors, setFieldErrors] = useState({});
  const [selected, setSelected] = useState(new Set());
  const fileRef = useRef(null);

  const gymnastsWithScores = useMemo(() => {
    const set = new Set();
    for (const k of Object.keys(scores)) {
      const parts = k.split("__");
      if (parts.length >= 3 && parseFloat(scores[k]) > 0) {
        set.add(parts[1]);
      }
    }
    console.log("[gymnasts-with-scores]", Array.from(set));
    return set;
  }, [scores]);
  const gymnastHasScores = (gid) => gymnastsWithScores.has(gid);

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
    name: "", level: "",
    number: nextNumber(gymnasts), age: ""
  });
  const [newG, setNewG] = useState(() => blankForm());


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
    setFieldErrors({});
    const warns = validateGymnast(newG);
    if (warns.length) { setFormWarnings(warns); return; }
    commit();
  };

  const commit = () => {
    const gymnast = { ...newG, name: normalizeStr(newG.name), age: normalizeStr(newG.age), club: selectedClub, id: generateId(), round: "", group: "" };
    setData(d => [...d, gymnast]);
    setNewG(blankForm([...data, gymnast]));
    setFormWarnings([]);
    setFieldErrors({});
  };

  const startEdit = (g) => {
    setEditModal({ id: g.id, name: g.name, level: g.level, number: g.number, age: g.age, club: g.club });
    setEditModalErrors({});
    setEditModalWarnings([]);
  };

  const saveEditModal = () => {
    const em = editModal;
    setEditModalErrors({});
    const warns = validateGymnast(em, em.id);
    if (warns.length && editModalWarnings.length === 0) { setEditModalWarnings(warns); return; }
    const normalized = { ...em, name: normalizeStr(em.name), age: normalizeStr(em.age) };
    setData(d => d.map(g => g.id === em.id ? { ...g, ...normalized } : g));
    setEditModal(null);
    setEditModalWarnings([]);
  };

  const tryRemove = (removeInfo) => {
    // Check if any gymnast in the removal batch has scores
    const ids = removeInfo.ids || [removeInfo.id];
    const scored = ids.filter(id => gymnastHasScores(id));
    if (scored.length > 0) {
      const names = scored.map(id => data.find(g => g.id === id)?.name).filter(Boolean);
      const label = scored.length === 1 ? `"${names[0]}" has` : `${scored.length} gymnasts have`;
      setPendingWithdraw({ ids: scored, msg: `${label} recorded scores and cannot be deleted. Withdraw them instead — their scores will be preserved but they will be marked as withdrawn.` });
    } else {
      setPendingRemove(removeInfo);
    }
  };

  const doRemove = () => {
    if (pendingRemove.ids) {
      const removeSet = new Set(pendingRemove.ids);
      setData(d => d.filter(g => !removeSet.has(g.id)));
      setSelected(s => { const n = new Set(s); pendingRemove.ids.forEach(id => n.delete(id)); return n; });
    } else {
      setData(d => d.filter(g => g.id !== pendingRemove.id));
    }
    setPendingRemove(null);
  };

  const doWithdraw = () => {
    const wdSet = new Set(pendingWithdraw.ids);
    setData(d => d.map(g => wdSet.has(g.id) ? { ...g, withdrawn: true } : g));
    setPendingWithdraw(null);
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
      const allExistingCodes = compData.clubs.map(c => c.clubCode).filter(Boolean);

      rows.forEach((row, i) => {
        const rowNum = i + 2;
        if (!row.name) { errors.push(`Row ${rowNum}: missing Name — skipped`); return; }
        if (row.number && data.find(x => x.number === row.number)) {
          errors.push(`Row ${rowNum}: number #${row.number} already taken — skipped`); return;
        }

        const levelObj = compData.levels.find(l => l.name.toLowerCase() === (row.level || "").toLowerCase());
        if (row.level && !levelObj) warns.push(`Row ${rowNum}: level "${row.level}" not found — imported without level`);
        else if (!row.level && compData.levels.length) warns.push(`Row ${rowNum}: no level provided — imported without level`);

        // Auto-add unknown clubs
        const clubName = (row.club || selectedClub || "").trim();
        if (clubName) {
          const existsInSetup = compData.clubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
          const alreadyQueued = newClubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
          if (!existsInSetup && !alreadyQueued) {
            const code = generateClubCode([...allExistingCodes, ...newClubs.map(c => c.clubCode)]);
            newClubs.push({ id: generateId(), name: clubName, clubCode: code });
            warns.push(`"${clubName}" added to Participating Clubs`);
          }
        }

        toAdd.push({ id: generateId(), name: row.name, number: row.number, club: clubName, level: levelObj ? levelObj.id : "", round: "", age: row.age || "", group: "" });
      });

      setCsvWarnings({ errors, warns });
      if (newClubs.length) {
        setCompDataFn(d => {
          const existing = new Set(d.clubs.map(c => c.name.toLowerCase()));
          const deduped = newClubs.filter(c => !existing.has(c.name.toLowerCase()));
          return deduped.length ? { ...d, clubs: [...d.clubs, ...deduped] } : d;
        });
      }
      if (toAdd.length) setData(d => [...d, ...toAdd]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Display — flat list grouped by Level > Gymnast Number
  const allGymnasts = data;

  const grouped = {};
  allGymnasts.forEach(g => {
    const lvl = compData.levels.find(l => l.id === g.level)?.name || g.level || "No Level";
    if (!grouped[lvl]) grouped[lvl] = [];
    grouped[lvl].push(g);
  });
  // Sort gymnasts by number within each level
  Object.values(grouped).forEach(arr => arr.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)));
  const sortedLevelKeys = Object.keys(grouped).sort();

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = (ids) => setSelected(s => { const allSelected = ids.every(id => s.has(id)); const n = new Set(s); ids.forEach(id => allSelected ? n.delete(id) : n.add(id)); return n; });
  const selectedVisible = allGymnasts.filter(g => selected.has(g.id)).length;

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

      <div className="setup-content" style={{ padding: "40px", maxWidth: 1200, margin: "0 auto" }}>
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
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Club</div>
        <div style={{ marginBottom: 16 }}>
          {compData.clubs.length > 0 ? (
            <div className="club-pills-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", ...(fieldErrors.club ? { padding: 4, borderRadius: 8, outline: "2px solid #e53e3e" } : {}) }}>
              {compData.clubs.map(c => (
                <button key={c.id} className={`btn btn-sm ${selectedClub === c.name ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => { setSelectedClub(c.name); setFieldErrors(e => { const n = { ...e }; delete n.club; return n; }); }}>{c.name}</button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No clubs added yet — add clubs from the dashboard first.</div>
          )}
          {fieldErrors.club && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 4 }}>Please select a club</div>}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", margin: "0 0 16px" }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Gymnast Details</div>
        <div className="grid-3" style={{ marginBottom: 8 }}>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" placeholder="Full name" value={newG.name} style={fieldErrors.name ? errBorder : {}}
              onChange={e => { setNewG(g => ({ ...g, name: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.name; return n; }); }} />
          </div>
          <div className="field">
            <label className="label">Number</label>
            <input className="input" placeholder="e.g. 42" value={newG.number}
              onChange={e => setNewG(g => ({ ...g, number: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Level</label>
            <select className="select" value={newG.level} style={fieldErrors.level ? errBorder : {}}
              onChange={e => { setNewG(g => ({ ...g, level: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.level; return n; }); }}>
              <option value="">Select…</option>
              {compData.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Age</label>
            <select className="select" value={newG.age} style={fieldErrors.age ? errBorder : {}}
              onChange={e => { setNewG(g => ({ ...g, age: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.age; return n; }); }}>
              <option value="">Select…</option>
              {(compData.ageRanges || []).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
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
        {selectedVisible > 0 && (
          <div style={{ padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{selectedVisible} selected</span>
              <select className="select" style={{ fontSize: 12, padding: "4px 24px 4px 8px", width: "auto", minWidth: 120 }}
                value="" onChange={e => { if (!e.target.value) return; setData(d => d.map(g => selected.has(g.id) ? { ...g, level: e.target.value } : g)); }}>
                <option value="">Assign Level...</option>
                {compData.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {(compData.ageRanges || []).length > 0 && (
                <select className="select" style={{ fontSize: 12, padding: "4px 24px 4px 8px", width: "auto", minWidth: 120 }}
                  value="" onChange={e => { if (!e.target.value) return; setData(d => d.map(g => selected.has(g.id) ? { ...g, age: e.target.value } : g)); }}>
                  <option value="">Assign Age...</option>
                  {compData.ageRanges.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {compData.clubs.length > 0 && (
                <select className="select" style={{ fontSize: 12, padding: "4px 24px 4px 8px", width: "auto", minWidth: 120 }}
                  value="" onChange={e => { if (!e.target.value) return; const val = e.target.value === "__clear__" ? "" : e.target.value; setData(d => d.map(g => selected.has(g.id) ? { ...g, club: val } : g)); }}>
                  <option value="">Assign Club...</option>
                  {compData.clubs.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  <option value="__clear__">— Clear Club —</option>
                </select>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: "4px 12px" }}
                onClick={() => tryRemove({ ids: [...selected], msg: `Remove ${selectedVisible} selected gymnast${selectedVisible > 1 ? "s" : ""}?` })}>
                Delete Selected
              </button>
              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}
                onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          </div>
        )}
        {sortedLevelKeys.length === 0 && <div className="empty">No gymnasts added yet</div>}
        {sortedLevelKeys.map(lvl => {
          const gymnasts = grouped[lvl];
          return (
            <div key={lvl} style={{ marginBottom: 16 }}>
              <div className="group-header">
                <span className="group-label">{lvl}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>({gymnasts.length})</span>
                <div className="group-line" />
              </div>
              <div className="table-wrap">
                <table style={{ tableLayout: "fixed", width: "100%" }}>
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "20%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <input type="checkbox" checked={gymnasts.every(g => selected.has(g.id))}
                          onChange={() => toggleAll(gymnasts.map(g => g.id))} />
                      </th>
                      <th>#</th>
                      <th>Name</th>
                      <th>Club</th>
                      <th>Age</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gymnasts.map(g => {
                      const dimmed = g.dns || g.withdrawn;
                      return (
                      <tr key={g.id} style={{ opacity: dimmed ? 0.45 : 1 }}>
                        <td><input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} /></td>
                        <td style={{ fontWeight: 600, color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.number}</td>
                        <td>
                          <strong style={{ textDecoration: dimmed ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{g.name}</strong>
                          {g.dns && <span style={{ display: "block", fontSize: 9, color: "var(--danger)", fontWeight: 700, letterSpacing: 0.5 }}>DNS</span>}
                          {g.withdrawn && !g.dns && <span style={{ display: "block", fontSize: 9, color: "#d97706", fontWeight: 700, letterSpacing: 0.5 }}>WD</span>}
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.club}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.age}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => startEdit(g)}>Edit</button>
                            {g.withdrawn ? (
                              <button className="btn btn-sm" style={{ fontSize: 11, padding: "4px 10px", background: "#d97706", color: "#fff", border: "none" }}
                                onClick={() => setData(d => d.map(x => x.id === g.id ? { ...x, withdrawn: false } : x))}>Reinstate</button>
                            ) : (
                              <button className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: "4px 10px" }}
                                onClick={() => tryRemove({ id: g.id, msg: `Remove gymnast "${g.name}"?` })}>Remove</button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

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
              <label className="label">Club</label>
              {compData.clubs.length > 0 && (
                <div className="club-pills-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, ...(editModalErrors.club ? { padding: 4, borderRadius: 8, outline: "2px solid #e53e3e" } : {}) }}>
                  {compData.clubs.map(c => (
                    <button key={c.id} className={`btn btn-sm ${editModal.club === c.name ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => { setEditModal(m => ({ ...m, club: c.name })); setEditModalErrors(e => { const n = { ...e }; delete n.club; return n; }); }}>{c.name}</button>
                  ))}
                </div>
              )}
              {compData.clubs.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No clubs added yet — add clubs from the dashboard first.</div>
              )}
              {editModalErrors.club && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 4 }}>Please select a club</div>}
            </div>
            <div className="grid-3" style={{ marginBottom: 8 }}>
              <div className="field">
                <label className="label">Name</label>
                <input className="input" value={editModal.name} style={editModalErrors.name ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, name: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.name; return n; }); }} autoFocus />
              </div>
              <div className="field">
                <label className="label">Number</label>
                <input className="input" value={editModal.number}
                  onChange={e => setEditModal(m => ({ ...m, number: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Level</label>
                <select className="select" value={editModal.level} style={editModalErrors.level ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, level: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.level; return n; }); }}>
                  <option value="">Select…</option>
                  {compData.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Age</label>
                <select className="select" value={editModal.age} style={editModalErrors.age ? errBorder : {}}
                  onChange={e => { setEditModal(m => ({ ...m, age: e.target.value })); setEditModalErrors(fe => { const n = { ...fe }; delete n.age; return n; }); }}>
                  <option value="">Select…</option>
                  {(compData.ageRanges || []).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            {editModalWarnings.length > 0 && (
              <div className="warn-box" style={{ marginBottom: 12 }}>
                {editModalWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button className="btn btn-warn btn-sm" onClick={() => { setData(d => d.map(g => g.id === editModal.id ? { ...g, ...editModal } : g)); setEditModal(null); setEditModalWarnings([]); }}>Save anyway</button>
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
      {pendingWithdraw && (
        <ConfirmModal message={pendingWithdraw.msg} confirmLabel="Withdraw" onConfirm={doWithdraw} onCancel={() => setPendingWithdraw(null)}
          confirmStyle={{ background: "#d97706", color: "#fff", borderColor: "#d97706" }} />
      )}
      </div>
    </div>
  );
}

export default Step2_Gymnasts;
