import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { gymnast_key, isDualVault, calculateNGAScore } from "../../lib/scoring.js";
import { NGA_MAX_SV, NGA_FALL_PENALTY, NGA_COURTESY_SCORE } from "../../lib/constants.js";
import { round2dp } from "../../lib/utils.js";
import { getApparatusIcon } from "../../lib/pdf.js";
import GymCompLogomark from "../../assets/Logomark.svg";

function Phase2_Step1({ compData, gymnasts, scores, setScores, setStep, onExportPDF, onSharePublic, onShareCoach, isOnline, pendingSyncCount, syncStatus, onRetrySync, onScoreCommit, onScoreDelete, newScoreKeys, pinRole, lockedApparatus, onExit, activeRound: activeRoundProp, setActiveRound: setActiveRoundProp }) {
  const [localRound, setLocalRound] = useState(compData.rounds[0]?.id || "");
  const activeRound = activeRoundProp !== undefined ? activeRoundProp : localRound;
  const setActiveRound = setActiveRoundProp || setLocalRound;
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
  const isNGA = compData.scoringMode === "nga";
  const fig = !isNGA;
  const allScoringApparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const isLockedJudge = pinRole === "judge" && lockedApparatus;
  const scoringApparatus = isLockedJudge ? allScoringApparatus.filter(a => a === lockedApparatus) : allScoringApparatus;

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

  // ── NGA total recalculation ────────────────────────────────
  const recalcNGATotal = (next, gid, app) => {
    const sv = parseFloat(next[subKey(gid, app, "dv")]) || 0;
    const neutral = parseFloat(next[subKey(gid, app, "bon")]) || 0; // NGA: bon field = neutral deductions
    const fallsPen = parseFloat(next[subKey(gid, app, "pen")]) || 0; // NGA: pen field = falls × 0.5
    const falls = fallsPen / NGA_FALL_PENALTY;
    const n = judgeCount(app);
    const judgeDeductions = [];
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(next[subKey(gid, app, `e${i}`)]);
      if (!isNaN(v)) judgeDeductions.push(v);
    }
    const hasAny = sv > 0;
    if (hasAny) {
      const total = calculateNGAScore(sv, judgeDeductions, neutral, falls);
      next[baseKey(gid, app)] = String(parseFloat(total.toFixed(3)));
    } else {
      next[baseKey(gid, app)] = "";
    }
  };

  const commitField = (gid, app, sub, raw) => {
    const rounded = round2dp(raw);
    const val = rounded === "" ? "" : rounded;
    setScores(s => {
      const n = { ...s, [sub ? subKey(gid, app, sub) : baseKey(gid, app)]: val };
      (isNGA ? recalcNGATotal : recalcTotal)(n, gid, app);
      return n;
    });
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
    scoringApparatus.reduce((s, a) => s + getAppTotal(gid, a), 0);

  // ── Dual vault helpers ──────────────────────────────────
  const isDualVaultForGymnast = (gid, app) => {
    const g = gymnasts.find(x => x.id === gid);
    if (!g) return false;
    return isDualVault(app, g.level, compData);
  };

  const calcVaultFinal = (fields, prefix, app) => {
    const dv = parseFloat(fields[`${prefix}dv`]) || 0;
    const bonus = parseFloat(fields[`${prefix}bon`]) || 0;
    const pen = parseFloat(fields[`${prefix}pen`]) || 0;
    const n = judgeCount(app);
    let eSum = 0, eCount = 0;
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(fields[`${prefix}e${i}`]);
      if (!isNaN(v)) { eSum += (10 - v); eCount++; }
    }
    const eAvg = eCount > 0 ? eSum / eCount : 0;
    const hasAny = dv > 0 || bonus > 0 || eAvg > 0;
    return hasAny ? Math.max(0, dv + bonus + eAvg - pen) : 0;
  };

  const calcDualVaultModalTotal = () => {
    const app = scoreModal?.app || "";
    const v1 = calcVaultFinal(modalFields, "v1", app);
    const v2 = calcVaultFinal(modalFields, "v2", app);
    if (v1 > 0 && v2 > 0) return (v1 + v2) / 2;
    if (v1 > 0) return v1;
    return 0;
  };

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
  const roundGymnasts = useMemo(() => gymnasts.filter(g => g.round === activeRound), [gymnasts, activeRound]);

  // Unfiltered groups for sheet tracker
  const allGroups = useMemo(() => {
    const groups = [];
    const seen = {};
    roundGymnasts.forEach(g => {
      const levelName = compData.levels.find(l => l.id === g.level)?.name || g.level;
      const grp = g.group || "\u2014";
      const key = `${levelName}__${grp}`;
      if (!seen[key]) {
        seen[key] = true;
        groups.push({ key, level: levelName, group: grp });
      }
    });
    return groups;
  }, [roundGymnasts, compData.levels]);
  const appCount = scoringApparatus.length;
  const totalSheets = allGroups.length * appCount;
  const sheetsIn = (roundId) => {
    const rd = sheetReceived[roundId] || {};
    return Object.values(rd).filter(Boolean).length;
  };
  const filteredGymnasts = useMemo(() => searchQuery.trim()
    ? roundGymnasts.filter(g => {
        const q = searchQuery.toLowerCase();
        return (g.name || "").toLowerCase().includes(q)
          || (g.number || "").toString().toLowerCase().includes(q)
          || (g.club || "").toLowerCase().includes(q);
      })
    : roundGymnasts, [roundGymnasts, searchQuery]);

  const grouped = useMemo(() => {
    const g = {};
    filteredGymnasts.forEach(gym => {
      const grp = gym.group || "\u2014";
      const levelName = compData.levels.find(l => l.id === gym.level)?.name || gym.level || "No Level";
      if (!g[grp]) g[grp] = {};
      if (!g[grp][levelName]) g[grp][levelName] = [];
      g[grp][levelName].push(gym);
    });
    // Sort gymnasts by number within each level
    Object.values(g).forEach(levels => {
      Object.values(levels).forEach(arr => arr.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0)));
    });
    return g;
  }, [filteredGymnasts, compData.levels]);

  const sortedGroupKeys = useMemo(() =>
    Object.keys(grouped).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, "")) || 0;
      const nb = parseInt(b.replace(/\D/g, "")) || 0;
      return na - nb;
    }), [grouped]);

  // ── Score Modal helpers ──────────────────────────────────
  const openScoreModal = (gid, app, isEdit) => {
    const fields = {};
    const bufs = {};
    const toBuf = (v) => { const n = parseFloat(v); return (!v || isNaN(n) || n === 0) ? "" : n.toFixed(2); };
    fields.app = app;
    const dual = isDualVaultForGymnast(gid, app);
    fields._dual = dual;

    if (dual) {
      const n = judgeCount(app);
      for (const prefix of ["v1", "v2"]) {
        for (const sub of ["dv", "bon", "pen"]) {
          const v = readVal(gid, app, `${prefix}${sub}`);
          fields[`${prefix}${sub}`] = v;
          bufs[`${prefix}${sub}`] = toBuf(v);
        }
        for (let i = 1; i <= Math.max(n, 1); i++) {
          const v = readVal(gid, app, `${prefix}e${i}`);
          fields[`${prefix}e${i}`] = v;
          bufs[`${prefix}e${i}`] = toBuf(v);
        }
      }
    } else {
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
      // NGA: derive falls count from stored penalty value for display
      if (isNGA) {
        const penVal = parseFloat(readVal(gid, app, "pen")) || 0;
        const fallsCount = NGA_FALL_PENALTY > 0 ? Math.round(penVal / NGA_FALL_PENALTY) : 0;
        fields._falls = fallsCount;
      }
    }
    setModalFields(fields);
    setModalBufs(bufs);
    const pristine = {};
    for (const k in bufs) if (bufs[k]) pristine[k] = true;
    setModalPristine(pristine);
    setScoreModal({ gid, app, isEdit });
  };

  const calcModalTotal = () => {
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

  const calcNGAModalTotal = () => {
    const sv = parseFloat(modalFields.dv) || 0;
    if (sv <= 0) return 0;
    const neutral = parseFloat(modalFields.bon) || 0;
    const falls = modalFields._falls || 0;
    const app = scoreModal?.app || "";
    const n = judgeCount(app);
    const deductions = [];
    for (let i = 1; i <= Math.max(n, 1); i++) {
      const v = parseFloat(modalFields[`e${i}`]);
      if (!isNaN(v)) deductions.push(v);
    }
    return calculateNGAScore(sv, deductions, neutral, falls);
  };

  const submitScoreModal = () => {
    const { gid, app } = scoreModal;
    const dual = modalFields._dual;

    if (dual) {
      // Dual vault submit
      const v1Final = calcVaultFinal(modalFields, "v1", app);
      const v2Final = calcVaultFinal(modalFields, "v2", app);
      const avg = (v1Final > 0 && v2Final > 0) ? (v1Final + v2Final) / 2 : (v1Final > 0 ? v1Final : 0);

      setScores(s => {
        const next = { ...s };
        next[subKey(gid, app, "dualVault")] = "1";
        const n = judgeCount(app);
        for (const prefix of ["v1", "v2"]) {
          for (const sub of ["dv", "bon", "pen"]) {
            next[subKey(gid, app, `${prefix}${sub}`)] = round2dp(modalFields[`${prefix}${sub}`]);
          }
          for (let i = 1; i <= Math.max(n, 1); i++) {
            next[subKey(gid, app, `${prefix}e${i}`)] = round2dp(modalFields[`${prefix}e${i}`]);
          }
          const fin = calcVaultFinal(modalFields, prefix, app);
          next[subKey(gid, app, `${prefix}fin`)] = fin > 0 ? String(parseFloat(fin.toFixed(3))) : "";
        }
        next[baseKey(gid, app)] = avg > 0 ? String(parseFloat(avg.toFixed(3))) : "";
        return next;
      });

      if (onScoreCommit) {
        const bk = baseKey(gid, app);
        const flatSubset = {};
        flatSubset[`${bk}__dualVault`] = "1";
        const n = judgeCount(app);
        for (const prefix of ["v1", "v2"]) {
          for (const sub of ["dv", "bon", "pen"]) {
            flatSubset[`${bk}__${prefix}${sub}`] = round2dp(modalFields[`${prefix}${sub}`]);
          }
          for (let i = 1; i <= Math.max(n, 1); i++) {
            flatSubset[`${bk}__${prefix}e${i}`] = round2dp(modalFields[`${prefix}e${i}`]);
          }
          const fin = calcVaultFinal(modalFields, prefix, app);
          flatSubset[`${bk}__${prefix}fin`] = fin > 0 ? String(parseFloat(fin.toFixed(3))) : "";
        }
        flatSubset[bk] = avg > 0 ? String(parseFloat(avg.toFixed(3))) : "";
        onScoreCommit(activeRound, gid, app, flatSubset);
      }
    } else if (isNGA) {
      // NGA mode submit
      // NGA field reuse:
      //   dv      → SV (Start Value)
      //   e1..eN  → array of per-judge execution deductions (raw values, NOT subtracted from 10)
      //   bon     → neutral deductions total
      //   pen     → falls × NGA_FALL_PENALTY (stored as the deduction amount, not fall count)
      const falls = modalFields._falls || 0;
      const penVal = round2dp(String(falls * NGA_FALL_PENALTY));

      setScores(s => {
        const next = { ...s };
        next[subKey(gid, app, "dv")] = round2dp(modalFields.dv);
        next[subKey(gid, app, "bon")] = round2dp(modalFields.bon);
        next[subKey(gid, app, "pen")] = penVal;
        const n = judgeCount(app);
        for (let i = 1; i <= Math.max(n, 1); i++) next[subKey(gid, app, `e${i}`)] = round2dp(modalFields[`e${i}`]);
        recalcNGATotal(next, gid, app);
        return next;
      });
      if (onScoreCommit) {
        const bk = baseKey(gid, app);
        const flatSubset = {};
        flatSubset[`${bk}__dv`] = round2dp(modalFields.dv);
        flatSubset[`${bk}__bon`] = round2dp(modalFields.bon);
        flatSubset[`${bk}__pen`] = penVal;
        const n = judgeCount(app);
        const deductions = [];
        for (let i = 1; i <= Math.max(n, 1); i++) {
          flatSubset[`${bk}__e${i}`] = round2dp(modalFields[`e${i}`]);
          const v = parseFloat(round2dp(modalFields[`e${i}`]));
          if (!isNaN(v)) deductions.push(v);
        }
        const sv = parseFloat(round2dp(modalFields.dv)) || 0;
        const neutral = parseFloat(round2dp(modalFields.bon)) || 0;
        if (sv > 0) {
          flatSubset[bk] = String(parseFloat(calculateNGAScore(sv, deductions, neutral, falls).toFixed(3)));
        } else {
          flatSubset[bk] = "";
        }
        onScoreCommit(activeRound, gid, app, flatSubset);
      }
    } else {
      // FIG normal submit
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
      if (onScoreCommit) {
        const bk = baseKey(gid, app);
        const flatSubset = {};
        flatSubset[bk] = "";
        flatSubset[`${bk}__dv`] = round2dp(modalFields.dv);
        flatSubset[`${bk}__bon`] = round2dp(modalFields.bon);
        flatSubset[`${bk}__pen`] = round2dp(modalFields.pen);
        const n = judgeCount(app);
        for (let i = 1; i <= Math.max(n, 1); i++) flatSubset[`${bk}__e${i}`] = round2dp(modalFields[`e${i}`]);
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
        onScoreCommit(activeRound, gid, app, flatSubset);
      }
    }
    setScoreModal(null);
  };

  const deleteScore = (gid, app) => {
    setScores(s => {
      const next = { ...s };
      delete next[baseKey(gid, app)];
      for (const sub of ["dv","bon","pen"]) delete next[subKey(gid, app, sub)];
      const n = judgeCount(app);
      for (let i = 1; i <= Math.max(n, 1); i++) delete next[subKey(gid, app, `e${i}`)];
      // Clean up dual vault keys
      delete next[subKey(gid, app, "dualVault")];
      for (const prefix of ["v1", "v2"]) {
        for (const sub of ["dv","bon","pen","fin"]) delete next[subKey(gid, app, `${prefix}${sub}`)];
        for (let i = 1; i <= Math.max(n, 1); i++) delete next[subKey(gid, app, `${prefix}e${i}`)];
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
          <img src={GymCompLogomark} alt="GymComp" style={{ height: 22, flexShrink: 0, filter: "brightness(0) invert(1)", opacity: 0.9 }} />
          {compData.name && <span className="setup-topbar-name">{compData.name}</span>}
          {compData.date && <span className="setup-topbar-meta">{new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          {compData.venue && <span className="setup-topbar-meta">{compData.venue}</span>}
          {!compData.name && <span className="setup-topbar-name" style={{ opacity: 0.6 }}>Score Input</span>}
        </div>
        <div className="setup-topbar-right">
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
          {!isLockedJudge && onSharePublic && (
            <button className="btn btn-sm" onClick={onSharePublic}
              style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.25)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.5)" }}>
              Share Live Scores — Public
            </button>
          )}
          {!isLockedJudge && onShareCoach && (
            <button className="btn btn-sm" onClick={onShareCoach}
              style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.25)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.5)" }}>
              Share Live Scores — Coaches
            </button>
          )}
          {onExit && (
            <span className="pin-mobile-only">
              <button className="btn btn-sm" onClick={onExit}
                style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "var(--text-alternate)", border: "1px solid rgba(255,255,255,0.3)" }}>
                Exit
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="si-body" style={{ marginTop: 24 }}>
        {/* ── Sheet Received Tracker (hidden for PIN judges) ── */}
        {!onExit && allGroups.length > 0 && appCount > 0 && (
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
                      {scoringApparatus.map(a => <th key={a} style={{ textAlign: "center" }}>{getApparatusIcon(a)} {a}</th>)}
                      <th style={{ textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allGroups.map(({ key, level, group }) => {
                      const groupDone = scoringApparatus.every(a => isSheetIn(activeRound, key, a));
                      const groupCount = scoringApparatus.filter(a => isSheetIn(activeRound, key, a)).length;
                      return (
                        <tr key={key}>
                          <td style={{ fontWeight: 600, fontSize: 12 }}>{level} · {group}</td>
                          {scoringApparatus.map(app => {
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

        {onExit && (
          <div className="pin-mobile-only" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
            {isLockedJudge && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 14px", borderRadius: 56,
                background: "var(--brand-01)", color: "var(--text-alternate)",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
              }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14V3a1 1 0 00-1-1H5a1 1 0 00-1 1v11M6 5h4M6 8h4M6 11h2"/></svg>
                {lockedApparatus}
              </span>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onExit}
              style={{ fontSize: 12, padding: "5px 14px" }}>
              Exit
            </button>
          </div>
        )}

        {/* ── Search + Round Tabs ── */}
        <div className="si-toolbar">
          <div className="si-search" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label className="label" style={{ marginBottom: 0, whiteSpace: "nowrap", flexShrink: 0 }}>Search by name, number, or club</label>
            <input
              className="input"
              type="text"
              placeholder="Start typing..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ marginBottom: 0 }}
            />
          </div>
          <div className={`tabs${onExit ? " pin-mobile-only" : ""}`}>
            {compData.rounds.map(r => (
              <button key={r.id} className={`tab-btn ${activeRound === r.id ? "active" : ""}`}
                onClick={() => setActiveRound(r.id)}>{r.name}</button>
            ))}
          </div>
        </div>

        {Object.keys(grouped).length === 0 && <div className="empty">{searchQuery ? "No gymnasts match your search" : "No gymnasts in this round"}</div>}

        {/* ── Grouped Tables ── */}
        {sortedGroupKeys.map(grp => (
          <div key={grp}>
            <div className="group-header">
              <span className="group-label">{grp}</span>
              <div className="group-line" />
            </div>
            {Object.entries(grouped[grp]).map(([level, glist]) => (
              <div key={level} style={{ marginBottom: 24 }}>
                <div className="sub-group-label">{level}</div>
                <div className="table-wrap">
                  <table className="si-table" style={{ minWidth: 388 + scoringApparatus.length * 100 + 140 }}>
                    <colgroup>
                      <col className="si-col-num" />
                      <col className="si-col-name" />
                      <col className="si-col-club" />
                      <col className="si-col-age" />
                      {scoringApparatus.map(a => <col key={a} className="si-col-app" />)}
                      <col className="si-col-total" />
                      <col className="si-col-flag" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Gymnast</th>
                        <th>Club</th>
                        <th>Age</th>
                        {scoringApparatus.map(a => <th key={a}>{getApparatusIcon(a)} {a}</th>)}
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {glist.map(g => {
                        const gymTotal = getGymnastTotal(g.id);
                        const isDns = !!g.dns;
                        const isWd = !!g.withdrawn;
                        const dimmed = isDns || isWd;
                        const hasQuery = scoringApparatus.some(a => isQueried(g.id, a));
                        return (
                          <tr key={g.id} style={{ opacity: dimmed ? 0.45 : 1 }}>
                            <td style={{ color: "var(--muted)", fontWeight: 600 }}>{g.number}</td>
                            <td>
                              <strong style={{ textDecoration: dimmed ? "line-through" : "none" }}>{g.name}</strong>
                              {isDns && <span style={{ display: "block", fontSize: 9, color: "var(--danger)", fontWeight: 700, letterSpacing: 0.5 }}>DNS</span>}
                              {isWd && !isDns && <span style={{ display: "block", fontSize: 9, color: "#d97706", fontWeight: 700, letterSpacing: 0.5 }}>WD</span>}
                            </td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.club}</td>
                            <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.age || "\u2014"}</td>
                            {scoringApparatus.map(a => {
                              const appScore = getAppTotal(g.id, a);
                              const queried = isQueried(g.id, a);
                              const flashBk = baseKey(g.id, a);
                              const isFlashing = newScoreKeys && newScoreKeys.has(flashBk);
                              return (
                                <td key={a} className={isFlashing ? "score-flash" : ""}>
                                  {dimmed ? (
                                    <span style={{ color: "var(--muted)" }}>\u2014</span>
                                  ) : appScore > 0 ? (
                                    <div className="si-score-cell">
                                      <span className="si-score-val si-score-clickable" style={{ color: queried ? "#f0ad4e" : undefined }}
                                        title="Click to edit score"
                                        onClick={() => openScoreModal(g.id, a, true)}>
                                        {appScore.toFixed(3)}
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
                                {gymTotal > 0 ? gymTotal.toFixed(3) : "\u2014"}
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
                                    const firstApp = scoringApparatus[0];
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
        const dual = modalFields._dual;
        const modalTotal = dual ? calcDualVaultModalTotal() : (isNGA ? calcNGAModalTotal() : calcModalTotal());
        const ngaCourtesyApplied = isNGA && modalTotal === NGA_COURTESY_SCORE && (parseFloat(modalFields.dv) || 0) > 0;
        const n = judgeCount(scoreModal.app);

        const vaultSection = (prefix, label, autoFocusFirst) => (
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)", marginBottom: 8 }}>
              {label}
              {(() => { const f = calcVaultFinal(modalFields, prefix, scoreModal.app); return f > 0 ? <span style={{ float: "right", fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{f.toFixed(3)}</span> : null; })()}
            </div>
            <div className="si-modal-fields">
              <div className="si-modal-field"><label>D Score</label>{scoreInput(`${prefix}dv`, 10, autoFocusFirst)}</div>
              <div className="si-modal-field"><label>Bonus</label>{scoreInput(`${prefix}bon`, 2)}</div>
              <div className="si-modal-field"><label>Penalty</label>{scoreInput(`${prefix}pen`, 10)}</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 4, marginTop: 6 }}>
              E Score {n > 0 ? `(${n} Judge${n !== 1 ? "s" : ""})` : ""}
            </div>
            <div className="si-modal-fields">
              {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                <div className="si-modal-field" key={i}><label>J{i + 1}</label>{scoreInput(`${prefix}e${i + 1}`, 10)}</div>
              ))}
            </div>
          </div>
        );

        return createPortal(
          <div className="modal-backdrop" onClick={() => setScoreModal(null)}>
            <div className="modal-box" style={{ maxWidth: dual ? 680 : 500 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{scoreModal.isEdit ? "Edit Score" : "Add Score"}</div>
                <button className="btn-icon" onClick={() => setScoreModal(null)} aria-label="Close" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>×</button>
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
                  {dual && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "rgba(0,13,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>Dual Vault</span>}
                </div>
              </div>

              {dual ? (
                <>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>{vaultSection("v1", "Vault 1", true)}</div>
                    <div style={{ flex: 1 }}>{vaultSection("v2", "Vault 2", false)}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5, fontStyle: "italic" }}>
                    Enter deductions — subtracted from 10. Final = average of both vaults.
                  </div>
                </>
              ) : isNGA ? (
                <>
                  <div className="si-modal-fields">
                    <div className="si-modal-field">
                      <label>Start Value (SV)</label>
                      {scoreInput("dv", NGA_MAX_SV, true)}
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>Max 10.0</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 6, marginTop: 8 }}>
                    Execution Deductions {n > 0 ? `(${n} Judge${n !== 1 ? "s" : ""})` : ""}{n === 0 && <span style={{ color: "#f0ad4e" }}> (none configured)</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontStyle: "italic" }}>
                    Total execution deductions for this routine (0.05 increments)
                  </div>
                  <div className="si-modal-fields">
                    {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                      <div className="si-modal-field" key={i}>
                        <label>Judge {i + 1} deductions</label>
                        {scoreInput(`e${i + 1}`, 10)}
                      </div>
                    ))}
                  </div>

                  <div className="si-modal-fields" style={{ marginTop: 8 }}>
                    <div className="si-modal-field">
                      <label>Neutral deductions</label>
                      {scoreInput("bon", 10)}
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>Missing requirements, restricted skills, no-dismount, etc.</span>
                    </div>
                    <div className="si-modal-field">
                      <label>Falls</label>
                      <input className="score-input" type="number" inputMode="numeric" min="0" step="1"
                        value={modalFields._falls || 0}
                        onChange={e => {
                          const v = Math.max(0, parseInt(e.target.value) || 0);
                          mf("_falls", v);
                        }}
                        style={{ width: "100%", fontSize: 20, padding: "14px 20px", fontWeight: 700, textAlign: "center", borderRadius: 12 }} />
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>Each fall = 0.5 penalty</span>
                    </div>
                  </div>
                </>
              ) : (
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
              )}

              <div className="si-modal-total">
                {modalTotal > 0 ? modalTotal.toFixed(3) : "\u2014"}
              </div>
              {ngaCourtesyApplied && (
                <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", marginTop: -24, marginBottom: 12 }}>
                  (courtesy score applied)
                </div>
              )}

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

export default Phase2_Step1;
