import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { generateId } from "../../lib/utils.js";
import { getApparatusIcon, printDocument, buildAgendaHTML, buildJudgeSheetsHTML, buildAttendanceHTML } from "../../lib/pdf.js";
import ClubPicker from "../shared/ClubPicker.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import QRDisplay from "../shared/QRDisplay.jsx";
import SubmissionsReviewPanel from "../public/SubmissionsReviewPanel.jsx";

function CompDashboard({ compData, gymnasts, compId, compPin, onStartComp, onEditSetup, onAcceptSubmissions, onManageGymnasts, onSetPin, eventStatus, onUpdateCompData }) {
  const [showId, setShowId] = useState(false);
  const [submLinkCopied, setSubmLinkCopied] = useState(false);
  const [showSubmReview, setShowSubmReview] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const lastScrollY = useRef(0);
  const [judgeModal, setJudgeModal] = useState(null); // { mode: "add"|"edit", apparatus, id?, name, club }
  const [judgeRemoveConfirm, setJudgeRemoveConfirm] = useState(null);

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchPendingCount = useCallback(() => {
    if (!compId) return;
    if (inSandbox) { setPendingCount(2); return; }
    supabase.from("submissions").select("*").eq("comp_id", compId).order("submitted_at", { ascending: false }).then(({ data }) => {
      if (mountedRef.current) setPendingCount((data || []).filter(s => s.status === "pending").length);
    }).catch(() => { if (mountedRef.current) setPendingCount(0); });
  }, [compId]);

  // Fetch on mount
  useEffect(() => { fetchPendingCount(); }, [fetchPendingCount]);

  // Poll every 30s for new submissions
  useEffect(() => {
    if (!compId) return;
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingCount]);

  // Re-fetch when tab regains focus
  useEffect(() => {
    const handleVis = () => { if (document.visibilityState === "visible") fetchPendingCount(); };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [fetchPendingCount]);

  const refreshSubmCount = () => fetchPendingCount();

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

  const copySubmitLink = async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/submit.html?comp=${compId}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    setSubmLinkCopied(true);
    setTimeout(() => setSubmLinkCopied(false), 2500);
  };

  const saveJudgeModal = () => {
    if (!judgeModal?.name.trim()) return;
    if (judgeModal.mode === "add") {
      onUpdateCompData(d => ({
        ...d,
        judges: [...d.judges, { id: generateId(), name: judgeModal.name.trim(), club: judgeModal.club.trim(), apparatus: judgeModal.apparatus }]
      }));
    } else {
      onUpdateCompData(d => ({
        ...d,
        judges: d.judges.map(j => j.id === judgeModal.id ? { ...j, name: judgeModal.name.trim(), club: judgeModal.club.trim() } : j)
      }));
    }
    setJudgeModal(null);
  };

  const removeJudge = (id) => {
    onUpdateCompData(d => ({ ...d, judges: d.judges.filter(j => j.id !== id) }));
    setJudgeRemoveConfirm(null);
  };

  const totalGymnasts = gymnasts.length;
  const judges = compData.judges || [];
  const hasGymnasts = gymnasts.length > 0;
  const hasJudges = judges.length > 0;
  const hasApparatus = (compData.apparatus || []).length > 0;
  const requiredFields = ["name", "club", "level", "round", "age", "group"];
  const incompleteGymnasts = gymnasts.filter(g => requiredFields.some(f => !g[f] || !g[f].toString().trim()));
  const allGymnastsComplete = incompleteGymnasts.length === 0;
  const canStart = hasGymnasts && hasJudges && allGymnastsComplete;
  const competingGymnasts = gymnasts.filter(g => !g.dns);
  const dnsGymnasts = gymnasts.filter(g => !!g.dns);
  const colour = "#000dff";
  const completed = eventStatus === "completed";

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
  const coachUrl = `${origin}/coach.html?comp=${compId}`;
  const parentUrl = `${origin}/results.html?comp=${compId}`;

  const statCard = (label, value, accent) => (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
      padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, lineHeight: 1, color: accent || "var(--text)" }}>{value}</div>
    </div>
  );

  const docBtn = (icon, label, available, action, note) => (
    <div style={{
      background: "var(--surface)", border: `1px solid ${available ? "var(--border)" : "var(--border)"}`,
      borderRadius: "var(--radius)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 14,
      opacity: available ? 1 : 0.55
    }}>
      <div style={{ flexShrink: 0, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{label}</div>
        {!available && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>{note}</div>}
      </div>
      {available ? (
        <button className="btn btn-primary btn-sm"
          style={{ background: colour, color: "#fff", flexShrink: 0 }}
          onClick={action}>
          ⬇ PDF
        </button>
      ) : (
        <button className="btn btn-secondary btn-sm" disabled style={{ flexShrink: 0 }}>⬇ PDF</button>
      )}
    </div>
  );

  return (
    <div style={{ flex: 1 }}>
      {/* Topbar — styled like setup topbar */}
      <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`} style={{ marginBottom: 0, margin: "0 24px" }}>
          <div className="setup-topbar-left">
            <div className="setup-topbar-name">{compData.name || "Untitled Competition"}</div>
            {compData.date && <div className="setup-topbar-meta">{new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>}
            {compData.location && <div className="setup-topbar-meta">{compData.location}</div>}
          </div>
          <div className="setup-topbar-right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {completed ? (
              <div style={{ padding: "7px 18px", borderRadius: 56, background: "rgba(255,255,255,0.15)", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600, color: "var(--text-alternate)", letterSpacing: 0.5 }}>
                Completed
              </div>
            ) : (<>
              <button onClick={onEditSetup} style={{
                padding: "7px 18px", borderRadius: 56, border: "1.5px solid rgba(255,255,255,0.3)", background: "none",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600, color: "var(--text-alternate)"
              }}>
                Edit Setup
              </button>
              <button
                onClick={canStart ? onStartComp : undefined}
                disabled={!canStart}
                title={!canStart ? `${[!hasGymnasts && "Add gymnasts", !hasJudges && "Add judges", !allGymnastsComplete && "Complete incomplete gymnast data"].filter(Boolean).join(", ")} to start` : undefined}
                style={{
                  padding: "7px 18px", borderRadius: 56, border: "none",
                  background: canStart ? (eventStatus === "live" ? "#22c55e" : "rgba(255,255,255,0.95)") : "rgba(255,255,255,0.2)",
                  cursor: canStart ? "pointer" : "not-allowed",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  color: canStart ? (eventStatus === "live" ? "#fff" : "var(--brand-01)") : "rgba(255,255,255,0.5)"
                }}
              >
                {eventStatus === "live" ? "Resume Competition →" : "Start Competition →"}
              </button>
            </>)}
          </div>
      </div>

      <div className="setup-content" style={{ padding: "40px 24px", paddingTop: 24 }}>
      <div style={{ width: "100%", maxWidth: 860, margin: "0 auto" }}>

        {/* Title + meta */}
        <div style={{ marginBottom: 32 }}>
          <div className="dash-hero-title" style={{ fontFamily: "var(--font-display)", fontSize: 58, fontWeight: 500, lineHeight: 1, marginBottom: 12 }}>
            {compData.name}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            {compData.date && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>
              {new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>}
            {compData.location && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="7" r="2"/><path d="M8 15S3 10 3 7a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
              {compData.location}
            </span>}
          </div>
        </div>

        {completed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "var(--radius)", marginBottom: 24, fontSize: 13, color: "#166534", fontWeight: 600 }}>
            <span style={{ fontSize: 16 }}>✓</span>
            This competition has been completed. The dashboard is view-only.
          </div>
        )}

        {/* ── COMPETITION DETAILS — ROUNDS ─────────────────────────── */}
        {compData.rounds.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              Rounds
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {compData.rounds.map((r, i) => {
                const formatTime = (t) => {
                  if (!t) return "—";
                  const [h, m] = t.split(":");
                  const hour = parseInt(h);
                  return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? "PM" : "AM"}`;
                };
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "14px 18px", fontSize: 14, fontFamily: "var(--font-display)",
                    borderBottom: i < compData.rounds.length - 1 ? "1px solid var(--border)" : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)"
                  }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                      {r.start || r.end ? `${formatTime(r.start)} – ${formatTime(r.end)}` : "No times set"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Overview</div>
        <div className="cd-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {statCard("Gymnasts", totalGymnasts, "var(--accent)")}
          {statCard("Clubs", (compData.clubs || []).length)}
          {statCard("Levels", compData.levels.length)}
          {statCard("Apparatus", compData.apparatus.length)}
        </div>

        {/* ── CLUBS SECTION ──────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Clubs
          </div>
          {(compData.clubs || []).length > 0 ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px 18px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: !completed ? 12 : 0 }}>
                {compData.clubs.map(c => (
                  <div key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "var(--surface2)", borderRadius: 56, fontSize: 13, fontWeight: 500 }}>
                    <span>{c.name}</span>
                    {!completed && (
                      <button onClick={() => onUpdateCompData(d => ({ ...d, clubs: d.clubs.filter(cl => cl.id !== c.id) }))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {!completed && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <ClubPicker placeholder="Add a club…" style={{ flex: 1 }}
                    value={newClubName}
                    onChange={val => setNewClubName(val)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newClubName.trim()) {
                        onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim() }] }));
                        setNewClubName("");
                      }
                    }} />
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    if (!newClubName.trim()) return;
                    onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim() }] }));
                    setNewClubName("");
                  }}>Add</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏟️</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No clubs added{completed ? "" : " yet"}</div>
              {!completed && (<>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, maxWidth: 400, margin: "0 auto 16px" }}>
                  Add participating clubs so gymnasts can be assigned to them.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", maxWidth: 400, margin: "0 auto" }}>
                  <ClubPicker placeholder="Search clubs…" style={{ flex: 1 }}
                    value={newClubName}
                    onChange={val => setNewClubName(val)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newClubName.trim()) {
                        onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim() }] }));
                        setNewClubName("");
                      }
                    }} />
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    if (!newClubName.trim()) return;
                    onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim() }] }));
                    setNewClubName("");
                  }}>Add</button>
                </div>
              </>)}
            </div>
          )}
        </div>

        {/* ── GYMNASTS SECTION ───────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Gymnasts
          </div>
          {/* Submissions bar */}
          {!completed && compId && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
              padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", marginBottom: 12
            }}>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", fontFamily: "var(--font-display)" }}>
                {pendingCount === 0 ? "No pending submissions" : (
                  <span style={{ color: "var(--brand-01)", fontWeight: 600 }}>{pendingCount} submission{pendingCount !== 1 ? "s" : ""} awaiting review</span>
                )}
              </div>
              <button onClick={() => setShowSubmReview(true)} style={{
                padding: "8px 20px", borderRadius: 56, border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
                fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                display: "inline-flex", alignItems: "center", gap: 8
              }}>
                Review Submissions
                {pendingCount > 0 && <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>}
              </button>
            </div>
          )}
          {!completed && incompleteGymnasts.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#fef3c7", border: "1px solid #f59e0b44", borderRadius: "var(--radius)", marginBottom: 12, fontSize: 13, color: "#92400e", fontWeight: 600 }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              {incompleteGymnasts.length} gymnast{incompleteGymnasts.length !== 1 ? "s" : ""} have incomplete data — fill in all fields before starting
            </div>
          )}
          {hasGymnasts ? (<>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 1fr 60px 28px", gap: 0, borderBottom: "1px solid var(--border)", padding: "8px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
                <div>#</div>
                <div>Name</div>
                <div>Club</div>
                <div>Level</div>
                <div>Round</div>
                <div>Age</div>
                <div></div>
              </div>
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {[...competingGymnasts].sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)).map((g, i) => {
                const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level || "—";
                const roundName = compData.rounds.find(r => r.id === g.round)?.name || g.round || "—";
                const missing = requiredFields.filter(f => !g[f] || !g[f].toString().trim());
                return (
                  <div key={g.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 1fr 60px 28px", gap: 0, padding: "10px 16px", fontSize: 13, borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)" }}>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>{g.number || i + 1}</div>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div style={{ color: "var(--muted)" }}>{g.club || "—"}</div>
                    <div style={{ color: "var(--muted)" }}>{levelName}</div>
                    <div style={{ color: "var(--muted)" }}>{roundName}</div>
                    <div style={{ color: "var(--muted)" }}>{g.age || "—"}</div>
                    <div style={{ textAlign: "center" }}>{missing.length > 0 && <span title={`Missing: ${missing.join(", ")}`} style={{ color: "#f59e0b", cursor: "help", fontSize: 15 }}>⚠</span>}</div>
                  </div>
                );
              })}
              </div>
              {!completed && (
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={onManageGymnasts} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 56,
                    background: "var(--brand-01)", color: "var(--text-alternate)", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
                  }}>
                    + Manage Gymnasts
                  </button>
                  <button
                    onClick={copySubmitLink}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 56,
                      border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
                      fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
                      color: "var(--text-primary)"
                    }}
                  >
                    {submLinkCopied ? "Copied!" : "Share Submission Link"}
                  </button>
                </div>
                {compId && pendingCount > 0 && (
                  <button onClick={() => setShowSubmReview(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 56,
                    border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)"
                  }}>
                    Review Submissions
                    <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>
                  </button>
                )}
              </div>
              )}
            </div>
          {dnsGymnasts.length > 0 && (
            <div style={{ marginTop: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", opacity: 0.7 }}>
              <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--danger)", background: "rgba(0,0,0,0.03)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                DNS — Did Not Start
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>{dnsGymnasts.length} gymnast{dnsGymnasts.length !== 1 ? "s" : ""}</span>
              </div>
              {[...dnsGymnasts].sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)).map((g, i) => {
                const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level || "—";
                return (
                  <div key={g.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr", gap: 0, padding: "8px 16px", fontSize: 13, borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)", textDecoration: "line-through", color: "var(--muted)" }}>
                    <div style={{ fontSize: 11 }}>{g.number || "—"}</div>
                    <div>{g.name}</div>
                    <div>{g.club || "—"}</div>
                    <div>{levelName}</div>
                  </div>
                );
              })}
            </div>
          )}
          </>) : (
            <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "40px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🤸</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>No gymnasts added{completed ? "" : " yet"}</div>
              {!completed && (<>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 420, margin: "0 auto 28px" }}>
                You need to add gymnasts before the competition can start. Add them manually or share the submission link so clubs can send their own lists.
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary" style={{ fontSize: 14, padding: "12px 24px", background: "var(--brand-01)", color: "var(--text-alternate)" }}
                  onClick={onManageGymnasts}>
                  + Add Gymnasts Manually
                </button>
                <button className="btn btn-secondary" style={{
                    fontSize: 14, padding: "12px 24px"
                  }}
                    onClick={copySubmitLink}>
                    {submLinkCopied ? "✅ Link copied!" : "Share Submission Link with Clubs"}
                </button>
              </div>
              {compId && pendingCount > 0 && (
                <div style={{ marginTop: 20 }}>
                  <button onClick={() => setShowSubmReview(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 56,
                    border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)"
                  }}>
                    Review Submissions
                    <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>
                  </button>
                </div>
              )}
              </>)}
            </div>
          )}
        </div>

        {/* ── JUDGES SECTION ──────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Judges
          </div>
          {hasApparatus ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {compData.apparatus.map(app => {
                  const appJudges = judges.filter(j => j.apparatus === app);
                  return (
                    <div key={app} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", background: "var(--surface2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>{getApparatusIcon(app)} {app}</span>
                        <span style={{ width: 20, height: 20, borderRadius: "50%", background: appJudges.length > 0 ? "var(--brand-01)" : "var(--border)", color: appJudges.length > 0 ? "#fff" : "var(--muted)", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{appJudges.length}</span>
                      </div>
                      <div style={{ padding: "8px 14px" }}>
                        {appJudges.length === 0 && (
                          <div style={{ color: "var(--muted)", fontSize: 12, padding: "6px 0" }}>No judges assigned</div>
                        )}
                        {appJudges.map(j => (
                          <div key={j.id} style={{ padding: "6px 0", fontSize: 13, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontWeight: 400, color: "var(--text)" }}>{j.name}</div>
                              {j.club && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{j.club}</div>}
                            </div>
                            {!completed && (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn-icon" onClick={() => setJudgeModal({ mode: "edit", apparatus: app, id: j.id, name: j.name, club: j.club || "" })} title="Edit">
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                                </button>
                                <button className="btn-icon" onClick={() => setJudgeRemoveConfirm({ id: j.id, name: j.name, apparatus: app })}>×</button>
                              </div>
                            )}
                          </div>
                        ))}
                        {!completed && (
                          <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
                            onClick={() => setJudgeModal({ mode: "add", apparatus: app, name: "", club: "" })}>
                            + Add Judge
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* FIG validation warning */}
              {compData.apparatus.some(app => judges.filter(j => j.apparatus === app).length === 0) && (
                <div style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: 12,
                  background: "rgba(240,173,78,0.1)", border: "1px solid rgba(240,173,78,0.4)",
                  fontSize: 12, color: "#c8862a" }}>
                  ⚠ Each apparatus needs at least one judge before scores can be entered.
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Add apparatus in Setup first</div>
            </div>
          )}
        </div>

        {/* Judge add/edit modal */}
        {judgeModal && (
          <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setJudgeModal(null); }}>
            <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                {judgeModal.mode === "add" ? "Add Judge" : "Edit Judge"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
                {getApparatusIcon(judgeModal.apparatus)} {judgeModal.apparatus}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>Name</label>
                  <input className="input" placeholder="Judge name" autoFocus
                    value={judgeModal.name}
                    onChange={e => setJudgeModal(m => ({ ...m, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter" && judgeModal.name.trim()) saveJudgeModal(); if (e.key === "Escape") setJudgeModal(null); }}
                    style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>Club (optional)</label>
                  <ClubPicker placeholder="Club"
                    value={judgeModal.club}
                    onChange={val => setJudgeModal(m => ({ ...m, club: val }))}
                    onKeyDown={e => { if (e.key === "Enter" && judgeModal.name.trim()) saveJudgeModal(); if (e.key === "Escape") setJudgeModal(null); }}
                    style={{ width: "100%" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={() => setJudgeModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveJudgeModal} disabled={!judgeModal.name.trim()}>
                  {judgeModal.mode === "add" ? "Add Judge" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Judge remove confirmation */}
        {judgeRemoveConfirm && (
          <ConfirmModal
            message={`Remove judge "${judgeRemoveConfirm.name}" from ${judgeRemoveConfirm.apparatus}?`}
            onConfirm={() => removeJudge(judgeRemoveConfirm.id)}
            onCancel={() => setJudgeRemoveConfirm(null)}
          />
        )}

        {/* ── PRE-COMPETITION DOCUMENTS ─────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Pre-Competition Documents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {docBtn(<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><path d="M7 6h6M7 10h6M7 14h3"/></svg>, "Competition Agenda",
              hasGymnasts,
              () => printDocument(buildAgendaHTML(compData, gymnasts, compId), "gymcomp-agenda.pdf"),
              "Add gymnasts in Setup to generate"
            )}
            {docBtn(<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><path d="M7 6h6M7 10h6"/><path d="M12.5 13.5l-2 2L9 14"/></svg>, "Judge Score Sheets",
              hasGymnasts && hasApparatus,
              () => printDocument(buildJudgeSheetsHTML(compData, gymnasts), "gymcomp-judge-sheets.pdf"),
              "Add gymnasts and apparatus in Setup"
            )}
            {docBtn(<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="3"/><path d="M2 17c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M13 6h5M13 10h5M13 14h3"/></svg>, "Attendance List",
              hasGymnasts,
              () => printDocument(buildAttendanceHTML(compData, gymnasts), "gymcomp-attendance.pdf"),
              "Add gymnasts in Setup to generate"
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            PDFs download directly to your device
          </div>
        </div>


        {/* ── LIVE VIEWS + QR CODES ─────────────────────────────── */}
        {compId && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              Live View Links
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
                Share these links with coaches and parents <strong style={{ color: "var(--text)" }}>before the competition</strong> — they can scan the QR code on the printed Agenda to follow along in real time.
              </div>
              <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>
                <QRDisplay url={coachUrl} size={140} label="Coach View (D/E breakdown)" />
                <QRDisplay url={parentUrl} size={140} label="Parent View (scores + rankings)" />
              </div>
            </div>
          </div>
        )}

        {/* ── START CTA ─────────────────────────────────────────── */}
        {!completed && (
        <div style={{ background: canStart ? (eventStatus === "live" ? "#22c55e12" : `${colour}12`) : "var(--surface)", border: `1px solid ${canStart ? (eventStatus === "live" ? "#22c55e33" : colour + "33") : "var(--border)"}`, borderRadius: "var(--radius)", padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
              {!canStart ? "Almost ready" : eventStatus === "live" ? "Competition in progress" : "Ready to begin?"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {canStart
                ? eventStatus === "live"
                  ? "Return to the scoring interface to continue judging"
                  : "Opens the scoring interface — you can return here any time via \"← Dashboard\""
                : "Add " + [!hasGymnasts && "gymnasts", !hasJudges && "judges", !allGymnastsComplete && "incomplete gymnast data"].filter(Boolean).join(", ") + " before starting the competition."}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <button className="btn btn-primary"
              style={{ fontSize: 16, padding: "14px 36px", letterSpacing: 1, background: canStart ? (eventStatus === "live" ? "#22c55e" : colour) : "var(--surface2)", color: canStart ? "#fff" : "var(--muted)", opacity: canStart ? 1 : 0.55 }}
              onClick={onStartComp}
              disabled={!canStart}>
              {eventStatus === "live" ? "Resume Competition →" : "Start Competition →"}
            </button>
            {!canStart && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, textAlign: "center" }}>
                {[!hasGymnasts && "Add gymnasts", !hasJudges && "Add judges", !allGymnastsComplete && "Complete incomplete gymnast data"].filter(Boolean).join(", ")} to get started
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── COMP ID + PIN ─────────────────────────────────────── */}
        {compId && (
          <div style={{ padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Competition ID</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, cursor: "pointer", color: "var(--text)" }} onClick={() => setShowId(v => !v)}>
                {showId ? compId : "•••••• (tap to reveal)"}
              </div>
              {showId && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 10 }}
                  onClick={() => { try { navigator.clipboard.writeText(compId); } catch {} }}>
                  Copy ID
                </button>
              )}
            </div>
            <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>PIN Protection</div>
              <div style={{ fontSize: 13, color: compPin ? "var(--success)" : "var(--muted)", marginBottom: 6 }}>
                {compPin ? "🔒 PIN set" : "🔓 No PIN"}
              </div>
              {onSetPin && !completed && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={onSetPin}>
                  {compPin ? "Change PIN" : "Set PIN"}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", width: "100%" }}>
              Save your Competition ID to resume this session from any device
            </div>
          </div>
        )}

      </div>
      </div>

      {showSubmReview && (
        <SubmissionsReviewPanel
          compId={compId}
          compData={compData}
          gymnasts={gymnasts}
          onAccept={(newGymnasts) => { onAcceptSubmissions(newGymnasts); refreshSubmCount(); }}
          onDecline={refreshSubmCount}
          onClose={() => { setShowSubmReview(false); fetchPendingCount(); }}
        />
      )}
    </div>
  );
}


export default CompDashboard;
