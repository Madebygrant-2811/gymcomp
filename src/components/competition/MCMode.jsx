import { useState, useMemo } from "react";
import { gymnast_key, denseRank } from "../../lib/scoring.js";
import { getApparatusIcon } from "../../lib/pdf.js";

function MCMode({ compData, gymnasts, scores }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("overall"); // "overall" | "apparatus"
  const scoringApparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const [activeApparatus, setActiveApparatus] = useState(scoringApparatus[0] || "");
  const [fullscreen, setFullscreen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const getScore = (gid, app) => {
    const v = parseFloat(scores[gymnast_key(activeRound, gid, app)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (gid) => scoringApparatus.reduce((s, a) => s + getScore(gid, a), 0);

  const roundGymnasts = useMemo(() => gymnasts.filter(g => g.round === activeRound && !g.dns), [gymnasts, activeRound]);

  const buildRankGroups = () => {
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([key, val]) => ({ key, ...val }));
  };

  const rankGroups = useMemo(buildRankGroups, [roundGymnasts, compData.levels]);

  // Build flat announcement list: for each level group, gymnasts in reverse order (worst first → best last)
  const buildAnnouncementList = () => {
    const list = [];
    rankGroups.forEach(({ levelName, ageLabel, gymnasts: glist }) => {
      const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
      if (view === "overall") {
        const withTotals = glist.map(g => ({ ...g, total: getTotal(g.id) }))
          .filter(g => g.total > 0);
        const ranked = denseRank(withTotals, "total");
        // Reverse: announce from last place to first
        const reversed = [...ranked].sort((a, b) => b.rank - a.rank);
        reversed.forEach(g => {
          const medal = g.rank === 1 ? "🥇" : g.rank === 2 ? "🥈" : g.rank === 3 ? "🥉" : "";
          const placing = g.rank === 1 ? "1st place" : g.rank === 2 ? "2nd place" : g.rank === 3 ? "3rd place" : `${g.rank}th place`;
          list.push({
            group: groupLabel,
            gymnast: g,
            rank: g.rank,
            medal,
            score: g.total.toFixed(3),
            text: `In ${placing}… with a score of ${g.total.toFixed(3)}… ${medal} ${g.name}… from ${g.club || "—"}`,
          });
        });
      } else {
        const withScores = glist.map(g => ({ ...g, score: getScore(g.id, activeApparatus) }))
          .filter(g => g.score > 0);
        const ranked = denseRank(withScores, "score");
        const reversed = [...ranked].sort((a, b) => b.rank - a.rank);
        reversed.forEach(g => {
          const medal = g.rank === 1 ? "🥇" : g.rank === 2 ? "🥈" : g.rank === 3 ? "🥉" : "";
          const placing = g.rank === 1 ? "1st place" : g.rank === 2 ? "2nd place" : g.rank === 3 ? "3rd place" : `${g.rank}th place`;
          list.push({
            group: groupLabel,
            gymnast: g,
            rank: g.rank,
            medal,
            score: g.score.toFixed(3),
            text: `In ${placing}… with a score of ${g.score.toFixed(3)}… ${medal} ${g.name}… from ${g.club || "—"}`,
          });
        });
      }
    });
    return list;
  };

  const announcements = useMemo(buildAnnouncementList, [rankGroups, scores, activeRound, scoringApparatus, view, activeApparatus]);
  const current = announcements[currentIdx];

  const prev = () => setCurrentIdx(i => Math.max(0, i - 1));
  const next = () => setCurrentIdx(i => Math.min(announcements.length - 1, i + 1));

  const rankBg = (rank) => {
    if (rank === 1) return "linear-gradient(135deg, #FFD700, #FFA500)";
    if (rank === 2) return "linear-gradient(135deg, #C0C0C0, #A0A0A0)";
    if (rank === 3) return "linear-gradient(135deg, #CD7F32, #A0522D)";
    return "var(--surface)";
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">MC <span>Mode</span></div>
        <div className="page-sub">Read off results during the awards ceremony — one gymnast at a time</div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {compData.rounds.map(r => (
            <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
              onClick={() => { setActiveRound(r.id); setCurrentIdx(0); }}>{r.name}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-sm ${view === "overall" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => { setView("overall"); setCurrentIdx(0); }}>Overall</button>
          {scoringApparatus.map(a => (
            <button key={a} className={`btn btn-sm ${view === "apparatus" && activeApparatus === a ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setView("apparatus"); setActiveApparatus(a); setCurrentIdx(0); }}>
              {getApparatusIcon(a)} {a}
            </button>
          ))}
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="empty">No scored gymnasts in this round yet</div>
      ) : (
        <>
          {/* Progress */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {announcements.map((ann, i) => (
              <button key={i}
                onClick={() => setCurrentIdx(i)}
                style={{
                  width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: i === currentIdx ? "var(--accent)" : i < currentIdx ? "var(--success)" : "var(--surface2)",
                  color: i === currentIdx ? "#000" : i < currentIdx ? "#fff" : "var(--muted)"
                }}>
                {ann.rank === 1 ? "🥇" : ann.rank === 2 ? "🥈" : ann.rank === 3 ? "🥉" : ann.rank}
              </button>
            ))}
          </div>

          {/* Group label */}
          {current && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>
              {current.group} {view === "apparatus" ? `· ${activeApparatus}` : "· Overall"}
            </div>
          )}

          {/* Main announcement card */}
          {current && (
            <div style={{
              background: rankBg(current.rank),
              borderRadius: 16, padding: "40px 48px", textAlign: "center", marginBottom: 24,
              boxShadow: current.rank <= 3 ? "0 8px 40px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>{current.medal || "🏅"}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: current.rank <= 3 ? 64 : 48, lineHeight: 1, letterSpacing: 2, marginBottom: 12, color: current.rank <= 3 ? "#fff" : "var(--text)" }}>
                {current.gymnast.name}
              </div>
              <div style={{ fontSize: 20, color: current.rank <= 3 ? "rgba(255,255,255,0.8)" : "var(--muted)", marginBottom: 16 }}>
                {current.gymnast.club}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 48, color: current.rank <= 3 ? "#fff" : "var(--accent)", letterSpacing: 1 }}>
                {current.score}
              </div>
              <div style={{ fontSize: 14, color: current.rank <= 3 ? "rgba(255,255,255,0.7)" : "var(--muted)", marginTop: 6 }}>
                {current.rank === 1 ? "🥇 1st Place" : current.rank === 2 ? "🥈 2nd Place" : current.rank === 3 ? "🥉 3rd Place" : `${current.rank}th Place`}
              </div>
            </div>
          )}

          {/* MC script text */}
          {current && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px 20px", marginBottom: 24, fontSize: 18, lineHeight: 1.8, color: "var(--text)", fontStyle: "italic" }}>
              "{current.text}"
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={prev} disabled={currentIdx === 0} style={{ fontSize: 16, padding: "12px 32px" }}>
              ← Previous
            </button>
            <div style={{ display: "flex", alignItems: "center", color: "var(--muted)", fontSize: 13 }}>
              {currentIdx + 1} of {announcements.length}
            </div>
            <button className="btn btn-primary" onClick={next} disabled={currentIdx === announcements.length - 1} style={{ fontSize: 16, padding: "12px 32px" }}>
              Next →
            </button>
          </div>

          {currentIdx === announcements.length - 1 && (
            <div style={{ textAlign: "center", marginTop: 24, fontSize: 20, color: "var(--accent)", fontFamily: "var(--font-display)", letterSpacing: 2 }}>
              🎉 End of ceremony — congratulations to all competitors!
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MCMode;
