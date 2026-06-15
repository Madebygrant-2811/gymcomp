import { useState, useEffect, useMemo } from "react";
import { denseRank, gymnast_key } from "../../lib/scoring.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";


function Phase2_Step2({ compData, gymnasts, scores, onComplete, onUpdateCompData }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("apparatus");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const scoringApparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const rankingMode = compData.rankingMode || "standard";
  const setRankingMode = (mode) => onUpdateCompData?.(prev => ({ ...prev, rankingMode: mode }));

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
      }).map(g => g.age || "Unknown age"))].sort()
    : [], [roundGymnasts, compData.levels, levelFilter, showAgeFilter]);

  // Reset age filter when level changes to one without age ranking
  useEffect(() => {
    if (!showAgeFilter) setAgeFilter("all");
  }, [showAgeFilter]);

  const getScore = (gid, apparatus) => {
    const v = parseFloat(scores[gymnast_key(activeRound, gid, apparatus)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (gid) => scoringApparatus.reduce((s, a) => s + getScore(gid, a), 0);

  // ── Dual-vault per-vault finals (display only) ──
  // Flag-driven, never mode-driven: when a row carries the persisted dualVault
  // flag we show both stored vault finals beneath the combined total. The total
  // (final_score) stays the ranked / all-around value, untouched.
  const subScore = (gid, app, sub) => scores[`${gymnast_key(activeRound, gid, app)}__${sub}`];
  const renderVaultFinals = (gid, app, total) => {
    if (subScore(gid, app, "dualVault") !== "1") return null;
    const v1 = parseFloat(subScore(gid, app, "v1fin")) || 0;
    const v2 = parseFloat(subScore(gid, app, "v2fin")) || 0;
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
  const isDualVaultRow = (gid, app) => subScore(gid, app, "dualVault") === "1";
  const vaultFinal = (gid, app, prefix) => parseFloat(subScore(gid, app, `${prefix}fin`)) || 0;
  const vaultEqualsTotal = (v, total) => v > 0 && Math.round(v * 1000) === Math.round((total || 0) * 1000);
  const vaultColCell = (gid, app, prefix, total) => {
    if (!isDualVaultRow(gid, app)) return <td style={{ color: "var(--muted)" }}>—</td>;
    const v = vaultFinal(gid, app, prefix);
    const hot = vaultEqualsTotal(v, total);
    return <td style={{ fontWeight: hot ? 700 : 500, color: hot ? "var(--accent)" : "var(--muted)" }}>{v > 0 ? v.toFixed(3) : "—"}</td>;
  };

  // Build ranking groups respecting level rankBy config
  const buildRankGroups = () => {
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "Unknown age") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    // Sort gymnasts by number within each group
    Object.values(map).forEach(g => g.gymnasts.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)));
    const levelOrder = (compData.levels || []).map(l => l.name);
    return Object.entries(map)
      .sort(([a], [b]) => {
        const aLevel = a.split("|||")[0];
        const bLevel = b.split("|||")[0];
        const ai = levelOrder.indexOf(aLevel);
        const bi = levelOrder.indexOf(bLevel);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(([key, val]) => ({ key, ...val }));
  };

  const allRankGroups = useMemo(buildRankGroups, [roundGymnasts, compData.levels]);
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
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {compData.rounds.map(r => (
            <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
              onClick={() => { setActiveRound(r.id); setLevelFilter("all"); setAgeFilter("all"); }}>{r.name}</button>
          ))}
        </div>
        {onUpdateCompData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: "auto", fontFamily: "var(--font-display)" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)" }}>Tie ranking</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={`btn btn-sm ${rankingMode === "standard" ? "btn-tertiary" : "btn-secondary"}`}
                style={{ fontFamily: "var(--font-display)" }}
                onClick={() => setRankingMode("standard")}>Standard — ties skip places (1, 1, 3)</button>
              <button className={`btn btn-sm ${rankingMode === "dense" ? "btn-tertiary" : "btn-secondary"}`}
                style={{ fontFamily: "var(--font-display)" }}
                onClick={() => setRankingMode("dense")}>Dense — ties keep places (1, 1, 2)</button>
            </div>
          </div>
        )}
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
                  const withScores = glist.map(g => ({ ...g, score: getScore(g.id, apparatus) }));
                  const ranked = denseRank(withScores.filter(g => g.score > 0 && !g.dns && !g.withdrawn), "score", rankingMode);
                  const dns = withScores.filter(g => g.score === 0 || g.dns || g.withdrawn);
                  // Dual-vault section → break the two vault finals out into columns.
                  const showVaultCols = [...ranked, ...dns].some(g => isDualVaultRow(g.id, apparatus));
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
                                {showVaultCols && <>{vaultColCell(g.id, apparatus, "v1", g.score)}{vaultColCell(g.id, apparatus, "v2", g.score)}</>}
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
            const withTotals = glist.map(g => ({ ...g, total: getTotal(g.id) }));
            const ranked = denseRank(withTotals.filter(g => g.total > 0 && !g.dns && !g.withdrawn), "total", rankingMode);
            const dns = withTotals.filter(g => g.total === 0 || g.dns || g.withdrawn);
            return (
              <div key={key} className="results-level-card">
                <div className="results-level-header">
                  {levelName}{ageLabel ? <span>{ageLabel}</span> : null}
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
                              {getScore(g.id, a) > 0 ? getScore(g.id, a).toFixed(3) : "—"}
                              {getScore(g.id, a) > 0 && renderVaultFinals(g.id, a, getScore(g.id, a))}
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
