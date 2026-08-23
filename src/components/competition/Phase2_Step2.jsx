import { useState, useEffect, useMemo, Fragment } from "react";
import { denseRank, gymnast_key } from "../../lib/scoring.js";
import { roundRunningOrderCompare } from "../../lib/rotations.js";
import { buildRankGroups as sharedRankGroups } from "../../../public/shared/ranking.js";
import { printDocument, buildOrganiserViewHTML } from "../../lib/pdf.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";

// Organiser-view regrouping dimensions (session-only; never touches compData)
const ORGANISER_DIMS = [
  { value: "level", label: "Level (no age split)" },
  { value: "age", label: "Age" },
  { value: "level+age", label: "Level + Age" },
  { value: "club", label: "Club" },
  { value: "all", label: "Whole competition" },
];


function Phase2_Step2({ compData, gymnasts, scores, onComplete }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("apparatus");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  // Organiser view — session state only: never written to compData, never
  // persisted, reset on reload.
  const [organiserDim, setOrganiserDim] = useState("level");
  const [organiserScope, setOrganiserScope] = useState("round"); // "round" | "all"
  const [cutLine, setCutLine] = useState("");
  const scoringApparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  // Ranking mode is configured on the Competition Configuration page
  const rankingMode = compData.rankingMode || "standard";

  const roundGymnasts = useMemo(() => gymnasts.filter(g => g.round === activeRound), [gymnasts, activeRound]);

  // Unique levels in this round
  const uniqueLevels = useMemo(() => {
    const present = new Set(roundGymnasts.map(g => {
      const lo = compData.levels.find(l => l.id === g.level);
      return lo?.name || "Unknown";
    }));
    const ordered = (compData.levels || []).map(l => l.name).filter(n => present.has(n));
    if (present.has("Unknown") && !ordered.includes("Unknown")) ordered.push("Unknown");
    return ordered;
  }, [roundGymnasts, compData.levels]);

  // Check if selected level uses level+age ranking
  const selectedLevelObj = levelFilter !== "all" ? compData.levels.find(l => l.name === levelFilter) : null;
  const showAgeFilter = selectedLevelObj && selectedLevelObj.rankBy === "level+age";

  // Unique ages for the selected level
  const uniqueAges = useMemo(() => showAgeFilter
    ? [...new Set(roundGymnasts.filter(g => {
        const lo = compData.levels.find(l => l.id === g.level);
        return (lo?.name || "Unknown") === levelFilter;
      }).map(g => g.age || "Age not set"))].sort()
    : [], [roundGymnasts, compData.levels, levelFilter, showAgeFilter]);

  // Reset age filter when level changes to one without age ranking
  useEffect(() => {
    if (!showAgeFilter) setAgeFilter("all");
  }, [showAgeFilter]);

  // Score lookups key on the gymnast's OWN round — for a level ranked across
  // rounds, pooled gymnasts keep their own round's scores.
  const getScore = (g, apparatus) => {
    const v = parseFloat(scores[gymnast_key(g.round || activeRound, g.id, apparatus)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (g) => scoringApparatus.reduce((s, a) => s + getScore(g, a), 0);

  // ── Dual-vault per-vault finals (display only) ──
  // Flag-driven, never mode-driven: when a row carries the persisted dualVault
  // flag we show both stored vault finals beneath the combined total. The total
  // (final_score) stays the ranked / all-around value, untouched.
  const subScore = (g, app, sub) => scores[`${gymnast_key(g.round || activeRound, g.id, app)}__${sub}`];
  const renderVaultFinals = (g, app, total) => {
    if (subScore(g, app, "dualVault") !== "1") return null;
    const v1 = parseFloat(subScore(g, app, "v1fin")) || 0;
    const v2 = parseFloat(subScore(g, app, "v2fin")) || 0;
    if (v1 <= 0 && v2 <= 0) return null;
    const counts = (v) => v > 0 && Math.round(v * 1000) === Math.round((total || 0) * 1000);
    const line = (label, v) => v > 0 ? (
      <div style={{ fontWeight: counts(v) ? 700 : 500, color: counts(v) ? "var(--accent)" : "var(--muted)" }}>{label} {v.toFixed(3)}</div>
    ) : null;
    return (
      <div style={{ fontSize: 10, marginTop: 2, lineHeight: 1.3, color: "var(--muted)", fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
        {line("V1", v1)}{line("V2", v2)}
      </div>
    );
  };

  // Per-apparatus dual-vault columns (Vault 1 / Vault 2). Flag-driven.
  const isDualVaultRow = (g, app) => subScore(g, app, "dualVault") === "1";
  const vaultFinal = (g, app, prefix) => parseFloat(subScore(g, app, `${prefix}fin`)) || 0;
  const vaultEqualsTotal = (v, total) => v > 0 && Math.round(v * 1000) === Math.round((total || 0) * 1000);
  const vaultColCell = (g, app, prefix, total) => {
    if (!isDualVaultRow(g, app)) return <td style={{ color: "var(--muted)" }}>—</td>;
    const v = vaultFinal(g, app, prefix);
    const hot = vaultEqualsTotal(v, total);
    return <td style={{ fontWeight: hot ? 700 : 500, color: hot ? "var(--accent)" : "var(--muted)" }}>{v > 0 ? v.toFixed(3) : "—"}</td>;
  };

  // Build ranking groups respecting level rankBy config (shared implementation;
  // gymnasts sorted by running order within each group). Passing the full list
  // with roundId lets a competition-scoped level pool across its rounds — the
  // combined group shows under every round tab it spans, badged below.
  const buildRankGroups = () =>
    sharedRankGroups(gymnasts, {
      levels: compData.levels || [],
      roundId: activeRound,
      rounds: compData.rounds,
      sortGymnasts: roundRunningOrderCompare(compData, activeRound),
    });

  const allRankGroups = useMemo(buildRankGroups, [gymnasts, compData, activeRound]);

  // Organiser regrouping — same scores, organiser-chosen dimension and scope.
  // "all" pools every gymnast across the rounds, each totalled from their own
  // round's scores. Awards and every public surface keep using the official
  // rankBy grouping above.
  const organiserPool = useMemo(
    () => (organiserScope === "all" ? gymnasts.filter(g => g.round) : roundGymnasts),
    [organiserScope, gymnasts, roundGymnasts]
  );
  const organiserGroups = useMemo(() => {
    if (view !== "organiser") return [];
    return sharedRankGroups(organiserPool, {
      levels: compData.levels || [],
      dimension: organiserDim,
      sortGroups: (organiserDim === "age" || organiserDim === "club") ? "keyAlpha" : "levelOrder",
    });
  }, [view, organiserDim, organiserPool, compData]);
  // Total from the gymnast's OWN round — identical to getTotal in round scope
  const organiserTotal = (g) => scoringApparatus.reduce((s, a) => {
    const v = parseFloat(scores[gymnast_key(g.round, g.id, a)]);
    return s + (isNaN(v) ? 0 : v);
  }, 0);
  const cutN = Math.max(0, parseInt(cutLine) || 0);
  const levelNameOf = (id) => (compData.levels || []).find(l => l.id === id)?.name || id || "—";
  const roundNameOf = (id) => compData.rounds.find(r => r.id === id)?.name || "—";
  const orgAllRounds = organiserScope === "all";
  const orgColCount = orgAllRounds ? 8 : 7;

  const exportOrganiserPdf = () => {
    const dimLabel = ORGANISER_DIMS.find(d => d.value === organiserDim)?.label || organiserDim;
    printDocument(
      buildOrganiserViewHTML(compData, gymnasts, scores, {
        scope: organiserScope,
        roundId: activeRound,
        roundName: roundNameOf(activeRound),
        dimension: organiserDim,
        dimensionLabel: dimLabel,
        cutLine: cutN,
      }),
      "gymcomp-organiser-view.pdf"
    );
  };
  const rankGroups = allRankGroups.filter(rg => {
    if (levelFilter !== "all" && rg.levelName !== levelFilter) return false;
    if (ageFilter !== "all" && rg.ageLabel !== ageFilter) return false;
    return true;
  });

  // ── Hide-on-scroll topbar ──
  const [topbarHidden, setTopbarHidden] = useState(false);
  useEffect(() => {
    const el = document.querySelector(".app-main");
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => { const t = el.scrollTop; setTopbarHidden(t > 60); last = t; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const rankBadge = (rank, label) => {
    if (rank === null) return <span className="badge" style={{ background: label === "WD" ? "rgba(217,119,6,0.15)" : "rgba(107,107,133,0.15)", color: label === "WD" ? "#d97706" : "var(--muted)" }}>{label || "DNS"}</span>;
    if (rank === 1) return <span className="badge badge-gold">🥇 1st</span>;
    if (rank === 2) return <span className="badge badge-silver">🥈 2nd</span>;
    if (rank === 3) return <span className="badge badge-bronze">🥉 3rd</span>;
    if (rank <= 6) return <span className="badge badge-medal">🎖️ {rank}th</span>;
    return <span className="badge badge-rank">{rank}th</span>;
  };

  return (
    <div>
      <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`} style={{ margin: "0 24px" }}>
        <div className="setup-topbar-left">
          {compData.name && <span className="setup-topbar-name">{compData.name}</span>}
          {compData.date && <span className="setup-topbar-meta">{new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          {compData.venue && <span className="setup-topbar-meta">{compData.venue}</span>}
        </div>
        <div className="setup-topbar-right" style={{ display: "flex", gap: 8 }}>
          {onComplete && (
            <button className="btn btn-sm" style={{ background: "#15803d", color: "#fff", border: "none", fontWeight: 600 }}
              onClick={() => setShowCompleteConfirm(true)}>Complete Competition</button>
          )}
        </div>
      </div>

      <div className="results-body">

      <div className="results-toolbar">
        <div className="results-toolbar-views">
          <button className={`btn ${view === "apparatus" ? "btn-tertiary" : "btn-secondary"}`}
            onClick={() => setView("apparatus")}>Per Apparatus</button>
          <button className={`btn ${view === "overall" ? "btn-tertiary" : "btn-secondary"}`}
            onClick={() => setView("overall")}>Overall</button>
          <button className={`btn ${view === "organiser" ? "btn-tertiary" : "btn-secondary"}`}
            onClick={() => setView("organiser")}>Organiser View</button>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {compData.rounds.map(r => (
            <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
              onClick={() => { setActiveRound(r.id); setLevelFilter("all"); setAgeFilter("all"); }}>{r.name}</button>
          ))}
        </div>
      </div>

      {/* PER APPARATUS VIEW
          Structure: Level (& Age) card → Apparatus sub-sections → ranked table */}
      {view === "apparatus" && (
        <div>
          {rankGroups.map(({ key, levelName, ageLabel, gymnasts: glist }, idx) => {
            const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
            return (
              <div key={key} className="results-level-card">
                <div className="results-level-header">
                  {levelName}{ageLabel ? <span>{ageLabel}</span> : null}
                  {rankGroups.find(r => r.key === key)?.crossRound && (
                    <span style={{ fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--text-primary)", padding: "3px 10px", borderRadius: 99 }}>
                      Ranked across {(rankGroups.find(r => r.key === key)?.roundIds || []).map(roundNameOf).join(" & ")}
                    </span>
                  )}
                  {idx === 0 && <>
                    <div style={{ flex: 1 }} />
                    <div className="results-filters">
                      <select className="select" value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setAgeFilter("all"); }}
                        style={{ width: "auto", minWidth: 120, fontSize: 12, padding: "6px 32px 6px 14px" }}>
                        <option value="all">All Levels</option>
                        {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <select className="select" value={showAgeFilter ? ageFilter : "all"} onChange={e => setAgeFilter(e.target.value)}
                        disabled={!showAgeFilter}
                        style={{ width: "auto", minWidth: 90, fontSize: 12, padding: "6px 32px 6px 14px", opacity: showAgeFilter ? 1 : 0.45, cursor: showAgeFilter ? "pointer" : "not-allowed" }}>
                        <option value="all">All Ages</option>
                        {uniqueAges.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      {(levelFilter !== "all" || ageFilter !== "all") && (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setLevelFilter("all"); setAgeFilter("all"); }}
                          style={{ fontSize: 11 }}>Clear</button>
                      )}
                    </div>
                  </>}
                </div>
                {scoringApparatus.map(apparatus => {
                  const withScores = glist.map(g => ({ ...g, score: getScore(g, apparatus) }));
                  const ranked = denseRank(withScores.filter(g => g.score > 0 && !g.dns && !g.withdrawn), "score", rankingMode);
                  const dns = withScores.filter(g => g.score === 0 || g.dns || g.withdrawn);
                  // Dual-vault section → break the two vault finals out into columns.
                  const showVaultCols = [...ranked, ...dns].some(g => isDualVaultRow(g, apparatus));
                  return (
                    <div key={apparatus} style={{ marginBottom: 24 }}>
                      <div className="sub-group-label">{apparatus}</div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th>
                              {showVaultCols && <><th>Vault 1</th><th>Vault 2</th></>}
                              <th>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ranked.map(g => (
                              <tr key={g.id}>
                                <td>{rankBadge(g.rank)}</td>
                                <td style={{ color: "var(--muted)" }}>{g.number}</td>
                                <td style={{ fontWeight: 500 }}>{g.name}</td>
                                <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                                {showVaultCols && <>{vaultColCell(g, apparatus, "v1", g.score)}{vaultColCell(g, apparatus, "v2", g.score)}</>}
                                <td><strong>{g.score.toFixed(3)}</strong></td>
                              </tr>
                            ))}
                            {dns.map(g => (
                              <tr key={g.id} style={{ opacity: 0.45 }}>
                                <td>{rankBadge(null, g.withdrawn ? "WD" : "DNS")}</td>
                                <td style={{ color: "var(--muted)" }}>{g.number}</td>
                                <td style={{ fontWeight: 500 }}>{g.name}</td>
                                <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                                {showVaultCols && <><td style={{ color: "var(--muted)" }}>—</td><td style={{ color: "var(--muted)" }}>—</td></>}
                                <td style={{ color: "var(--muted)" }}>—</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {rankGroups.length === 0 && <div className="empty">No results to display yet</div>}
        </div>
      )}

      {/* OVERALL VIEW
          Structure: Level (& Age) card → cumulative ranked table */}
      {view === "overall" && (
        <div>
          {rankGroups.map(({ key, levelName, ageLabel, gymnasts: glist }, idx) => {
            const withTotals = glist.map(g => ({ ...g, total: getTotal(g) }));
            const ranked = denseRank(withTotals.filter(g => g.total > 0 && !g.dns && !g.withdrawn), "total", rankingMode);
            const dns = withTotals.filter(g => g.total === 0 || g.dns || g.withdrawn);
            return (
              <div key={key} className="results-level-card">
                <div className="results-level-header">
                  {levelName}{ageLabel ? <span>{ageLabel}</span> : null}
                  {rankGroups.find(r => r.key === key)?.crossRound && (
                    <span style={{ fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--text-primary)", padding: "3px 10px", borderRadius: 99 }}>
                      Ranked across {(rankGroups.find(r => r.key === key)?.roundIds || []).map(roundNameOf).join(" & ")}
                    </span>
                  )}
                  {idx === 0 && <>
                    <div style={{ flex: 1 }} />
                    <div className="results-filters">
                      <select className="select" value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setAgeFilter("all"); }}
                        style={{ width: "auto", minWidth: 120, fontSize: 12, padding: "6px 32px 6px 14px" }}>
                        <option value="all">All Levels</option>
                        {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <select className="select" value={showAgeFilter ? ageFilter : "all"} onChange={e => setAgeFilter(e.target.value)}
                        disabled={!showAgeFilter}
                        style={{ width: "auto", minWidth: 90, fontSize: 12, padding: "6px 32px 6px 14px", opacity: showAgeFilter ? 1 : 0.45, cursor: showAgeFilter ? "pointer" : "not-allowed" }}>
                        <option value="all">All Ages</option>
                        {uniqueAges.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      {(levelFilter !== "all" || ageFilter !== "all") && (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setLevelFilter("all"); setAgeFilter("all"); }}
                          style={{ fontSize: 11 }}>Clear</button>
                      )}
                    </div>
                  </>}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th>
                        {scoringApparatus.map(a => <th key={a}>{a}</th>)}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map(g => (
                        <tr key={g.id}>
                          <td>{rankBadge(g.rank)}</td>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td style={{ fontWeight: 500 }}>{g.name}</td>
                          <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                          {scoringApparatus.map(a => (
                            <td key={a} style={{ color: "var(--muted)" }}>
                              {getScore(g, a) > 0 ? getScore(g, a).toFixed(3) : "—"}
                              {getScore(g, a) > 0 && renderVaultFinals(g, a, getScore(g, a))}
                            </td>
                          ))}
                          <td><strong style={{ color: "var(--accent)" }}>{g.total.toFixed(3)}</strong></td>
                        </tr>
                      ))}
                      {dns.map(g => (
                        <tr key={g.id} style={{ opacity: 0.45 }}>
                          <td>{rankBadge(null, g.withdrawn ? "WD" : "DNS")}</td>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td style={{ fontWeight: 500 }}>{g.name}</td>
                          <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                          {scoringApparatus.map(a => <td key={a} style={{ color: "var(--muted)" }}>—</td>)}
                          <td style={{ color: "var(--muted)" }}>—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {rankGroups.length === 0 && <div className="empty">No results to display yet</div>}
        </div>
      )}

      {/* ORGANISER VIEW
          Same scores regrouped on an organiser-chosen dimension — a planning
          aid (e.g. qualification cuts), never official results. Session state
          only; awards and public surfaces are untouched. */}
      {view === "organiser" && (
        <div>
          {/* Persistent unofficial banner */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 16,
            background: "rgba(245,158,11,0.08)", border: "1px solid var(--warn)", borderRadius: "var(--radius)",
            fontFamily: "var(--font-display)",
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--warn)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M8 2L1.5 13.5h13L8 2zM8 6.5v3.5M8 12.2v.01" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--warn)" }}>
              Organiser view — regrouped for planning. Not official results; awards and public pages use the competition's configured grouping.
            </span>
          </div>

          {/* Controls — session only, reset on reload */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20, fontFamily: "var(--font-display)" }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Scope</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button className={`btn btn-sm ${organiserScope === "round" ? "btn-tertiary" : "btn-secondary"}`}
                  style={{ fontFamily: "var(--font-display)" }}
                  onClick={() => setOrganiserScope("round")}>This round</button>
                <button className={`btn btn-sm ${organiserScope === "all" ? "btn-tertiary" : "btn-secondary"}`}
                  style={{ fontFamily: "var(--font-display)" }}
                  onClick={() => setOrganiserScope("all")}>Whole competition</button>
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Group by</label>
              <select className="select" value={organiserDim}
                onChange={e => setOrganiserDim(e.target.value)}
                style={{ width: "auto", minWidth: 180 }}>
                {ORGANISER_DIMS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Cut line (top N per group)</label>
              <input className="input" type="number" min="1" placeholder="None"
                value={cutLine} onChange={e => setCutLine(e.target.value)}
                style={{ width: 140 }} />
            </div>
            <button className="btn btn-secondary" onClick={exportOrganiserPdf} style={{ fontFamily: "var(--font-display)" }}>
              ⬇ Export PDF
            </button>
          </div>

          {organiserGroups.map(grp => {
            const label = [grp.levelName, grp.ageLabel].filter(Boolean).join(" — ") || "Whole competition";
            const withTotals = grp.gymnasts.map(g => ({ ...g, total: organiserTotal(g) }));
            const ranked = denseRank(withTotals.filter(g => g.total > 0 && !g.dns && !g.withdrawn), "total", rankingMode);
            const rest = withTotals.filter(g => g.total === 0 || g.dns || g.withdrawn);
            return (
              <div key={grp.key} className="results-level-card">
                <div className="results-level-header">{label}</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th><th>Level</th><th>Age</th>
                        {orgAllRounds && <th>Round</th>}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((g, i) => (
                        <Fragment key={g.id}>
                          <tr>
                            <td>{rankBadge(g.rank)}</td>
                            <td style={{ color: "var(--muted)" }}>{g.number}</td>
                            <td style={{ fontWeight: 500 }}>{g.name}</td>
                            <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{levelNameOf(g.level)}</td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.age || "—"}</td>
                            {orgAllRounds && <td style={{ color: "var(--muted)", fontSize: 12 }}>{roundNameOf(g.round)}</td>}
                            <td><strong>{g.total.toFixed(3)}</strong></td>
                          </tr>
                          {cutN > 0 && i === cutN - 1 && i < ranked.length - 1 && (
                            <tr>
                              <td colSpan={orgColCount} style={{
                                borderTop: "3px solid var(--warn)", background: "rgba(245,158,11,0.08)",
                                color: "var(--warn)", fontWeight: 800, fontSize: 10, letterSpacing: "1px",
                                textTransform: "uppercase", padding: "4px 12px", fontFamily: "var(--font-display)",
                              }}>
                                Cut line — top {cutN}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                      {rest.map(g => (
                        <tr key={g.id} style={{ opacity: 0.45 }}>
                          <td>{rankBadge(null, g.withdrawn ? "WD" : g.dns ? "DNS" : "—")}</td>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td style={{ fontWeight: 500 }}>{g.name}</td>
                          <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                          <td style={{ color: "var(--muted)", fontSize: 12 }}>{levelNameOf(g.level)}</td>
                          <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.age || "—"}</td>
                          {orgAllRounds && <td style={{ color: "var(--muted)", fontSize: 12 }}>{roundNameOf(g.round)}</td>}
                          <td style={{ color: "var(--muted)" }}>—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {organiserGroups.length === 0 && <div className="empty">No results to display yet</div>}
        </div>
      )}

      </div>{/* end body wrapper */}

      {showCompleteConfirm && (
        <ConfirmModal
          icon="🏆"
          isDanger={false}
          confirmStyle={{ background: "#15803d", color: "#fff", borderColor: "#15803d" }}
          message="Are you sure you want to complete this competition? The event status will change to Completed."
          confirmLabel="Complete"
          onConfirm={() => { setShowCompleteConfirm(false); onComplete(); }}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
    </div>
  );
}

export default Phase2_Step2;
