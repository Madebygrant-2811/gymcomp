import { useState, useRef, useEffect, useMemo } from "react";
import { generateId, newRound, agendaWindow } from "../../lib/utils.js";
import { nextOrderIndex, effectiveRotations, numberByRunningOrder, runningOrderCompare, proposeSchedule, restCount, roundCycle } from "../../lib/rotations.js";
import { exportScheduleXLSX, parseScheduleXLSX } from "../../lib/scheduleXlsx.js";

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

function RoundsGroupsPage({ compData, gymnasts, setCompData, setGymnasts, scores = {}, eventStatus, onBack }) {
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
  const [importPlan, setImportPlan] = useState(null); // parsed schedule plan (or { error }) awaiting confirmation
  const importFileRef = useRef(null);
  // Auto-populate: { maxPerGroup, proposal|null } — proposal null while the
  // organiser is still choosing the maximum group size.
  const [autoPop, setAutoPop] = useState(null);

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
  // Rest slots for the active round — declared before the auto-sync effect
  // below, which lists it as a dependency.
  const restsForActive = activeRound ? restCount(compData, activeRound) : 0;

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

  /* ── Auto-sync groups to match the rotation cycle (apparatus + rests) ── */
  useEffect(() => {
    if (!activeRound || readOnly || apparatus.length === 0) return;
    const target = apparatus.length + restCount(compData, activeRound);
    const existing = gbr[activeRound] || [];
    if (existing.length >= target) return;
    setCompData((d) => {
      const newGbr = { ...(d.groupsByRound || {}) };
      const cur = newGbr[activeRound] || [];
      const freshTarget = ((d.apparatus || []).filter((a) => a !== "Rest").length) + restCount(d, activeRound);
      if (cur.length >= freshTarget) return d;
      let offset = 0;
      (d.rounds || []).forEach((rd) => {
        const count = rd.id === activeRound ? freshTarget : (newGbr[rd.id] || []).length;
        newGbr[rd.id] = Array.from({ length: count }, (_, i) => {
          const ex = rd.id === activeRound ? cur[i] : (newGbr[rd.id] || [])[i];
          return ex || `Rotation ${offset + i + 1}`;
        });
        offset += count;
      });
      return { ...d, groupsByRound: newGbr };
    });
  }, [activeRound, apparatus.length, restsForActive]);

  /* ── Gymnast helpers ────────────────────────────────────── */
  const activeGymnasts = gymnasts.filter((g) => !g.dns && !g.withdrawn);
  const groups = activeRound ? gbr[activeRound] || [] : [];

  // Per-group apparatus order for the active round: stored if edited, cascade otherwise.
  const effRot = useMemo(
    () => (activeRound ? effectiveRotations(compData, activeRound) : {}),
    [compData, activeRound]
  );
  // The active round's rotation cycle: apparatus + its rest slots. One
  // column per cycle position (plus any leftover groups from a rest cut).
  const cycle = activeRound ? roundCycle(compData, activeRound) : apparatus;
  const colCount = Math.max(cycle.length, groups.length);
  // Column ci hosts group groups[ci]; the group's first cycle entry is where it starts.
  const columnApp = (ci) => {
    const gName = groups[ci];
    return (gName && effRot[gName]?.[0]) || cycle[ci] || "";
  };
  const roundGymnasts = activeRound ? activeGymnasts.filter((g) => g.round === activeRound) : [];
  const assignedCount = roundGymnasts.filter((g) => g.group && groups.includes(g.group)).length;

  // Unassigned: no round OR in this round but no valid group
  const unassigned = activeGymnasts.filter((g) => {
    if (!g.round || !roundIds.includes(g.round)) return true;
    if (g.round === activeRound && (!g.group || !groups.includes(g.group))) return true;
    return false;
  });

  function sortGymnasts(list) {
    return [...list].sort(runningOrderCompare);
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
    let idx = nextOrderIndex(gymnasts, activeRound, groupName);
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

  /* ── XLSX schedule export / import ──────────────────────── */
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setImportPlan(parseScheduleXLSX(reader.result, compData, gymnasts, scores));
      } catch (err) {
        setImportPlan({ error: `Could not read the file: ${err.message}` });
      }
    };
    reader.onerror = () => setImportPlan({ error: "Could not read the file." });
    reader.readAsArrayBuffer(file);
  };

  // Applies the previewed plan per round: agenda, groups + rotations and group
  // assignments are replaced for rounds with a matching sheet; blocked rounds
  // and rounds with no sheet are untouched. orderIndex comes from row order —
  // numbers are then written from the running order on save, exactly as after
  // a manual reorder.
  const applyImportPlan = () => {
    const plan = importPlan;
    if (!plan || plan.error) return;
    const applicable = plan.rounds.filter((p) => !p.blocked);
    setCompData((d) => {
      const newRounds = (d.rounds || []).map((r) => {
        const pr = applicable.find((p) => p.roundId === r.id);
        if (!pr || !pr.agenda) return r;
        // Agenda items drive the round window when present
        return { ...r, agenda: pr.agenda, ...(pr.agenda.length ? agendaWindow(pr.agenda) : {}) };
      });
      const newGbr = { ...(d.groupsByRound || {}) };
      const newRot = { ...(d.rotations || {}) };
      applicable.forEach((pr) => {
        if (pr.groups) newGbr[pr.roundId] = pr.groups;
        if (pr.rotations) newRot[pr.roundId] = pr.rotations;
      });
      return { ...d, rounds: newRounds, groupsByRound: newGbr, rotations: newRot };
    });
    const byId = {};
    applicable.forEach((pr) => {
      (pr.assignments || []).forEach((a) => {
        byId[a.id] = { round: pr.roundId, group: a.group, orderIndex: a.orderIndex };
      });
    });
    if (Object.keys(byId).length) {
      setGymnasts((prev) => prev.map((g) => (byId[g.id] ? { ...g, ...byId[g.id] } : g)));
    }
    setImportPlan(null);
  };

  /* ── Auto-populate the whole schedule ───────────────────── */
  // Gymnasts are averaged across the rounds and each round gets one group per
  // apparatus, so there is no group-count input. Redistribution moves
  // gymnasts between rounds, so it is unavailable once any score exists.
  const hasAnyScores = useMemo(
    () => Object.keys(scores).some((k) => parseFloat(scores[k]) > 0),
    [scores]
  );
  const autoPopDisabled = activeGymnasts.length === 0 || apparatus.length === 0 || hasAnyScores;
  const autoPopDisabledReason =
    activeGymnasts.length === 0 ? "Add gymnasts first"
    : apparatus.length === 0 ? "Set up apparatus first"
    : hasAnyScores ? "Scores have been submitted — auto-populate would move gymnasts between rounds"
    : undefined;

  const openAutoPopulate = () => {
    if (readOnly || autoPopDisabled) return;
    const groupTotal = Math.max(1, rounds.reduce((s, r) => s + (apparatus.length || 1) + restCount(compData, r.id), 0));
    setAutoPop({
      maxPerGroup: Math.max(1, Math.ceil(activeGymnasts.length / groupTotal)),
      proposal: null,
    });
  };

  const previewAutoPopulate = () => {
    setAutoPop((a) => (a ? { ...a, proposal: proposeSchedule(compData, gymnasts, a.maxPerGroup) } : a));
  };

  // Replaces round, group and orderIndex for every active gymnast, and each
  // round's group list. From here the existing drag-to-reorder and save-time
  // numbering take over unchanged.
  const applyAutoPopulate = () => {
    const p = autoPop?.proposal;
    if (!p) return;
    setCompData((d) => {
      const newGbr = { ...(d.groupsByRound || {}) };
      p.rounds.forEach((rp) => { newGbr[rp.roundId] = rp.groups.map((g) => g.name); });
      return { ...d, groupsByRound: newGbr };
    });
    const byId = {};
    p.assignments.forEach((a) => { byId[a.id] = { round: a.round, group: a.group, orderIndex: a.orderIndex }; });
    setGymnasts((prev) => prev.map((g) => (byId[g.id] ? { ...g, ...byId[g.id] } : g)));
    setAutoPop(null);
  };

  /* ── Save: write numbers from the running order, then leave ── */
  // Save is the single point where numbers are written: every gymnast is
  // numbered sequentially from 1 in competition-wide running order, with
  // unassigned gymnasts last. Runs on every save, at any competition status.
  const handleSaveClick = () => {
    const numbered = numberByRunningOrder(compData, gymnasts);
    setGymnasts(numbered);
    onBack(numbered);
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
      newRounds.push(newRound(`Round ${newRounds.length + 1}`));
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

        {Array.from({ length: colCount }, (_, ci) => {
          const gName = groups[ci] || null;
          const col = gName ? getColumnGymnasts(gName) : [];
          const appName = getAppName(columnApp(ci));
          const target = Math.ceil(activeGymnasts.length / (colCount || 1));

          return (
            <div
              key={ci}
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
    const activeApp = columnApp(mobileColumn);
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
          {Array.from({ length: colCount }, (_, i) => {
            const active = mobileColumn === i;
            const gn = groups[i] || null;
            const cnt = gn ? getColumnGymnasts(gn).length : 0;
            const an = getAppName(columnApp(i));

            return (
              <button
                key={i}
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
    const activeApp = columnApp(mobileColumn);
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
        {Array.from({ length: colCount }, (_, i) => {
          const gn = groups[i] || null;
          const cnt = gn ? getColumnGymnasts(gn).length : 0;
          const an = getAppName(columnApp(i));
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
          {!isMobile && (
            <button
              onClick={() => exportScheduleXLSX(compData, gymnasts)}
              disabled={gymnasts.length === 0}
              title={gymnasts.length === 0 ? "Upload gymnasts before exporting the schedule" : undefined}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                background: "rgba(255,255,255,0.15)",
                color: "var(--text-alternate)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "var(--radius)",
                cursor: gymnasts.length === 0 ? "not-allowed" : "pointer",
                opacity: gymnasts.length === 0 ? 0.5 : 1,
              }}
            >
              ⬇ Export XLSX
            </button>
          )}
          {!readOnly && !isMobile && (
            <button
              onClick={() => importFileRef.current?.click()}
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
              ⬆ Import XLSX
            </button>
          )}
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
            onClick={handleSaveClick}
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

        {!readOnly && (
          <button
            onClick={openAutoPopulate}
            disabled={autoPopDisabled}
            title={autoPopDisabledReason}
            style={{
              padding: "6px 14px",
              borderRadius: 56,
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              color: autoPopDisabled ? "var(--muted)" : "var(--brand-01)",
              border: "1px solid var(--border)",
              cursor: autoPopDisabled ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-display)",
              opacity: autoPopDisabled ? 0.6 : 1,
            }}
          >
            ✨ Auto-populate
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

      {/* ── XLSX import: hidden file input + preview modal ── */}
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />
      {/* ── Auto-populate modal: max size input, then preview ── */}
      {autoPop && (() => {
        const p = autoPop.proposal;
        const totalExtra = p ? p.rounds.reduce((s, rp) => s + rp.extraGroups, 0) : 0;
        return (
          <div className="modal-backdrop" onClick={() => setAutoPop(null)}>
            <div
              className="modal-box"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 560, width: "100%", textAlign: "left", fontFamily: "var(--font-display)", maxHeight: "82vh", overflowY: "auto" }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Auto-populate schedule</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14, lineHeight: 1.6 }}>
                Averages the {activeGymnasts.length} active gymnast{activeGymnasts.length !== 1 ? "s" : ""} across{" "}
                {rounds.length} round{rounds.length !== 1 ? "s" : ""}, one rotation per apparatus plus each round's rest slots, with balanced
                rotation sizes (±3 of each round's average). The maximum guides the rotation count and is a soft ceiling, not a hard cut-off.
                Levels and clubs stay together where sizes allow, and no gymnast is left as the only one from their club <em>and</em> the
                only one at their level in a rotation. Nothing is changed until you apply.
              </div>

              {!p && (
                <div className="field" style={{ margin: "0 0 6px", maxWidth: 240 }}>
                  <label className="label">Maximum gymnasts per rotation</label>
                  <input
                    className="input" type="number" min="1"
                    value={autoPop.maxPerGroup}
                    onChange={(e) => setAutoPop((a) => ({ ...a, maxPerGroup: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              )}

              {p && (
                <>
                  {p.rounds.map((rp) => (
                    <div key={rp.roundId} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{rp.roundName}</span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {rp.total} gymnast{rp.total !== 1 ? "s" : ""}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          · rotation sizes {rp.groups.map((g) => g.count).join(" / ")}
                        </span>
                      </div>
                      {rp.groups.map((g) => (
                        <div key={g.name} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{g.name}</span>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {g.count} gymnast{g.count !== 1 ? "s" : ""}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {g.levels.join(", ")}
                          </span>
                        </div>
                      ))}
                      {rp.extraGroups > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 4, display: "flex", gap: 6 }}>
                          <span aria-hidden="true">⚠</span>
                          <span>
                            {rp.extraGroups} rotation{rp.extraGroups !== 1 ? "s" : ""} beyond this round's {rp.baseline} (apparatus + rest slots) —
                            the maximum of {p.maxPerGroup} per rotation can't hold this round's share otherwise.
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {p.overTarget.map((ot, i) => (
                    <div key={`ot-${i}`} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 6, display: "flex", gap: 6 }}>
                      <span aria-hidden="true">⚠</span>
                      <span>
                        {ot.name} ({ot.roundName}) has {ot.count} gymnasts — {ot.count - ot.target} over its target of {ot.target}, kept to avoid splitting a club or isolating a gymnast.
                      </span>
                    </div>
                  ))}
                  {p.clubSplits.map((cs, i) => (
                    <div key={`cs-${i}`} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 6, display: "flex", gap: 6 }}>
                      <span aria-hidden="true">⚠</span>
                      <span>
                        Club "{cs.club}" ({cs.level}) is split across rotations — {cs.placed} placed, {cs.remaining} carried into the next rotation.
                      </span>
                    </div>
                  ))}
                  {p.isolated.map((iso, i) => (
                    <div key={`iso-${i}`} style={{ fontSize: 12, color: "var(--danger)", lineHeight: 1.6, marginTop: 6, display: "flex", gap: 6 }}>
                      <span aria-hidden="true">⚠</span>
                      <span>
                        {iso.name} ({iso.club}, {iso.level}) is still the only one from their club and at their level in {iso.group} ({iso.roundName}) — no suitable rotation had room. Consider placing them by hand.
                      </span>
                    </div>
                  ))}
                  {totalExtra === 0 && p.clubSplits.length === 0 && p.overTarget.length === 0 && p.isolated.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
                      No club splits, no isolated gymnasts, and every rotation is on its balanced target.
                    </div>
                  )}
                </>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                {p && (
                  <button className="btn btn-ghost" onClick={() => setAutoPop((a) => ({ ...a, proposal: null }))} style={{ marginRight: "auto" }}>
                    ← Adjust
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setAutoPop(null)}>Cancel</button>
                {!p && <button className="btn btn-primary" onClick={previewAutoPopulate}>Preview →</button>}
                {p && <button className="btn btn-primary" onClick={applyAutoPopulate}>Apply schedule</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {importPlan && (() => {
        const canApply =
          !importPlan.error &&
          (importPlan.rounds || []).some((p) => !p.blocked && (p.agenda || p.groups || p.assignments));
        return (
          <div className="modal-backdrop" onClick={() => setImportPlan(null)}>
            <div
              className="modal-box"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 580, width: "100%", textAlign: "left", fontFamily: "var(--font-display)", maxHeight: "82vh", overflowY: "auto" }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Import schedule — preview</div>
              {importPlan.error ? (
                <div style={{ fontSize: 13, color: "var(--danger)", lineHeight: 1.6, margin: "8px 0 16px" }}>
                  {importPlan.error}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14, lineHeight: 1.6 }}>
                    Nothing has been changed yet — review what each sheet will do, then apply.
                  </div>

                  {importPlan.rounds.length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                      No sheets in this file match a round name. Sheets are matched to rounds by name (case and spacing don't matter).
                    </div>
                  )}

                  {importPlan.rounds.map((pr) => (
                    <div key={pr.roundId} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{pr.roundName}</span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>sheet “{pr.sheetName}”</span>
                        {pr.blocked && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)" }}>BLOCKED</span>
                        )}
                      </div>
                      {!pr.blocked && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                          <div>Agenda: {pr.agenda ? `replace with ${pr.agenda.length} entr${pr.agenda.length !== 1 ? "ies" : "y"}` : "unchanged"}</div>
                          <div>Rotations: {pr.groups ? `${pr.groups.length} rotation${pr.groups.length !== 1 ? "s" : ""} with apparatus orders` : "unchanged"}</div>
                          <div>Gymnasts: {pr.assignments ? `${pr.assignments.length} assignment${pr.assignments.length !== 1 ? "s" : ""} (row order sets running order)` : "unchanged"}</div>
                        </div>
                      )}
                      {pr.warnings.map((w, wi) => (
                        <div key={wi} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 6, display: "flex", gap: 6 }}>
                          <span aria-hidden="true">⚠</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {importPlan.unmatchedSheets.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8, display: "flex", gap: 6 }}>
                      <span aria-hidden="true">⚠</span>
                      <span>
                        Sheet{importPlan.unmatchedSheets.length !== 1 ? "s" : ""} not matching any round (ignored):{" "}
                        {importPlan.unmatchedSheets.join(", ")}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setImportPlan(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={!canApply} onClick={applyImportPlan}>
                  Apply import
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default RoundsGroupsPage;
