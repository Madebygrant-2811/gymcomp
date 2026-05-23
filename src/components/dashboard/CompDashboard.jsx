import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { generateId, generateClubCode } from "../../lib/utils.js";
import { getApparatusIcon, printDocument, buildAgendaHTML, buildJudgeSheetsHTML, buildAttendanceHTML, buildPublicQRPdf, buildCoachQRPdf } from "../../lib/pdf.js";
import ClubPicker from "../shared/ClubPicker.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";

import SubmissionsReviewPanel from "../public/SubmissionsReviewPanel.jsx";

function CompDashboard({ compData, gymnasts, compId, compPin, onStartComp, onEditSetup, onAcceptSubmissions, onManageGymnasts, onManageRoundsGroups, onSetPin, eventStatus, onUpdateCompData, onUpdateGymnasts }) {
  const [showId, setShowId] = useState(false);
  const [submLinkCopied, setSubmLinkCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [showSubmReview, setShowSubmReview] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const lastScrollY = useRef(0);
  const [judgeModal, setJudgeModal] = useState(null); // { mode: "add"|"edit", apparatus, id?, name, club }
  const [judgeRemoveConfirm, setJudgeRemoveConfirm] = useState(null);
  const [roundCount, setRoundCount] = useState(compData.rounds?.length || 1);
  const [collapsed, setCollapsed] = useState(new Set());

  // Seed Round 1 on first load if rounds array is empty
  useEffect(() => {
    if (!compData.rounds || compData.rounds.length === 0) {
      onUpdateCompData(d => ({ ...d, rounds: [{ id: generateId(), name: "Round 1", start: "", end: "" }] }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const scoringApparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const hasApparatus = scoringApparatus.length > 0;
  const requiredFields = ["name", "club", "level"];
  const incompleteGymnasts = gymnasts.filter(g => requiredFields.some(f => !g[f] || !g[f].toString().trim()));
  const allGymnastsComplete = incompleteGymnasts.length === 0;

  // 5-step readiness checklist
  const gymnastsWithoutClub = gymnasts.filter(g => !g.club || !g.club.trim());
  const uncoveredApparatus = scoringApparatus.filter(app => !judges.some(j => j.apparatus === app));
  const unassignedGymnasts = gymnasts.filter(g => !g.round || !g.group);
  const readinessSteps = [
    { label: "Add clubs", sub: "At least one club required", done: (compData.clubs || []).length > 0, scrollTo: "card-clubs" },
    { label: "Add gymnasts and assign to clubs", sub: gymnasts.length === 0 ? "No gymnasts added yet" : gymnastsWithoutClub.length > 0 ? `${gymnastsWithoutClub.length} gymnast${gymnastsWithoutClub.length !== 1 ? "s" : ""} need a club` : "All gymnasts assigned to clubs", done: gymnasts.length > 0 && gymnastsWithoutClub.length === 0, scrollTo: "card-gymnasts" },
    { label: "Add judges to apparatus", sub: scoringApparatus.length === 0 ? "Add apparatus in setup first" : uncoveredApparatus.length > 0 ? `${uncoveredApparatus.length} apparatus need a judge` : "All apparatus have judges", done: scoringApparatus.length > 0 && uncoveredApparatus.length === 0, scrollTo: "card-judges" },
    { label: "Set up rounds", sub: "At least one round required", done: (compData.rounds || []).length > 0, scrollTo: "card-rounds-groups" },
    { label: "Assign gymnasts to rotations within rounds", sub: gymnasts.length === 0 ? "Add gymnasts first" : unassignedGymnasts.length > 0 ? `${unassignedGymnasts.length} gymnast${unassignedGymnasts.length !== 1 ? "s" : ""} not yet assigned` : "All gymnasts assigned", done: gymnasts.length > 0 && unassignedGymnasts.length === 0, scrollTo: "card-rounds-groups" },
  ];
  const canStart = readinessSteps.every(s => s.done);
  const readyIcon = (done) => done
    ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="8" cy="8" r="7" fill="#22c55e"/><path d="M5 8.5l2 2 4-4.5" stroke="white" strokeWidth="1.8"/></svg>
    : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="8" cy="8" r="5"/></svg>;
  const toggleCard = (id, canClose) => {
    if (!canClose) return;
    setCollapsed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const chevron = (id) => (
    <div style={{ width: 28, height: 28, borderRadius: 14, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.2s", transform: collapsed.has(id) ? "rotate(-90deg)" : "rotate(0deg)" }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6l4 4 4-4"/>
      </svg>
    </div>
  );
  const competingGymnasts = gymnasts.filter(g => !g.dns);
  const dnsGymnasts = gymnasts.filter(g => !!g.dns);
  const colour = "#000dff";
  const completed = eventStatus === "completed";
  const submissionsOpen = compData.allowSubmissions !== false;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.gymcomp.co.uk";

  const statCard = (label, value, accent) => (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
      padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, lineHeight: 1, color: accent || "var(--text)" }}>{value}</div>
    </div>
  );

  const docBtn = (icon, label, available, action, note, extraBtn) => (
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
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {extraBtn}
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
                title={!canStart ? `${readinessSteps.filter(s => !s.done).map(s => s.label).join(", ")} to start` : undefined}
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
      <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>

        <div className="card" id="card-overview" style={{ marginBottom: 24 }}>
          <div className="card-title">Comp Overview</div>

        <div style={{ marginBottom: 20 }}>
          <div className="dash-hero-title" style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 500, lineHeight: 1, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
            {compData.name}
            {compData.scoringMode === "nga" && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "var(--brand-03)", color: "var(--brand-01)", whiteSpace: "nowrap" }}>NGA</span>
            )}
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

        {/* Stats */}
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Overview</div>
        <div className="cd-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {statCard("Gymnasts", totalGymnasts, "var(--accent)")}
          {statCard("Clubs", (compData.clubs || []).length)}
          {statCard("Levels", compData.levels.length)}
          {statCard("Apparatus", scoringApparatus.length)}
        </div>
        </div>

        {/* ── SETUP CHECKLIST (horizontal) ──────────────────────── */}
        {!completed && (
        <div className="card" id="card-readiness" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Setup Checklist</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: canStart ? "#22c55e" : "var(--text-tertiary)" }}>{readinessSteps.filter(s => s.done).length} of {readinessSteps.length} complete</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {readinessSteps.map((s, i) => (
              <button key={i}
                onClick={s.scrollTo ? () => document.getElementById(s.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" }) : undefined}
                title={s.sub}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 56, fontSize: 12, fontWeight: 550,
                  fontFamily: "var(--font-display)", cursor: s.scrollTo ? "pointer" : "default",
                  border: `1px solid ${s.done ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                  background: s.done ? "rgba(34,197,94,0.06)" : "var(--surface)",
                  color: s.done ? "#22c55e" : "var(--text-secondary)",
                  whiteSpace: "nowrap"
                }}>
                {s.done
                  ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5l3 3 5-5.5"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="5"/></svg>
                }
                {s.label}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="card" id="card-clubs" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: readinessSteps[0].done ? "pointer" : "default", marginBottom: collapsed.has("clubs") ? 0 : undefined, paddingBottom: collapsed.has("clubs") ? 0 : undefined, borderBottom: collapsed.has("clubs") ? "none" : undefined }}
            onClick={() => toggleCard("clubs", readinessSteps[0].done)}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!completed && readyIcon(readinessSteps[0].done)}Manage Clubs
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)" }}>({(compData.clubs || []).length})</span>
            </span>
            {chevron("clubs")}
          </div>
          {!collapsed.has("clubs") && (compData.clubs || []).length === 0 && (
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
                        onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim(), clubCode: generateClubCode(d.clubs.map(c => c.clubCode).filter(Boolean)) }] }));
                        setNewClubName("");
                      }
                    }} />
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    if (!newClubName.trim()) return;
                    onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim(), clubCode: generateClubCode(d.clubs.map(c => c.clubCode).filter(Boolean)) }] }));
                    setNewClubName("");
                  }}>Add</button>
                </div>
              </>)}
            </div>
          )}

        {!collapsed.has("clubs") && (compData.clubs || []).length > 0 && (
          <div style={{ marginTop: 20 }}>
            {!completed && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <ClubPicker placeholder="Add a club…" style={{ flex: 1 }}
                  value={newClubName}
                  onChange={val => setNewClubName(val)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newClubName.trim()) {
                      onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim(), clubCode: generateClubCode(d.clubs.map(c => c.clubCode).filter(Boolean)) }] }));
                      setNewClubName("");
                    }
                  }} />
                <button className="btn btn-sm btn-primary" onClick={() => {
                  if (!newClubName.trim()) return;
                  onUpdateCompData(d => ({ ...d, clubs: [...d.clubs, { id: generateId(), name: newClubName.trim(), clubCode: generateClubCode(d.clubs.map(c => c.clubCode).filter(Boolean)) }] }));
                  setNewClubName("");
                }}>Add</button>
              </div>
            )}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--border)", lineHeight: 1.6 }}>
                Each club has a unique code to access the Coach View. Share the relevant code with each club representative.
              </div>
              {compData.clubs.map((c, i) => (
                <div key={c.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "12px 18px", fontSize: 14,
                  borderBottom: i < compData.clubs.length - 1 ? "1px solid var(--border)" : "none",
                  background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)"
                }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.5px", flexShrink: 0 }}>{c.clubCode || "—"}</div>
                  <button
                    onClick={async () => {
                      if (!c.clubCode) return;
                      try { await navigator.clipboard.writeText(c.clubCode); } catch {}
                      setCopiedCode(c.id);
                      setTimeout(() => setCopiedCode(v => v === c.id ? null : v), 2000);
                    }}
                    style={{
                      padding: "5px 14px", borderRadius: 56, border: "1px solid var(--border)", background: "none",
                      cursor: c.clubCode ? "pointer" : "default", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                      color: copiedCode === c.id ? "var(--success)" : "var(--text-primary)", flexShrink: 0, minWidth: 72, textAlign: "center"
                    }}
                  >
                    {copiedCode === c.id ? "Copied!" : "Copy Code"}
                  </button>
                  {!completed && (
                    <button
                      onClick={() => {
                        onUpdateCompData(d => ({ ...d, clubs: d.clubs.filter(cl => cl.id !== c.id) }));
                        if (onUpdateGymnasts) onUpdateGymnasts(prev => prev.map(g => g.club === c.name ? { ...g, club: "" } : g));
                      }}
                      style={{
                        padding: "5px 14px", borderRadius: 56, border: "1px solid var(--border)", background: "none",
                        cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                        color: "var(--danger)", flexShrink: 0
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        </div>

        <div className="card" id="card-gymnasts" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: readinessSteps[1].done ? "pointer" : "default", marginBottom: collapsed.has("gymnasts") ? 0 : undefined, paddingBottom: collapsed.has("gymnasts") ? 0 : undefined, borderBottom: collapsed.has("gymnasts") ? "none" : undefined }}
            onClick={() => toggleCard("gymnasts", readinessSteps[1].done)}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!completed && readyIcon(readinessSteps[1].done)}Manage Gymnasts
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)" }}>({gymnasts.length})</span>
            </span>
            {chevron("gymnasts")}
          </div>
          {!collapsed.has("gymnasts") && (<>
          {/* Submissions toggle + bar */}
          {!completed && compId && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", marginBottom: 12
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 2 }}>Accept club submissions</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5, fontFamily: "var(--font-display)" }}>
                  {submissionsOpen
                    ? "Clubs can submit gymnast lists via the public link."
                    : "The public submission link will show a Submissions Closed message."}
                </div>
              </div>
              <button
                onClick={() => onUpdateCompData(d => ({ ...d, allowSubmissions: !submissionsOpen }))}
                style={{
                  position: "relative", width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", flexShrink: 0,
                  background: submissionsOpen ? "var(--brand-01)" : "var(--border)",
                  transition: "background 0.2s"
                }}
                title={submissionsOpen ? "Turn off submissions" : "Turn on submissions"}
              >
                <div style={{
                  position: "absolute", top: 2, left: submissionsOpen ? 22 : 2,
                  width: 20, height: 20, borderRadius: 10,
                  background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.2s"
                }} />
              </button>
            </div>
          )}
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
              <div style={{ display: "grid", gridTemplateColumns: "36px 1.2fr 1fr 0.8fr 50px 28px", gap: 0, borderBottom: "1px solid var(--border)", padding: "8px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
                <div>#</div>
                <div>Name</div>
                <div>Club</div>
                <div>Level</div>
                <div>Age</div>
                <div></div>
              </div>
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {[...competingGymnasts].sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)).map((g, i) => {
                const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level || "—";
                const missing = requiredFields.filter(f => !g[f] || !g[f].toString().trim());
                return (
                  <div key={g.id} style={{ display: "grid", gridTemplateColumns: "36px 1.2fr 1fr 0.8fr 50px 28px", gap: 0, padding: "10px 16px", fontSize: 13, borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)", alignItems: "center" }}>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>{g.number || i + 1}</div>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.club || "—"}</div>
                    <div style={{ color: "var(--muted)" }}>{levelName}</div>
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
                    onClick={submissionsOpen ? copySubmitLink : undefined}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 56,
                      border: "1.5px solid var(--border)", background: "none",
                      cursor: submissionsOpen ? "pointer" : "default",
                      fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
                      color: "var(--text-primary)", opacity: submissionsOpen ? 1 : 0.5
                    }}
                  >
                    {submLinkCopied ? "Copied!" : "Share Submission Link"}
                    {!submissionsOpen && <span style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--surface2)", padding: "2px 8px", borderRadius: 56, fontWeight: 600 }}>Closed</span>}
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
                    fontSize: 14, padding: "12px 24px",
                    opacity: submissionsOpen ? 1 : 0.5,
                    cursor: submissionsOpen ? "pointer" : "default"
                  }}
                    onClick={submissionsOpen ? copySubmitLink : undefined}>
                    {submLinkCopied ? "Copied!" : "Share Submission Link with Clubs"}
                    {!submissionsOpen && <span style={{ fontSize: 10, marginLeft: 8, color: "var(--text-tertiary)", background: "var(--surface2)", padding: "2px 8px", borderRadius: 56, fontWeight: 600 }}>Closed</span>}
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
          </>)}
        </div>

        <div className="card" id="card-judges" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: readinessSteps[2].done ? "pointer" : "default", marginBottom: collapsed.has("judges") ? 0 : undefined, paddingBottom: collapsed.has("judges") ? 0 : undefined, borderBottom: collapsed.has("judges") ? "none" : undefined }}
            onClick={() => toggleCard("judges", readinessSteps[2].done)}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!completed && readyIcon(readinessSteps[2].done)}Manage Judges
              {compId && (
                <button onClick={async (e) => {
                  e.stopPropagation();
                  try { await navigator.clipboard.writeText(compId); } catch {}
                  setCopiedCode("__compid__");
                  setTimeout(() => setCopiedCode(v => v === "__compid__" ? null : v), 2000);
                }} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 56,
                  border: "1px solid var(--border)", background: "none", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  color: copiedCode === "__compid__" ? "var(--success)" : "var(--text-primary)"
                }}>
                  {copiedCode === "__compid__" ? "Copied!" : "Copy Comp ID"}
                </button>
              )}
            </span>
            {chevron("judges")}
          </div>
          {!collapsed.has("judges") && (<>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
            Judges will need the Comp ID and PIN to access the score input on competition day.
          </div>
          {hasApparatus ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {scoringApparatus.map(app => {
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
              {scoringApparatus.some(app => judges.filter(j => j.apparatus === app).length === 0) && (
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
          </>)}
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

        {/* ── ROUNDS & GROUPS ─────────────────────────────────── */}
        {(() => {
          const rgRounds = compData.rounds || [];
          const rgGbr = compData.groupsByRound || {};
          const rgActive = gymnasts.filter(g => !g.dns && !g.withdrawn);
          const rgUnassigned = rgActive.filter(g => !g.round);

          let statusIcon, statusColor, statusLabel, statusSub;
          if (rgActive.length === 0 && rgRounds.length > 0) {
            statusColor = "var(--muted)";
            statusIcon = <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>;
            statusLabel = "Rounds set up — no gymnasts yet";
            statusSub = null;
          } else if (rgActive.length > 0 && rgUnassigned.length === 0) {
            statusColor = "#22c55e";
            statusIcon = <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={statusColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>;
            statusLabel = "All gymnasts assigned";
            statusSub = `${rgActive.length} of ${rgActive.length} placed in ${rgRounds.length} round${rgRounds.length !== 1 ? "s" : ""}`;
          } else if (rgActive.length > 0 && rgUnassigned.length > 0) {
            statusColor = "#f59e0b";
            statusIcon = <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={statusColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11h.01"/></svg>;
            statusLabel = `${rgUnassigned.length} gymnast${rgUnassigned.length !== 1 ? "s" : ""} unassigned`;
            statusSub = null;
          } else {
            statusIcon = null; statusColor = null; statusLabel = null; statusSub = null;
          }

          return (
            <div className="card" id="card-rounds-groups" style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: (readinessSteps[3].done && readinessSteps[4].done) ? "pointer" : "default", marginBottom: collapsed.has("rounds") ? 0 : undefined, paddingBottom: collapsed.has("rounds") ? 0 : undefined, borderBottom: collapsed.has("rounds") ? "none" : undefined }}
                onClick={() => toggleCard("rounds", readinessSteps[3].done && readinessSteps[4].done)}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{!completed && readyIcon(readinessSteps[3].done && readinessSteps[4].done)}Rounds &amp; Rotations</span>
                {chevron("rounds")}
              </div>

              {!collapsed.has("rounds") && (<>
              {/* ── Round count stepper ── */}
              {!completed && (
                <div style={{ marginBottom: 20 }}>
                  <div className="field" style={{ maxWidth: 200 }}>
                    <label className="label">Number of Rounds</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button className="btn-icon" style={{ fontSize: 18 }}
                        onClick={() => {
                          const n = Math.max(1, roundCount - 1);
                          setRoundCount(n);
                          onUpdateCompData(d => {
                            const existing = d.rounds || [];
                            const rounds = Array.from({ length: n }, (_, i) => existing[i] || { id: generateId(), name: `Round ${i + 1}`, start: "", end: "" });
                            rounds.forEach((r, i) => { r.name = `Round ${i + 1}`; });
                            const newGbr = { ...(d.groupsByRound || {}) };
                            const keepIds = new Set(rounds.map(r => r.id));
                            Object.keys(newGbr).forEach(k => { if (!keepIds.has(k)) delete newGbr[k]; });
                            return { ...d, rounds, groupsByRound: newGbr };
                          });
                        }} disabled={roundCount <= 1}>−</button>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 32, minWidth: 32, textAlign: "center", color: "var(--accent)" }}>{roundCount}</span>
                      <button className="btn-icon" style={{ fontSize: 18 }}
                        onClick={() => {
                          const n = Math.min(10, roundCount + 1);
                          setRoundCount(n);
                          onUpdateCompData(d => {
                            const existing = d.rounds || [];
                            const rounds = Array.from({ length: n }, (_, i) => existing[i] || { id: generateId(), name: `Round ${i + 1}`, start: "", end: "" });
                            rounds.forEach((r, i) => { r.name = `Round ${i + 1}`; });
                            return { ...d, rounds };
                          });
                        }} disabled={roundCount >= 10}>+</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Round times ── */}
              {rgRounds.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                    {completed ? "Round times" : "Set times for each round"}
                  </div>
                  {compData.rounds.map((r, i) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                      <div style={{ width: 80, fontWeight: 600, fontSize: 14 }}>Round {i + 1}</div>
                      {completed ? (
                        <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                          {(() => {
                            const fmt = (t) => { if (!t) return "—"; const [h, m] = t.split(":"); const hour = parseInt(h); return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? "PM" : "AM"}`; };
                            return r.start || r.end ? `${fmt(r.start)} – ${fmt(r.end)}` : "No times set";
                          })()}
                        </div>
                      ) : (<>
                        <div className="field" style={{ margin: 0, flex: "1 1 100px" }}>
                          <label className="label">Start</label>
                          <input className="input" type="time" value={r.start}
                            onChange={e => onUpdateCompData(d => ({ ...d, rounds: d.rounds.map(rd => rd.id === r.id ? { ...rd, start: e.target.value } : rd) }))} />
                        </div>
                        <div className="field" style={{ margin: 0, flex: "1 1 100px" }}>
                          <label className="label">End</label>
                          <input className="input" type="time" value={r.end}
                            onChange={e => onUpdateCompData(d => ({ ...d, rounds: d.rounds.map(rd => rd.id === r.id ? { ...rd, end: e.target.value } : rd) }))} />
                        </div>
                      </>)}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Assignment status ── */}
              {statusLabel && (
                <>
                  <div style={{ borderTop: "1px solid var(--border)", marginBottom: 14 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: rgRounds.length > 0 && rgActive.length > 0 ? 14 : 0 }}>
                    {statusIcon}
                    <span style={{ fontSize: 13, fontWeight: 550, color: statusColor }}>{statusLabel}</span>
                    {statusSub && (
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 4 }}>{statusSub}</span>
                    )}
                  </div>
                </>
              )}

              {/* ── Per-round breakdown ── */}
              {rgRounds.length > 0 && rgActive.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rgRounds.map((r, ri) => {
                    const inRound = rgActive.filter(g => g.round === r.id);
                    const groups = rgGbr[r.id] || [];
                    const roundOnly = inRound.filter(g => !g.group || !groups.includes(g.group));
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 550, color: "var(--text-secondary)", minWidth: 60, flexShrink: 0 }}>Round {ri + 1}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", flex: 1 }}>
                          {groups.map(gName => {
                            const cnt = inRound.filter(g => g.group === gName).length;
                            return (
                              <span key={gName} style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 500, lineHeight: "18px",
                                ...(cnt > 0
                                  ? { background: "rgba(0,13,255,0.08)", color: "var(--brand-01)" }
                                  : { background: "transparent", border: "1px dashed var(--border)", color: "var(--text-tertiary)" }
                                )
                              }}>
                                {gName}{cnt > 0 ? ` · ${cnt}` : ""}
                              </span>
                            );
                          })}
                          {roundOnly.length > 0 && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 500, lineHeight: "18px",
                              background: "rgba(245,158,11,0.1)", color: "#f59e0b"
                            }}>
                              Round only · {roundOnly.length}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>{inRound.length}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Unassigned callout ── */}
              {rgUnassigned.length > 0 && rgRounds.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginTop: 12, padding: "6px 10px", borderRadius: 8,
                  background: "rgba(245,158,11,0.06)"
                }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11h.01"/></svg>
                  <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 500 }}>
                    {rgUnassigned.length} gymnast{rgUnassigned.length !== 1 ? "s" : ""} not assigned to a round
                  </span>
                </div>
              )}

              {/* ── CTA ── */}
              <div style={{ marginTop: 14, padding: "8px 0 2px" }}>
                <button onClick={onManageRoundsGroups} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 56,
                  background: "var(--brand-01)", color: "var(--text-alternate)", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
                }}>
                  Manage Rotations &amp; Assignments
                </button>
              </div>
              </>)}
            </div>
          );
        })()}

        <div className="card" id="card-documents" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: collapsed.has("documents") ? 0 : undefined, paddingBottom: collapsed.has("documents") ? 0 : undefined, borderBottom: collapsed.has("documents") ? "none" : undefined }}
            onClick={() => toggleCard("documents", true)}>
            <span>Comp Documents</span>
            {chevron("documents")}
          </div>
          {!collapsed.has("documents") && (<>
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
            {docBtn(<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 7h2v2H7zM11 7h2v2h-2zM7 11h2v2H7zM11 11h2v2h-2z"/></svg>, "Public Live Scores QR",
              true,
              () => buildPublicQRPdf(compData, compId),
              undefined,
              <button onClick={async (e) => {
                e.stopPropagation();
                const url = `${origin}/results.html?comp=${compId}`;
                try { await navigator.clipboard.writeText(url); } catch {}
                setCopiedCode("__public__");
                setTimeout(() => setCopiedCode(v => v === "__public__" ? null : v), 2000);
              }} style={{
                padding: "5px 14px", borderRadius: 56, border: "1px solid var(--border)", background: "none",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                color: copiedCode === "__public__" ? "var(--success)" : "var(--text-primary)", whiteSpace: "nowrap"
              }}>
                {copiedCode === "__public__" ? "Copied!" : "Copy Link"}
              </button>
            )}
            {docBtn(<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 7h2v2H7zM11 7h2v2h-2zM7 11h2v2H7zM11 11h2v2h-2z"/></svg>, "Coach View QR",
              true,
              () => buildCoachQRPdf(compData, compId),
              undefined,
              <button onClick={async (e) => {
                e.stopPropagation();
                const url = `${origin}/coach.html?comp=${compId}`;
                try { await navigator.clipboard.writeText(url); } catch {}
                setCopiedCode("__coach__");
                setTimeout(() => setCopiedCode(v => v === "__coach__" ? null : v), 2000);
              }} style={{
                padding: "5px 14px", borderRadius: 56, border: "1px solid var(--border)", background: "none",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                color: copiedCode === "__coach__" ? "var(--success)" : "var(--text-primary)", whiteSpace: "nowrap"
              }}>
                {copiedCode === "__coach__" ? "Copied!" : "Copy Link"}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            PDFs download directly to your device
          </div>
          </>)}
        </div>

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
                : readinessSteps.filter(s => !s.done).map(s => s.label).join(", ") + " — complete these before starting."}
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
                {readinessSteps.filter(s => !s.done).length} step{readinessSteps.filter(s => !s.done).length !== 1 ? "s" : ""} remaining
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
