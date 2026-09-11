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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClub, setFilterClub] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterAge, setFilterAge] = useState(""); // only offered when the filtered level has ages
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

  const blankForm = () => ({ name: "", level: "", age: "", bgNumber: "" });
  const [newG, setNewG] = useState(() => blankForm());
  // Manual add lives in a modal; it stays open after each add so a run of
  // gymnasts can be entered back-to-back.
  const [showAddModal, setShowAddModal] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  const openAddModal = () => {
    setNewG(blankForm());
    setFormWarnings([]);
    setFieldErrors({});
    setLastAdded(null);
    setShowAddModal(true);
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
    setFieldErrors({});
    const warns = validateGymnast(newG);
    if (warns.length) { setFormWarnings(warns); return; }
    commit();
  };

  const commit = () => {
    // Numbers come from running order — a new gymnast just takes the next unused one.
    const gymnast = { ...newG, name: normalizeStr(newG.name), age: normalizeStr(newG.age), bgNumber: normalizeStr(newG.bgNumber), number: nextNumber(data), club: selectedClub, id: generateId(), round: "", group: "" };
    setData(d => [...d, gymnast]);
    setNewG(blankForm());
    setFormWarnings([]);
    setFieldErrors({});
    setLastAdded(gymnast.name);
  };

  const startEdit = (g) => {
    setEditModal({ id: g.id, name: g.name, level: g.level, number: g.number, age: g.age, club: g.club, bgNumber: g.bgNumber || "" });
    setEditModalErrors({});
    setEditModalWarnings([]);
  };

  const saveEditModal = () => {
    const em = editModal;
    setEditModalErrors({});
    const warns = validateGymnast(em, em.id);
    if (warns.length && editModalWarnings.length === 0) { setEditModalWarnings(warns); return; }
    const normalized = { ...em, name: normalizeStr(em.name), age: normalizeStr(em.age), bgNumber: normalizeStr(em.bgNumber || "") };
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

  // DNS (Did Not Start) — gymnast stays in the list and keeps any scores,
  // but is dimmed in score entry, excluded from rankings and rotation groups.
  const setDns = (ids, dns) => {
    const set = new Set(ids);
    setData(d => d.map(g => set.has(g.id) ? { ...g, dns } : g));
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

      const newLevels = []; // levels from CSV not yet in setup
      const newAges = [];   // age ranges from CSV not yet in setup

      // Numbers come from running order — imported gymnasts take the next unused ones.
      const usedNumbers = new Set(data.map(g => parseInt(g.number)).filter(n => !isNaN(n)));
      let numCursor = 1;
      const takeNextNumber = () => {
        while (usedNumbers.has(numCursor)) numCursor++;
        usedNumbers.add(numCursor);
        return String(numCursor);
      };

      rows.forEach((row, i) => {
        const rowNum = i + 2;
        if (!row.name) { errors.push(`Row ${rowNum}: missing Name — skipped`); return; }

        // Auto-add unknown levels
        let levelObj = compData.levels.find(l => l.name.toLowerCase() === (row.level || "").toLowerCase())
          || newLevels.find(l => l.name.toLowerCase() === (row.level || "").toLowerCase());
        if (row.level && !levelObj) {
          levelObj = { id: generateId(), name: row.level.trim(), rankBy: "level" };
          newLevels.push(levelObj);
          warns.push(`Level "${row.level}" added to competition levels`);
        } else if (!row.level && compData.levels.length) {
          warns.push(`Row ${rowNum}: no level provided — imported without level`);
        }

        // Auto-add unknown age ranges
        const ageName = (row.age || "").trim();
        if (ageName) {
          const existingAges = [...(compData.ageRanges || []), ...newAges];
          if (!existingAges.some(a => a.toLowerCase() === ageName.toLowerCase()) ) {
            newAges.push(ageName);
            warns.push(`Age range "${ageName}" added to competition age ranges`);
          }
        }

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

        toAdd.push({ id: generateId(), name: row.name, number: takeNextNumber(), club: clubName, level: levelObj ? levelObj.id : "", round: "", age: ageName, group: "", bgNumber: normalizeStr(row["bg number"] || "") });
      });

      setCsvWarnings({ errors, warns });
      if (newClubs.length || newLevels.length || newAges.length) {
        setCompDataFn(d => {
          let updated = d;
          if (newClubs.length) {
            const existing = new Set(d.clubs.map(c => c.name.toLowerCase()));
            const deduped = newClubs.filter(c => !existing.has(c.name.toLowerCase()));
            if (deduped.length) updated = { ...updated, clubs: [...updated.clubs, ...deduped] };
          }
          if (newLevels.length) {
            const existing = new Set((d.levels || []).map(l => l.name.toLowerCase()));
            const deduped = newLevels.filter(l => !existing.has(l.name.toLowerCase()));
            if (deduped.length) updated = { ...updated, levels: [...(updated.levels || []), ...deduped] };
          }
          if (newAges.length) {
            const existing = new Set((d.ageRanges || []).map(a => a.toLowerCase()));
            const deduped = newAges.filter(a => !existing.has(a.toLowerCase()));
            if (deduped.length) updated = { ...updated, ageRanges: [...(updated.ageRanges || []), ...deduped] };
          }
          return updated;
        });
      }
      if (toAdd.length) setData(d => [...d, ...toAdd]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Display — flat list grouped by Level > Age > Gymnast Number
  const pastelColors = [
    "#E8D5F5", "#D5E8F5", "#D5F5E0", "#F5EAD5", "#F5D5D5",
    "#D5F5F0", "#F5D5EA", "#E0F5D5", "#D5D5F5", "#F5F0D5",
  ];
  const uniqueAges = useMemo(() => {
    const seen = [];
    data.forEach(g => { if (g.age && !seen.includes(g.age)) seen.push(g.age); });
    return seen;
  }, [data]);
  // Search (name only) + club/level filters, with an age filter that appears
  // only when the chosen level actually has ages attached to its gymnasts.
  // Filters are faceted: each dropdown only offers values present in the rows
  // matching every OTHER active criterion, so a search for "Maddie" narrows
  // the club list to just her clubs. A selected value always stays listed so
  // it can be deselected.
  const search = normalizeStr(searchQuery).toLowerCase();
  const hasFilter = !!(search || filterClub || filterLevel || filterAge);
  const { clubOptions, levelOptions, ageOptions, allGymnasts } = useMemo(() => {
    const matchesExcept = (g, except) =>
      (except === "search" || !search || (g.name || "").toLowerCase().includes(search)) &&
      (except === "club" || !filterClub || g.club === filterClub) &&
      (except === "level" || !filterLevel || g.level === filterLevel) &&
      (except === "age" || !filterAge || g.age === filterAge);

    const countBy = (except, keyFn) => {
      const counts = new Map();
      data.forEach(g => {
        if (!matchesExcept(g, except)) return;
        const k = keyFn(g);
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      });
      return counts;
    };

    const clubCounts = countBy("club", g => g.club);
    const levelCounts = countBy("level", g => g.level);
    const ageCounts = countBy("age", g => (g.level === filterLevel ? g.age : ""));

    return {
      clubOptions: compData.clubs
        .filter(c => c.name === filterClub || clubCounts.has(c.name))
        .map(c => ({ value: c.name, label: c.name, count: clubCounts.get(c.name) || 0 })),
      levelOptions: compData.levels
        .filter(l => l.id === filterLevel || levelCounts.has(l.id))
        .map(l => ({ value: l.id, label: l.name, count: levelCounts.get(l.id) || 0 })),
      ageOptions: filterLevel
        ? [...new Set([...ageCounts.keys(), ...(filterAge ? [filterAge] : [])])]
            .map(a => ({ value: a, label: a, count: ageCounts.get(a) || 0 }))
        : [],
      allGymnasts: hasFilter ? data.filter(g => matchesExcept(g, null)) : data,
    };
  }, [data, compData.clubs, compData.levels, search, filterClub, filterLevel, filterAge, hasFilter]);

  const grouped = {};
  allGymnasts.forEach(g => {
    const lvl = compData.levels.find(l => l.id === g.level)?.name || g.level || "No Level";
    const age = g.age || "";
    const key = age ? `${lvl}|||${age}` : lvl;
    if (!grouped[key]) grouped[key] = { levelName: lvl, age, gymnasts: [] };
    grouped[key].gymnasts.push(g);
  });
  // Sort gymnasts by number within each group
  Object.values(grouped).forEach(grp => grp.gymnasts.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)));
  const levelOrder = (compData.levels || []).map(l => l.name);
  const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
    const ga = grouped[a], gb = grouped[b];
    const ai = levelOrder.indexOf(ga.levelName), bi = levelOrder.indexOf(gb.levelName);
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return (ga.age || "").localeCompare(gb.age || "");
  });

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = (ids) => setSelected(s => { const allSelected = ids.every(id => s.has(id)); const n = new Set(s); ids.forEach(id => allSelected ? n.delete(id) : n.add(id)); return n; });
  // Selection is counted against the full list, not the search-filtered view —
  // bulk actions always act on everything selected, even rows a search hides.
  const selectedVisible = data.filter(g => selected.has(g.id)).length;

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

      {/* Add Gymnasts — bulk + manual, two routes to the same action */}
      <div className="card">
        <div className="card-title">Add Gymnasts</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Bulk upload</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, fontFamily: "var(--font-display)" }}>
              Import a whole list at once from a CSV file — clubs, levels and age ranges are added automatically.
            </div>
            <div className="csv-zone" onClick={() => fileRef.current.click()}>
              📂 Click to upload CSV file
            </div>
            <div style={{ marginTop: "auto" }}>
              <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}>⬇ Download Template</button>
            </div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Add manually</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, fontFamily: "var(--font-display)" }}>
              Add gymnasts one at a time — pick a club and enter their details. Handy for late entries on the day.
            </div>
            <div style={{ marginTop: "auto" }}>
              <button className="btn btn-primary" onClick={openAddModal}>＋ Add Gymnast</button>
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
        {csvWarnings.errors.length > 0 && (
          <div className="error-box" style={{ marginTop: 12, marginBottom: 8 }}>
            <strong>⚠ {csvWarnings.errors.length} row{csvWarnings.errors.length > 1 ? "s" : ""} skipped:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {csvWarnings.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {csvWarnings.warns.length > 0 && (
          <div className="warn-box" style={{ marginTop: 12 }}>
            <strong>ℹ Notices:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {csvWarnings.warns.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Gymnast List */}
      <div className="card">
        <div className="card-title">Gymnast List — {data.length} total</div>
        {data.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>
              </svg>
              <input className="input" placeholder="Search by name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: "100%", paddingLeft: 34, paddingRight: searchQuery ? 34 : undefined }} />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} title="Clear search"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--muted)", padding: 4, lineHeight: 1, fontFamily: "var(--font-display)" }}>
                  ×
                </button>
              )}
            </div>
            {(clubOptions.length > 0 || filterClub) && (
              <select className="select" style={{ width: "auto", minWidth: 130, fontSize: 13 }}
                value={filterClub} onChange={e => setFilterClub(e.target.value)}>
                <option value="">All clubs ({clubOptions.length})</option>
                {clubOptions.map(o => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
              </select>
            )}
            {(levelOptions.length > 0 || filterLevel) && (
              <select className="select" style={{ width: "auto", minWidth: 130, fontSize: 13 }}
                value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setFilterAge(""); }}>
                <option value="">All levels ({levelOptions.length})</option>
                {levelOptions.map(o => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
              </select>
            )}
            {filterLevel && ageOptions.length > 0 && (
              <select className="select" style={{ width: "auto", minWidth: 110, fontSize: 13 }}
                value={filterAge} onChange={e => setFilterAge(e.target.value)}>
                <option value="">All ages ({ageOptions.length})</option>
                {ageOptions.map(o => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>)}
              </select>
            )}
            {hasFilter && (<>
              <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
                {allGymnasts.length} of {data.length} match{allGymnasts.length === 1 ? "es" : ""}
              </span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, whiteSpace: "nowrap" }}
                onClick={() => { setSearchQuery(""); setFilterClub(""); setFilterLevel(""); setFilterAge(""); }}>
                Clear all
              </button>
            </>)}
          </div>
        )}
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
              {(() => {
                const allDns = data.filter(g => selected.has(g.id)).every(g => g.dns);
                return (
                  <button className="btn btn-sm" title={allDns ? "Clear Did Not Start" : "Mark as Did Not Start"}
                    style={{ fontSize: 11, padding: "4px 12px", background: allDns ? "var(--danger)" : "transparent", color: allDns ? "#fff" : "var(--danger)", border: "1px solid var(--danger)" }}
                    onClick={() => setDns([...selected], !allDns)}>
                    {allDns ? "Clear DNS" : "Mark DNS"}
                  </button>
                );
              })()}
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
        {sortedGroupKeys.length === 0 && (
          <div className="empty">
            {hasFilter ? "No gymnasts match the current search and filters" : "No gymnasts added yet"}
          </div>
        )}
        {sortedGroupKeys.map(key => {
          const { levelName, age, gymnasts } = grouped[key];
          const label = age ? `${levelName} — ${age}` : levelName;
          return (
            <div key={key} style={{ marginBottom: 16 }}>
              <div className="group-header">
                <span className="group-label">{levelName}</span>
                {age && (() => {
                  const ageIdx = uniqueAges.indexOf(age);
                  const color = ageIdx >= 0 ? pastelColors[ageIdx % pastelColors.length] : "var(--surface2)";
                  return (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 56,
                      background: color, color: "var(--text)", marginLeft: 8,
                    }}>{age}</span>
                  );
                })()}
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>({gymnasts.length})</span>
                <div className="group-line" />
              </div>
              <div className="table-wrap">
                <table style={{ tableLayout: "fixed", width: "100%" }}>
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "27%" }} />
                    <col style={{ width: "23%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "26%" }} />
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
                            <button className="btn btn-sm" title={g.dns ? "Clear Did Not Start" : "Mark as Did Not Start"}
                              style={{ fontSize: 11, padding: "4px 10px", background: g.dns ? "var(--danger)" : "transparent", color: g.dns ? "#fff" : "var(--danger)", border: "1px solid var(--danger)" }}
                              onClick={() => setDns([g.id], !g.dns)}>{g.dns ? "Clear DNS" : "DNS"}</button>
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

      {/* Add Gymnast Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 520, width: "100%", padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Add Gymnast</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", padding: 4 }}>×</button>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="label">Club</label>
              {compData.clubs.length > 0 ? (
                <select className="select" value={selectedClub} style={{ width: "100%", ...(fieldErrors.club ? errBorder : {}) }}
                  onChange={e => { setSelectedClub(e.target.value); setFieldErrors(fe => { const n = { ...fe }; delete n.club; return n; }); }}>
                  <option value="">Select…</option>
                  {compData.clubs.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No clubs added yet — add clubs from the dashboard first.</div>
              )}
              {fieldErrors.club && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 4 }}>Please select a club</div>}
            </div>
            <div className="grid-3" style={{ marginBottom: 8 }}>
              <div className="field">
                <label className="label">Name</label>
                <input className="input" placeholder="Full name" value={newG.name} style={fieldErrors.name ? errBorder : {}}
                  onChange={e => { setNewG(g => ({ ...g, name: e.target.value })); setFieldErrors(fe => { const n = { ...fe }; delete n.name; return n; }); }} autoFocus />
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
              <div className="field">
                <label className="label">BG Number (optional)</label>
                <input className="input" placeholder="e.g. 1234567" value={newG.bgNumber}
                  onChange={e => setNewG(g => ({ ...g, bgNumber: e.target.value }))} />
              </div>
            </div>
            {lastAdded && formWarnings.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--success)", fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 12 }}>
                ✓ Added {lastAdded} — add another or close
              </div>
            )}
            {formWarnings.length > 0 && (
              <div className="warn-box" style={{ marginBottom: 12 }}>
                {formWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button className="btn btn-warn btn-sm" onClick={commit}>Add anyway</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFormWarnings([])}>Cancel</button>
                </div>
              </div>
            )}
            {formWarnings.length === 0 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Done</button>
                <button className="btn btn-primary" onClick={attemptAdd}>Add Gymnast</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Gymnast Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}>
          <div className="modal-box" style={{ maxWidth: 520, width: "100%", padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Edit Gymnast</div>
              <button onClick={() => setEditModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", padding: 4 }}>×</button>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="label">Club</label>
              {compData.clubs.length > 0 ? (
                <select className="select" value={editModal.club || ""} style={{ width: "100%", ...(editModalErrors.club ? errBorder : {}) }}
                  onChange={e => { setEditModal(m => ({ ...m, club: e.target.value })); setEditModalErrors(er => { const n = { ...er }; delete n.club; return n; }); }}>
                  <option value="">Select…</option>
                  {compData.clubs.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  {editModal.club && !compData.clubs.some(c => c.name === editModal.club) && (
                    <option value={editModal.club}>{editModal.club} (not in club list)</option>
                  )}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No clubs added yet — add clubs from the dashboard first.</div>
              )}
              {editModalErrors.club && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 4 }}>Please select a club</div>}
            </div>
            <div className="grid-2" style={{ marginBottom: 8 }}>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
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
              <div className="field">
                <label className="label">BG Number (optional)</label>
                <input className="input" placeholder="e.g. 1234567" value={editModal.bgNumber || ""}
                  onChange={e => setEditModal(m => ({ ...m, bgNumber: e.target.value }))} />
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
