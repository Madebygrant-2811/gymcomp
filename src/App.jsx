import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import GymCompLogo from "./assets/GymComp-Logo.svg";
import GymCompLogotype from "./assets/Logotype.svg";
import GymCompLogomark from "./assets/Logomark.svg";
import LaptopSignUp from "./assets/Laptop-sign-up.png";

// ── lib imports ──
import { supabaseAuth, supabase, SUPABASE_URL, SUPABASE_KEY } from "./lib/supabase.js";
import { generateId, hashPin, isHashed, todayStr, isFutureOrToday, round2dp, normalizeStr, buildRotations, parseCSV, downloadTemplate } from "./lib/utils.js";
import { denseRank, gymnast_key, scoresToFlat, flatToScoreRows } from "./lib/scoring.js";
import { EVENTS_KEY, events, SYNC_QUEUE_KEY, syncQueue } from "./lib/storage.js";
import { EVENT_STATUSES, statusMeta, APPARATUS_GROUPS, APPARATUS_OPTIONS, APPARATUS_MIGRATE, UK_LEVELS, UK_LEVELS_FLAT, UK_CLUBS } from "./lib/constants.js";
import { migrateApparatus, migrateCompData, migrateScoreKeys, migrateGymnasts } from "./lib/migrate.js";
import { getApparatusIcon, formatDate, formatTime, printDocument, buildAgendaHTML, buildJudgeSheetsHTML, buildAttendanceHTML, buildDiagnosticHTML, buildResultsHTML, exportResultsPDF, exportResultsXLSX, generatePDF } from "./lib/pdf.js";
import { css } from "./lib/styles.js";


// ── shared component imports ──
import ErrorBoundary from "./components/shared/ErrorBoundary.jsx";
import AddressLookup from "./components/shared/AddressLookup.jsx";
import ClubSearch from "./components/shared/ClubSearch.jsx";
import ClubPicker from "./components/shared/ClubPicker.jsx";
import ConfirmModal from "./components/shared/ConfirmModal.jsx";
import QRDisplay from "./components/shared/QRDisplay.jsx";
import SubmissionsDashboardSection from "./components/shared/SubmissionsDashboardSection.jsx";

import Step1_CompDetails from "./components/setup/Step1_CompDetails.jsx";
import Step2_Gymnasts from "./components/setup/Step2_Gymnasts.jsx";


// ============================================================
// PHASE 2 STEP 3 — EXPORTS & DOCUMENTS
// ============================================================
function Phase2_Exports({ compData, gymnasts, scores, onSharePublic, onShareCoach }) {
  const colour = compData.brandColour || "#000dff";
  const hasGymnasts = gymnasts.length > 0;
  const hasScores = Object.keys(scores).length > 0;

  const docs = [
    {
      id: "links",
      title: "Result Links",
      icon: "🔗",
      desc: "Share live result links with parents, coaches and spectators. Links update in real-time as scores are entered.",
      use: "Share during the event so coaches and parents can follow along live.",
      available: hasScores,
      unavailableMsg: "Enter scores in Score Input first.",
      isLinks: true,
    },
    {
      id: "results",
      title: "Results Sheet",
      icon: "🏆",
      desc: "Ranked results per level showing gymnast name, club, score and placing. Medal positions highlighted. Ready to share with clubs post-competition.",
      use: "Email to clubs after the event. Display at the awards ceremony.",
      available: hasScores,
      unavailableMsg: "Enter scores in Score Input to generate results.",
      action: () => printDocument(buildResultsHTML(compData, gymnasts, scores), "gymcomp-results.pdf"),
    },
    {
      id: "diagnostic",
      title: "Gymnast Diagnostic Report",
      icon: "📊",
      desc: "Per-gymnast breakdown comparing Difficulty vs Execution against level peers. Identifies strengths, flags areas for development, and highlights performance patterns across apparatus.",
      use: "Share with coaches post-competition. D/E scoring must be enabled in Setup for full analysis.",
      available: hasScores && !!compData.useDEScoring,
      unavailableMsg: compData.useDEScoring
        ? "Enter D/E scores in Score Input to generate diagnostics."
        : "Enable D/E Scoring in Step 1 → Scoring Settings to use this report.",
      action: () => printDocument(buildDiagnosticHTML(compData, gymnasts, scores), "gymcomp-diagnostic.pdf"),
    },
  ];

  const brandOk = compData.name && compData.organiserName;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Post-Competition <span>Exports</span></div>
        <div className="page-sub">Results and diagnostic reports — generated after scoring is complete</div>
      </div>

      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "var(--muted)" }}>
        ℹ Pre-competition documents (Agenda, Judge Sheets, Attendance List) are available on the <strong style={{ color: "var(--text)" }}>Competition Dashboard</strong> — accessible before you start.
      </div>

      {/* Branding preview */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Branding Preview</div>
        {!brandOk && (
          <div className="warn-box" style={{ marginBottom: 14 }}>
            Complete your organiser name in Step 1 → Competition Details to improve document branding.
          </div>
        )}
        <div style={{
          border: `2px solid ${colour}`, borderRadius: 8, padding: "16px 20px",
          display: "flex", alignItems: "center", gap: 16, background: "#fff"
        }}>
          {compData.logo
            ? <img src={compData.logo} alt="Logo" style={{ height: 52, maxWidth: 120, objectFit: "contain" }} />
            : <div style={{ width: 52, height: 52, borderRadius: 8, background: colour, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏅</div>
          }
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: colour }}>{compData.name || "Competition Name"}</div>
            {compData.organiserName && <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>{compData.organiserName}</div>}
            {(compData.date || compData.venue) && (
              <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
                {compData.date ? formatDate(compData.date) : ""}
                {compData.venue ? ` · ${compData.venue}` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
          To update branding, go to <strong>Step 1 → Organiser Branding</strong>.
        </div>
      </div>

      {/* Document cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {docs.map(doc => (
          <div key={doc.id} className="card" style={{
            opacity: doc.available || doc.coming ? 1 : 0.7,
            position: "relative", overflow: "hidden"
          }}>
            {doc.coming && (
              <div style={{
                position: "absolute", top: 12, right: 12,
                background: "var(--surface2)", color: "var(--muted)",
                fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 4
              }}>Coming soon</div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                background: doc.available && !doc.coming ? `${colour}22` : "var(--surface2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22
              }}>{doc.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{doc.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{doc.desc}</div>
              </div>
            </div>
            <div style={{
              background: "var(--surface2)", borderRadius: 6, padding: "8px 12px",
              fontSize: 11, color: "var(--muted)", lineHeight: 1.4, marginBottom: 14
            }}>
              <strong style={{ color: "var(--text)" }}>When to use:</strong> {doc.use}
            </div>
            {doc.available && !doc.coming && doc.isLinks ? (
              <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                <button className="btn btn-tertiary" style={{ width: "100%" }} onClick={onSharePublic}>
                  Share — Public
                </button>
                <button className="btn btn-tertiary" style={{ width: "100%" }} onClick={onShareCoach}>
                  Share — Coaches
                </button>
              </div>
            ) : doc.available && !doc.coming ? (
              <button
                className="btn btn-primary"
                style={{ width: "100%", background: colour, color: "#fff" }}
                onClick={doc.action}>
                ⬇ Generate PDF
              </button>
            ) : doc.coming ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                Coming in next update
              </button>
            ) : (
              <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                ⚠ {doc.unavailableMsg}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16, background: "rgba(0,13,255,0.03)", borderColor: "rgba(0,13,255,0.12)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>How it works:</strong> Click "Generate PDF" to download a .pdf file directly to your device.
          All documents are automatically branded with your competition name, organiser details, logo and colour.
        </div>
      </div>
    </div>
  );
}


// ============================================================
// PHASE 2 STEP 1 — Score Input (upgraded: sheet tracker + query flags + DNS)
// ============================================================
function Phase2_Step1({ compData, gymnasts, scores, setScores, setStep, onExportPDF, onSharePublic, onShareCoach, isOnline, pendingSyncCount, syncStatus, onRetrySync, onScoreCommit, onScoreDelete, newScoreKeys }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [queryModal, setQueryModal] = useState(null); // { gid, app }
  const [queryNote, setQueryNote] = useState("");
  const [sheetReceived, setSheetReceived] = useState({});
  const [showTracker, setShowTracker] = useState(false);
  const [scoreModal, setScoreModal] = useState(null); // { gid, app, isEdit }
  const [searchQuery, setSearchQuery] = useState("");
  const [modalFields, setModalFields] = useState({});
  const [modalBufs, setModalBufs] = useState({});
  const [modalPristine, setModalPristine] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { gid, app }
  const fig = !!compData.useDEScoring;

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

  // ── Key helpers ──────────────────────────────────────────
  const baseKey = (gid, app) => gymnast_key(activeRound, gid, app);
  const subKey  = (gid, app, sub) => `${baseKey(gid, app)}__${sub}`;
  const queryKey = (gid, app) => `${baseKey(gid, app)}__query`;
  const queryNoteKey = (gid, app) => `${baseKey(gid, app)}__queryNote`;
  const queryResolvedKey = (gid, app) => `${baseKey(gid, app)}__queryResolved`;

  // ── Judge counts ─────────────────────────────────────────
  const judgeCount = (app) =>
    (compData.judges || []).filter(j => j.apparatus === app).length;

  // ── Total recalculation ──────────────────────────────────
  const recalcTotal = (next, gid, app) => {
    if (!fig) return;
    const dv    = parseFloat(next[subKey(gid, app, "dv")])  || 0;
    const bonus = parseFloat(next[subKey(gid, app, "bon")]) || 0;
    const pen   = parseFloat(next[subKey(gid, app, "pen")]) || 0;
    const n = judgeCount(app);
    let eSum = 0, eCount = 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(next[subKey(gid, app, `e${i}`)]);
      if (!isNaN(v)) { eSum += (10 - v); eCount++; }
    }
    const eAvg    = eCount > 0 ? eSum / eCount : 0;
    const hasAny  = dv > 0 || bonus > 0 || eAvg > 0;
    const total   = hasAny ? Math.max(0, dv + bonus + eAvg - pen) : 0;
    next[baseKey(gid, app)] = hasAny ? String(parseFloat(total.toFixed(3))) : "";
  };

  const commitField = (gid, app, sub, raw) => {
    const rounded = round2dp(raw);
    const val = rounded === "" ? "" : rounded;
    if (fig) {
      setScores(s => {
        const n = { ...s, [sub ? subKey(gid, app, sub) : baseKey(gid, app)]: val };
        recalcTotal(n, gid, app);
        return n;
      });
    } else {
      setScores(s => ({ ...s, [baseKey(gid, app)]: val }));
      // Push non-FIG score immediately
      if (onScoreCommit && val) {
        onScoreCommit(activeRound, gid, app, { [baseKey(gid, app)]: val });
      }
    }
  };

  const readVal = (gid, app, sub) =>
    scores[sub ? subKey(gid, app, sub) : baseKey(gid, app)] ?? "";

  const getEAvg = (gid, app) => {
    const n = judgeCount(app);
    let sum = 0, count = 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(scores[subKey(gid, app, `e${i}`)]);
      if (!isNaN(v)) { sum += (10 - v); count++; }
    }
    return count > 0 ? sum / count : null;
  };
  const getPenaltyTotal = (gid, app) =>
    parseFloat(scores[subKey(gid, app, "pen")]) || 0;
  const getAppTotal = (gid, app) => parseFloat(scores[baseKey(gid, app)]) || 0;
  const getGymnastTotal = (gid) =>
    compData.apparatus.reduce((s, a) => s + getAppTotal(gid, a), 0);

  // ── Query helpers ────────────────────────────────────────
  const isQueried = (gid, app) => !!scores[queryKey(gid, app)];
  const isResolved = (gid, app) => !!scores[queryResolvedKey(gid, app)];
  const getQueryNote = (gid, app) => scores[queryNoteKey(gid, app)] || "";

  const openQueryModal = (gid, app) => {
    setQueryModal({ gid, app });
    setQueryNote(getQueryNote(gid, app));
  };

  const saveQuery = () => {
    const { gid, app } = queryModal;
    setScores(s => ({
      ...s,
      [queryKey(gid, app)]: "1",
      [queryNoteKey(gid, app)]: queryNote,
      [queryResolvedKey(gid, app)]: "",
    }));
    setQueryModal(null);
  };

  const resolveQuery = (gid, app) => {
    setScores(s => ({
      ...s,
      [queryKey(gid, app)]: "",
      [queryResolvedKey(gid, app)]: "",
    }));
  };

  // ── Sheet received tracker (per group × apparatus) ──────
  const toggleSheet = (roundId, groupKey, apparatus) => {
    const k = `${groupKey}__${apparatus}`;
    setSheetReceived(prev => ({
      ...prev,
      [roundId]: { ...(prev[roundId] || {}), [k]: !(prev[roundId]?.[k]) }
    }));
  };

  const isSheetIn = (roundId, groupKey, apparatus) =>
    !!sheetReceived[roundId]?.[`${groupKey}__${apparatus}`];

  // ── Group gymnasts ───────────────────────────────────────
  const roundGymnasts = gymnasts.filter(g => g.round === activeRound);

  // Unfiltered groups for sheet tracker
  const allGroups = [];
  const allGrouped = {};
  roundGymnasts.forEach(g => {
    const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level;
    const grp = g.group || "\u2014";
    const key = `${levelName}__${grp}`;
    if (!allGrouped[key]) {
      allGrouped[key] = true;
      allGroups.push({ key, level: levelName, group: grp });
    }
  });
  const appCount = (compData.apparatus || []).length;
  const totalSheets = allGroups.length * appCount;
  const sheetsIn = (roundId) => {
    const rd = sheetReceived[roundId] || {};
    return Object.values(rd).filter(Boolean).length;
  };
  const filteredGymnasts = searchQuery.trim()
    ? roundGymnasts.filter(g => {
        const q = searchQuery.toLowerCase();
        return (g.name || "").toLowerCase().includes(q)
          || (g.number || "").toString().toLowerCase().includes(q)
          || (g.club || "").toLowerCase().includes(q);
      })
    : roundGymnasts;

  const grouped = {};
  filteredGymnasts.forEach(g => {
    const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level;
    if (!grouped[levelName]) grouped[levelName] = {};
    const grp = g.group || "\u2014";
    if (!grouped[levelName][grp]) grouped[levelName][grp] = [];
    grouped[levelName][grp].push(g);
  });

  // ── Score Modal helpers ──────────────────────────────────
  const openScoreModal = (gid, app, isEdit) => {
    const fields = {};
    const bufs = {};
    const toBuf = (v) => { const n = parseFloat(v); return (!v || isNaN(n) || n === 0) ? "" : n.toFixed(2); };
    if (fig) {
      fields.app = app;
      for (const sub of ["dv", "bon", "pen"]) {
        const v = readVal(gid, app, sub);
        fields[sub] = v;
        bufs[sub] = toBuf(v);
      }
      const n = judgeCount(app);
      for (let i = 1; i <= Math.max(n, 1); i++) {
        const v = readVal(gid, app, `e${i}`);
        fields[`e${i}`] = v;
        bufs[`e${i}`] = toBuf(v);
      }
    } else {
      fields.app = app;
      const v = readVal(gid, app, null);
      fields.score = v;
      bufs.score = toBuf(v);
    }
    setModalFields(fields);
    setModalBufs(bufs);
    // Mark fields with existing values as pristine — first keystroke clears them
    const pristine = {};
    for (const k in bufs) if (bufs[k]) pristine[k] = true;
    setModalPristine(pristine);
    setScoreModal({ gid, app, isEdit });
  };

  const calcModalTotal = () => {
    if (!fig) return parseFloat(modalFields.score) || 0;
    const dv = parseFloat(modalFields.dv) || 0;
    const bonus = parseFloat(modalFields.bon) || 0;
    const app = scoreModal?.app || "";
    const n = judgeCount(app);
    let eSum = 0, eCount = 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(modalFields[`e${i}`]);
      if (!isNaN(v)) { eSum += (10 - v); eCount++; }
    }
    const eAvg = eCount > 0 ? eSum / eCount : 0;
    const penalty = parseFloat(modalFields.pen) || 0;
    const hasAny = dv > 0 || bonus > 0 || eAvg > 0;
    return hasAny ? Math.max(0, dv + bonus + eAvg - penalty) : 0;
  };

  const submitScoreModal = () => {
    const { gid, app } = scoreModal;
    if (fig) {
      setScores(s => {
        const next = { ...s };
        next[subKey(gid, app, "dv")] = round2dp(modalFields.dv);
        next[subKey(gid, app, "bon")] = round2dp(modalFields.bon);
        const n = judgeCount(app);
        for (let i = 1; i <= Math.max(n, 1); i++) next[subKey(gid, app, `e${i}`)] = round2dp(modalFields[`e${i}`]);
        next[subKey(gid, app, "pen")] = round2dp(modalFields.pen);
        recalcTotal(next, gid, app);
        return next;
      });
    } else {
      const val = round2dp(modalFields.score);
      setScores(s => ({ ...s, [baseKey(gid, app)]: val }));
    }
    // Push to scores table (fire-and-forget)
    if (onScoreCommit) {
      const bk = baseKey(gid, app);
      const flatSubset = {};
      if (fig) {
        flatSubset[bk] = ""; // will be recalculated; we need the sub-keys
        flatSubset[`${bk}__dv`] = round2dp(modalFields.dv);
        flatSubset[`${bk}__bon`] = round2dp(modalFields.bon);
        flatSubset[`${bk}__pen`] = round2dp(modalFields.pen);
        const n = judgeCount(app);
        for (let i = 1; i <= Math.max(n, 1); i++) flatSubset[`${bk}__e${i}`] = round2dp(modalFields[`e${i}`]);
        // Compute final for the table row
        const dv = parseFloat(round2dp(modalFields.dv)) || 0;
        const bon = parseFloat(round2dp(modalFields.bon)) || 0;
        const pen = parseFloat(round2dp(modalFields.pen)) || 0;
        let eSum = 0, eCount = 0;
        for (let i = 1; i <= Math.max(n, 1); i++) {
          const v = parseFloat(round2dp(modalFields[`e${i}`]));
          if (!isNaN(v)) { eSum += (10 - v); eCount++; }
        }
        const eAvg = eCount > 0 ? eSum / eCount : 0;
        const hasAny = dv > 0 || bon > 0 || eAvg > 0;
        flatSubset[bk] = hasAny ? String(parseFloat(Math.max(0, dv + bon + eAvg - pen).toFixed(3))) : "";
      } else {
        flatSubset[bk] = round2dp(modalFields.score);
      }
      onScoreCommit(activeRound, gid, app, flatSubset);
    }
    setScoreModal(null);
  };

  const deleteScore = (gid, app) => {
    setScores(s => {
      const next = { ...s };
      delete next[baseKey(gid, app)];
      if (fig) {
        for (const sub of ["dv","bon","pen"]) delete next[subKey(gid, app, sub)];
        const n = judgeCount(app);
        for (let i = 1; i <= Math.max(n, 1); i++) delete next[subKey(gid, app, `e${i}`)];
      }
      return next;
    });
    if (onScoreDelete) onScoreDelete(activeRound, gid, app);
    setScoreModal(null);
    setDeleteConfirm(null);
  };

  const mf = (field, val) => setModalFields(f => ({ ...f, [field]: val }));
  const mb = (field, val) => setModalBufs(b => ({ ...b, [field]: val }));

  // Auto-decimal helpers: type digits (implied .XX) or press "." to place decimal explicitly
  const bufToVal = (b) => {
    if (!b || b === ".") return 0;
    if (b.includes(".")) return parseFloat(b) || 0;
    return parseInt(b, 10) / 100;
  };

  const scoreDisplay = (field) => {
    const buf = modalBufs[field] || "";
    if (!buf) return "";
    return bufToVal(buf).toFixed(2);
  };

  const processKey = (field, max, key) => {
    let buf = modalBufs[field] || "";

    if (key === "Backspace") {
      if (modalPristine[field]) {
        setModalPristine(p => ({ ...p, [field]: false }));
        mb(field, "");
        mf(field, "");
        return;
      }
      const next = buf.slice(0, -1);
      mb(field, next);
      const v = bufToVal(next);
      mf(field, v === 0 ? "" : v.toFixed(2));
      return;
    }

    if (modalPristine[field] && (/^\d$/.test(key) || key === ".")) {
      setModalPristine(p => ({ ...p, [field]: false }));
      buf = "";
    }

    if (key === ".") {
      if (buf.includes(".")) return;
      const next = (buf || "0") + ".";
      mb(field, next);
      const v = bufToVal(next);
      mf(field, v === 0 ? "" : v.toFixed(2));
      return;
    }

    if (!/^\d$/.test(key)) return;

    if (buf.includes(".")) {
      const afterDot = buf.split(".")[1] || "";
      if (afterDot.length >= 2) return;
    }

    const next = buf + key;
    const v = bufToVal(next);
    if (max !== undefined && v > max) return;
    mb(field, next);
    mf(field, v === 0 ? "" : v.toFixed(2));
  };

  const handleScoreKey = (field, max) => (e) => {
    if (e.key === "Enter") { submitScoreModal(); return; }
    if (e.key === "Tab" || e.key === "Escape") return;
    e.preventDefault();
    processKey(field, max, e.key);
  };

  // Mobile: capture input from soft keyboard via beforeinput
  const handleBeforeInput = (field, max) => (e) => {
    e.preventDefault();
    const chars = e.data || "";
    for (const ch of chars) processKey(field, max, ch);
  };

  const scoreInput = (field, max, autoFocus, large) => (
    <input className="score-input" type="text" inputMode="decimal"
      value={scoreDisplay(field)}
      style={{ caretColor: "transparent", ...(large ? { width: "100%", fontSize: 20, padding: "14px 20px", fontWeight: 700, textAlign: "center", borderRadius: 12 } : {}) }}
      onChange={() => {}}
      onFocus={() => { if (modalBufs[field]) setModalPristine(p => ({ ...p, [field]: true })); }}
      onKeyDown={handleScoreKey(field, max)}
      onBeforeInput={handleBeforeInput(field, max)}
      autoFocus={autoFocus} />
  );

  return (
    <div>
      {/* ── Topbar ── */}
      <div className={`setup-topbar${topbarHidden ? " topbar-hidden" : ""}`} style={{ margin: "0 24px" }}>
        <div className="setup-topbar-left">
          {compData.logo
            ? <img src={compData.logo} alt="" style={{ height: 28, maxWidth: 80, objectFit: "contain", borderRadius: 4, flexShrink: 0 }} />
            : <img src={GymCompLogomark} alt="GymComp" style={{ height: 22, flexShrink: 0, filter: "brightness(0) invert(1)", opacity: 0.9 }} />
          }
          {compData.name && <span className="setup-topbar-name">{compData.name}</span>}
          {compData.date && <span className="setup-topbar-meta">{new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          {compData.venue && <span className="setup-topbar-meta">{compData.venue}</span>}
          {!compData.name && <span className="setup-topbar-name" style={{ opacity: 0.6 }}>Score Input</span>}
        </div>
        <div className="setup-topbar-right">
          {fig && <span className="setup-topbar-sync">FIG Scoring</span>}
          {isOnline === false && (
            <span className="setup-topbar-sync" style={{ color: "#fbbf24" }}>Offline — saved locally</span>
          )}
          {isOnline !== false && pendingSyncCount > 0 && syncStatus === "pending" && (
            <button className="setup-topbar-sync" onClick={onRetrySync}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 48, padding: "3px 10px", cursor: "pointer", color: "#fbbf24" }}>
              {pendingSyncCount} pending — retry
            </button>
          )}
          {isOnline !== false && syncStatus === "saved" && (
            <span className="setup-topbar-sync" style={{ color: "rgba(255,255,255,0.7)" }}>Saved</span>
          )}
          {isOnline !== false && syncStatus === "saving" && (
            <span className="setup-topbar-sync" style={{ color: "rgba(255,255,255,0.5)" }}>Saving…</span>
          )}
          {onSharePublic && (
            <button className="btn btn-sm" onClick={onSharePublic}
              style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.25)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.5)" }}>
              Share Live Scores — Public
            </button>
          )}
          {onShareCoach && (
            <button className="btn btn-sm" onClick={onShareCoach}
              style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.25)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.5)" }}>
              Share Live Scores — Coaches
            </button>
          )}
        </div>
      </div>

      <div className="si-body" style={{ marginTop: 24 }}>
        {/* ── Sheet Received Tracker ─────────────────────────── */}
        {allGroups.length > 0 && appCount > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="page-title" style={{ fontSize: 22 }}>Sheet Tracker</div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {sheetsIn(activeRound)} of {totalSheets} received
                </span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTracker(v => !v)}>
                {showTracker ? "Hide" : "Show"}
              </button>
            </div>
            {showTracker && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      {(compData.apparatus || []).map(a => <th key={a} style={{ textAlign: "center" }}>{getApparatusIcon(a)} {a}</th>)}
                      <th style={{ textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allGroups.map(({ key, level, group }) => {
                      const groupDone = (compData.apparatus || []).every(a => isSheetIn(activeRound, key, a));
                      const groupCount = (compData.apparatus || []).filter(a => isSheetIn(activeRound, key, a)).length;
                      return (
                        <tr key={key}>
                          <td style={{ fontWeight: 600, fontSize: 12 }}>{level} · {group}</td>
                          {(compData.apparatus || []).map(app => {
                            const received = isSheetIn(activeRound, key, app);
                            return (
                              <td key={app} style={{ textAlign: "center", padding: "6px 8px" }}>
                                <button onClick={() => toggleSheet(activeRound, key, app)}
                                  style={{
                                    width: 28, height: 24, borderRadius: 4, border: "none", cursor: "pointer",
                                    background: received ? "var(--success)" : "var(--surface2)",
                                    color: received ? "#fff" : "var(--muted)",
                                    fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                                    display: "inline-flex", alignItems: "center", justifyContent: "center"
                                  }}>
                                  {received ? "\u2713" : ""}
                                </button>
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "center", fontSize: 11, fontWeight: 600, padding: "6px 8px", color: groupDone ? "var(--success)" : "var(--muted)" }}>
                            {groupDone ? "Complete" : `${groupCount}/${appCount}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="page-title" style={{ fontSize: 22, marginBottom: 16 }}>Scores</div>

        {/* ── Search + Round Tabs ── */}
        <div className="si-toolbar">
          <input
            className="input si-search"
            type="text"
            placeholder="Search by name, number, or club..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ marginBottom: 0 }}
          />
          <div className="tabs">
            {compData.rounds.map(r => (
              <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
                onClick={() => setActiveRound(r.id)}>{r.name}</button>
            ))}
          </div>
        </div>

        {Object.keys(grouped).length === 0 && <div className="empty">{searchQuery ? "No gymnasts match your search" : "No gymnasts in this round"}</div>}

        {/* ── Grouped Tables ── */}
        {Object.entries(grouped).map(([level, groups]) => (
          <div key={level}>
            <div className="group-header">
              <span className="group-label">{level}</span>
              <div className="group-line" />
            </div>
            {Object.entries(groups).map(([grp, glist]) => (
              <div key={grp} style={{ marginBottom: 24 }}>
                <div className="sub-group-label">{grp}</div>
                <div className="table-wrap">
                  <table className="si-table" style={{ minWidth: 388 + compData.apparatus.length * 100 + 140 }}>
                    <colgroup>
                      <col className="si-col-num" />
                      <col className="si-col-name" />
                      <col className="si-col-club" />
                      <col className="si-col-age" />
                      {compData.apparatus.map(a => <col key={a} className="si-col-app" />)}
                      <col className="si-col-total" />
                      <col className="si-col-flag" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Gymnast</th>
                        <th>Club</th>
                        <th>Age</th>
                        {compData.apparatus.map(a => <th key={a}>{getApparatusIcon(a)} {a}</th>)}
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {glist.map(g => {
                        const gymTotal = getGymnastTotal(g.id);
                        const isDns = !!g.dns;
                        const hasQuery = compData.apparatus.some(a => isQueried(g.id, a));
                        return (
                          <tr key={g.id} style={{ opacity: isDns ? 0.45 : 1 }}>
                            <td style={{ color: "var(--muted)", fontWeight: 600 }}>{g.number}</td>
                            <td>
                              <strong style={{ textDecoration: isDns ? "line-through" : "none" }}>{g.name}</strong>
                              {isDns && <span style={{ display: "block", fontSize: 9, color: "var(--danger)", fontWeight: 700, letterSpacing: 0.5 }}>DNS</span>}
                            </td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.club}</td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.age || "\u2014"}</td>
                            {compData.apparatus.map(a => {
                              const appScore = getAppTotal(g.id, a);
                              const queried = isQueried(g.id, a);
                              const flashBk = baseKey(g.id, a);
                              const isFlashing = newScoreKeys && newScoreKeys.has(flashBk);
                              return (
                                <td key={a} className={isFlashing ? "score-flash" : ""}>
                                  {isDns ? (
                                    <span style={{ color: "var(--muted)" }}>\u2014</span>
                                  ) : appScore > 0 ? (
                                    <div className="si-score-cell">
                                      <span className="si-score-val si-score-clickable" style={{ color: queried ? "#f0ad4e" : undefined }}
                                        title="Click to edit score"
                                        onClick={() => openScoreModal(g.id, a, true)}>
                                        {fig ? appScore.toFixed(3) : appScore.toFixed(2)}
                                      </span>
                                    </div>
                                  ) : (
                                    <button className="si-add-btn" onClick={() => openScoreModal(g.id, a, false)}>+ Add</button>
                                  )}
                                </td>
                              );
                            })}
                            <td>
                              <strong style={{ color: gymTotal > 0 ? "var(--accent)" : "var(--muted)", fontSize: 14 }}>
                                {gymTotal > 0 ? (fig ? gymTotal.toFixed(3) : gymTotal.toFixed(2)) : "\u2014"}
                              </strong>
                            </td>
                            <td>
                              {!isDns && (
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    fontSize: 10, padding: "3px 8px",
                                    background: hasQuery ? "rgba(240,173,78,0.15)" : "var(--surface2)",
                                    color: hasQuery ? "#f0ad4e" : "var(--muted)",
                                    border: `1px solid ${hasQuery ? "rgba(240,173,78,0.4)" : "var(--border)"}`,
                                    borderRadius: 4, cursor: "pointer"
                                  }}
                                  onClick={() => {
                                    const firstApp = compData.apparatus[0];
                                    if (hasQuery) resolveQuery(g.id, firstApp);
                                    else openQueryModal(g.id, firstApp);
                                  }}>
                                  {hasQuery ? "Clear" : "Flag"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Score Modal ── */}
      {scoreModal && (() => {
        const g = gymnasts.find(x => x.id === scoreModal.gid);
        if (!g) return null;
        const modalTotal = calcModalTotal();
        const n = judgeCount(scoreModal.app);
        return createPortal(
          <div className="modal-backdrop" onClick={() => setScoreModal(null)}>
            <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{scoreModal.isEdit ? "Edit Score" : "Add Score"}</div>
                <button className="btn-icon" onClick={() => setScoreModal(null)} style={{ borderColor: "var(--border)", color: "var(--muted)" }}>×</button>
              </div>

              <div className="si-modal-readonly">
                <strong style={{ fontSize: 18 }}>#{g.number}</strong>
                <span>{g.name}</span>
                {g.club && <span style={{ marginLeft: "auto" }}>{g.club}</span>}
              </div>

              <div className="field">
                <label className="label">Apparatus</label>
                <div className="input" style={{ cursor: "default", background: "var(--surface2)", color: "var(--text)", fontWeight: 600 }}>
                  {getApparatusIcon(scoreModal.app)} {scoreModal.app}
                </div>
              </div>

              {fig ? (
                <>
                  <div className="si-modal-fields">
                    <div className="si-modal-field">
                      <label>D Score</label>
                      {scoreInput("dv", 10, true)}
                    </div>
                    <div className="si-modal-field">
                      <label>Bonus</label>
                      {scoreInput("bon", 2)}
                    </div>
                    <div className="si-modal-field">
                      <label>Penalty</label>
                      {scoreInput("pen", 10)}
                    </div>
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 6 }}>
                    E Score {n > 0 ? `(${n} Judge${n !== 1 ? "s" : ""})` : ""}{n === 0 && <span style={{ color: "#f0ad4e" }}> (none configured)</span>}
                  </div>
                  <div className="si-modal-fields">
                    {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                      <div className="si-modal-field" key={i}>
                        <label>Judge {i + 1}</label>
                        {scoreInput(`e${i + 1}`, 10)}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5, fontStyle: "italic" }}>
                    Enter deductions — subtracted from 10 (e.g. 2.50 = E score of 7.50)
                  </div>
                </>
              ) : (
                <div className="field">
                  <label className="label">Score</label>
                  {scoreInput("score", 99, true, true)}
                </div>
              )}

              <div className="si-modal-total">
                {modalTotal > 0 ? (fig ? modalTotal.toFixed(3) : modalTotal.toFixed(2)) : "\u2014"}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                {scoreModal.isEdit && (
                  <button className="btn-icon" style={{ marginRight: "auto", color: "var(--danger)", borderColor: "var(--danger)" }}
                    title="Delete Score"
                    onClick={() => setDeleteConfirm({ gid: scoreModal.gid, app: scoreModal.app })}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M6.67 7.33v4M9.33 7.33v4"/><path d="M3.33 4l.67 9.33a1.33 1.33 0 001.33 1.34h5.34a1.33 1.33 0 001.33-1.34L12.67 4"/></svg>
                  </button>
                )}
                <button className="btn btn-primary" onClick={submitScoreModal}>
                  {scoreModal.isEdit ? "Update Score" : "Submit Score"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && createPortal(
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Delete Score?</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              This will remove the {deleteConfirm.app} score for {gymnasts.find(x => x.id === deleteConfirm.gid)?.name || "this gymnast"}. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteScore(deleteConfirm.gid, deleteConfirm.app)}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Query Modal ── */}
      {queryModal && createPortal(
        <div className="modal-backdrop" onClick={() => setQueryModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Flag Coach Query</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              {gymnasts.find(g => g.id === queryModal.gid)?.name} \u00B7 {queryModal.app}
            </div>
            <label className="label">Note (optional)</label>
            <input
              className="input"
              placeholder="e.g. Coach disputes E score"
              value={queryNote}
              onChange={e => setQueryNote(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveQuery()}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setQueryModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveQuery}>Flag Query</button>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
              Flagged scores show as "Under Review" on the coach live view until cleared.
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============================================================
// PHASE 2 STEP 2 — Results
// ============================================================
function Phase2_Step2({ compData, gymnasts, scores, onComplete }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("apparatus");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");

  const roundGymnasts = gymnasts.filter(g => g.round === activeRound);

  // Unique levels in this round
  const uniqueLevels = [...new Set(roundGymnasts.map(g => {
    const lo = compData.levels.find(l => l.id === g.level);
    return lo?.name || "Unknown";
  }))].sort();

  // Check if selected level uses level+age ranking
  const selectedLevelObj = levelFilter !== "all" ? compData.levels.find(l => l.name === levelFilter) : null;
  const showAgeFilter = selectedLevelObj && selectedLevelObj.rankBy === "level+age";

  // Unique ages for the selected level
  const uniqueAges = showAgeFilter
    ? [...new Set(roundGymnasts.filter(g => {
        const lo = compData.levels.find(l => l.id === g.level);
        return (lo?.name || "Unknown") === levelFilter;
      }).map(g => g.age || "Unknown age"))].sort()
    : [];

  // Reset age filter when level changes to one without age ranking
  React.useEffect(() => {
    if (!showAgeFilter) setAgeFilter("all");
  }, [showAgeFilter]);

  const getScore = (gid, apparatus) => {
    const v = parseFloat(scores[gymnast_key(activeRound, gid, apparatus)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (gid) => compData.apparatus.reduce((s, a) => s + getScore(gid, a), 0);

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
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));
  };

  const allRankGroups = buildRankGroups();
  const rankGroups = allRankGroups.filter(rg => {
    if (levelFilter !== "all" && rg.levelName !== levelFilter) return false;
    if (ageFilter !== "all" && rg.ageLabel !== ageFilter) return false;
    return true;
  });

  // ── Hide-on-scroll topbar ──
  const [topbarHidden, setTopbarHidden] = useState(false);
  React.useEffect(() => {
    const el = document.querySelector(".app-main");
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => { const t = el.scrollTop; setTopbarHidden(t > 60); last = t; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const rankBadge = (rank) => {
    if (rank === null) return <span className="badge" style={{ background: "rgba(107,107,133,0.15)", color: "var(--muted)" }}>DNS</span>;
    if (rank === 1) return <span className="badge badge-gold">🥇 1st</span>;
    if (rank === 2) return <span className="badge badge-silver">🥈 2nd</span>;
    if (rank === 3) return <span className="badge badge-bronze">🥉 3rd</span>;
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
          <button className="btn btn-secondary btn-sm" onClick={() => exportResultsXLSX(compData, gymnasts, scores)}>Export Spreadsheet</button>
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
              onClick={() => setActiveRound(r.id)}>{r.name}</button>
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
                {compData.apparatus.map(apparatus => {
                  const withScores = glist.map(g => ({ ...g, score: getScore(g.id, apparatus) }));
                  const ranked = denseRank(withScores.filter(g => g.score > 0 && !g.dns), "score");
                  const dns = withScores.filter(g => g.score === 0 || g.dns);
                  return (
                    <div key={apparatus} style={{ marginBottom: 24 }}>
                      <div className="sub-group-label">{apparatus}</div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th><th>Score</th></tr>
                          </thead>
                          <tbody>
                            {ranked.map(g => (
                              <tr key={g.id}>
                                <td>{rankBadge(g.rank)}</td>
                                <td style={{ color: "var(--muted)" }}>{g.number}</td>
                                <td style={{ fontWeight: 500 }}>{g.name}</td>
                                <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                                <td><strong>{g.score.toFixed(2)}</strong></td>
                              </tr>
                            ))}
                            {dns.map(g => (
                              <tr key={g.id} style={{ opacity: 0.45 }}>
                                <td>{rankBadge(null)}</td>
                                <td style={{ color: "var(--muted)" }}>{g.number}</td>
                                <td style={{ fontWeight: 500 }}>{g.name}</td>
                                <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
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
            const ranked = denseRank(withTotals.filter(g => g.total > 0 && !g.dns), "total");
            const dns = withTotals.filter(g => g.total === 0 || g.dns);
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
                        {compData.apparatus.map(a => <th key={a}>{a}</th>)}
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
                          {compData.apparatus.map(a => (
                            <td key={a} style={{ color: "var(--muted)" }}>
                              {getScore(g.id, a) > 0 ? getScore(g.id, a).toFixed(2) : "—"}
                            </td>
                          ))}
                          <td><strong style={{ color: "var(--accent)" }}>{g.total.toFixed(2)}</strong></td>
                        </tr>
                      ))}
                      {dns.map(g => (
                        <tr key={g.id} style={{ opacity: 0.45 }}>
                          <td>{rankBadge(null)}</td>
                          <td style={{ color: "var(--muted)" }}>{g.number}</td>
                          <td style={{ fontWeight: 500 }}>{g.name}</td>
                          <td style={{ fontWeight: 500, color: "var(--muted)" }}>{g.club}</td>
                          {compData.apparatus.map(a => <td key={a} style={{ color: "var(--muted)" }}>—</td>)}
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
          message="Are you sure you want to complete this competition? The event status will change to Completed."
          confirmLabel="Complete"
          onConfirm={() => { setShowCompleteConfirm(false); onComplete(); }}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

// ============================================================
// AUTH SCREEN — Google OAuth + Magic Link (replaces LoginScreen + RegisterScreen)
// ============================================================
function AuthScreen({ onResume }) {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showJudgePin, setShowJudgePin] = useState(false);

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    const { error: err } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) { setError(err.message); setLoading(false); }
  };

  const handleMagicLink = async () => {
    setError("");
    const trimmed = email.trim();
    if (!trimmed) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Please enter a valid email address."); return; }
    setLoading(true);
    const { error: err } = await supabaseAuth.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  const googleIconUrl = "https://www.figma.com/api/mcp/asset/ecdc4d55-f8d8-4a06-ae78-791219f31494";
  const heroImageUrl = "https://www.figma.com/api/mcp/asset/aaec2cb4-9483-4034-9b9a-89218ba8373d";
  const heroImage2Url = LaptopSignUp;

  /* ── Shared form elements ── */
  const googleBtn = (
    <button
      onClick={handleGoogle}
      disabled={loading}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        gap: 10, padding: "12px 21px", border: "1px solid var(--brand-01)", borderRadius: 72,
        background: "#fff", cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16,
        color: "#050505", letterSpacing: "0.3px",
      }}
    >
      <img src={googleIconUrl} alt="" width={16} height={16} style={{ flexShrink: 0 }} />
      Continue with Google
    </button>
  );

  const divider = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>or sign in with email</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  const emailInput = (
    <input
      type="email"
      placeholder="your@email.com"
      value={email}
      onChange={e => setEmail(e.target.value)}
      onKeyDown={e => e.key === "Enter" && handleMagicLink()}
      autoFocus
      style={{
        width: "100%", boxSizing: "border-box", background: "#fff",
        border: "1px solid var(--border)", borderRadius: 72, padding: "12px 24px",
        fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-primary)",
        outline: "none",
      }}
    />
  );

  const sendBtn = (
    <button
      onClick={handleMagicLink}
      disabled={loading}
      style={{
        width: "100%", background: "var(--brand-01)", border: "none", borderRadius: 72,
        padding: "12px 16px", fontFamily: "var(--font-display)", fontWeight: 400,
        fontSize: 16, color: "var(--text-alternate)", textAlign: "center",
        letterSpacing: "0.3px", cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Sending…" : "Send sign-in link →"}
    </button>
  );

  const judgeCard = (
    <div
      onClick={() => setShowJudgePin(true)}
      style={{
        width: "100%", border: "1px solid var(--border)", borderRadius: 16,
        padding: "12px 24px", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", boxSizing: "border-box", cursor: "pointer",
      }}
    >
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 14, color: "var(--brand-02)",
        textAlign: "center", letterSpacing: "0.3px",
      }}>
        Enter as Scorer or Judge — PIN access →
      </div>
    </div>
  );

  const footer = (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
      All Rights Reserved 2026 GymComp© · <a href="/privacy" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Privacy Policy</a> · <a href="/terms" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Terms of Service</a>
    </div>
  );

  /* ── "Check your inbox" state ── */
  if (sent) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--background-light)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Saans', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📬</div>
          <div style={{ fontFamily: "'Saans', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--text-primary)", marginBottom: 12 }}>
            Check your inbox
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>
            We sent a sign-in link to{" "}
            <strong style={{ color: "var(--text-primary)" }}>{email}</strong>.<br />
            Click it to continue — no password needed.
          </div>
          <button
            onClick={() => { setSent(false); setLoading(false); }}
            style={{ fontFamily: "'Saans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--brand-01)", background: "var(--background-neutral)", border: "none", padding: "10px 20px", borderRadius: 72, cursor: "pointer", letterSpacing: "0.3px" }}
          >
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

  /* ── DESKTOP (≥768px): two-column split ── */
  /* ── MOBILE (<768px): single column ── */
  return (
    <>
      <style>{`
        .auth-wrapper { position:fixed;inset:0;display:flex;font-family:var(--font-display);background:var(--background-light);--border:#ddd;--background-neutral:#efefef; }
        .auth-left { width:550px;flex-shrink:0;padding:48px;display:flex;flex-direction:column;justify-content:space-between;background:var(--background-light);box-sizing:border-box; }
        .auth-left-logo img { height:25px; }
        .auth-left-middle { display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:363px;padding:0 40px; }
        .auth-left-form { width:100%;display:flex;flex-direction:column;gap:16px; }
        .auth-right { flex:1;padding:24px;min-width:0;height:100%;box-sizing:border-box; }
        .auth-right-inner { background:#000dff;border-radius:32px;overflow:hidden;height:100%;width:100%;position:relative; }
        .auth-right-inner .auth-hero-bg { position:absolute;width:200%;height:200%;top:-80%;left:-25%;max-width:none;pointer-events:none;object-fit:cover; }
        .auth-right-inner .auth-hero-laptop { position:absolute;left:0;top:-2%;width:100%;height:102%;max-width:none;pointer-events:none;object-fit:cover; }

        @media(max-width:767px) {
          .auth-wrapper { flex-direction:column; }
          .auth-left { width:100%;flex-shrink:initial;padding:40px 16px;align-items:center;gap:64px;justify-content:flex-start; }
          .auth-left-middle { height:auto;gap:32px;padding:0; }
          .auth-left-form { width:100%;max-width:396px; }
          .auth-right { display:none; }
        }
      `}</style>
      <div className="auth-wrapper">
        {/* ── Left Panel ── */}
        <div className="auth-left">
          <div className="auth-left-logo">
            <img src={GymCompLogo} alt="GymComp" />
          </div>

          <div className="auth-left-middle">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, color: "var(--text-primary)", lineHeight: 1.1, textAlign: "center", width: "100%" }}>
                Welcome to GymComp
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-secondary)", textAlign: "center", lineHeight: "18px", maxWidth: 200 }}>
                Sign in or sign up for free<br />with your email
              </div>
            </div>
            <div className="auth-left-form">
              {googleBtn}
              {divider}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {emailInput}
                {error && <div style={{ fontSize: 13, color: "#e53e3e", paddingLeft: 24 }}>{error}</div>}
                {sendBtn}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.4, maxWidth: 246, alignSelf: "center" }}>
                By signing up to a free account you agree to the GymComp <a href="/privacy" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Privacy Policy</a> and <a href="/terms" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Terms of Service</a>.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" }}>
            {judgeCard}
            {footer}
          </div>
        </div>

        {/* ── Right Panel (hero image) ── */}
        <div className="auth-right">
          <div className="auth-right-inner">
            <img className="auth-hero-bg" src={heroImageUrl} alt="" />
            <img className="auth-hero-laptop" src={heroImage2Url} alt="" />
          </div>
        </div>
      </div>

      {showJudgePin && (
        <JudgePinModal
          onResume={onResume}
          onClose={() => setShowJudgePin(false)}
        />
      )}
    </>
  );
}

// ============================================================
// ORGANISER DASHBOARD — list of events for logged-in account
// ============================================================
function OrganizerDashboard({ account, onNew, onOpen, onView, onEdit, onDuplicate, statusFilter, setStatusFilter, onFilterCountsChange }) {
  const [myEvents, setMyEvents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [sortBy, setSortBy] = useState("recent");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Guard: track recently-patched comp IDs so syncFromSupabase won't overwrite them before the PATCH lands
  const recentPatches = useRef({});

  const pushStatusToSupabase = async (cid, newStatus) => {
    recentPatches.current[cid] = { status: newStatus, ts: Date.now() };
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) { console.error("[pushStatusToSupabase] no session"); return; }
      const { error } = await supabase.patch("competitions", cid, { status: newStatus }, session.access_token);
      if (error) console.error("[pushStatusToSupabase] failed:", error);
    } catch (e) { console.error("[pushStatusToSupabase] error:", e); }
  };

  const reload = () => {
    const all = events.getForAccount(account.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    setMyEvents(all);
    if (onFilterCountsChange) {
      onFilterCountsChange({
        draft: all.filter(e => e.status === "draft").length,
        active: all.filter(e => e.status === "active").length,
        live: all.filter(e => e.status === "live").length,
        completed: all.filter(e => e.status === "completed").length,
        archived: all.filter(e => e.status === "archived").length,
      });
    }
  };

  const syncFromSupabase = useCallback(() => {
    reload();
    // Clean up expired patch guards (>10s old)
    const now = Date.now();
    Object.keys(recentPatches.current).forEach(k => { if (now - recentPatches.current[k].ts > 10000) delete recentPatches.current[k]; });
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.fetchListForUser(session.access_token, session.user.id).then(({ data: supabaseComps, error }) => {
        if (error) return;
        console.log("[syncFromSupabase] raw rows:", (supabaseComps || []).map(c => ({ id: c.id, status: c.status, keys: Object.keys(c) })));
        const all = events.getAll();
        let changed = false;
        const ownedCompIds = new Set((supabaseComps || []).map(c => c.id));
        const toRemove = all.filter(e => e.accountId === account.id && e.compId && !ownedCompIds.has(e.compId));
        if (toRemove.length > 0) {
          toRemove.forEach(e => { const idx = all.indexOf(e); if (idx !== -1) all.splice(idx, 1); });
          changed = true;
        }
        (supabaseComps || []).forEach(comp => {
          const existing = all.find(e => e.compId === comp.id && e.accountId === account.id);
          const snapshot = comp.data
            ? { compData: comp.data.compData, gymnasts: comp.data.gymnasts }
            : undefined;
          const supaStatus = comp.status || "active";
          if (!existing) {
            console.log("[syncFromSupabase] NEW local event:", comp.id, "supabase status:", comp.status, "→ local status:", supaStatus);
            all.push({ id: generateId(), accountId: account.id, compId: comp.id, status: supaStatus, createdAt: comp.created_at, updatedAt: comp.created_at, snapshot });
            changed = true;
          } else {
            // If this comp was recently patched locally, trust local status over stale Supabase data
            const patch = recentPatches.current[comp.id];
            const useLocalStatus = patch && (Date.now() - patch.ts < 5000);
            const effectiveStatus = useLocalStatus ? patch.status : supaStatus;
            if (useLocalStatus) {
              console.log("[syncFromSupabase] SKIP status overwrite for", comp.id, "— recent patch:", patch.status, "(supabase has:", comp.status, ")");
            }
            const needsUpdate = snapshot || existing.status !== effectiveStatus;
            if (needsUpdate) {
              console.log("[syncFromSupabase] UPDATE:", comp.id, "status:", existing.status, "→", effectiveStatus);
              const idx = all.indexOf(existing);
              all[idx] = { ...existing, ...(snapshot ? { snapshot } : {}), status: effectiveStatus };
              changed = true;
            }
          }
        });
        // Strip snapshots from archived events to save localStorage space
        // (data is always available from Supabase on re-open)
        all.forEach((e, i) => {
          if (e.snapshot && e.status === "archived") {
            all[i] = { ...e }; delete all[i].snapshot;
            changed = true;
          }
        });
        if (changed) { events.save(all); reload(); }
      });
    });
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync on mount
  useEffect(() => { syncFromSupabase(); }, [syncFromSupabase]);

  // Re-sync when tab regains focus (cross-device changes)
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "visible") syncFromSupabase(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncFromSupabase]);

  // Reset select mode when leaving archived filter
  useEffect(() => {
    if (statusFilter !== "archived") {
      setSelectMode(false);
      setSelected(new Set());
    }
  }, [statusFilter]);

  const handleStatusChange = (eventId, newStatus) => {
    events.update(eventId, { status: newStatus });
    const ev = events.getAll().find(e => e.id === eventId);
    if (ev?.compId) pushStatusToSupabase(ev.compId, newStatus);
    reload();
  };

  const handleDelete = (ev) => {
    if (ev.status !== "archived") {
      setArchiveConfirm(ev);
      return;
    }
    setDeleteConfirm(ev);
  };

  const confirmDelete = async () => {
    const ev = deleteConfirm;
    setDeleteConfirm(null);
    if (ev.compId) {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (session) {
        const { error } = await supabase.deleteCompetition(ev.compId, session.access_token);
        if (error) console.error("[confirmDelete] Supabase DELETE failed:", error);
      }
    }
    events.remove(ev.id);
    reload();
  };

  const confirmBulkDelete = async () => {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    for (const id of selected) {
      const ev = myEvents.find(e => e.id === id);
      if (ev?.compId && session) {
        await supabase.deleteCompetition(ev.compId, session.access_token);
      }
      events.remove(id);
    }
    setSelected(new Set());
    setSelectMode(false);
    setBulkDeleteConfirm(false);
    reload();
  };

  const getPublicLink = (ev) => `${window.location.origin}/results.html?comp=${ev.compId}`;

  const copyLink = async (ev) => {
    const link = getPublicLink(ev);
    try { await navigator.clipboard.writeText(link); } catch {}
    setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: true } : e));
    setTimeout(() => setMyEvents(prev => prev.map(e => e.id === ev.id ? { ...e, _copied: false } : e)), 1800);
  };

  const sortEvents = (list) => {
    if (sortBy === "date") {
      return [...list].sort((a, b) => {
        const da = a.snapshot?.compData?.date || "";
        const db = b.snapshot?.compData?.date || "";
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? -1 : da > db ? 1 : 0;
      });
    }
    return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  };

  const filtered = statusFilter === "all"
    ? myEvents.filter(e => e.status !== "archived")
    : myEvents.filter(e => e.status === statusFilter);
  const currentEvents = sortEvents(filtered.filter(e => e.status === "draft" || e.status === "active" || e.status === "live"));
  const completedEvents = sortEvents(filtered.filter(e => e.status === "completed"));

  const firstName = (account.name || account.email?.split("@")[0] || "").split(" ")[0];

  // Left border + dot colours per status
  const statusConfig = {
    draft:     { border: "#f59e0b", dot: "#f59e0b" },
    active:    { border: "var(--brand-01)", dot: "var(--brand-01)" },
    live:      { border: "#22c55e", dot: "#22c55e" },
    completed: { border: "#15803d", dot: "#15803d" },
    archived:  { border: "#acacac", dot: "#acacac" },
  };

  const sidebarFilters = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "live", label: "Live" },
    { value: "completed", label: "Complete" },
    { value: "archived", label: "Archived" },
  ];

  const countFor = (status) => myEvents.filter(e => e.status === status).length;

  const renderCard = (ev) => {
    const cd = ev.snapshot?.compData || {};
    const sc = statusConfig[ev.status] || statusConfig.draft;
    const gymnasts = ev.snapshot?.gymnasts || [];
    const clubs = cd.clubs || [];
    const isCompleted = ev.status === "completed" || ev.status === "archived";

    const isArchived = ev.status === "archived";
    const isDraft = ev.status === "draft";
    const isSelectable = selectMode && isArchived;
    const isSelected = isSelectable && selected.has(ev.id);

    const toggleSelect = () => {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(ev.id)) next.delete(ev.id);
        else next.add(ev.id);
        return next;
      });
    };

    return (
      <div key={ev.id} className="od-card-wrap">
        <div
          className={`od-card${isDraft ? " od-card-draft" : ""}${isSelected ? " od-card-selected" : ""}`}
          style={{ borderLeftColor: isSelected ? "var(--brand-01)" : sc.border, position: "relative", cursor: isSelectable ? "pointer" : undefined }}
          onClick={isSelectable ? toggleSelect : undefined}
        >
          {/* Selection checkbox */}
          {isSelectable && (
            <div className="od-select-check" style={{ background: isSelected ? "var(--brand-01)" : "transparent", borderColor: isSelected ? "var(--brand-01)" : "var(--text-tertiary)" }}>
              {isSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          )}
          {/* Delete button — top right (hidden for archived since CTA handles it) */}
          {!isArchived && (
            <button onClick={() => handleDelete(ev)}
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-display)", padding: "4px 8px" }}>
              Archive
            </button>
          )}
          <div className="od-card-top">
            <div className="od-card-status-pill">
              <span className="od-card-status-dot" style={{ background: sc.dot }} />
              <span style={{ fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {statusMeta(ev.status).label}
              </span>
            </div>
            {isDraft && (
              <div className="od-card-draft-banner">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 10.5h.01"/></svg>
                Setup incomplete — finish setting up your competition to get started
              </div>
            )}
            <div style={isDraft ? { opacity: 0.45 } : undefined}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="od-card-title">{cd.name || "Untitled Competition"}</div>
                <div className="od-card-meta">
                  {cd.date && (
                    <div className="od-card-meta-row">
                      <span className="od-card-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>
                      </span>
                      {new Date(cd.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                  {cd.location && (
                    <div className="od-card-meta-row">
                      <span className="od-card-meta-icon">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="7" r="2"/><path d="M8 15S3 10 3 7a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
                      </span>
                      {cd.location}
                    </div>
                  )}
                  {!cd.date && !cd.location && isDraft && (
                    <div className="od-card-meta-row" style={{ fontStyle: "italic" }}>No details added yet</div>
                  )}
                </div>
              </div>
              <div className="od-card-divider" style={{ marginTop: 24 }} />
              <div style={{ marginTop: 24 }}>
                <div className="od-card-clubs-title">Clubs Details</div>
                <div className="od-card-clubs-row">
                  <div className="od-card-clubs-item">
                    <span className="od-card-clubs-badge" style={clubs.length === 0 ? { background: "#efefef", color: "var(--text-tertiary)" } : undefined}>{clubs.length}</span>
                    Clubs Registered
                  </div>
                  <div className="od-card-clubs-item">
                    <span className="od-card-clubs-badge" style={gymnasts.length === 0 ? { background: "#efefef", color: "var(--text-tertiary)" } : undefined}>{gymnasts.length}</span>
                    Gymnasts Registered
                  </div>
                </div>
              </div>
            </div>
          </div>
          {!isSelectable && (
            <div className="od-card-actions">
              {isDraft ? (
                <button className="od-card-btn-open" onClick={() => onOpen(ev)}
                  style={{ background: "#f59e0b" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                  Finish Setup
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              ) : (
                <button className={`od-card-btn-open`} onClick={() => isArchived ? handleDelete(ev) : onOpen(ev)}
                  style={isArchived ? { background: "#e53e3e" } : ev.status === "live" ? { background: "#22c55e" } : undefined}>
                  {ev.status === "live" && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>}
                  {{ active: "Open Comp", live: "Resume Comp", completed: "View Results", archived: "Delete Event" }[ev.status] || "Open Comp"}
                  {ev.status !== "live" && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(-90deg)" }}><path d="M4 6l4 4 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </button>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {ev.status === "live" && (
                  <button className="od-card-btn-open outlined" onClick={() => onView(ev)}
                    style={{ background: "none", border: "1.5px solid var(--border)", color: "var(--text-primary)" }}>
                    View Comp
                  </button>
                )}
                {ev.status === "active" && (
                  <button className="od-card-btn-icon" onClick={() => onEdit(ev)} title="Edit Comp">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
                  </button>
                )}
                <button className="od-card-btn-icon" onClick={() => onDuplicate(ev)} title="Duplicate">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V3.5A.5.5 0 013.5 3H11"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .od-main{flex:1;display:flex;flex-direction:column;gap:22px;padding:40px;overflow-y:auto;min-width:0;}
        .od-header{display:flex;flex-direction:column;gap:8px;max-width:434px;}
        .od-greeting{font-size:38px;font-weight:600;color:var(--text-primary);line-height:1.2;}
        .od-subtitle{font-size:14px;color:var(--text-tertiary);line-height:1.4;}
        .od-content{display:flex;flex-direction:column;gap:30px;flex:1;min-height:0;}
        .od-filter-pill{display:inline-flex;align-items:center;justify-content:center;padding:4px 16px;border-radius:48px;background:var(--background-light);font-size:14px;color:var(--text-primary);font-family:var(--font-display);border:none;cursor:pointer;align-self:flex-start;}
        .od-cards-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;max-width:1200px;}
        .od-card-wrap{display:flex;}
        .od-card{flex:1;background:var(--background-light);border-radius:8px;overflow:hidden;padding:16px 18px;display:flex;flex-direction:column;justify-content:space-between;border-left:6px solid transparent;}
        .od-card-top{display:flex;flex-direction:column;gap:24px;}
        .od-card-status-pill{display:inline-flex;align-items:center;gap:8px;padding:4px 16px;border-radius:48px;background:var(--background-neutral);font-size:12px;color:var(--text-primary);font-family:var(--font-display);align-self:flex-start;}
        .od-card-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .od-card-title{font-size:20px;font-weight:600;color:var(--text-primary);line-height:1.2;max-height:48px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-overflow:ellipsis;}
        .od-card-meta{display:flex;flex-direction:column;gap:8px;}
        .od-card-meta-row{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary);font-family:var(--font-display);}
        .od-card-meta-icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);flex-shrink:0;}
        .od-card-divider{height:1px;background:#f5f5f5;}
        .od-card-clubs-title{font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.1;margin-bottom:8px;}
        .od-card-clubs-row{display:flex;flex-wrap:wrap;gap:16px;align-items:center;}
        .od-card-clubs-item{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-tertiary);font-family:var(--font-display);}
        .od-card-clubs-badge{min-width:18px;height:18px;padding:0 5px;border-radius:36px;background:var(--brand-01);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0;}
        .od-card-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:40px;}
        .od-card-btn-open{display:inline-flex;align-items:center;gap:6px;height:30px;padding:5px 11px;border-radius:80px;background:var(--brand-01);border:none;cursor:pointer;font-family:var(--font-display);font-size:12px;font-weight:600;color:white;letter-spacing:0.3px;}
        .od-card-btn-open:hover{opacity:0.9;}
        .od-card-btn-open.outlined{background:none;border:1.5px solid var(--brand-01);color:var(--brand-01);}
        .od-card-btn-open.outlined:hover{background:rgba(0,13,255,0.06);}
        .od-card-btn-icon{width:30px;height:30px;border-radius:80px;border:none;background:#efefef;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex-shrink:0;}
        .od-card-btn-icon:hover{background:var(--background-neutral);}
        .od-card-draft{background:var(--background-light);}
        .od-card-draft-banner{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);font-size:12px;color:#92600a;font-family:var(--font-display);line-height:1.4;}
        .od-card-btn-icon.danger{border:1px solid red;background:none;}
        .od-card-btn-icon.danger:hover{background:#fee;}
        .od-select-check{position:absolute;top:12px;left:-3px;width:20px;height:20px;border-radius:50%;border:2px solid var(--text-tertiary);display:flex;align-items:center;justify-content:center;z-index:1;transition:background 0.15s,border-color 0.15s;}
        .od-card-selected{background:rgba(0,13,255,0.03)!important;}
        .od-bulk-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:48px;border:1.5px solid var(--border);background:var(--background-light);font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);cursor:pointer;white-space:nowrap;}
        .od-bulk-btn:hover{background:#f0f0f0;}
        .od-bulk-btn-danger{background:#e53e3e;color:white;border-color:#e53e3e;}
        .od-bulk-btn-danger:hover{background:#c53030;}
        .od-empty-box{flex:1;min-height:322px;border:1px dashed #080808;background:#f2f2f2;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:16px 18px;}
        .od-empty-box-btn{padding:16px 32px;border-radius:56px;background:var(--brand-01);border:none;cursor:pointer;font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--text-alternate);}
        .od-empty-box-btn:hover{opacity:0.92;}
        .od-section-title{font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;}
        .od-empty-msg{text-align:center;padding:40px 24px;color:var(--text-tertiary);font-size:14px;width:100%;}
        .od-active-filter{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:48px;background:var(--background-light);color:var(--text-primary);font-family:var(--font-display);font-size:13px;font-weight:600;border:1px solid var(--border);cursor:pointer;align-self:flex-start;margin-bottom:-14px;}
        .od-active-filter:hover{background:#f5f5f5;}
        .od-active-filter-x{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.08);font-size:11px;line-height:1;}
        @media(max-width:768px){.od-active-filter{display:none;}}
        .od-mobile-filters{display:none;}
        @media(max-width:768px){
          .od-main{padding:24px 16px;}
          .od-cards-row{flex-direction:column;}
          .od-card-wrap{min-width:0;}
          .od-mobile-filters{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
          .od-mobile-filters::-webkit-scrollbar{display:none;}
          .od-mobile-filter{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:48px;border:1.5px solid var(--border);background:var(--background-light);font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-tertiary);cursor:pointer;white-space:nowrap;}
          .od-mobile-filter.active{background:var(--brand-01);color:white;border-color:var(--brand-01);}
          .od-mobile-filter .od-mf-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
          .od-mobile-filter .od-mf-count{font-size:11px;opacity:0.7;}
        }
      `}</style>
      <div className="od-main">
        <div className="od-header">
          <div className="od-greeting">{`Hello ${firstName}  👋`}</div>
          <div className="od-subtitle">
            This is your Organiser Vault - within here are all of your competitions - you can filter these on your toolbar into the different status of competitions you currently have.
          </div>
        </div>

        {/* Mobile filter pills — visible only ≤768px */}
        <div className="od-mobile-filters">
          {sidebarFilters.map(f => {
            const count = myEvents.filter(e => e.status === f.value).length;
            const isActive = statusFilter === f.value;
            const sc = statusConfig[f.value] || {};
            return (
              <button key={f.value} className={`od-mobile-filter${isActive ? " active" : ""}`}
                onClick={() => setStatusFilter(prev => prev === f.value ? "all" : f.value)}>
                <span className="od-mf-dot" style={{ background: isActive ? "white" : sc.dot }} />
                {f.label}
                {count > 0 && <span className="od-mf-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Cards area */}
        <div className="od-content">
          {/* Filter pill + sort toggle row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: myEvents.length > 0 ? -8 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {statusFilter !== "all" && (
                <button className="od-active-filter" style={{ marginBottom: 0 }} onClick={() => setStatusFilter("all")}>
                  {sidebarFilters.find(f => f.value === statusFilter)?.label || statusFilter}
                  <span className="od-active-filter-x">✕</span>
                </button>
              )}
              {statusFilter === "archived" && filtered.length > 0 && (
                <>
                  <button className="od-bulk-btn" onClick={() => { if (selectMode) { setSelectMode(false); setSelected(new Set()); } else { setSelectMode(true); } }}>
                    {selectMode ? "Cancel" : "Select"}
                  </button>
                  {selectMode && (
                    <>
                      <button className="od-bulk-btn" onClick={() => {
                        const archivedIds = filtered.map(e => e.id);
                        setSelected(prev => prev.size === archivedIds.length ? new Set() : new Set(archivedIds));
                      }}>
                        {selected.size === filtered.length ? "Deselect All" : "Select All"}
                      </button>
                      {selected.size > 0 && (
                        <button className="od-bulk-btn od-bulk-btn-danger" onClick={() => setBulkDeleteConfirm(true)}>
                          Delete ({selected.size})
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {myEvents.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-display)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M4 2v12M4 14l-2.5-3M4 14l2.5-3M12 14V2M12 2L9.5 5M12 2l2.5 3"/></svg>
                <button onClick={() => setSortBy("recent")} style={{
                  padding: "4px 10px", borderRadius: 48, border: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  background: sortBy === "recent" ? "var(--brand-01)" : "var(--background-light)",
                  color: sortBy === "recent" ? "white" : "var(--text-tertiary)"
                }}>Recent</button>
                <button onClick={() => setSortBy("date")} style={{
                  padding: "4px 10px", borderRadius: 48, border: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  background: sortBy === "date" ? "var(--brand-01)" : "var(--background-light)",
                  color: sortBy === "date" ? "white" : "var(--text-tertiary)"
                }}>Event Date</button>
              </div>
            )}
          </div>

          {/* Empty state — no events at all */}
          {myEvents.length === 0 ? (
            <div className="od-empty-box">
              <button className="od-empty-box-btn" onClick={onNew}>+ New Competition</button>
            </div>
          ) : statusFilter !== "all" && filtered.length === 0 ? (
            <div className="od-empty-msg">No {sidebarFilters.find(f => f.value === statusFilter)?.label?.toLowerCase() || statusFilter} competitions</div>
          ) : statusFilter !== "all" ? (
            /* Filtered view — flat list */
            <div className="od-cards-row">
              {sortEvents(filtered).map(ev => renderCard(ev))}
            </div>
          ) : (
            /* Default view — sectioned */
            <>
              {currentEvents.length > 0 ? (
                <div>
                  <div className="od-section-title">Current Events</div>
                  <div className="od-cards-row">
                    {currentEvents.map(ev => renderCard(ev))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="od-section-title">Current Events</div>
                  <div className="od-empty-box">
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                      <div style={{ fontSize: 14, color: "var(--text-tertiary)", fontFamily: "var(--font-display)", textAlign: "center", lineHeight: 1.5 }}>
                        No current competitions — create one to get started
                      </div>
                      <button className="od-empty-box-btn" onClick={onNew}>+ New Competition</button>
                    </div>
                  </div>
                </div>
              )}
              {completedEvents.length > 0 && (
                <div>
                  <div className="od-section-title">Completed Events</div>
                  <div className="od-cards-row">
                    {completedEvents.map(ev => renderCard(ev))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {archiveConfirm && (
        <ConfirmModal
          message={<>Are you sure you want to archive this event?<br/><span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>By archiving this event you can still access it within your Archive filter on your sidebar.</span></>}
          confirmLabel="Archive"
          isDanger={false}
          onConfirm={() => {
            events.update(archiveConfirm.id, { status: "archived" });
            const ev = events.getAll().find(e => e.id === archiveConfirm.id);
            if (ev?.compId) pushStatusToSupabase(ev.compId, "archived");
            setArchiveConfirm(null); reload();
          }}
          onCancel={() => setArchiveConfirm(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          message={`Permanently delete "${deleteConfirm.snapshot?.compData?.name || "this competition"}"? This cannot be undone.`}
          confirmLabel="Delete permanently"
          isDanger={true}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      {bulkDeleteConfirm && (
        <ConfirmModal
          message={`Permanently delete ${selected.size} archived event${selected.size === 1 ? "" : "s"}? This cannot be undone.`}
          confirmLabel={`Delete ${selected.size} event${selected.size === 1 ? "" : "s"}`}
          isDanger={true}
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}
    </>
  );
}

// ============================================================
// ACCOUNT SETTINGS MODAL
// ============================================================
function AccountSettingsModal({ account, profile, onSave, onLogout, onClose }) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [clubName, setClubName] = useState(profile?.club_name || "");
  const [location, setLocation] = useState(profile?.location || "");
  const [saving,  setSaving]   = useState(false);
  const [error,   setError]    = useState("");
  const [success, setSuccess]  = useState("");

  const handleSave = async () => {
    setError(""); setSuccess("");
    if (!fullName.trim()) { setError("Name cannot be empty."); return; }
    setSaving(true);
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) { setError("Session expired — please sign in again."); setSaving(false); return; }
    const token = session.access_token;
    const updated = { id: account.id, full_name: fullName.trim(), club_name: clubName.trim(), location: location.trim() };
    const { error: err } = await supabase.upsertProfile(updated, token);
    setSaving(false);
    if (err) { setError("Couldn't save changes — please try again."); return; }
    setSuccess("Changes saved.");
    onSave({ ...(profile || {}), ...updated });
  };

  return (
    <>
    <style>{`
      .acct-label{font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px;}
      .acct-input{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-light);font-family:var(--font-display);font-size:14px;color:var(--text-primary);outline:none;box-sizing:border-box;transition:border-color 0.15s;}
      .acct-input:focus{border-color:var(--brand-01);}
      .acct-input-disabled{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-neutral);font-family:var(--font-display);font-size:14px;color:var(--text-tertiary);box-sizing:border-box;cursor:default;}
    `}</style>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--background-light)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 440, fontFamily: "var(--font-display)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>Your Account</div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 80, background: "#efefef", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-tertiary)" }}
          >✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label className="acct-label">Email</label>
            <div className="acct-input-disabled">{account.email}</div>
          </div>
          <div>
            <label className="acct-label">Name</label>
            <input className="acct-input" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="acct-label">Club / Organisation</label>
            <input className="acct-input" value={clubName} onChange={e => setClubName(e.target.value)} />
          </div>
          <div>
            <label className="acct-label">Location</label>
            <input className="acct-input" value={location} onChange={e => setLocation(e.target.value)} />
          </div>

          {error && <div style={{ fontSize: 13, color: "#e53e3e", padding: "10px 16px", background: "#fff5f5", borderRadius: 8 }}>{error}</div>}
          {success && <div style={{ fontSize: 13, color: "#22c55e", padding: "10px 16px", background: "#f0fdf4", borderRadius: 8 }}>{success}</div>}

          <button
            onClick={handleSave} disabled={saving}
            style={{
              width: "100%", padding: "14px", borderRadius: 56, background: "var(--brand-01)", border: "none",
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text-alternate)",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

          <div style={{ height: 1, background: "#f5f5f5" }} />

          <button
            onClick={onLogout}
            style={{
              width: "100%", height: 46, borderRadius: 56, border: "1px solid var(--brand-01)", background: "none",
              cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ============================================================
// PROFILE ONBOARDING — shown once on first login
// ============================================================
function ProfileOnboardingScreen({ user, onComplete }) {
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ""
  );
  const [clubName,  setClubName]  = useState("");
  const [location,  setLocation]  = useState("");
  const [role,      setRole]      = useState("");
  const [referral,  setReferral]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const handleSave = async () => {
    setError("");
    if (!fullName.trim()) { setError("Please enter your name."); return; }
    if (!role)            { setError("Please select your role."); return; }
    setSaving(true);
    const { data: { session } } = await supabaseAuth.auth.getSession();
    const token = session?.access_token ?? SUPABASE_KEY;
    const profile = {
      id:        user.id,
      full_name: fullName.trim(),
      club_name: clubName.trim(),
      location:  location.trim(),
      role,
      referral,
    };
    const { error: err } = await supabase.upsertProfile(profile, token);
    setSaving(false);
    if (err) { setError("Couldn't save your profile — please try again."); return; }
    onComplete(profile);
  };

  const lbl = (text) => (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 7 }}>
      {text}
    </label>
  );

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", minHeight: "100vh" }}>
      <div style={{ width: "100%", maxWidth: 500 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, letterSpacing: 3, color: "var(--accent)", lineHeight: 1, marginBottom: 14 }}>
            GYMCOMP
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
            Welcome — let's get you set up
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
            Just a few quick details and you'll be ready to run your first competition.
          </div>
        </div>

        <div className="card" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Name */}
            <div>
              {lbl("Your name *")}
              <input className="input" placeholder="Jane Smith" value={fullName}
                onChange={e => setFullName(e.target.value)} autoFocus />
            </div>

            {/* Club + Location */}
            <div className="grid-2">
              <div>
                {lbl("Club / Organisation")}
                <input className="input" placeholder="Springers GC" value={clubName}
                  onChange={e => setClubName(e.target.value)} />
              </div>
              <div>
                {lbl("Location")}
                <input className="input" placeholder="Manchester" value={location}
                  onChange={e => setLocation(e.target.value)} />
              </div>
            </div>

            {/* Role */}
            <div>
              {lbl("Your role *")}
              <select className="select" value={role} onChange={e => setRole(e.target.value)}>
                <option value="">Select your role…</option>
                <option value="Organiser">Organiser</option>
                <option value="Club Secretary">Club Secretary</option>
                <option value="Coach">Coach</option>
              </select>
            </div>

            {/* Referral */}
            <div>
              {lbl("How did you hear about us?")}
              <select className="select" value={referral} onChange={e => setReferral(e.target.value)}>
                <option value="">Select an option…</option>
                <option value="Google">Google</option>
                <option value="Social Media">Social Media</option>
                <option value="Word of Mouth">Word of Mouth</option>
                <option value="British Gymnastics">British Gymnastics</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 15, marginTop: 4 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Let's go →"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
          Signed in as <strong style={{ color: "var(--text)" }}>{user?.email}</strong>
        </div>
      </div>
    </div>
  );
}

function CompDashboard({ compData, gymnasts, compId, compPin, onStartComp, onEditSetup, onAcceptSubmissions, onManageGymnasts, onSetPin, eventStatus, onUpdateCompData }) {
  const [showId, setShowId] = useState(false);
  const [submLinkCopied, setSubmLinkCopied] = useState(false);
  const [showSubmReview, setShowSubmReview] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);
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
    supabase.fetchSubmissions(compId).then(({ data }) => {
      if (mountedRef.current && data) setPendingCount(data.filter(s => s.status === "pending").length);
    });
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
  const clubs = [...new Set(gymnasts.map(g => g.club))].filter(Boolean);
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
  const colour = compData.brandColour || "#000dff";
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
          {statCard("Clubs", clubs.length)}
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
                {pendingCount === null ? "Loading submissions…" : pendingCount === 0 ? "No pending submissions" : (
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
              {compData.useDEScoring && compData.apparatus.some(app => judges.filter(j => j.apparatus === app).length === 0) && (
                <div style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: 12,
                  background: "rgba(240,173,78,0.1)", border: "1px solid rgba(240,173,78,0.4)",
                  fontSize: 12, color: "#c8862a" }}>
                  ⚠ FIG scoring is enabled — each apparatus needs at least one judge before scores can be entered.
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

// ============================================================
// HOME SCREEN
// ============================================================
// ============================================================
// CLUB SUBMISSION SCREEN — public form for clubs to submit gymnasts
// ============================================================
function ClubSubmissionScreen({ compId }) {
  const [compConfig, setCompConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [clubName, setClubName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [gymnasts, setGymnasts] = useState([
    { id: generateId(), name: "", level: "", ageCategory: "" }
  ]);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!compId) { setError("No competition ID provided."); setLoading(false); return; }
    let cancelled = false;
    supabase.fetchOne("competitions", compId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setError("Competition not found. Please check your link."); setLoading(false); return; }
      const cd = data.data?.compData;
      setCompConfig(cd);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [compId]);

  const addGymnast = () => {
    setGymnasts(g => [...g, { id: generateId(), name: "", level: "", ageCategory: "" }]);
  };

  const removeGymnast = (id) => {
    setGymnasts(g => g.filter(x => x.id !== id));
  };

  const updateGymnast = (id, field, value) => {
    setGymnasts(g => g.map(x => x.id === id ? { ...x, [field]: value } : x));
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!clubName.trim()) { setFormError("Please enter your club name."); return; }
    const filled = gymnasts.filter(g => g.name.trim());
    if (!filled.length) { setFormError("Please add at least one gymnast."); return; }
    const incomplete = filled.find(g => !g.level);
    if (incomplete) { setFormError(`Please select a level for ${incomplete.name}.`); return; }

    setSubmitting(true);
    const submission = {
      id: generateId(),
      comp_id: compId,
      club_name: clubName.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      gymnasts: filled.map(g => ({ id: generateId(), name: g.name.trim(), level: g.level, ageCategory: g.ageCategory })),
      submitted_at: new Date().toISOString(),
      status: "pending",
    };

    const { error } = await supabase.insertSubmission(submission);
    setSubmitting(false);
    if (error) { setFormError("Submission failed — please try again or contact the organiser."); return; }
    setSubmitted(true);
  };

  const colour = compConfig?.brandColour || "#000dff";

  const inputStyle = { width: "100%", padding: "12px 16px", background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 56, color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-display)", boxSizing: "border-box", outline: "none" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", display: "block", marginBottom: 8, fontFamily: "var(--font-display)" };
  const selectStyle = { ...inputStyle, borderRadius: 56, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center", paddingRight: 40 };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", fontFamily: "var(--font-display)" }}>
      <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Loading competition details…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", padding: 24, fontFamily: "var(--font-display)" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8, color: "var(--text-primary)" }}>Unable to load</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", padding: 24, fontFamily: "var(--font-display)" }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎉</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: colour, marginBottom: 8 }}>Submitted!</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          Your gymnast list has been sent to the organiser for review.
          You will be contacted if any details need to be confirmed.
        </div>
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "20px 24px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "left" }}>
          <strong style={{ color: "var(--text-primary)", fontSize: 15 }}>{compConfig.name}</strong><br />
          {compConfig.date && <span style={{ fontSize: 12 }}>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>}<br />
          <span style={{ color: colour, fontWeight: 600, marginTop: 8, display: "block" }}>
            {gymnasts.filter(g => g.name.trim()).length} gymnast{gymnasts.filter(g => g.name.trim()).length !== 1 ? "s" : ""} submitted from {clubName}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-neutral)", fontFamily: "var(--font-display)" }}>
      {/* Header */}
      <div style={{ background: "var(--background-light)", borderBottom: "1px solid #e4e4e4", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        {compConfig.logo && <img src={compConfig.logo} alt="Logo" style={{ height: 44, objectFit: "contain" }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 20, color: "var(--text-primary)" }}>{compConfig.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", display: "flex", gap: 16, marginTop: 3 }}>
            {compConfig.date && <span>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
            {(compConfig.venue || compConfig.location) && <span>{compConfig.venue || compConfig.location}</span>}
          </div>
        </div>
        <div style={{ background: colour + "14", border: "1px solid " + colour + "30", borderRadius: 56, padding: "6px 14px", fontSize: 11, fontWeight: 600, color: colour, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
          Gymnast Submission
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>

        {/* Club details */}
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "28px", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20, color: "var(--text-primary)" }}>Club Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Club Name <span style={{ color: colour }}>*</span></label>
              <input style={inputStyle} placeholder="e.g. Acton Gymnastics Club" value={clubName} onChange={e => setClubName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Contact Name <span style={{ fontWeight: 400, color: "#bbb" }}>(optional)</span></label>
                <input style={inputStyle} placeholder="Your name" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Contact Email <span style={{ fontWeight: 400, color: "#bbb" }}>(optional)</span></label>
                <input type="email" style={inputStyle} placeholder="coach@example.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Gymnast list */}
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)" }}>
              Gymnasts <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)" }}>({gymnasts.filter(g => g.name.trim()).length} entered)</span>
            </div>
            <button onClick={addGymnast}
              style={{ padding: "8px 16px", background: colour, color: "var(--text-alternate)", border: "none", borderRadius: 56, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-display)" }}>
              + Add gymnast
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gymnasts.map((g, idx) => (
              <div key={g.id} style={{ background: "var(--background-neutral)", border: "1px solid #e4e4e4", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: colour + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: colour, flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <input style={{ ...inputStyle, flex: 1, width: "auto" }} placeholder="Full name" value={g.name} onChange={e => updateGymnast(g.id, "name", e.target.value)} />
                  {gymnasts.length > 1 && (
                    <button onClick={() => removeGymnast(g.id)}
                      style={{ width: 32, height: 32, background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 8, color: "var(--text-tertiary)", cursor: "pointer", fontSize: 16, flexShrink: 0, fontFamily: "var(--font-display)" }}>
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11, marginBottom: 6 }}>Level <span style={{ color: colour }}>*</span></label>
                    <select style={{ ...selectStyle, color: g.level ? "var(--text-primary)" : "var(--text-tertiary)" }} value={g.level} onChange={e => updateGymnast(g.id, "level", e.target.value)}>
                      <option value="">Select level…</option>
                      {(compConfig.levels || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                  {(compConfig.levels || []).some(l => l.rankBy === "level+age") && (
                    <div style={{ flex: 1 }}>
                      <label style={{ ...labelStyle, fontSize: 11, marginBottom: 6 }}>Age Category</label>
                      <select style={{ ...selectStyle, color: g.ageCategory ? "var(--text-primary)" : "var(--text-tertiary)" }} value={g.ageCategory} onChange={e => updateGymnast(g.id, "ageCategory", e.target.value)}>
                        <option value="">Select…</option>
                        <option value="Junior">Junior</option>
                        <option value="Senior">Senior</option>
                        <option value="U9">Under 9</option>
                        <option value="U11">Under 11</option>
                        <option value="U13">Under 13</option>
                        <option value="U15">Under 15</option>
                        <option value="U18">Under 18</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {formError && (
          <div style={{ background: "rgba(220,53,69,0.06)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#c53030", marginBottom: 16, fontFamily: "var(--font-display)" }}>
            {formError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: "100%", padding: "16px", background: colour, color: "var(--text-alternate)", border: "none", borderRadius: 56,
            fontWeight: 600, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, fontFamily: "var(--font-display)" }}>
          {submitting ? "Submitting…" : "Submit Gymnast List"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", marginTop: 20, fontFamily: "var(--font-display)" }}>
          Powered by GYMCOMP · Your details will only be used for this competition
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUBMISSIONS REVIEW PANEL — organiser reviews pending submissions
// ============================================================
function SubmissionsReviewPanel({ compId, compData, gymnasts, onAccept, onDecline, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  // Per-gymnast round assignment (set during review)
  const [roundAssignments, setRoundAssignments] = useState({});
  // Editable gymnast names
  const [editedNames, setEditedNames] = useState({});

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const load = async () => {
    setLoading(true);
    if (inSandbox) {
      // Demo data in sandbox
      setSubmissions([
        { id: "demo1", club_name: "Acton GC", contact_name: "Jane Smith", status: "pending", submitted_at: new Date().toISOString(),
          gymnasts: [
            { id: "g1", name: "Emma Wilson", level: compData.levels[0]?.name || "Level 1", ageCategory: "U13" },
            { id: "g2", name: "Sophie Brown", level: compData.levels[0]?.name || "Level 1", ageCategory: "U11" },
          ]},
        { id: "demo2", club_name: "Harrow Gymnastics", contact_name: "Mike Jones", status: "pending", submitted_at: new Date(Date.now() - 3600000).toISOString(),
          gymnasts: [
            { id: "g3", name: "Lily Chen", level: compData.levels[1]?.name || "Level 2", ageCategory: "U15" },
          ]},
      ]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.fetchSubmissions(compId);
    if (error) console.error("[SubmissionsReviewPanel] load error:", error);
    if (!mountedRef.current) return;
    setSubmissions(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [compId]);

  const pending = submissions.filter(s => s.status === "pending");
  const accepted = submissions.filter(s => s.status === "accepted");

  const nextNumber = () => {
    const used = gymnasts.map(g => parseInt(g.number)).filter(n => !isNaN(n));
    if (!used.length) return 1;
    return Math.max(...used) + 1;
  };

  const acceptSubmission = async (sub) => {
    setProcessing(sub.id);

    if (!inSandbox) {
      const { error } = await supabase.updateSubmission(sub.id, { status: "accepted" });
      if (error) {
        console.error("[acceptSubmission] Supabase update failed:", error);
        alert("Could not save acceptance to Supabase — please check your RLS policies on the submissions table, then try again.\n\n" + error);
        setProcessing(null);
        return;
      }
    }

    let num = nextNumber();
    const newGymnasts = sub.gymnasts.map(g => ({
      id: generateId(),
      name: (editedNames[g.id] ?? g.name).trim(),
      club: sub.club_name,
      level: compData.levels.find(l => l.name === g.level)?.id || "",
      ageCategory: g.ageCategory || "",
      round: roundAssignments[g.id] || compData.rounds[0]?.id || "",
      group: "",
      number: String(num++),
      dns: false,
    }));

    onAccept(newGymnasts);
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "accepted" } : x));
    setProcessing(null);
  };

  const declineSubmission = async (sub) => {
    setProcessing(sub.id);
    if (!inSandbox) {
      const { error } = await supabase.updateSubmission(sub.id, { status: "declined" });
      if (error) {
        console.error("[declineSubmission] Supabase update failed:", error);
        setProcessing(null);
        return;
      }
    }
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "declined" } : x));
    setProcessing(null);
    onDecline?.();
  };

  const colour = compData.brandColour || "#000dff";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end"
    }}>
      <div style={{
        width: "min(560px, 100vw)", height: "100vh", background: "var(--surface)", overflowY: "auto",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Gymnast Submissions</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {pending.length} pending · {accepted.length} accepted
            </div>
          </div>
          <button onClick={load} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>↻ Refresh</button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>

        {inSandbox && (
          <div style={{ margin: "12px 24px 0", padding: "8px 12px", background: "rgba(0,13,255,0.05)", border: "1px solid rgba(0,13,255,0.12)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }}>
            ⚪ Preview mode — showing demo submissions. Real submissions load when deployed.
          </div>
        )}

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading submissions…</div>}

          {!loading && submissions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No submissions yet</div>
              <div style={{ fontSize: 12 }}>Share your submission link with clubs to get started</div>
            </div>
          )}

          {!loading && pending.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", marginBottom: 12 }}>
                Pending Review ({pending.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {pending.map(sub => (
                  <div key={sub.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    {/* Club header */}
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{sub.club_name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          {sub.contact_name && <span>{sub.contact_name} · </span>}
                          {sub.contact_email && <><a href={`mailto:${sub.contact_email}`} style={{ color: "var(--muted)", textDecoration: "underline" }}>{sub.contact_email}</a>{" · "}</>}
                          {new Date(sub.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(sub.submitted_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          · {sub.gymnasts.length} gymnast{sub.gymnasts.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Gymnast rows */}
                    <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {sub.gymnasts.map(g => (
                        <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            style={{ flex: 1, minWidth: 120, padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13 }}
                            value={editedNames[g.id] ?? g.name}
                            onChange={e => setEditedNames(n => ({ ...n, [g.id]: e.target.value }))}
                          />
                          <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", whiteSpace: "nowrap" }}>
                            {g.level}{g.ageCategory ? ` · ${g.ageCategory}` : ""}
                          </div>
                          <select
                            style={{ padding: "6px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, minWidth: 90 }}
                            value={roundAssignments[g.id] || ""}
                            onChange={e => setRoundAssignments(r => ({ ...r, [g.id]: e.target.value }))}>
                            <option value="">Round…</option>
                            {(compData.rounds || []).map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => declineSubmission(sub)} disabled={!!processing}
                        className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--muted)" }}>
                        Decline
                      </button>
                      <button onClick={() => acceptSubmission(sub)} disabled={!!processing}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: 12, background: colour, color: "#fff" }}>
                        {processing === sub.id ? "Accepting…" : "Accept All →"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && accepted.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", marginBottom: 12 }}>
                Accepted ({accepted.length})
              </div>
              {accepted.map(sub => (
                <div key={sub.id} style={{ padding: "10px 14px", background: "rgba(0,13,255,0.04)", border: "1px solid rgba(0,13,255,0.12)", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span> {sub.club_name} · {sub.gymnasts.length} gymnast{sub.gymnasts.length !== 1 ? "s" : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ onNew, onResume }) {
  const [recentComps, setRecentComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [resuming, setResuming] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (inSandbox) { setLoading(false); return; }
    let cancelled = false;
    supabase.fetchList("competitions").then(({ data }) => {
      if (cancelled) return;
      setRecentComps(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleIdChange = (val) => {
    setResumeId(val);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setResuming(true);
    const { data, error } = await supabase.fetchOne("competitions", id);
    setResuming(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      onResume(id, data.data);
    }
  };

  const handlePinSubmit = async () => {
    if (!fetchedData) return;
    const storedPin = fetchedData.pin;
    // Legacy plaintext PINs: compare directly; hashed PINs: hash input first
    const match = isHashed(storedPin)
      ? storedPin === await hashPin(resumePin)
      : storedPin === resumePin;
    if (!match) { setResumeError("Incorrect PIN."); return; }
    onResume(resumeId.trim(), fetchedData);
  };

  const handleResume = compChecked ? handlePinSubmit : handleCheck;

  return (
    <div className="home-wrap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, minHeight: "calc(100vh - 65px)" }}>
      <div style={{ width: "100%", maxWidth: 700 }}>

        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="home-logo" style={{ fontFamily: "var(--font-display)", fontSize: 72, letterSpacing: 4, lineHeight: 1, color: "var(--accent)" }}>GYMCOMP</div>
          <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 15 }}>Competition management & live results</div>
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "16px 24px", marginBottom: 24 }}
          onClick={onNew}>
          + New Competition
        </button>

        <div className="card">
          <div className="card-title">Resume Existing Competition</div>
          <div className="home-resume-row" style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="input" placeholder="Competition ID" style={{ flex: 2, minWidth: 160 }}
              value={resumeId} onChange={e => handleIdChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResume()} />
            {compChecked && compHasPin && (
              <input className="input" placeholder="Enter PIN" style={{ flex: 1, minWidth: 100 }}
                type="password" maxLength={4} autoFocus
                value={resumePin} onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePinSubmit()} />
            )}
            <button className="btn btn-secondary" onClick={handleResume} disabled={resuming || !resumeId.trim() || (compChecked && compHasPin && !resumePin.trim())}>
              {resuming ? "Checking…" : compChecked && compHasPin ? "Enter →" : "Continue →"}
            </button>
          </div>
          {resumeError && <div className="error-box" style={{ marginTop: 8 }}>{resumeError}</div>}
        </div>

        {!inSandbox && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">Recent Competitions</div>
            {loading && <div className="empty">Loading…</div>}
            {!loading && recentComps.length === 0 && <div className="empty">No competitions yet</div>}
            {recentComps.map(c => (
              <div key={c.id} className="list-item" style={{ cursor: "pointer" }}
                onClick={() => { setResumeId(c.id); }}>
                <div className="list-item-content">
                  <strong>{c.name || "Untitled"}</strong>
                  {c.date && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 10 }}>
                    {new Date(c.date + "T12:00:00").toLocaleDateString("en-GB")}
                  </span>}
                  {c.location && <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>· {c.location}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{c.id}</div>
              </div>
            ))}
          </div>
        )}

        {inSandbox && (
          <div className="warn-box" style={{ marginTop: 20, textAlign: "center" }}>
            ⚪ Running in preview mode — deploy to enable Supabase sync & recent competitions list
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// JUDGE PIN MODAL — competition ID + PIN entry overlay
// ============================================================
function JudgePinModal({ onResume, onClose }) {
  const [resumeId, setResumeId] = useState("");
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [compChecked, setCompChecked] = useState(false);
  const [compHasPin, setCompHasPin] = useState(false);
  const [fetchedData, setFetchedData] = useState(null);

  // Reset to step 1 if ID changes after check
  const handleIdChange = (e) => {
    setResumeId(e.target.value);
    if (compChecked) { setCompChecked(false); setCompHasPin(false); setFetchedData(null); setResumePin(""); setResumeError(""); }
  };

  // Step 1: check competition ID
  const handleCheck = async () => {
    const id = resumeId.trim();
    if (!id) return;
    setResumeError("");
    setChecking(true);
    const { data, error } = await supabase.fetchOne("competitions", id);
    setChecking(false);
    if (error || !data) { setResumeError("Competition not found. Check the ID and try again."); return; }
    const pin = data.data?.pin;
    setFetchedData(data.data);
    if (pin) {
      setCompHasPin(true);
      setCompChecked(true);
    } else {
      // No PIN — proceed directly
      onResume(id, data.data);
    }
  };

  // Step 2: verify PIN
  const handlePinSubmit = async () => {
    if (!fetchedData) return;
    const storedPin = fetchedData.pin;
    const match = isHashed(storedPin)
      ? storedPin === await hashPin(resumePin)
      : storedPin === resumePin;
    if (!match) { setResumeError("Incorrect PIN."); return; }
    onResume(resumeId.trim(), fetchedData);
  };

  const inputStyle = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border)",
    borderRadius: 72, padding: "16px 24px", fontFamily: "inherit",
    fontSize: 16, color: "var(--text-primary)", outline: "none", background: "transparent",
  };

  const btnStyle = (disabled) => ({
    width: "100%", background: "var(--brand-01)", border: "none", borderRadius: 72,
    padding: 16, fontFamily: "inherit", fontWeight: 400,
    fontSize: 16, color: "var(--text-alternate)", textAlign: "center",
    letterSpacing: "0.3px", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--background-light)", borderRadius: 24, padding: 32,
          width: 347, maxWidth: "calc(100vw - 32px)", position: "relative",
          display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box",
          fontFamily: "var(--font-display)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 13, right: 13, width: 25, height: 25,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: "inherit", fontSize: 16, color: "var(--text-tertiary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Close"
        >
          &#x2715;
        </button>

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 18, color: "var(--text-primary)", lineHeight: 1.2 }}>
            Enter Competition
          </div>
          <div style={{ fontFamily: "inherit", fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            {compChecked && compHasPin
              ? "This competition requires a PIN. Please enter the PIN provided by the organiser."
              : "If you are a Judge or someone entering the Scores please enter the Competition ID — if you are unsure please contact your Competition Organiser."}
          </div>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            placeholder="Competition ID"
            value={resumeId}
            onChange={handleIdChange}
            onKeyDown={e => e.key === "Enter" && (!compChecked ? handleCheck() : handlePinSubmit())}
            autoFocus={!compChecked}
            style={inputStyle}
          />
          {compChecked && compHasPin && (
            <input
              placeholder="Enter PIN"
              type="password"
              maxLength={4}
              value={resumePin}
              onChange={e => { setResumePin(e.target.value); setResumeError(""); }}
              onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
              autoFocus
              style={inputStyle}
            />
          )}
          {resumeError && <div style={{ fontSize: 13, color: "#e53e3e", paddingLeft: 24 }}>{resumeError}</div>}
          {!compChecked ? (
            <button
              onClick={handleCheck}
              disabled={checking || !resumeId.trim()}
              style={btnStyle(checking || !resumeId.trim())}
            >
              {checking ? "Checking…" : "Continue →"}
            </button>
          ) : (
            <button
              onClick={handlePinSubmit}
              disabled={!resumePin.trim()}
              style={btnStyle(!resumePin.trim())}
            >
              Enter Competition →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PIN SETUP MODAL
// ============================================================
function PinSetupModal({ onSet, onSkip }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const handleSet = async () => {
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits."); return; }
    if (pin !== confirm) { setErr("PINs don't match."); return; }
    onSet(await hashPin(pin));
  };

  return (
    <>
    <style>{`
      .pin-input{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-light);font-family:var(--font-display);font-size:14px;color:var(--text-primary);outline:none;box-sizing:border-box;transition:border-color 0.15s;}
      .pin-input:focus{border-color:var(--brand-01);}
      .pin-input::placeholder{color:var(--text-tertiary);}
      .pin-label{font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px;}
    `}</style>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--background-light)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, fontFamily: "var(--font-display)" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Set a PIN</div>
        <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 24, lineHeight: 1.5 }}>
          Set a PIN to restrict score entry to authorised judges and scorers. Anyone entering scores will need this PIN to access the competition.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label className="pin-label">PIN (4 digits)</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} placeholder="e.g. 1234"
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,""))} />
          </div>
          <div>
            <label className="pin-label">Confirm PIN</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} placeholder="Repeat PIN"
              value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g,""))}
              onKeyDown={e => e.key === "Enter" && handleSet()} />
          </div>
          {err && <div style={{ fontSize: 13, color: "#e53e3e", padding: "10px 16px", background: "#fff5f5", borderRadius: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSet}
              style={{
                flex: 1, padding: "14px", borderRadius: 56, background: "var(--brand-01)", border: "none",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-alternate)",
              }}
            >Set PIN</button>
            <button
              onClick={onSkip}
              style={{
                flex: 1, padding: "14px", borderRadius: 56, background: "none", border: "1px solid #e4e4e4",
                cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
              }}
            >Skip — no PIN</button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// ============================================================
// MC MODE — Read-off screen for awards ceremony
// ============================================================
function MCMode({ compData, gymnasts, scores }) {
  const [activeRound, setActiveRound] = useState(compData.rounds[0]?.id || "");
  const [view, setView] = useState("overall"); // "overall" | "apparatus"
  const [activeApparatus, setActiveApparatus] = useState(compData.apparatus[0] || "");
  const [fullscreen, setFullscreen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const getScore = (gid, app) => {
    const v = parseFloat(scores[gymnast_key(activeRound, gid, app)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (gid) => compData.apparatus.reduce((s, a) => s + getScore(gid, a), 0);

  const roundGymnasts = gymnasts.filter(g => g.round === activeRound && !g.dns);

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

  const rankGroups = buildRankGroups();

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

  const announcements = buildAnnouncementList();
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
          {compData.apparatus.map(a => (
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

// ============================================================
// LIVE VIEW LAUNCHER — generates public coach/parent links
// ============================================================
function LiveViewPanel({ compId, compData }) {
  const [coachCopied, setCoachCopied] = useState(false);
  const [parentCopied, setParentCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const coachUrl = `${origin}/coach.html?comp=${compId}`;
  const parentUrl = `${origin}/results.html?comp=${compId}`;

  const copy = async (url, setFlag) => {
    try { await navigator.clipboard.writeText(url); } catch {}
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>Live:</div>
      <button className="btn btn-sm btn-secondary" onClick={() => copy(coachUrl, setCoachCopied)}>
        {coachCopied ? "✅ Coach link copied" : "📋 Coach View"}
      </button>
      <button className="btn btn-sm btn-secondary" onClick={() => copy(parentUrl, setParentCopied)}>
        {parentCopied ? "✅ Parent link copied" : "👪 Parent View"}
      </button>
    </div>
  );
}

// ============================================================
// APP SIDEBAR (persistent, context-aware)
// ============================================================
function AppSidebar({ screen, phase, step, setStep, collapsed, onToggle, account, statusFilter, setStatusFilter, filterCounts, activeSection, onNew, onMyEvents, onEditSetup, onManageGymnasts, onStartComp, onDashboard, onSettings, onLogout, gymnastsCount, judgesCount, eventStatus, allGymnastsComplete }) {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // SVG icon helpers (16x16)
  const icons = {
    plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
    back: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>,
    edit: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>,
    users: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M12 9.5c1.5.3 2.5 1.5 2.5 3"/></svg>,
    play: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>,
    score: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 2v12"/></svg>,
    trophy: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6v5a3 3 0 01-6 0V2zM8 10v3M5 13h6"/><path d="M5 4H3a1 1 0 00-1 1v1a2 2 0 002 2h1M11 4h2a1 1 0 011 1v1a2 2 0 01-2 2h-1"/></svg>,
    doc: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/></svg>,
    mic: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="6" height="8" rx="3"/><path d="M3 8a5 5 0 0010 0M8 13v2"/></svg>,
    account: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>,
    logout: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M6 8h8"/></svg>,
    info: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.5v0"/></svg>,
    palette: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="10" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="9" r="1" fill="currentColor"/></svg>,
    club: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14l2-8h8l2 8M5 2a3 3 0 016 0"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>,
    bars: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10M3 8h10M3 12h10"/></svg>,
    layers: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L2 5.5 8 9l6-3.5L8 2zM2 10.5L8 14l6-3.5M2 8l6 3.5L14 8"/></svg>,
    gauge: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 14A6 6 0 118 2a6 6 0 010 12zM8 5v3l2 1"/></svg>,
    send: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z"/></svg>,
    grid: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>,
    collapse: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4L7 8l4 4"/><path d="M7 4L3 8l4 4"/></svg>,
    expand: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4-4-4-4"/><path d="M9 12l4-4-4-4"/></svg>,
    judge: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14V3a1 1 0 00-1-1H5a1 1 0 00-1 1v11M6 5h4M6 8h4M6 11h2"/></svg>,
    home: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l6-5.5L14 8M3.5 9v4.5a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>,
  };

  const NavItem = ({ icon, label, active, done, onClick, count, title: tip, disabled, badge, primary }) => (
    <button className={`as-nav-item${active ? " active" : ""}${done ? " done" : ""}${disabled ? " disabled" : ""}`}
      onClick={disabled ? undefined : onClick} title={collapsed ? (tip || label) : undefined}
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : primary ? { background: "var(--brand-01)", color: "#fff", padding: "16px 12px" } : undefined}>
      {icon}
      <span className="as-label">{label}</span>
      {badge && <span style={{ fontSize: 9, fontWeight: 700, background: "var(--brand-03)", color: "var(--brand-01)", padding: "2px 8px", borderRadius: 99, marginLeft: "auto", whiteSpace: "nowrap" }}>{badge}</span>}
      {count !== undefined && count > 0 && <span className="as-count">{count}</span>}
    </button>
  );

  const sidebarFilters = [
    { value: "draft", label: "Draft", color: "#f59e0b",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg> },
    { value: "active", label: "Active", color: "var(--brand-01)",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--brand-01)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 1.5"/></svg> },
    { value: "live", label: "Live", color: "#22c55e",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg> },
    { value: "completed", label: "Complete", color: "#15803d",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5L6.5 11.5 12.5 4.5"/></svg> },
    { value: "archived", label: "Archived", color: "#909090",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#909090" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="3" rx="1"/><path d="M3 6v6.5a1 1 0 001 1h8a1 1 0 001-1V6M6.5 9h3"/></svg> },
  ];

  const setupAnchors = [
    { id: "setup-basic", label: "Basic Info", icon: icons.info },
    { id: "setup-branding", label: "Branding", icon: icons.palette },
    { id: "setup-clubs", label: "Clubs", icon: icons.club },
    { id: "setup-rounds", label: "Rounds", icon: icons.clock },
    { id: "setup-apparatus", label: "Apparatus", icon: icons.bars },
    { id: "setup-levels", label: "Levels", icon: icons.layers },
    { id: "setup-scoring", label: "Scoring", icon: icons.gauge },
  ];

  const phase2Steps = [
    { label: "Score Input", icon: icons.score, step: 1 },
    { label: "Results", icon: icons.trophy, step: 2 },
    { label: "Exports", icon: icons.doc, step: 3 },
    { label: "MC Mode", icon: icons.mic, step: 4, disabled: true, badge: "Coming Soon" },
  ];

  const initial = (account?.name || account?.email || "?")[0].toUpperCase();

  return (
    <div className={`app-sidebar${collapsed ? " collapsed" : ""}`}>
      <button className="as-toggle" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {collapsed ? <path d="M3 1l3 3-3 3"/> : <path d="M5 1L2 4l3 3"/>}
        </svg>
      </button>
      <div className="as-top">
        <div className="as-header">
          <div className="as-logo">
            <img src={GymCompLogotype} alt="GymComp" className="as-logo-logotype" />
            <img src={GymCompLogomark} alt="GC" className="as-logo-logomark" />
          </div>
        </div>

        <div className="as-nav">
          {/* ── org-dashboard context ── */}
          {screen === "org-dashboard" && (<>
            <NavItem icon={icons.plus} label="New Competition" onClick={onNew} primary />
            <div className="as-divider" />
            <div className="as-section-title">Filter</div>
            {sidebarFilters.map(f => (
              <NavItem key={f.value} icon={f.icon} label={f.label}
                active={statusFilter === f.value}
                count={filterCounts[f.value]}
                onClick={() => setStatusFilter(prev => prev === f.value ? "all" : f.value)} />
            ))}
          </>)}

          {/* ── active / phase 1 (edit setup) ── */}
          {screen === "active" && phase === 1 && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <div className="as-divider" />
            <div className="as-section-title">Setup Sections</div>
            {setupAnchors.map(a => (
              <NavItem key={a.id} icon={a.icon} label={a.label} active={activeSection === a.id} onClick={() => scrollTo(a.id)} />
            ))}
          </>)}

          {/* ── active / dashboard ── */}
          {screen === "active" && phase === "dashboard" && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            {eventStatus !== "completed" && (<>
            <div className="as-divider" />
            <NavItem icon={icons.edit} label="Edit Setup" onClick={onEditSetup} />
            <NavItem icon={icons.users} label="Manage Gymnasts" onClick={onManageGymnasts} />
            {(() => {
              const ready = gymnastsCount > 0 && judgesCount > 0 && allGymnastsComplete !== false;
              const label = eventStatus === "live" ? "Resume Competition" : "Start Competition";
              return (
                <div style={ready ? {} : { opacity: 0.4, pointerEvents: "none" }}
                  title={!ready ? [gymnastsCount === 0 && "Add gymnasts", judgesCount === 0 && "Add judges", allGymnastsComplete === false && "Complete incomplete gymnast data"].filter(Boolean).join(", ") + " to start" : undefined}>
                  <NavItem icon={icons.play} label={label} onClick={ready ? onStartComp : undefined} />
                </div>
              );
            })()}
            </>)}
          </>)}

          {/* ── active / gymnasts ── */}
          {screen === "active" && phase === "gymnasts" && (<>
            <NavItem icon={icons.back} label="Back to Comp" onClick={onDashboard} />
          </>)}

          {/* ── active / phase 2 (competition) ── */}
          {screen === "active" && phase === 2 && (<>
            <NavItem icon={icons.back} label="My Events" onClick={onMyEvents} />
            <NavItem icon={icons.home} label="Dashboard" onClick={onDashboard} />
            <div className="as-divider" />
            <div className="as-section-title">Competition</div>
            {phase2Steps.map(s => (
              <NavItem key={s.step} icon={s.icon} label={s.label}
                active={step === s.step}
                disabled={s.disabled} badge={s.badge}
                onClick={() => setStep(s.step)} />
            ))}
          </>)}
        </div>
      </div>

      <div className="as-bottom">
        <button className="as-account" onClick={onSettings} title={collapsed ? "Account" : undefined}>
          <div className="as-account-avatar">{initial}</div>
          <span className="as-account-label">{account?.name || account?.email || "Account"}</span>
        </button>
        <button className="as-signout" onClick={onLogout}>
          {icons.logout}
          <span className="as-label">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MOBILE LOGO HEADER — pill at top, hides on scroll down
// ============================================================
function MobileLogoHeader({ onGoHome }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const el = document.querySelector(".app-main");
    const target = el || window;
    const onScroll = () => {
      const y = el ? el.scrollTop : window.scrollY;
      if (y > 48) setHidden(true);
      else setHidden(false);
      lastY.current = y;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`mobile-logo-header${hidden ? " hidden" : ""}`} onClick={onGoHome} style={{ cursor: "pointer" }}>
      <img src={GymCompLogotype} alt="GymComp" className="mlh-logotype" />
      <img src={GymCompLogomark} alt="" className="mlh-logomark" />
    </div>
  );
}

// ============================================================
// MOBILE TAB BAR
// ============================================================
function MobileTabBar({ screen, phase, step, setStep, onNew, onMyEvents, onEditSetup, onManageGymnasts, onStartComp, onDashboard, onSettings, onSave, saveLabel, eventStatus }) {
  const icons = {
    plus: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
    account: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>,
    home: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l6-5.5L14 8M3.5 9v4.5a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>,
    save: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 14h-9a1 1 0 01-1-1V3a1 1 0 011-1h7l3 3v9a1 1 0 01-1 1z"/><path d="M10 14V9H6v5M6 2v3h5"/></svg>,
    edit: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>,
    users: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/></svg>,
    play: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg>,
    score: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M6 2v12"/></svg>,
    trophy: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6v5a3 3 0 01-6 0V2zM8 10v3M5 13h6"/></svg>,
    doc: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/></svg>,
    mic: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="6" height="8" rx="3"/><path d="M3 8a5 5 0 0010 0M8 13v2"/></svg>,
    back: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>,
  };

  const Tab = ({ icon, label, active, onClick }) => (
    <button className={`mtb-tab${active ? " active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  const D = () => <div className="mtb-divider" />;

  return (
    <div className="mobile-tab-bar">
      {screen === "org-dashboard" && (<>
        <Tab icon={icons.plus} label="New" onClick={onNew} />
        <D />
        <Tab icon={icons.account} label="Account" onClick={onSettings} />
      </>)}

      {screen === "active" && phase === 1 && (<>
        <Tab icon={icons.home} label="My Events" onClick={onMyEvents} />
        <D />
        <Tab icon={icons.save} label={saveLabel || "Save"} onClick={onSave} />
      </>)}

      {screen === "active" && phase === "dashboard" && (<>
        <Tab icon={icons.home} label="My Events" onClick={onMyEvents} />
        {eventStatus !== "completed" && (<>
          <D />
          <Tab icon={icons.edit} label="Edit" onClick={onEditSetup} />
          <D />
          <Tab icon={icons.users} label="Gymnasts" onClick={onManageGymnasts} />
          <D />
          <Tab icon={icons.play} label="Start" onClick={onStartComp} />
        </>)}
      </>)}

      {screen === "active" && phase === "gymnasts" && (<>
        <Tab icon={icons.back} label="Back to Comp" onClick={onDashboard} />
      </>)}

      {screen === "active" && phase === 2 && (<>
        <Tab icon={icons.score} label="Scores" active={step === 1} onClick={() => setStep(1)} />
        <D />
        <Tab icon={icons.trophy} label="Results" active={step === 2} onClick={() => setStep(2)} />
        <D />
        <Tab icon={icons.doc} label="Exports" active={step === 3} onClick={() => setStep(3)} />
      </>)}
    </div>
  );
}

// ============================================================
// PRIVACY POLICY (public, no auth required)
// ============================================================
function PrivacyPolicyScreen() {
  const sectionStyle = { marginBottom: 28 };
  const headingStyle = { fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 };
  const paraStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px" };
  const listStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px", paddingLeft: 24 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-light)", fontFamily: "var(--font-display)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Logo */}
        <a href="/" style={{ display: "inline-block", marginBottom: 48 }}>
          <img src={GymCompLogo} alt="GymComp" style={{ height: 25 }} />
        </a>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 40 }}>Last updated: March 2026</p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Who we are</h2>
          <p style={paraStyle}>
            GymComp is a gymnastics competition management platform operated by Grant Thompson, trading as GymComp, accessible at gymcomp.co.uk.
          </p>
          <p style={paraStyle}>
            For the purposes of UK GDPR, GymComp acts as a data processor. The competition organiser acts as the data controller for competitor data entered into their competitions.
          </p>
          <p style={paraStyle}>Contact: hello@gymcomp.co.uk</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. What data we collect</h2>
          <p style={{ ...paraStyle, fontWeight: 600 }}>Account data (organisers):</p>
          <ul style={listStyle}>
            <li>Email address</li>
            <li>Display name</li>
            <li>Authentication tokens (managed securely via Supabase)</li>
          </ul>
          <p style={{ ...paraStyle, fontWeight: 600 }}>Competition data (entered by organisers):</p>
          <ul style={listStyle}>
            <li>Gymnast names, numbers, ages, club affiliations and scores</li>
            <li>Competition dates and locations</li>
          </ul>
          <p style={{ ...paraStyle, fontWeight: 600 }}>Technical data:</p>
          <ul style={listStyle}>
            <li>Browser type and device information</li>
            <li>IP address (via Supabase infrastructure)</li>
            <li>Session tokens</li>
          </ul>
          <p style={paraStyle}>
            We do not collect payment information. We do not run advertising. We do not sell data to third parties.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Why we collect it</h2>
          <ul style={listStyle}>
            <li>Email address and display name: account creation and sign-in (contract performance)</li>
            <li>Gymnast data: competition management and results (legitimate interests of the organiser)</li>
            <li>Technical data: security, fraud prevention, platform stability (legitimate interests)</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Competitor data and children</h2>
          <p style={paraStyle}>
            GymComp is used to manage gymnastics competitions which may include competitors under the age of 18.
          </p>
          <p style={paraStyle}>Organisers are responsible for:</p>
          <ul style={listStyle}>
            <li>Obtaining appropriate consent to enter competitor data into GymComp</li>
            <li>Ensuring their use of GymComp complies with their own data protection obligations</li>
            <li>Confirming they have permission to enter each competitor's data (confirmed via consent checkbox at competition setup)</li>
          </ul>
          <p style={paraStyle}>GymComp does not knowingly collect data directly from children.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. How we store and protect your data</h2>
          <ul style={listStyle}>
            <li>All data stored securely via Supabase, hosted on EU infrastructure</li>
            <li>Protected by Row Level Security — each organiser can only access their own data</li>
            <li>Authentication via magic links and Google OAuth — no passwords stored</li>
            <li>Competition PINs stored using SHA-256 hashing — plain text PINs never stored</li>
            <li>All data transmitted over HTTPS</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. How long we keep your data</h2>
          <ul style={listStyle}>
            <li>Account data: until you delete your account</li>
            <li>Competition data: until the organiser deletes the competition</li>
            <li>Authentication logs: 90 days</li>
            <li>Technical/session data: 30 days</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Your rights under UK GDPR</h2>
          <p style={paraStyle}>
            You have the right to access, correct, erase, restrict, port and object to processing of your personal data. Contact hello@gymcomp.co.uk to exercise any of these rights. We will respond within 30 days.
          </p>
          <p style={paraStyle}>
            For competitor data entered by an organiser, requests should be directed to the organiser in the first instance as they are the data controller.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Third parties</h2>
          <ul style={listStyle}>
            <li>Supabase: database, authentication, storage (supabase.com/privacy)</li>
            <li>Netlify: hosting and deployment (netlify.com/privacy)</li>
            <li>Google OAuth: optional sign-in (policies.google.com/privacy)</li>
            <li>GoDaddy: domain registration (godaddy.com/legal/agreements/privacy-policy)</li>
            <li>Mapbox: address lookup (mapbox.com/legal/privacy)</li>
          </ul>
          <p style={paraStyle}>No data is shared beyond what is necessary to operate these services.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Cookies</h2>
          <p style={paraStyle}>
            GymComp uses minimal cookies and local storage for maintaining your authenticated session and storing competition state locally for offline resilience. We do not use advertising or tracking cookies.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Changes to this policy</h2>
          <p style={paraStyle}>
            Significant changes will be notified via email to registered account holders. The latest version will always be available at gymcomp.co.uk/privacy.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Complaints</h2>
          <p style={paraStyle}>
            You have the right to lodge a complaint with the UK Information Commissioner's Office (ICO) at ico.org.uk.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, marginTop: 40, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
          All Rights Reserved 2026 GymComp©
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TERMS OF SERVICE (public, no auth required)
// ============================================================
function TermsOfServiceScreen() {
  const sectionStyle = { marginBottom: 28 };
  const headingStyle = { fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 };
  const paraStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px" };
  const listStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px", paddingLeft: 24 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-light)", fontFamily: "var(--font-display)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <a href="/" style={{ display: "inline-block", marginBottom: 48 }}>
          <img src={GymCompLogo} alt="GymComp" style={{ height: 25 }} />
        </a>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 40 }}>Last updated: March 2026</p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Acceptance of Terms</h2>
          <p style={paraStyle}>
            By creating an account or using GymComp you agree to these Terms of Service. If you do not agree, do not use the service. These terms constitute a legally binding agreement between you and GymComp, operated by Grant Thompson.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Description of Service</h2>
          <p style={paraStyle}>
            GymComp is a web-based gymnastics competition management platform that allows authorised organisers to create and manage competitions, record scores, and publish results. The service is accessible at gymcomp.co.uk.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Accounts</h2>
          <ul style={listStyle}>
            <li>You must provide a valid email address to create an account</li>
            <li>You are responsible for maintaining the security of your account</li>
            <li>You must notify us immediately of any unauthorised access at hello@gymcomp.co.uk</li>
            <li>One person or organisation may not maintain more than one free account</li>
            <li>You must be 18 or over to create an organiser account</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Acceptable Use</h2>
          <p style={paraStyle}>You agree not to:</p>
          <ul style={listStyle}>
            <li>Use GymComp for any unlawful purpose</li>
            <li>Enter false, inaccurate or misleading competitor data</li>
            <li>Attempt to gain unauthorised access to other organisers' competitions</li>
            <li>Use the service to store or transmit malicious code</li>
            <li>Resell or sublicense access to the service</li>
            <li>Attempt to reverse engineer or copy the platform</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Competitor Data and Your Responsibilities</h2>
          <p style={paraStyle}>
            As an organiser you are the data controller for all competitor data you enter into GymComp. You confirm that:
          </p>
          <ul style={listStyle}>
            <li>You have obtained appropriate permission to enter each competitor's personal data</li>
            <li>You will comply with UK GDPR and any applicable data protection laws</li>
            <li>You will not enter data for competitors without appropriate authorisation</li>
            <li>You accept full responsibility for the accuracy of data you enter</li>
          </ul>
          <p style={paraStyle}>
            GymComp acts as a data processor only. We process competitor data solely on your instructions and in accordance with our <a href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>Privacy Policy</a>.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Subscription and Payment</h2>
          <ul style={listStyle}>
            <li>GymComp is free to use for competition setup</li>
            <li>Starting a live competition requires an active paid subscription at the current advertised rate</li>
            <li>Subscriptions are billed monthly and can be cancelled at any time</li>
            <li>Cancellation takes effect at the end of the current billing period — no partial refunds are issued</li>
            <li>We reserve the right to change pricing with 30 days notice to active subscribers</li>
            <li>All prices are in GBP and inclusive of VAT where applicable</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Service Availability</h2>
          <ul style={listStyle}>
            <li>We aim to maintain high availability but do not guarantee uninterrupted access to the service</li>
            <li>Scheduled maintenance will be communicated in advance where possible</li>
            <li>We are not liable for any losses arising from service unavailability during a competition or otherwise</li>
            <li>We strongly recommend maintaining a paper or spreadsheet backup of scores during live competitions</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Limitation of Liability</h2>
          <p style={paraStyle}>To the maximum extent permitted by law:</p>
          <ul style={listStyle}>
            <li>GymComp is provided "as is" without warranty of any kind</li>
            <li>We are not liable for any loss of data, loss of revenue, or any indirect or consequential losses arising from your use of the service</li>
            <li>Our total liability to you shall not exceed the amount you have paid us in the 3 months preceding the claim</li>
            <li>Nothing in these terms limits liability for death, personal injury, or fraudulent misrepresentation</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Intellectual Property</h2>
          <ul style={listStyle}>
            <li>GymComp and all associated software, designs and content are owned by Grant Thompson</li>
            <li>You retain ownership of all competition data you enter</li>
            <li>By using the service you grant us a limited licence to process and store your data solely to provide the service</li>
            <li>You may not copy, reproduce or distribute any part of the platform without written permission</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Termination</h2>
          <ul style={listStyle}>
            <li>You may delete your account at any time via the account settings</li>
            <li>We reserve the right to suspend or terminate accounts that violate these terms without notice</li>
            <li>On termination your data will be retained for 30 days then permanently deleted unless you request earlier deletion</li>
            <li>Clauses relating to liability, intellectual property and dispute resolution survive termination</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Changes to These Terms</h2>
          <p style={paraStyle}>
            We may update these terms from time to time. Significant changes will be notified via email at least 14 days before taking effect. Continued use of the service after changes take effect constitutes acceptance of the updated terms. The latest version will always be at gymcomp.co.uk/terms.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>12. Governing Law</h2>
          <p style={paraStyle}>
            These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>13. Contact</h2>
          <p style={paraStyle}>For any questions about these terms contact hello@gymcomp.co.uk</p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, marginTop: 40, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
          All Rights Reserved 2026 GymComp©
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  // ── Auth state (Supabase Auth) ──────────────────────────────────────────
  const [currentUser,    setCurrentUser]    = useState(null);  // supabase user object
  const hasAuthed = useRef(false); // guard against token-refresh re-navigation
  const [currentProfile, setCurrentProfile] = useState(null);  // row from profiles table
  const [authLoading,    setAuthLoading]    = useState(true);
  // "loading" | "auth-login" | "profile-onboarding" | "org-dashboard" | "new-pin" | "active"
  const [screen, setScreen] = useState("loading");
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterCounts, setFilterCounts] = useState({ draft: 0, active: 0, completed: 0, archived: 0 });
  // Current event record (from events store) — links comp to account
  const [currentEventId, setCurrentEventId] = useState(null);

  // Derived account shape — keeps all downstream component code unchanged
  const currentAccount = currentUser ? {
    id:       currentUser.id,
    email:    currentUser.email,
    name:     currentProfile?.full_name || currentUser.email?.split("@")[0] || "",
    clubName: currentProfile?.club_name || "",
  } : null;

  const [phase, setPhase] = useState(1);
  const [step, setStep] = useState(1);
  const [setupWarn, setSetupWarn] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);
  const [leaveEditConfirm, setLeaveEditConfirm] = useState(null);

  // Supabase sync state
  const [compId, setCompId] = useState(() => generateId());
  const [compPin, setCompPin] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const pinModalCallback = useRef(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [shareUrl, setShareUrl] = useState(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [shareToastType, setShareToastType] = useState("public");
  const [showCompId, setShowCompId] = useState(false);
  const syncTimer = useRef(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => syncQueue.size());
  const flushingRef = useRef(false);

  const [compData, setCompDataRaw] = useState({
    name: "", location: "", date: "", holder: "",
    organiserName: "", venue: "", brandColour: "#000dff", logo: "",
    useDEScoring: true, allowSubmissions: true, dataConsentConfirmed: false,
    clubs: [], rounds: [], apparatus: [], levels: [], judges: []
  });
  const [gymnasts, setGymnasts] = useState([]);
  const [scores, setScores] = useState({});
  const [newScoreKeys, setNewScoreKeys] = useState(new Set());

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  // ── Auth initialisation ──────────────────────────────────────────────────
  const loadUserProfile = async (user) => {
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const { data: profile } = await supabase.fetchProfile(user.id, token);
      setCurrentProfile(profile || null);
      setAuthLoading(false);
      // Only navigate on initial auth — not on token refreshes that re-trigger loadUserProfile
      if (!hasAuthed.current) {
        hasAuthed.current = true;
        setScreen(profile?.full_name ? "org-dashboard" : "profile-onboarding");
      }
    } catch (e) {
      console.error("Profile load error:", e);
      setAuthLoading(false);
      setScreen("auth-login");
    }
  };

  useEffect(() => {
    // Resolve any existing session on page load (also handles magic-link / OAuth redirect tokens)
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadUserProfile(session.user);
      } else {
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        setCurrentUser(session.user);
        loadUserProfile(session.user);
      } else if (event === "SIGNED_OUT") {
        hasAuthed.current = false;
        setCurrentUser(null);
        setCurrentProfile(null);
        setAuthLoading(false);
        setScreen("auth-login");
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── localStorage size warning ─────────────────────────────────────────
  const [storageWarning, setStorageWarning] = useState(null);
  useEffect(() => {
    const bytes = events.storageBytes();
    const mb = bytes / (1024 * 1024);
    if (mb > 4) {
      setStorageWarning(`Local storage is ${mb.toFixed(1)} MB — approaching the browser limit. Consider archiving or deleting old competitions to free space.`);
    }
  }, []);

  // ---- Supabase sync (with offline queue) ----
  const pushToSupabase = useCallback(async (nextCompData, nextGymnasts, pin, status) => {
    if (inSandbox) { setSyncStatus("sandbox"); return; }
    if (!currentUser) { return; } // Judge/scorer mode — no Supabase auth, skip silently
    setSyncStatus("saving");
    const payload = { compData: nextCompData, gymnasts: nextGymnasts, pin: pin ?? compPin };
    const record = { id: compId, data: payload, user_id: currentUser.id };
    const localEv = events.getAll().find(e => e.compId === compId);
    record.status = status || localEv?.status || "draft";
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) throw new Error("no active session");
      const token = session.access_token;
      const { error } = await supabase.upsert("competitions", record, token);
      if (error) throw new Error(error);
      // Success — clear any queued entry for this comp
      syncQueue.clear(compId);
      setPendingSyncCount(syncQueue.size());
      setSyncStatus("saved");
    } catch (e) {
      console.error("Supabase sync failed, queuing locally:", e.message);
      syncQueue.push(record);
      setPendingSyncCount(syncQueue.size());
      setSyncStatus("pending");
    }
  }, [compId, compPin, inSandbox, currentUser]);

  // Flush all queued syncs — called when back online
  const flushSyncQueue = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = syncQueue.get();
    if (queue.length === 0) return;
    flushingRef.current = true;
    setSyncStatus("saving");
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) { flushingRef.current = false; return; }
      const token = session.access_token;
      const remaining = [];
      for (const entry of queue) {
        try {
          const { error } = await supabase.upsert("competitions", entry.record, token);
          if (error) throw new Error(error);
        } catch {
          remaining.push(entry);
        }
      }
      syncQueue.save(remaining);
      setPendingSyncCount(remaining.length);
      setSyncStatus(remaining.length > 0 ? "pending" : "saved");
    } catch {
      setSyncStatus("pending");
    }
    flushingRef.current = false;
  }, []);

  // Online/offline detection + auto-flush
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); flushSyncQueue(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Also try to flush on mount if there's a pending queue
    if (navigator.onLine && syncQueue.size() > 0) flushSyncQueue();
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [flushSyncQueue]);

  // Also flush when tab regains focus (catches cases where online event was missed)
  useEffect(() => {
    const handleVis = () => {
      if (document.visibilityState === "visible" && navigator.onLine && syncQueue.size() > 0) flushSyncQueue();
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [flushSyncQueue]);

  // ── Realtime subscription for scores table ─────────────────────────────
  useEffect(() => {
    if (!compId || inSandbox) return;
    // Subscribe for both judges and organisers when in competition phase
    if (phase !== 2 && phase !== "dashboard") return;

    const flashTimers = new Set();
    const channel = supabaseAuth.channel(`scores:${compId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `comp_id=eq.${compId}` }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const row = payload.new;
          const flat = scoresToFlat([row]);
          // Merge into scores state directly (NOT via setScoresWithSync to avoid re-pushing)
          setScores(prev => ({ ...prev, ...flat }));
          // Flash animation — add base key, remove after 2s
          const bk = `${row.round_id}__${row.gymnast_id}__${row.apparatus}`;
          setNewScoreKeys(prev => new Set(prev).add(bk));
          const t = setTimeout(() => { setNewScoreKeys(prev => { const n = new Set(prev); n.delete(bk); return n; }); flashTimers.delete(t); }, 2000);
          flashTimers.add(t);
        } else if (payload.eventType === "DELETE") {
          const row = payload.old;
          if (row) {
            const bk = `${row.round_id}__${row.gymnast_id}__${row.apparatus}`;
            setScores(prev => {
              const next = { ...prev };
              // Remove all keys starting with this base key
              for (const key of Object.keys(next)) {
                if (key === bk || key.startsWith(bk + "__")) delete next[key];
              }
              return next;
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabaseAuth.removeChannel(channel);
      flashTimers.forEach(t => clearTimeout(t));
    };
  }, [compId, phase, inSandbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSync = useCallback((cd, g) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      pushToSupabase(cd, g);
      // Also snapshot to local events store (scores live in scores table, not blob)
      if (currentEventId) events.snapshot(currentEventId, cd, g);
    }, 800);
  }, [pushToSupabase, currentEventId]);

  const setCompData = useCallback((updater) => {
    setCompDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (gymnasts.length > 0) {
        const apparatusChanged = JSON.stringify(prev.apparatus) !== JSON.stringify(next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      scheduleSync(next, gymnasts);
      return next;
    });
  }, [gymnasts, scheduleSync]);

  // Local-only version of setCompData — updates React state without syncing to Supabase.
  // Used in Phase 1 setup so edits aren't auto-saved.
  const setCompDataLocal = useCallback((updater) => {
    setCompDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (gymnasts.length > 0) {
        const apparatusChanged = JSON.stringify(prev.apparatus) !== JSON.stringify(next.apparatus);
        const roundsChanged = JSON.stringify(prev.rounds.map(r => r.id)) !== JSON.stringify(next.rounds.map(r => r.id));
        const levelsChanged = JSON.stringify(prev.levels.map(l => l.id)) !== JSON.stringify(next.levels.map(l => l.id));
        if (apparatusChanged || roundsChanged || levelsChanged) {
          setPendingChange(next);
          setSetupWarn("Changing this setup may affect gymnast data already entered. Do you want to continue?");
          return prev;
        }
      }
      return next;
    });
  }, [gymnasts]);

  const setGymnastsWithSync = useCallback((updater) => {
    setGymnasts(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      scheduleSync(compData, next);
      return next;
    });
  }, [compData, scheduleSync]);

  // Scores now persist via the scores table (pushScoreToTable), not the blob.
  // setScoresWithSync updates local state only — no blob sync needed.
  const setScoresWithSync = useCallback((updater) => {
    setScores(updater);
  }, []);

  // ── Score table push (fire-and-forget) ──────────────────────────────────
  const pushScoreToTable = useCallback(async (roundId, gymnastId, apparatus, flatSubset) => {
    if (inSandbox) return;
    try {
      const rows = flatToScoreRows(flatSubset, compId, currentUser ? `organiser:${currentUser.id}` : "judge");
      if (!rows.length) return;
      // Use JWT if authenticated, anon key for judges
      let token = SUPABASE_KEY;
      if (currentUser) {
        const { data: { session } } = await supabaseAuth.auth.getSession();
        if (session) token = session.access_token;
      }
      const { error } = await supabase.upsertScores(rows, token);
      if (error) console.error("[pushScoreToTable]", error);
    } catch (e) {
      console.error("[pushScoreToTable]", e.message);
    }
  }, [compId, currentUser, inSandbox]);

  const deleteScoreFromTable = useCallback(async (roundId, gymnastId, apparatus) => {
    if (inSandbox) return;
    try {
      let token = SUPABASE_KEY;
      if (currentUser) {
        const { data: { session } } = await supabaseAuth.auth.getSession();
        if (session) token = session.access_token;
      }
      const { error } = await supabase.deleteScore(compId, roundId, gymnastId, apparatus, token);
      if (error) console.error("[deleteScoreFromTable]", error);
    } catch (e) {
      console.error("[deleteScoreFromTable]", e.message);
    }
  }, [compId, currentUser, inSandbox]);

  const confirmSetupChange = () => {
    setCompDataRaw(pendingChange);
    setSetupWarn(null);
    setPendingChange(null);
  };

  // ---- Auth actions ----
  /* OLD handleLogin — navigation now driven by onAuthStateChange
  const handleLogin = (account) => {
    setCurrentAccount(account);
    setScreen("org-dashboard");
  };
  */

  const handleLogout = async () => {
    events.clear(); // Wipe local events so stale data never leaks to the next session
    await supabaseAuth.auth.signOut();
    // setCurrentUser(null) + setScreen("auth-login") handled by onAuthStateChange
  };

  const handleAccountSave = (updatedProfile) => {
    setCurrentProfile(updatedProfile);
  };

  // ---- New competition flow ----
  const handleNew = () => {
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    setCompDataRaw({ name:"", location:"", date:"", holder: currentProfile?.full_name || "", organiserName: currentProfile?.club_name || "", venue:"", brandColour:"#000dff", logo:"", useDEScoring:true, allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
    setGymnasts([]);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    // Create event record if logged in
    if (currentAccount) {
      const ev = events.create(currentAccount.id, newCompId);
      setCurrentEventId(ev.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  // Open an existing event from the organiser dashboard
  const handleOpenEvent = async (ev) => {
    const snapshot = ev.snapshot;
    setCompId(ev.compId);
    if (snapshot) {
      const rawPin = snapshot.compData?.pin || null;
      setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
      const consentGiven = ev.status !== "draft";
      setCompDataRaw(migrateCompData({ ...structuredClone(snapshot.compData || {}), dataConsentConfirmed: consentGiven }));
      setGymnasts(migrateGymnasts(structuredClone(snapshot.gymnasts || [])));
    } else {
      // No local snapshot — try to fetch from Supabase (e.g. archived events with stripped snapshots)
      const { data: row } = await supabase.fetchOne("competitions", ev.compId);
      if (row?.data) {
        const d = row.data;
        const rawPin = d.compData?.pin || null;
        setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
        setCompDataRaw(migrateCompData({ ...structuredClone(d.compData || {}), dataConsentConfirmed: true }));
        setGymnasts(migrateGymnasts(structuredClone(d.gymnasts || [])));
      } else {
        // Truly new — start fresh setup
        setCompPin(null);
        setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#000dff", logo:"", useDEScoring:true, allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
        setGymnasts([]);
        setScores({});
        setPhase(1); setStep(1);
        setSyncStatus("idle");
        setCurrentEventId(ev.id);
        setScreen("active");
        return;
      }
    }
    // Scores come exclusively from the scores table
    const { data: tableRows } = await supabase.fetchScores(ev.compId);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      // Check blob for legacy scores and silently migrate
      const blobScores = migrateScoreKeys(structuredClone(snapshot?.scores || {}));
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        // Silent migration — push to scores table in background
        const submittedBy = currentUser ? `organiser:${currentUser.id}` : "migration";
        const rows = flatToScoreRows(blobScores, ev.compId, submittedBy);
        if (rows.length > 0) {
          let token = SUPABASE_KEY;
          if (currentUser) {
            const { data: { session } } = await supabaseAuth.auth.getSession();
            if (session) token = session.access_token;
          }
          supabase.upsertScores(rows, token).catch(err => console.warn("[score migration]", err));
        }
      } else {
        setScores({});
      }
    }
    // Draft events open in edit mode; live opens into competition; others to dashboard
    if (ev.status === "draft") { setPhase(1); setStep(1); }
    else if (ev.status === "live") { setPhase(2); setStep(1); }
    else if (ev.status === "completed") { setPhase(2); setStep(2); }
    else { setPhase("dashboard"); setStep(1); }
    setSyncStatus("saved");
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Open an existing event directly into edit mode (phase 1)
  const handleEditEvent = async (ev) => {
    const snapshot = ev.snapshot;
    setCompId(ev.compId);
    if (snapshot) {
      const rawPin = snapshot.compData?.pin || null;
      setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
      const consentGiven = ev.status !== "draft";
      setCompDataRaw(migrateCompData({ ...structuredClone(snapshot.compData || {}), dataConsentConfirmed: consentGiven }));
      setGymnasts(migrateGymnasts(structuredClone(snapshot.gymnasts || [])));
    } else {
      const { data: row } = await supabase.fetchOne("competitions", ev.compId);
      if (row?.data) {
        const d = row.data;
        const rawPin = d.compData?.pin || null;
        setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
        setCompDataRaw(migrateCompData({ ...structuredClone(d.compData || {}), dataConsentConfirmed: true }));
        setGymnasts(migrateGymnasts(structuredClone(d.gymnasts || [])));
      } else {
        setCompPin(null);
        setCompDataRaw({ name:"", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#000dff", logo:"", useDEScoring:true, allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] });
        setGymnasts([]);
        setScores({});
        setSyncStatus("idle");
        setPhase(1); setStep(1);
        setCurrentEventId(ev.id);
        setScreen("active");
        return;
      }
    }
    // Scores from table only, with silent blob migration
    const { data: tableRows } = await supabase.fetchScores(ev.compId);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      const blobScores = migrateScoreKeys(structuredClone(snapshot?.scores || {}));
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        const submittedBy = currentUser ? `organiser:${currentUser.id}` : "migration";
        const rows = flatToScoreRows(blobScores, ev.compId, submittedBy);
        if (rows.length > 0) {
          let token = SUPABASE_KEY;
          if (currentUser) {
            const { data: { session } } = await supabaseAuth.auth.getSession();
            if (session) token = session.access_token;
          }
          supabase.upsertScores(rows, token).catch(err => console.warn("[score migration]", err));
        }
      } else {
        setScores({});
      }
    }
    setSyncStatus("saved");
    setPhase(1); setStep(1);
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Open an existing event into the dashboard overview (comp details + PDFs)
  const handleViewEvent = async (ev) => {
    const snapshot = ev.snapshot;
    setCompId(ev.compId);
    if (snapshot) {
      const rawPin = snapshot.compData?.pin || null;
      setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
      const consentGiven = ev.status !== "draft";
      setCompDataRaw(migrateCompData({ ...structuredClone(snapshot.compData || {}), dataConsentConfirmed: consentGiven }));
      setGymnasts(migrateGymnasts(structuredClone(snapshot.gymnasts || [])));
    } else {
      const { data: row } = await supabase.fetchOne("competitions", ev.compId);
      if (row?.data) {
        const d = row.data;
        const rawPin = d.compData?.pin || null;
        setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
        setCompDataRaw(migrateCompData({ ...structuredClone(d.compData || {}), dataConsentConfirmed: true }));
        setGymnasts(migrateGymnasts(structuredClone(d.gymnasts || [])));
      }
    }
    // Scores from table only, with silent blob migration
    const { data: tableRows } = await supabase.fetchScores(ev.compId);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      const blobScores = migrateScoreKeys(structuredClone(snapshot?.scores || {}));
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        const submittedBy = currentUser ? `organiser:${currentUser.id}` : "migration";
        const rows = flatToScoreRows(blobScores, ev.compId, submittedBy);
        if (rows.length > 0) {
          let token = SUPABASE_KEY;
          if (currentUser) {
            const { data: { session } } = await supabaseAuth.auth.getSession();
            if (session) token = session.access_token;
          }
          supabase.upsertScores(rows, token).catch(err => console.warn("[score migration]", err));
        }
      } else {
        setScores({});
      }
    }
    setSyncStatus("saved");
    setPhase("dashboard"); setStep(1);
    setCurrentEventId(ev.id);
    setScreen("active");
  };

  // Duplicate an event as a new competition
  const handleDuplicateEvent = (ev) => {
    const snapshot = ev.snapshot;
    const newCompId = generateId();
    setCompId(newCompId);
    setCompPin(null);
    // Deep copy and regenerate all IDs to fully detach from source
    let baseData;
    if (snapshot?.compData) {
      const src = structuredClone(snapshot.compData);
      src.clubs = (src.clubs || []).map(c => ({ ...c, id: generateId() }));
      src.rounds = (src.rounds || []).map(r => ({ ...r, id: generateId() }));
      src.levels = (src.levels || []).map(l => ({ ...l, id: generateId() }));
      src.name = `${src.name || "Competition"} (Copy)`;
      src.date = "";
      src.dataConsentConfirmed = false;
      src.judges = [];
      baseData = src;
    } else {
      baseData = { name:"Copy", location:"", date:"", holder:"", organiserName:"", venue:"", brandColour:"#000dff", logo:"", useDEScoring:true, allowSubmissions:true, dataConsentConfirmed:false, clubs:[], rounds:[], apparatus:[], levels:[], judges:[] };
    }
    setCompDataRaw(migrateCompData(baseData));
    setGymnasts([]);
    setScores({});
    setPhase(1); setStep(1);
    setSyncStatus("idle");

    if (currentAccount) {
      const newEv = events.create(currentAccount.id, newCompId);
      events.snapshot(newEv.id, baseData, []);
      setCurrentEventId(newEv.id);
    } else {
      setCurrentEventId(null);
    }

    setScreen("active");
  };

  const handlePinSet = (pin) => {
    setCompPin(pin); setShowPinModal(false);
    // Sync PIN to Supabase + local snapshot
    pushToSupabase(compData, gymnasts, pin);
    if (currentEventId) events.snapshot(currentEventId, { ...compData, pin }, gymnasts);
    if (pinModalCallback.current) { pinModalCallback.current(); pinModalCallback.current = null; }
  };
  const handlePinSkip = () => {
    setCompPin(null); setShowPinModal(false);
    if (pinModalCallback.current) { pinModalCallback.current(); pinModalCallback.current = null; }
  };

  // Navigate back to org dashboard
  const goBackToDashboard = () => {
    const doLeave = () => { setScreen("org-dashboard"); };
    // Always warn during phase 1 setup — nothing auto-saves
    if (phase === 1) {
      setLeaveEditConfirm(() => doLeave);
    } else {
      doLeave();
    }
  };

  // ---- Sidebar nav callbacks for active screen ----
  const handleSaveSetup = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    pushToSupabase(compData, gymnasts);
    if (currentEventId) events.snapshot(currentEventId, compData, gymnasts);
  };

  const setupCanProceed = compData.name && compData.date &&
    (compData.rounds || []).length > 0 &&
    (compData.apparatus || []).length > 0 && (compData.levels || []).length > 0 &&
    compData.dataConsentConfirmed;
  const setupCanSave = !!compData.name;

  const handleMobileSave = () => {
    if (setupCanProceed) {
      // All fields complete — full save & continue (PIN flow + dashboard)
      if (syncTimer.current) clearTimeout(syncTimer.current);
      const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
      const isDraft = ev && ev.status === "draft";
      pushToSupabase(compData, gymnasts, undefined, isDraft ? "active" : undefined);
      if (currentEventId) {
        events.snapshot(currentEventId, compData, gymnasts);
        if (isDraft) events.update(currentEventId, { status: "active" });
      }
      if (!compPin) {
        pinModalCallback.current = () => setPhase("dashboard");
        setShowPinModal(true);
      } else {
        setPhase("dashboard");
      }
    } else if (setupCanSave) {
      // Partial save — persist and go back to dashboard
      if (syncTimer.current) clearTimeout(syncTimer.current);
      pushToSupabase(compData, gymnasts);
      if (currentEventId) events.snapshot(currentEventId, compData, gymnasts);
      setScreen("org-dashboard");
    }
  };

  const handleStartComp = () => {
    setPhase(2); setStep(1);
    if (currentEventId) {
      events.update(currentEventId, { status: "live" });
      const ev = events.getAll().find(e => e.id === currentEventId);
      if (ev?.compId) {
        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
          if (session) supabase.patch("competitions", ev.compId, { status: "live" }, session.access_token);
        });
      }
    }
  };
  const handleCompleteComp = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    pushToSupabase(compData, gymnasts);
    if (currentEventId) {
      events.snapshot(currentEventId, compData, gymnasts);
      events.update(currentEventId, { status: "completed" });
      const ev = events.getAll().find(e => e.id === currentEventId);
      if (ev?.compId) {
        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
          if (session) supabase.patch("competitions", ev.compId, { status: "completed" }, session.access_token);
        });
      }
    }
    setScreen("org-dashboard");
  };
  const handleEditSetup = () => { setPhase(1); setStep(1); };
  const handleManageGymnasts = () => setPhase("gymnasts");
  const handleGoToDashboard = () => { setPhase("dashboard"); setStep(1); };

  // Scroll .app-main to top on phase/screen transitions
  const appMainRef = useRef(null);
  useEffect(() => {
    if (appMainRef.current) appMainRef.current.scrollTop = 0;
  }, [phase, step, screen]);

  // Track which setup section is in view (Phase 1 scroll-spy)
  const [activeSection, setActiveSection] = useState("");
  useEffect(() => {
    if (screen !== "active" || phase !== 1) { setActiveSection(""); return; }
    const ids = ["setup-basic","setup-branding","setup-clubs","setup-rounds","setup-apparatus","setup-levels","setup-scoring"];
    const root = appMainRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) setActiveSection(visible[0].target.id);
    }, { root, rootMargin: "-10% 0px -60% 0px", threshold: 0 });
    // Small delay so DOM has rendered the cards
    const t = setTimeout(() => {
      ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    }, 100);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [screen, phase]);

  // ---- Resume competition (PIN-only path for judges / no-account users) ----
  const handleResume = async (id, savedData) => {
    setCompId(id);
    const rawPin = savedData.pin || null;
    setCompPin(rawPin && !isHashed(rawPin) ? await hashPin(rawPin) : rawPin);
    setCompDataRaw(savedData.compData || {});
    setGymnasts(savedData.gymnasts || []);
    // Scores exclusively from table
    const { data: tableRows } = await supabase.fetchScores(id);
    if (tableRows && tableRows.length > 0) {
      setScores(scoresToFlat(tableRows));
    } else {
      // Fallback: migrate blob scores silently (judge path — anon key)
      const blobScores = savedData.scores || {};
      if (Object.keys(blobScores).length > 0) {
        setScores(blobScores);
        const rows = flatToScoreRows(blobScores, id, "migration:judge");
        if (rows.length > 0) {
          supabase.upsertScores(rows, SUPABASE_KEY).catch(err => console.warn("[score migration]", err));
        }
      } else {
        setScores({});
      }
    }
    // Judges land directly on scoring view, not dashboard
    setPhase(2); setStep(1);
    setSyncStatus("saved");
    setCurrentEventId(null);
    setScreen("active");
  };

  // ---- Share links ----
  const copyOrShare = async (url, title) => {
    // Try native share on mobile first
    if (navigator.share) {
      try { await navigator.share({ title: title || "GymComp", url }); return true; } catch {}
    }
    // Try clipboard API
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(url); return true; } catch {}
    }
    // Fallback: temporary textarea for older browsers
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {}
    return false;
  };
  const handleSharePublic = async () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    await pushToSupabase(compData, gymnasts);
    const url = `${window.location.origin}/results.html?comp=${compId}`;
    setShareUrl(url);
    await copyOrShare(url, `${compData.name || "Competition"} — Live Results`);
    setShareToastType("public");
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 4000);
  };
  const handleShareCoach = async () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    await pushToSupabase(compData, gymnasts);
    const url = `${window.location.origin}/coach.html?comp=${compId}`;
    setShareUrl(url);
    await copyOrShare(url, `${compData.name || "Competition"} — Coach View`);
    setShareToastType("coaches");
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 4000);
  };

  const phase2Steps = [
    { label: "Score Input", done: Object.keys(scores).length > 0 },
    { label: "Results", done: false },
    { label: "Exports & Docs", done: false },
    { label: "MC Mode", done: false },
  ];

  const syncDot = { idle:null, saving:"🟡", saved:"🟢", error:"🔴", pending:"🟠", sandbox:"⚪" }[syncStatus];
  const syncLabel = { idle:"", saving:"Saving…", saved:"Saved ✓", error:"Sync error", pending:`${pendingSyncCount} pending`, sandbox:"Preview mode" }[syncStatus];

  // ---- PUBLIC LEGAL PAGES — no auth required ----
  if (window.location.pathname === "/privacy") {
    return (
      <>
        <style>{css}</style>
        <PrivacyPolicyScreen />
      </>
    );
  }
  if (window.location.pathname === "/terms") {
    return (
      <>
        <style>{css}</style>
        <TermsOfServiceScreen />
      </>
    );
  }

  // ---- LOADING — blank dark screen while session resolves ----
  if (authLoading) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ background: "var(--bg)", minHeight: "100vh" }} />
      </>
    );
  }

  // ---- AUTH SCREEN (Google OAuth + Magic Link) ----
  if (screen === "auth-login") {
    return (
      <>
        <style>{css}</style>
        <AuthScreen onResume={handleResume} />
      </>
    );
  }

  // ---- PROFILE ONBOARDING (first login only) ----
  if (screen === "profile-onboarding") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <ProfileOnboardingScreen
            user={currentUser}
            onComplete={(profile) => {
              setCurrentProfile(profile);
              setScreen("org-dashboard");
            }}
          />
        </div>
      </>
    );
  }

  // ---- ORGANISER DASHBOARD ----
  if (screen === "org-dashboard") {
    return (
      <>
        <style>{css}</style>
        <div className="app-shell">
          <AppSidebar screen="org-dashboard" phase={null} step={null} setStep={null}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection=""
            onNew={handleNew} onMyEvents={null} onEditSetup={null} onManageGymnasts={null}
            onStartComp={null} onDashboard={null}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout} />
          <div className="app-main">
            {storageWarning && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", margin: "12px 16px 0",
                background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 8, fontSize: 13, color: "#b45309", fontFamily: "var(--font)"
              }}>
                <span style={{ flex: 1 }}>{storageWarning}</span>
                <button onClick={() => setStorageWarning(null)} style={{
                  background: "none", border: "none", color: "#b45309", cursor: "pointer", fontSize: 16, padding: 4
                }}>&times;</button>
              </div>
            )}
            <ErrorBoundary label="dashboard">
            <OrganizerDashboard
              account={currentAccount}
              onNew={handleNew}
              onOpen={handleOpenEvent}
              onView={handleViewEvent}
              onEdit={handleEditEvent}
              onDuplicate={handleDuplicateEvent}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onFilterCountsChange={setFilterCounts}
            />
            </ErrorBoundary>
          </div>
        </div>
        <MobileLogoHeader onGoHome={() => setScreen("org-dashboard")} />
        <MobileTabBar screen="org-dashboard" phase={null} step={null} setStep={null}
          onNew={handleNew} onMyEvents={null} onEditSetup={null} onManageGymnasts={null}
          onStartComp={null} onDashboard={null}
          onSettings={() => setShowAccountSettings(true)} />
        {showAccountSettings && (
          <AccountSettingsModal
            account={currentAccount}
            profile={currentProfile}
            onSave={handleAccountSave}
            onLogout={handleLogout}
            onClose={() => setShowAccountSettings(false)}
          />
        )}
      </>
    );
  }

  // ---- PIN SETUP ----
  if (screen === "new-pin") {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <nav className="nav"><div className="nav-logo">GYMCOMP<span>.</span></div><div /><div /></nav>
          <PinSetupModal onSet={handlePinSet} onSkip={handlePinSkip} />
        </div>
      </>
    );
  }

  // ---- ACTIVE COMPETITION ----
  // Organisers get app-shell with sidebar; judges (no account) get minimal nav
  const activeContent = (
    <>
      {/* SHARE TOAST */}
      {showShareToast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          background: "var(--accent)", color: "#fff", borderRadius: 16, padding: "12px 24px",
          fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxWidth: "90vw", textAlign: "center", lineHeight: 1.6
        }}>
          Link copied — share with {shareToastType === "coaches" ? "coaches" : "parents"}<br />
          <span style={{ fontWeight: 400, wordBreak: "break-all", fontSize: 11 }}>{shareUrl}</span>
        </div>
      )}

      {/* Offline banner */}
      {!isOnline && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "8px 16px", background: "#f59e0b", color: "#fff", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1l14 14"/><path d="M4.7 4.7A7 7 0 001 8M7 7a4 4 0 00-3 1.5M8 11a1 1 0 100 .01M11 3.5A7 7 0 0115 8M13 5.5"/></svg>
          You're offline — scores are saved locally and will sync when reconnected
          {pendingSyncCount > 0 && <span style={{ background: "rgba(0,0,0,0.2)", borderRadius: 48, padding: "2px 10px", fontSize: 11 }}>{pendingSyncCount} pending</span>}
        </div>
      )}

      {/* Pending sync indicator (online but queue not empty) */}
      {isOnline && pendingSyncCount > 0 && syncStatus === "pending" && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "6px 16px", background: "var(--brand-01)", color: "#fff", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600
        }}>
          Syncing {pendingSyncCount} pending update{pendingSyncCount !== 1 ? "s" : ""}…
          <button onClick={flushSyncQueue} style={{ background: "rgba(255,255,255,0.25)", border: "none", borderRadius: 48, padding: "3px 12px", color: "#fff", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Retry now</button>
        </div>
      )}

      {/* Nav bar — hidden during setup (phase 1), dashboard, gymnast management, and phase 2 for organisers */}
      {!(currentAccount && (phase === 1 || phase === "dashboard" || phase === "gymnasts" || phase === 2)) && (
        <nav className="nav">
          {!currentAccount && (
            <div className="nav-logo" style={{ cursor: "pointer" }} onClick={() => setScreen("auth-login")}>GYMCOMP<span>.</span></div>
          )}
          {currentAccount && <div style={{ width: 8 }} />}

          <div className="nav-centre" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
            {compData.name && (
              <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                <strong style={{ color: "var(--text)" }}>{compData.name}</strong>
                {compData.date && <> · {new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB")}</>}
              </div>
            )}
            {syncStatus !== "idle" && (
              <div style={{ fontSize: 11, color: syncStatus === "saved" ? "var(--success)" : syncStatus === "pending" ? "#f59e0b" : "var(--muted)", cursor: "pointer" }}
                onClick={() => syncStatus === "pending" ? flushSyncQueue() : setShowCompId(v => !v)}>
                {syncDot} {syncLabel}
                {syncStatus === "saved" && <> · <span style={{ fontFamily: "monospace", fontSize: 10 }}>{showCompId ? compId : "ID"}</span></>}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {phase === 2 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResultsXLSX(compData, gymnasts, scores)}>
                  Export XLSX
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResultsPDF(compData, gymnasts, scores)}>
                  Export PDF
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSharePublic}>
                  Share Results
                </button>
              </>
            )}
            {!currentAccount && phase === 2 && <div style={{ width: 8 }} />}
          </div>
        </nav>
      )}

      {/* DASHBOARD */}
      {phase === "dashboard" && (
        <ErrorBoundary label="competition dashboard">
        <CompDashboard
          compData={compData} gymnasts={gymnasts}
          compId={compId} compPin={compPin}
          eventStatus={currentEventId ? events.getAll().find(e => e.id === currentEventId)?.status : undefined}
          onStartComp={handleStartComp}
          onEditSetup={handleEditSetup}
          onManageGymnasts={handleManageGymnasts}
          onUpdateCompData={setCompDataRaw}
          onSetPin={() => {
            pinModalCallback.current = null;
            setShowPinModal(true);
          }}
          onAcceptSubmissions={(newGymnasts) => {
            setGymnastsWithSync(prev => [...prev, ...newGymnasts]);
          }}
        />
        </ErrorBoundary>
      )}

      {/* SETUP phase 1 */}
      {phase === 1 && (
        <ErrorBoundary label="competition setup">
        <div style={{ flex: 1 }}>
          <Step1_CompDetails data={compData} setData={setCompDataLocal} syncStatus={syncStatus} onSave={handleSaveSetup} isExisting={!!(currentEventId && events.getAll().find(e => e.id === currentEventId)?.status !== "draft")}
            onSaveExit={async () => {
              // Partial save — persist and go back to organiser dashboard (event list)
              if (syncTimer.current) clearTimeout(syncTimer.current);
              if (currentEventId) events.snapshot(currentEventId, compData, gymnasts);
              await pushToSupabase(compData, gymnasts);
              setScreen("org-dashboard");
            }}
            onNext={async () => {
              // Full save — all mandatory fields complete
              if (syncTimer.current) clearTimeout(syncTimer.current);
              const ev = currentEventId ? events.getAll().find(e => e.id === currentEventId) : null;
              const isDraft = ev && ev.status === "draft";
              if (currentEventId) {
                events.snapshot(currentEventId, compData, gymnasts);
                if (isDraft) events.update(currentEventId, { status: "active" });
              }
              await pushToSupabase(compData, gymnasts, undefined, isDraft ? "active" : undefined);
              if (!compPin) {
                pinModalCallback.current = () => setPhase("dashboard");
                setShowPinModal(true);
              } else {
                setPhase("dashboard");
              }
            }} />
        </div>
        </ErrorBoundary>
      )}

      {/* GYMNAST MANAGEMENT */}
      {phase === "gymnasts" && (
        <ErrorBoundary label="gymnast management">
        <div style={{ flex: 1 }}>
          <Step2_Gymnasts compData={compData} setCompDataFn={setCompData} data={gymnasts} setData={setGymnastsWithSync}
            onNext={() => setPhase("dashboard")} onBack={() => setPhase("dashboard")} />
        </div>
        </ErrorBoundary>
      )}

      {/* COMPETITION phase 2 — no old sidebar, just content */}
      {phase === 2 && (step === 1 ? (
        <ErrorBoundary label="score input">
        <div style={{ flex: 1 }}>
          <Phase2_Step1 compData={compData} gymnasts={gymnasts} scores={scores} setScores={setScoresWithSync} setStep={setStep}
            onExportPDF={() => exportResultsPDF(compData, gymnasts, scores)} onSharePublic={handleSharePublic} onShareCoach={handleShareCoach}
            isOnline={isOnline} pendingSyncCount={pendingSyncCount} syncStatus={syncStatus} onRetrySync={flushSyncQueue}
            onScoreCommit={pushScoreToTable} onScoreDelete={deleteScoreFromTable} newScoreKeys={newScoreKeys} />
        </div>
        </ErrorBoundary>
      ) : step === 2 ? (
        <ErrorBoundary label="results">
        <div style={{ flex: 1 }}>
          <Phase2_Step2 compData={compData} gymnasts={gymnasts} scores={scores}
            onComplete={currentEventId && events.getAll().find(e => e.id === currentEventId)?.status !== "completed" ? handleCompleteComp : undefined} />
        </div>
        </ErrorBoundary>
      ) : (
        <main className="content" style={{ maxWidth: 1200 }}>
          {step === 3 && <Phase2_Exports compData={compData} gymnasts={gymnasts} scores={scores} onSharePublic={handleSharePublic} onShareCoach={handleShareCoach} />}
          {step === 4 && <MCMode compData={compData} gymnasts={gymnasts} scores={scores} />}
        </main>
      ))}
    </>
  );

  return (
    <>
      <style>{css}</style>
      {currentAccount ? (
        <div className="app-shell">
          <AppSidebar screen="active" phase={phase} step={step} setStep={setStep}
            collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)}
            account={currentAccount} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            filterCounts={filterCounts} activeSection={activeSection}
            onNew={handleNew} onMyEvents={goBackToDashboard} onEditSetup={handleEditSetup}
            onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
            onDashboard={handleGoToDashboard}
            onSettings={() => setShowAccountSettings(true)} onLogout={handleLogout}
            gymnastsCount={gymnasts.length}
            judgesCount={(compData.judges || []).length}
            eventStatus={currentEventId ? events.getAll().find(e => e.id === currentEventId)?.status : undefined}
            allGymnastsComplete={(() => { const rf = ["name","club","level","round","age","group"]; return gymnasts.length === 0 || gymnasts.every(g => rf.every(f => g[f] && g[f].toString().trim())); })()}  />
          <div className="app-main" ref={appMainRef}>
            {activeContent}
          </div>
        </div>
      ) : (
        /* Judge mode — no sidebar, current layout */
        <div className="app">
          {activeContent}
        </div>
      )}

      {currentAccount && (<>
        <MobileLogoHeader onGoHome={goBackToDashboard} />
        <MobileTabBar screen="active" phase={phase} step={step} setStep={setStep}
          onNew={handleNew} onMyEvents={goBackToDashboard} onEditSetup={handleEditSetup}
          onManageGymnasts={handleManageGymnasts} onStartComp={handleStartComp}
          onDashboard={handleGoToDashboard}
          onSettings={() => setShowAccountSettings(true)}
          onSave={phase === 1 ? handleMobileSave : handleSaveSetup}
          saveLabel={phase === 1 ? (setupCanProceed ? "Continue" : "Save & Exit") : "Save"}
          eventStatus={currentEventId ? events.getAll().find(e => e.id === currentEventId)?.status : undefined} />
      </>)}

      {showAccountSettings && (
        <AccountSettingsModal
          account={currentAccount}
          profile={currentProfile}
          onSave={handleAccountSave}
          onLogout={handleLogout}
          onClose={() => setShowAccountSettings(false)}
        />
      )}

      {setupWarn && (
        <ConfirmModal message={setupWarn} confirmLabel="Yes, continue" isDanger={false}
          onConfirm={confirmSetupChange}
          onCancel={() => { setSetupWarn(null); setPendingChange(null); }} />
      )}

      {showPinModal && (
        <PinSetupModal onSet={handlePinSet} onSkip={handlePinSkip} />
      )}

      {leaveEditConfirm && (
        <ConfirmModal
          message="You have unsaved changes. Are you sure you want to leave?"
          confirmLabel="Leave" isDanger={false}
          onConfirm={() => { const fn = leaveEditConfirm; setLeaveEditConfirm(null); fn(); }}
          onCancel={() => setLeaveEditConfirm(null)}
        />
      )}

    </>
  );
}
