import { useState, useRef, useEffect, useMemo } from "react";
import { generateId } from "../../lib/utils.js";

const getAppName = (full) => full.replace(/\s*\(.*?\)\s*$/, "");

/* ── Grip icon (reorder handle) ─────────────────────────── */
const gripIcon = (
  <svg width="10" height="12" viewBox="0 0 12 12" fill="var(--muted)" style={{ flexShrink: 0 }}>
    <circle cx="4" cy="2" r="1.2" /><circle cx="8" cy="2" r="1.2" />
    <circle cx="4" cy="6" r="1.2" /><circle cx="8" cy="6" r="1.2" />
    <circle cx="4" cy="10" r="1.2" /><circle cx="8" cy="10" r="1.2" />
  </svg>
);

/* ================================================================ */

function RoundsGroupsPage({ compData, gymnasts, setCompData, setGymnasts, eventStatus, onBack }) {
  /* ── State ──────────────────────────────────────────────── */
  const [assignSel, setAssignSel] = useState(new Set());
  const [assignSearch, setAssignSearch] = useState("");
  const [assignLevelFilter, setAssignLevelFilter] = useState("");
  const [assignAgeFilter, setAssignAgeFilter] = useState("");
  const [assignClubFilter, setAssignClubFilter] = useState("");
  const [activeRound, setActiveRound] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [dropColumn, setDropColumn] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);

  // Mobile
  const [isMobile, setIsMobile] = useState(false);
  const [mobileColumn, setMobileColumn] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSel, setPickerSel] = useState(new Set());
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFilter, setPickerFilter] = useState("");

  // Touch reorder (mobile)
  const [touchDrag, setTouchDrag] = useState(null);
  const touchTimerRef = useRef(null);
  const rowRefsRef = useRef({});

  /* ── Derived ────────────────────────────────────────────── */
  const completed = eventStatus === "completed";
  const readOnly = completed || eventStatus === "live" || eventStatus === "archived";
  const gbr = compData.groupsByRound || {};
  const rounds = compData.rounds || [];
  const roundIds = rounds.map((r) => r.id);
  const apparatus = (compData.apparatus || []).filter((a) => a !== "Rest");
  const levels = compData.levels || [];

  /* ── Responsive ─────────────────────────────────────────── */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* ── Default active round ───────────────────────────────── */
  useEffect(() => {
    if ((!activeRound || !roundIds.includes(activeRound)) && roundIds.length > 0)
      setActiveRound(roundIds[0]);
  }, [roundIds.join(",")]);

  /* ── Auto-sync groups to match apparatus count ──────────── */
  useEffect(() => {
    if (!activeRound || readOnly || apparatus.length === 0) return;
    const existing = gbr[activeRound] || [];
    if (existing.length >= apparatus.length) return;
    setCompData((d) => {
      const newGbr = { ...(d.groupsByRound || {}) };
      const cur = newGbr[activeRound] || [];
      if (cur.length >= apparatus.length) return d;
      let offset = 0;
      (d.rounds || []).forEach((rd) => {
        const count = rd.id === activeRound ? apparatus.length : (newGbr[rd.id] || []).length;
        newGbr[rd.id] = Array.from({ length: count }, (_, i) => {
          const ex = rd.id === activeRound ? cur[i] : (newGbr[rd.id] || [])[i];
          return ex || `Rotation ${offset + i + 1}`;
        });
        offset += count;
      });
      return { ...d, groupsByRound: newGbr };
    });
  }, [activeRound, apparatus.length]);

  /* ── Gymnast helpers ────────────────────────────────────── */
  const activeGymnasts = gymnasts.filter((g) => !g.dns && !g.withdrawn);
  const groups = activeRound ? gbr[activeRound] || [] : [];
  const roundGymnasts = activeRound ? activeGymnasts.filter((g) => g.round === activeRound) : [];
  const assignedCount = roundGymnasts.filter((g) => g.group && groups.includes(g.group)).length;

  // Unassigned: no round OR in this round but no valid group
  const unassigned = activeGymnasts.filter((g) => {
    if (!g.round || !roundIds.includes(g.round)) return true;
    if (g.round === activeRound && (!g.group || !groups.includes(g.group))) return true;
    return false;
  });

  function sortGymnasts(list) {
    return [...list].sort((a, b) => {
      const aIdx = typeof a.orderIndex === "number" ? a.orderIndex : Number.MAX_SAFE_INTEGER;
      const bIdx = typeof b.orderIndex === "number" ? b.orderIndex : Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      const aNum = parseInt(a.number) || Number.MAX_SAFE_INTEGER;
      const bNum = parseInt(b.number) || Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  function nextOrderIndex(roundId, groupLabel) {
    const bucket = gymnasts.filter((g) => g.round === roundId && (g.group || "") === (groupLabel || ""));
    if (bucket.length === 0) return 0;
    const indices = bucket.map((g) => (typeof g.orderIndex === "number" ? g.orderIndex : -1));
    return Math.max(...indices) + 1;
  }

  const getColumnGymnasts = (groupName) =>
    sortGymnasts(roundGymnasts.filter((g) => g.group === groupName));

  /* ── Filter unassigned ──────────────────────────────────── */
  const filteredUnassigned = unassigned.filter((g) => {
    if (assignSearch) {
      const s = assignSearch.toLowerCase();
      if (
        !(g.name || "").toLowerCase().includes(s) &&
        !(g.club || "").toLowerCase().includes(s) &&
        !(g.number || "").toString().includes(s)
      )
        return false;
    }
    if (assignLevelFilter && g.level !== assignLevelFilter) return false;
    if (assignAgeFilter && (g.age || "") !== assignAgeFilter) return false;
    if (assignClubFilter && (g.club || "") !== assignClubFilter) return false;
    return true;
  });

  /* ── Ranking band grouping ──────────────────────────────── */
  const buildRankGroups = (list) => {
    const map = {};
    list.forEach((g) => {
      const lo = levels.find((l) => l.id === g.level);
      const ln = lo?.name || "Unknown";
      const rk = lo?.rankBy || "level";
      const age = rk === "level+age" ? g.age || "" : "";
      const key = age ? `${ln} (${age})` : ln;
      if (!map[key]) map[key] = { label: key, levelName: ln, ageLabel: age, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    const order = levels.map((l) => l.name);
    return Object.values(map).sort((a, b) => {
      const ai = order.indexOf(a.levelName);
      const bi = order.indexOf(b.levelName);
      if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return (a.ageLabel || "").localeCompare(b.ageLabel || "");
    });
  };

  const allRankGroups = useMemo(() => buildRankGroups(unassigned), [unassigned, levels]);
  const filteredRankGroups = useMemo(() => buildRankGroups(filteredUnassigned), [filteredUnassigned, levels]);

  // Assigned / total per band (across all rounds)
  const bandStats = useMemo(() => {
    const out = {};
    activeGymnasts.forEach((g) => {
      const lo = levels.find((l) => l.id === g.level);
      const ln = lo?.name || "Unknown";
      const rk = lo?.rankBy || "level";
      const age = rk === "level+age" ? g.age || "" : "";
      const key = age ? `${ln} (${age})` : ln;
      if (!out[key]) out[key] = { total: 0, assigned: 0 };
      out[key].total++;
      if (g.round && roundIds.includes(g.round)) {
        const rg = gbr[g.round] || [];
        if (g.group && rg.includes(g.group)) out[key].assigned++;
      }
    });
    return out;
  }, [activeGymnasts, levels, gbr, roundIds]);

  /* ── Level filter chips ─────────────────────────────────── */
  const levelChips = useMemo(() => {
    const chips = [{ id: "", label: "All", count: unassigned.length }];
    levels.forEach((l) => {
      chips.push({ id: l.id, label: l.name, count: unassigned.filter((g) => g.level === l.id).length });
    });
    return chips;
  }, [unassigned, levels]);

  /* ── Age options (shown when a level is selected and has ages) ── */
  const selectedLevelObj = assignLevelFilter ? levels.find((l) => l.id === assignLevelFilter) : null;
  const showAgeFilter = !!selectedLevelObj;
  const ageOptions = useMemo(() => {
    if (!assignLevelFilter) return [];
    const levelGymnasts = unassigned.filter((g) => g.level === assignLevelFilter);
    const ages = [];
    levelGymnasts.forEach((g) => {
      const a = g.age || "";
      if (a && !ages.includes(a)) ages.push(a);
    });
    return ages.sort();
  }, [unassigned, assignLevelFilter]);

  /* ── Club options ──────────────────────────────────────── */
  const clubOptions = useMemo(() => {
    const clubs = [];
    unassigned.forEach((g) => {
      if (g.club && !clubs.includes(g.club)) clubs.push(g.club);
    });
    return clubs.sort();
  }, [unassigned]);

  /* ── Selection helpers ──────────────────────────────────── */
  const visibleIds = filteredUnassigned.map((g) => g.id);
  const selectedInPanel = [...assignSel].filter((id) => visibleIds.includes(id));

  /* ── Auto-assign ────────────────────────────────────────── */
  const handleAutoAssign = () => {
    if (readOnly) return;
    const rnds = compData.rounds || [];
    if (!rnds.length) return;
    const unassignedAll = activeGymnasts.filter((g) => !g.round || !roundIds.includes(g.round));
    const toAssign = [...unassignedAll];
    const perRound = Math.ceil(toAssign.length / rnds.length);
    const bucketMax = {};
    gymnasts.forEach((g) => {
      if (g.round && g.orderIndex !== undefined) {
        const key = `${g.round}::${g.group || ""}`;
        bucketMax[key] = Math.max(bucketMax[key] || 0, g.orderIndex);
      }
    });
    const assignments = {};
    rnds.forEach((r, ri) => {
      const chunk = toAssign.splice(0, ri === rnds.length - 1 ? toAssign.length : perRound);
      const rGroups = gbr[r.id] || [];
      chunk.forEach((g, gi) => {
        const targetGroup = rGroups.length ? rGroups[gi % rGroups.length] : "";
        const key = `${r.id}::${targetGroup}`;
        bucketMax[key] = (bucketMax[key] || 0) + 1;
        assignments[g.id] = { round: r.id, group: targetGroup, orderIndex: bucketMax[key] };
      });
    });
    setGymnasts((prev) => prev.map((g) => (assignments[g.id] ? { ...g, ...assignments[g.id] } : g)));
  };

  /* ── Assign / unassign / reorder ────────────────────────── */
  const assignToColumn = (ids, groupName) => {
    if (readOnly || !activeRound || !groupName) return;
    let idx = nextOrderIndex(activeRound, groupName);
    setGymnasts((prev) =>
      prev.map((g) => {
        if (!ids.includes(g.id)) return g;
        return { ...g, round: activeRound, group: groupName, orderIndex: idx++ };
      })
    );
    setAssignSel(new Set());
  };

  const handleUnassign = (ids) => {
    if (readOnly) return;
    setGymnasts((prev) =>
      prev.map((g) => (ids.includes(g.id) ? { ...g, round: "", group: "", orderIndex: undefined } : g))
    );
    setAssignSel(new Set());
  };

  const handleResetRound = () => {
    if (readOnly || !activeRound) return;
    const toReset = gymnasts.filter((g) => g.round === activeRound).map((g) => g.id);
    setGymnasts((prev) =>
      prev.map((g) => (toReset.includes(g.id) ? { ...g, round: "", group: "", orderIndex: undefined } : g))
    );
  };

  const handleReorder = (fromId, toId, position) => {
    const from = gymnasts.find((g) => g.id === fromId);
    if (!from) return;
    const bucket = sortGymnasts(
      gymnasts.filter(
        (g) => g.round === from.round && (g.group || "") === (from.group || "") && !g.dns && !g.withdrawn
      )
    );
    const fromIdx = bucket.findIndex((g) => g.id === fromId);
    let toIdx = bucket.findIndex((g) => g.id === toId);
    if (position === "after") toIdx += 1;
    if (fromIdx < toIdx) toIdx -= 1;
    const [moved] = bucket.splice(fromIdx, 1);
    bucket.splice(toIdx, 0, moved);
    const updated = bucket.map((g, i) => ({ ...g, orderIndex: i }));
    setGymnasts((prev) => prev.map((g) => updated.find((u) => u.id === g.id) || g));
  };

  /* ── Drag handlers ──────────────────────────────────────── */
  const handleColumnDrop = (e, groupName) => {
    e.preventDefault();
    if (readOnly || !activeRound || !groupName) return;
    try {
      const d = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (d.gymnastIds) assignToColumn(d.gymnastIds, groupName);
      else if (d.gymnastId) assignToColumn([d.gymnastId], groupName);
    } catch (_) {}
    setDraggingId(null);
    setDropTarget(null);
    setDragSource(null);
    setDropColumn(null);
  };

  const handlePanelDrop = (e) => {
    e.preventDefault();
    try {
      const d = JSON.parse(e.dataTransfer.getData("text/plain"));
      const ids = d.gymnastIds || (d.gymnastId ? [d.gymnastId] : []);
      if (ids.length > 0) handleUnassign(ids);
    } catch (_) {}
    setDraggingId(null);
    setDropTarget(null);
    setDragSource(null);
    setDropColumn(null);
  };

  /* ── Add round ──────────────────────────────────────────── */
  const handleAddRound = () => {
    if (readOnly) return;
    setCompData((d) => {
      const newRounds = [...(d.rounds || [])];
      newRounds.push({ id: generateId(), name: `Round ${newRounds.length + 1}`, start: "", end: "" });
      return { ...d, rounds: newRounds };
    });
  };

  /* ── Gymnast row (shared) ───────────────────────────────── */
  const pastelColors = [
    "#E8D5F5", "#D5E8F5", "#D5F5E0", "#F5EAD5", "#F5D5D5",
    "#D5F5F0", "#F5D5EA", "#E0F5D5", "#D5D5F5", "#F5F0D5",
  ];

  const uniqueAges = useMemo(() => {
    const seen = [];
    activeGymnasts.forEach((g) => {
      if (g.age && !seen.includes(g.age)) seen.push(g.age);
    });
    return seen;
  }, [activeGymnasts]);

  const renderGymnastInfo = (g, opts = {}) => {
    const lo = levels.find((l) => l.id === g.level);
    const rk = lo?.rankBy || "level";
    const ageIdx = g.age ? uniqueAges.indexOf(g.age) : -1;
    const ageColor = ageIdx >= 0 ? pastelColors[ageIdx % pastelColors.length] : null;
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: opts.fontSize || 13,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {g.name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 8,
              background: "rgba(0,13,255,0.08)",
              color: "var(--brand-01)",
              whiteSpace: "nowrap",
            }}
          >
            {lo?.name || "—"}
          </span>
          {rk === "level+age" && g.age && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 8,
                background: ageColor || "var(--background-neutral)",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
              }}
            >
              {g.age}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {g.club || "—"}
        </div>
      </div>
    );
  };

  /* ================================================================
     DESKTOP LAYOUT
     ================================================================ */
  const renderDesktop = () => (
    <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
      {/* ── Left panel ──────────────────────────────────────── */}
      <div
        style={{
          width: 380,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
        }}
        onDragOver={(e) => {
          if (dragSource === "column") {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={handlePanelDrop}
      >
        {/* Header */}
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Available Gymnasts
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>
            {unassigned.length} unassigned · {activeGymnasts.length} total
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 18px 0" }}>
          <div style={{ position: "relative" }}>
            <svg
              style={{ position: "absolute", left: 12, top: 10, pointerEvents: "none" }}
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
            >
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3 3" />
            </svg>
            <input
              className="input"
              placeholder="Search name, club…"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 14px 8px 34px", fontSize: 13 }}
            />
          </div>
        </div>

        {/* Filter dropdowns */}
        <div style={{ padding: "8px 18px 10px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="select"
            value={assignLevelFilter}
            onChange={(e) => { setAssignLevelFilter(e.target.value); setAssignAgeFilter(""); }}
            style={{ width: "auto", minWidth: 130, fontSize: 12, padding: "6px 32px 6px 10px" }}
          >
            <option value="">All Levels</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {showAgeFilter && ageOptions.length > 0 && (
            <select
              className="select"
              value={assignAgeFilter}
              onChange={(e) => setAssignAgeFilter(e.target.value)}
              style={{ width: "auto", minWidth: 110, fontSize: 12, padding: "6px 32px 6px 10px" }}
            >
              <option value="">All Ages</option>
              {ageOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
          <select
            className="select"
            value={assignClubFilter}
            onChange={(e) => setAssignClubFilter(e.target.value)}
            style={{ width: "auto", minWidth: 120, fontSize: 12, padding: "6px 32px 6px 10px" }}
          >
            <option value="">All Clubs</option>
            {clubOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {(assignLevelFilter || assignAgeFilter || assignClubFilter) && (
            <button
              onClick={() => { setAssignLevelFilter(""); setAssignAgeFilter(""); setAssignClubFilter(""); }}
              style={{ fontSize: 11, color: "var(--brand-01)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
            >Clear</button>
          )}
        </div>

        {/* Selection bar */}
        {selectedInPanel.length > 0 && (
          <div
            style={{
              padding: "8px 18px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ fontWeight: 600 }}>{selectedInPanel.length} selected</span>
            <button
              onClick={() => setAssignSel(new Set())}
              style={{ color: "var(--brand-01)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Grouped list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px" }}>
          {allRankGroups.map((rg, rgIdx) => {
            const st = bandStats[rg.label] || { assigned: 0, total: 0 };
            const done = st.assigned >= st.total;
            const visible = filteredRankGroups.find((fg) => fg.label === rg.label)?.gymnasts || [];
            const bandColor = pastelColors[rgIdx % pastelColors.length];
            const hasFilter = assignLevelFilter || assignAgeFilter || assignClubFilter;
            if (hasFilter && visible.length === 0) return null;

            return (
              <div key={rg.label}>
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    padding: "12px 18px 8px",
                    marginBottom: 4,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: bandColor,
                    borderBottom: "1px solid var(--border)",
                    borderLeft: `3px solid ${bandColor}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: done ? "var(--muted)" : "var(--text-primary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {rg.label}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!readOnly && visible.length > 0 && (
                      <button
                        onClick={() => {
                          const ids = visible.map((g) => g.id);
                          const allSelected = ids.every((id) => assignSel.has(id));
                          const next = new Set(assignSel);
                          if (allSelected) {
                            ids.forEach((id) => next.delete(id));
                          } else {
                            ids.forEach((id) => next.add(id));
                          }
                          setAssignSel(next);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--brand-01)",
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {visible.every((g) => assignSel.has(g.id)) ? "Deselect all" : "Select all"}
                      </button>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: done ? "var(--muted)" : "var(--text-tertiary)" }}>
                      {st.assigned}/{st.total}
                    </span>
                  </div>
                </div>
                {sortGymnasts(visible).map((g) => {
                  const sel = assignSel.has(g.id);
                  return (
                    <div
                      key={g.id}
                      draggable={!readOnly}
                      onDragStart={(e) => {
                        const ids = sel && selectedInPanel.length > 1 ? selectedInPanel : [g.id];
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify(ids.length === 1 ? { gymnastId: ids[0] } : { gymnastIds: ids })
                        );
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(g.id);
                        setDragSource("panel");
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragSource(null);
    setDropColumn(null);
                      }}
                      onClick={() => {
                        if (readOnly) return;
                        setAssignSel((s) => {
                          const n = new Set(s);
                          n.has(g.id) ? n.delete(g.id) : n.add(g.id);
                          return n;
                        });
                      }}
                      onMouseEnter={() => setHoveredCard(g.id)}
                      onMouseLeave={() => setHoveredCard((h) => (h === g.id ? null : h))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        margin: "0 10px 6px",
                        cursor: readOnly ? "default" : "pointer",
                        background: sel ? "rgba(0,13,255,0.06)" : hoveredCard === g.id ? "var(--background-light)" : "var(--surface)",
                        borderRadius: "var(--radius)",
                        border: sel ? "1px solid var(--brand-01)" : hoveredCard === g.id ? "1px solid var(--brand-01)" : "1px solid var(--border)",
                        opacity: draggingId === g.id ? 0.4 : 1,
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      {!readOnly && <input type="checkbox" checked={sel} readOnly style={{ flexShrink: 0 }} />}
                      {renderGymnastInfo(g)}
                      {!readOnly && <div style={{ cursor: "grab" }}>{gripIcon}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filteredUnassigned.length === 0 && unassigned.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              All gymnasts are assigned
            </div>
          )}
          {filteredUnassigned.length === 0 && unassigned.length > 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No gymnasts match the current filters
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel — Kanban ────────────────────────────── */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: 16, display: "flex", gap: 16, alignItems: "stretch" }}>
        {apparatus.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              fontSize: 14,
            }}
          >
            No apparatus configured. Set up apparatus on the dashboard.
          </div>
        )}

        {apparatus.map((appFull, ci) => {
          const gName = groups[ci] || null;
          const col = gName ? getColumnGymnasts(gName) : [];
          const appName = getAppName(appFull);
          const target = Math.ceil(activeGymnasts.length / (apparatus.length || 1));

          return (
            <div
              key={appFull}
              style={{ flex: "1 0 320px", display: "flex", flexDirection: "column", maxHeight: "100%" }}
              onDragOver={(e) => {
                if (!gName) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropColumn(ci);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDropColumn(null);
              }}
              onDrop={(e) => { setDropColumn(null); gName && handleColumnDrop(e, gName); }}
            >
              {/* Column header */}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius) var(--radius) 0 0",
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display)" }}>
                    {appName}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    {!readOnly && col.length > 0 && (
                      <button
                        onClick={() => handleUnassign(col.map((g) => g.id))}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--brand-01)",
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Clear all
                      </button>
                    )}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                      background: "var(--brand-01)",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {col.length}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {gName || `Rotation ${ci + 1}`} · ORDER
                </div>
              </div>

              {/* Column body */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  background: draggingId && dropColumn === ci ? "rgba(0,13,255,0.06)" : "var(--background-light)",
                  border: draggingId && dropColumn === ci ? "1px solid var(--brand-01)" : "1px solid var(--border)",
                  borderTop: "none",
                  borderRadius: "0 0 var(--radius) var(--radius)",
                  minHeight: 120,
                  padding: "6px 6px 6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {col.length === 0 && (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px dashed var(--border)",
                      borderRadius: "var(--radius)",
                      margin: 4,
                      color: "var(--muted)",
                      fontSize: 12,
                      minHeight: 80,
                    }}
                  >
                    Drop gymnasts here
                  </div>
                )}

                {col.map((g, gi) => {
                  const isDrag = draggingId === g.id;
                  const isDropBefore = dropTarget?.gymnastId === g.id && dropTarget?.position === "before";
                  const isDropAfter = dropTarget?.gymnastId === g.id && dropTarget?.position === "after";

                  return (
                    <div
                      key={g.id}
                      draggable={!readOnly}
                      onDragStart={(e) => {
                        const ids = assignSel.has(g.id) && assignSel.size > 1 ? [...assignSel] : [g.id];
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify(ids.length === 1 ? { gymnastId: ids[0] } : { gymnastIds: ids })
                        );
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(g.id);
                        setDragSource("column");
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropTarget(null);
                        setDragSource(null);
    setDropColumn(null);
                      }}
                      onDragOver={(e) => {
                        if (!draggingId || draggingId === g.id) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const dragG = gymnasts.find((x) => x.id === draggingId);
                        if (dragG && (dragG.group || "") === gName && dragG.round === activeRound) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const mid = rect.top + rect.height / 2;
                          setDropTarget({ gymnastId: g.id, position: e.clientY < mid ? "before" : "after" });
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!draggingId) return;
                        try {
                          const d = JSON.parse(e.dataTransfer.getData("text/plain"));
                          const ids = d.gymnastIds || [d.gymnastId];
                          const dragG = gymnasts.find((x) => x.id === draggingId);
                          if (
                            ids.length === 1 &&
                            dragG &&
                            dragG.round === activeRound &&
                            (dragG.group || "") === gName &&
                            dropTarget
                          ) {
                            handleReorder(draggingId, dropTarget.gymnastId, dropTarget.position);
                          } else {
                            assignToColumn(ids, gName);
                          }
                        } catch (_) {}
                        setDraggingId(null);
                        setDropTarget(null);
                        setDragSource(null);
                        setDropColumn(null);
                      }}
                      onMouseEnter={() => setHoveredCard(g.id)}
                      onMouseLeave={() => setHoveredCard((h) => (h === g.id ? null : h))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        background: hoveredCard === g.id ? "var(--background-light)" : "var(--surface)",
                        borderRadius: "var(--radius)",
                        border: hoveredCard === g.id ? "1px solid var(--brand-01)" : "1px solid var(--border)",
                        borderTop: isDropBefore ? "2px solid var(--brand-01)" : undefined,
                        borderBottom: isDropAfter ? "2px solid var(--brand-01)" : hoveredCard === g.id ? "1px solid var(--brand-01)" : "1px solid var(--border)",
                        opacity: isDrag ? 0.4 : 1,
                        cursor: readOnly ? "default" : "grab",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--muted)",
                          width: 18,
                          textAlign: "center",
                          flexShrink: 0,
                        }}
                      >
                        {gi + 1}
                      </span>
                      {renderGymnastInfo(g)}
                      {!readOnly && (
                        <button
                          onClick={() => handleUnassign([g.id])}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 4,
                            flexShrink: 0,
                            color: "var(--muted)",
                          }}
                          title="Remove from rotation"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ================================================================
     MOBILE LAYOUT
     ================================================================ */
  const renderMobile = () => {
    const activeGroup = groups[mobileColumn] || "";
    const activeApp = apparatus[mobileColumn];
    const appName = activeApp ? getAppName(activeApp) : activeGroup;
    const col = activeGroup ? getColumnGymnasts(activeGroup) : [];

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Apparatus row */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 16px",
            overflowX: "auto",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {apparatus.map((appFull, i) => {
            const active = mobileColumn === i;
            const gn = groups[i] || null;
            const cnt = gn ? getColumnGymnasts(gn).length : 0;
            const an = getAppName(appFull);

            return (
              <button
                key={appFull}
                onClick={() => setMobileColumn(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  border: `1px solid ${active ? "var(--brand-01)" : "var(--border)"}`,
                  background: active ? "var(--brand-01)" : "var(--surface)",
                  color: active ? "#fff" : "var(--text-primary)",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontFamily: "var(--font-display)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{an}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 8,
                    background: active ? "rgba(255,255,255,0.25)" : "var(--background-neutral)",
                  }}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Running order */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          <div style={{ padding: "12px 0 8px" }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "var(--muted)",
              }}
            >
              RUNNING ORDER
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 12 }}>
            {appName || "Select a rotation"}
          </div>

          {apparatus.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No apparatus configured. Set up apparatus on the dashboard.
            </div>
          )}
          {col.length === 0 && apparatus.length > 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No gymnasts yet — tap + Add below
            </div>
          )}

          {col.map((g, gi) => (
            <div
              key={g.id}
              ref={(el) => {
                if (el) rowRefsRef.current[g.id] = el;
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
                background: touchDrag?.id === g.id ? "rgba(0,13,255,0.06)" : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--muted)",
                  width: 24,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {gi + 1}
              </span>
              {renderGymnastInfo(g, { fontSize: 14 })}
              {!readOnly && (
                <div
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    touchTimerRef.current = setTimeout(() => {
                      setTouchDrag({ id: g.id, startY: touch.clientY, currentY: touch.clientY });
                      if (navigator.vibrate) navigator.vibrate(50);
                    }, 400);
                  }}
                  onTouchEnd={() => {
                    clearTimeout(touchTimerRef.current);
                    if (touchDrag) {
                      const entries = Object.entries(rowRefsRef.current);
                      let targetId = null;
                      let pos = "after";
                      for (const [id, el] of entries) {
                        if (id === touchDrag.id) continue;
                        const rect = el.getBoundingClientRect();
                        if (touchDrag.currentY >= rect.top && touchDrag.currentY <= rect.bottom) {
                          targetId = id;
                          pos = touchDrag.currentY < rect.top + rect.height / 2 ? "before" : "after";
                          break;
                        }
                      }
                      if (targetId) handleReorder(touchDrag.id, targetId, pos);
                      setTouchDrag(null);
                    }
                  }}
                  onTouchMove={(e) => {
                    if (touchDrag) {
                      setTouchDrag((p) => (p ? { ...p, currentY: e.touches[0].clientY } : null));
                    } else {
                      clearTimeout(touchTimerRef.current);
                    }
                  }}
                  onTouchCancel={() => {
                    clearTimeout(touchTimerRef.current);
                    setTouchDrag(null);
                  }}
                  style={{ padding: 8, cursor: "grab" }}
                >
                  {gripIcon}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom pill */}
        {!readOnly && activeGroup && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
            <button
              onClick={() => {
                setPickerOpen(true);
                setPickerSel(new Set());
                setPickerSearch("");
                setPickerFilter("");
              }}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 56,
                fontSize: 14,
                fontWeight: 600,
                background: "var(--brand-01)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-display)",
              }}
            >
              + Add gymnasts to {appName}
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ================================================================
     MOBILE BOTTOM SHEET
     ================================================================ */
  const renderBottomSheet = () => {
    if (!pickerOpen) return null;
    const activeGroup = groups[mobileColumn] || "";
    const activeApp = apparatus[mobileColumn];
    const appName = activeApp ? getAppName(activeApp) : activeGroup;

    const pickerList = unassigned
      .filter((g) => {
        if (pickerSearch) {
          const s = pickerSearch.toLowerCase();
          if (!(g.name || "").toLowerCase().includes(s) && !(g.club || "").toLowerCase().includes(s)) return false;
        }
        if (pickerFilter && g.level !== pickerFilter) return false;
        return true;
      });
    const pickerGroups = buildRankGroups(pickerList);

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
          onClick={() => setPickerOpen(false)}
        />
        <div
          style={{
            position: "relative",
            background: "var(--surface)",
            borderRadius: "16px 16px 0 0",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Drag handle */}
          <div style={{ padding: "8px 0", display: "flex", justifyContent: "center" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
          </div>

          {/* Header */}
          <div style={{ padding: "0 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "var(--muted)",
                  marginBottom: 4,
                }}
              >
                ADD TO {appName.toUpperCase()}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)" }}>Choose gymnasts</div>
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              style={{ fontSize: 13, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: "0 16px 8px" }}>
            <input
              className="input"
              placeholder="Search…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 14px", fontSize: 14 }}
            />
          </div>

          {/* Filter chips */}
          <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, overflowX: "auto" }}>
            {[{ id: "", label: "All" }, ...levels.map((l) => ({ id: l.id, label: l.name }))].map((c) => {
              const on = pickerFilter === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setPickerFilter(c.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 500,
                    border: `1px solid ${on ? "var(--brand-01)" : "var(--border)"}`,
                    background: on ? "var(--brand-01)" : "transparent",
                    color: on ? "#fff" : "var(--text-secondary)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
            {pickerGroups.map((rg) => (
              <div key={rg.label}>
                <div
                  style={{
                    padding: "8px 0 4px",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  {rg.label}
                </div>
                {sortGymnasts(rg.gymnasts).map((g) => {
                  const sel = pickerSel.has(g.id);
                  const lo = levels.find((l) => l.id === g.level);
                  return (
                    <div
                      key={g.id}
                      onClick={() =>
                        setPickerSel((s) => {
                          const n = new Set(s);
                          n.has(g.id) ? n.delete(g.id) : n.add(g.id);
                          return n;
                        })
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 0",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: sel ? "rgba(0,13,255,0.04)" : "transparent",
                      }}
                    >
                      <input type="checkbox" checked={sel} readOnly />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{g.club || "—"}</div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 8,
                          background: "rgba(0,13,255,0.08)",
                          color: "var(--brand-01)",
                        }}
                      >
                        {lo?.name || "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 12,
              background: "var(--surface)",
            }}
          >
            <button
              onClick={() => setPickerSel(new Set())}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 56,
                border: "1px solid var(--border)",
                background: "transparent",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <button
              disabled={pickerSel.size === 0}
              onClick={() => {
                const tg = groups[mobileColumn] || "";
                if (tg) {
                  assignToColumn([...pickerSel], tg);
                  setPickerSel(new Set());
                  setPickerOpen(false);
                }
              }}
              style={{
                flex: 2,
                padding: 12,
                borderRadius: 56,
                border: "none",
                background: pickerSel.size > 0 ? "var(--brand-01)" : "var(--background-neutral)",
                color: pickerSel.size > 0 ? "#fff" : "var(--muted)",
                fontSize: 14,
                fontWeight: 600,
                cursor: pickerSel.size > 0 ? "pointer" : "default",
                fontFamily: "var(--font-display)",
              }}
            >
              Add to {appName} →
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ================================================================
     BULK-MOVE TOOLBAR (desktop only)
     ================================================================ */
  const renderBulkToolbar = () => {
    if (readOnly || selectedInPanel.length === 0 || isMobile) return null;
    return (
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "#1a1a1a",
          borderRadius: 56,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          zIndex: 100,
          color: "#fff",
          fontFamily: "var(--font-display)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedInPanel.length} selected</span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>·</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Move to:</span>
        {apparatus.map((appFull, i) => {
          const gn = groups[i] || null;
          const cnt = gn ? getColumnGymnasts(gn).length : 0;
          const an = getAppName(appFull);
          if (!gn) return null;
          return (
            <button
              key={gn}
              onClick={() => assignToColumn(selectedInPanel, gn)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-display)",
                whiteSpace: "nowrap",
              }}
            >
              {an} {cnt}
            </button>
          );
        })}
      </div>
    );
  };

  /* ================================================================
     MAIN RENDER
     ================================================================ */
  if (rounds.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "var(--font-display)" }}>
        <div style={{ fontSize: 16, color: "var(--text-tertiary)" }}>No rounds configured yet.</div>
        <button className="btn btn-primary" onClick={onBack}>← Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "var(--font-display)" }}>
      {/* ── Top bar ───────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "10px 16px" : "12px 24px",
          background: "var(--brand-01)",
          color: "var(--text-alternate)",
          flexShrink: 0,
          zIndex: 50,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          {!isMobile && (
            <>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {compData.name || "Competition"}
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ fontSize: 14 }}>Rotations</span>
            </>
          )}
          {isMobile && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                opacity: 0.7,
              }}
            >
              ROTATIONS
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!readOnly && !isMobile && (
            <button
              onClick={handleResetRound}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                background: "rgba(255,255,255,0.15)",
                color: "var(--text-alternate)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
              }}
            >
              ↻ Reset round
            </button>
          )}
          <button
            onClick={onBack}
            style={{
              padding: "6px 18px",
              fontSize: 13,
              fontWeight: 600,
              background: "#fff",
              color: "var(--brand-01)",
              border: "none",
              borderRadius: 56,
              cursor: "pointer",
            }}
          >
            {isMobile ? "Save" : "Save rotation"}
          </button>
        </div>
      </div>

      {/* ── Round strip ───────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: isMobile ? "8px 16px" : "10px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        {rounds.map((r) => {
          const active = activeRound === r.id;
          const rGym = activeGymnasts.filter((g) => g.round === r.id);
          const rGrps = gbr[r.id] || [];
          const rAssigned = rGym.filter((g) => g.group && rGrps.includes(g.group)).length;

          return (
            <button
              key={r.id}
              onClick={() => setActiveRound(r.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 56,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--brand-01)" : "transparent",
                color: active ? "#fff" : "var(--text-secondary)",
                border: active ? "none" : "1px solid var(--border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-display)",
              }}
            >
              {r.name}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 8,
                  background: active ? "rgba(255,255,255,0.2)" : "var(--background-neutral)",
                }}
              >
                {rGym.length}
              </span>
            </button>
          );
        })}

        {!readOnly && (
          <button
            onClick={handleAddRound}
            style={{
              padding: "6px 14px",
              borderRadius: 56,
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              color: "var(--text-tertiary)",
              border: "1px dashed var(--border)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + Add round
          </button>
        )}

        {!isMobile && (
          <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
            {assignedCount} gymnasts assigned this round
          </div>
        )}
      </div>

      {/* ── Mobile subtitle ───────────────────────────────── */}
      {isMobile && (
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-display)" }}>
            {compData.name || "Competition"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {assignedCount} gymnasts assigned
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────── */}
      {isMobile ? renderMobile() : renderDesktop()}

      {/* ── Overlays ──────────────────────────────────────── */}
      {renderBulkToolbar()}
      {renderBottomSheet()}
    </div>
  );
}

export default RoundsGroupsPage;
