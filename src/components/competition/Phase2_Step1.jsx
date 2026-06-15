import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { gymnast_key, combineVaults, calculateNGAScore } from "../../lib/scoring.js";
import { NGA_MAX_SV, NGA_FALL_PENALTY, NGA_COURTESY_SCORE } from "../../lib/constants.js";
import { round2dp } from "../../lib/utils.js";
import { getApparatusIcon } from "../../lib/pdf.js";
import { roundGroups, isValidGroup, nextOrderIndex } from "../../lib/rotations.js";

function Phase2_Step1({ compData, gymnasts, scores, setScores, setStep, onSharePublic, onShareCoach, isOnline, pendingSyncCount, syncStatus, onRetrySync, onScoreCommit, onScoreDelete, newScoreKeys, setGymnasts, onMoveScoreCleanup, pinRole, lockedApparatus, onExit, activeRound: activeRoundProp, setActiveRound: setActiveRoundProp }) {
  const [localRound, setLocalRound] = useState(compData.rounds[0]?.id || "");
  const activeRound = activeRoundProp !== undefined ? activeRoundProp : localRound;
  const setActiveRound = setActiveRoundProp || setLocalRound;
  const [queryModal, setQueryModal] = useState(null); // { gid, app }
  const [queryNote, setQueryNote] = useState("");
  const [scoreModal, setScoreModal] = useState(null); // { gid, app, isEdit }
  const [searchQuery, setSearchQuery] = useState("");
  const [modalFields, setModalFields] = useState({});
  const [modalBufs, setModalBufs] = useState({});
  const [modalPristine, setModalPristine] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { gid, app }
  const [moveModal, setMoveModal] = useState(null); // { gid } or null
  const [moveRound, setMoveRound] = useState("");    // target round id
  const [moveGroup, setMoveGroup] = useState("");    // target rotation label
  const canMoveGymnasts = !!setGymnasts; // organiser-only; judges never receive setGymnasts
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

  // ── Dual-vault per-vault finals (display only) ──
  // Flag-driven: show both stored vault finals beneath the combined total for
  // rows carrying the persisted dualVault flag. The total stays the value fed
  // to all-around / ranking — nothing here recomputes it.
  const renderVaultFinals = (gid, app, total) => {
    if (scores[subKey(gid, app, "dualVault")] !== "1") return null;
    const v1 = parseFloat(scores[subKey(gid, app, "v1fin")]) || 0;
    const v2 = parseFloat(scores[subKey(gid, app, "v2fin")]) || 0;
    if (v1 <= 0 && v2 <= 0) return null;
    const counts = (v) => v > 0 && Math.round(v * 1000) === Math.round((total || 0) * 1000);
    const line = (label, v) => v > 0 ? (
      <div style={{ fontWeight: counts(v) ? 700 : 500, color: counts(v) ? "var(--accent)" : "var(--muted)" }}>{label} {v.toFixed(3)}</div>
    ) : null;
    return (
      <div style={{ fontSize: 9, marginTop: 2, lineHeight: 1.3, color: "var(--muted)", fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
        {line("V1", v1)}{line("V2", v2)}
      </div>
    );
  };

  // ── Dual vault helpers ──────────────────────────────────
  // Dual vault entry is now driven by the comp-level vault mode (FIG only),
  // not by the gymnast's level. NGA keeps its own single-input handling.
  const vaultMode = compData.vaultMode || "single";
  const isVaultApparatus = (app) => (app || "").toLowerCase().includes("vault");
  const isDualVaultForGymnast = (gid, app) => {
    if (isNGA) return false;
    return isVaultApparatus(app) && (vaultMode === "average" || vaultMode === "highest");
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
    return combineVaults(v1, v2, vaultMode);
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
  // ── Group gymnasts ───────────────────────────────────────
  const roundGymnasts = useMemo(() => gymnasts.filter(g => g.round === activeRound), [gymnasts, activeRound]);
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

  // ── Unassigned gymnasts (organiser-only) ─────────────────
  // Anyone not in a valid round+rotation — no round, or a round whose group
  // is not a configured rotation. Membership uses isValidGroup so it stays in
  // step with the assign/move modal. Judges never receive setGymnasts → empty.
  const unassignedGymnasts = useMemo(() =>
    canMoveGymnasts
      ? gymnasts.filter(g => !isValidGroup(compData, g.round, g.group))
                .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0))
      : [],
    [canMoveGymnasts, gymnasts, compData]);

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
      const combined = combineVaults(v1Final, v2Final, vaultMode);

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
        next[baseKey(gid, app)] = combined > 0 ? String(combined) : "";
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
        flatSubset[bk] = combined > 0 ? String(combined) : "";
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

  // ── Move-to-round helpers ────────────────────────────────
  // True if the gymnast has any positive final score under `roundId` specifically.
  // Checks only base score keys of the form `${roundId}__${gid}__${apparatus}`
  // (exactly 3 segments) — NOT the round-blind has-scores check used elsewhere.
  const hasPositiveScoreInRound = (roundId, gid) => {
    if (!roundId) return false;
    return Object.keys(scores).some(k => {
      const parts = k.split("__");
      return parts.length === 3 && parts[0] === roundId && parts[1] === gid && (parseFloat(scores[k]) || 0) > 0;
    });
  };

  const openMoveModal = (gid) => {
    setMoveRound("");
    setMoveGroup("");
    setMoveModal({ gid });
  };

  const confirmMove = () => {
    if (!moveModal) return;
    const g = gymnasts.find(x => x.id === moveModal.gid);
    if (!g) { setMoveModal(null); return; }
    const source = g.round;
    // Hard block — no override — if already scored in the source round.
    if (hasPositiveScoreInRound(source, g.id)) return;
    // Target must be a real round/rotation so the gymnast can never land unassigned.
    if (!moveRound || !isValidGroup(compData, moveRound, moveGroup)) return;

    const idx = nextOrderIndex(gymnasts, moveRound, moveGroup);
    // Only ever touch the one moved gymnast's round / group / orderIndex.
    setGymnasts(prev => prev.map(x =>
      x.id === g.id ? { ...x, round: moveRound, group: moveGroup, orderIndex: idx } : x
    ));

    // Defensively clear any leftover empty/zero score keys for this gymnast under
    // the OLD round only — locally and in the scores table.
    if (source) {
      const prefix = `${source}__${g.id}__`;
      setScores(s => {
        const next = { ...s };
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) delete next[k];
        }
        return next;
      });
      if (onMoveScoreCleanup) onMoveScoreCleanup(source, g.id);
    }

    setMoveModal(null);
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

        {/* ── Unassigned (organiser-only) ── */}
        {unassignedGymnasts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div className="group-header">
              <span className="group-label" style={{ fontFamily: "var(--font-display)" }}>Unassigned</span>
              <div className="group-line" />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, fontFamily: "var(--font-display)" }}>
              {unassignedGymnasts.length} gymnast{unassignedGymnasts.length !== 1 ? "s" : ""} not yet in a round and rotation. Assign each to a round to start scoring.
            </div>
            <div className="table-wrap">
              <table className="si-table" style={{ minWidth: 528, fontFamily: "var(--font-display)" }}>
                <colgroup>
                  <col className="si-col-num" />
                  <col className="si-col-name" />
                  <col className="si-col-club" />
                  <col className="si-col-age" />
                  <col className="si-col-flag" />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Gymnast</th>
                    <th>Club</th>
                    <th>Age</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedGymnasts.map(g => {
                    const isDns = !!g.dns;
                    const isWd = !!g.withdrawn;
                    const dimmed = isDns || isWd;
                    return (
                      <tr key={g.id} style={{ opacity: dimmed ? 0.45 : 1 }}>
                        <td style={{ color: "var(--muted)", fontWeight: 600 }}>{g.number}</td>
                        <td>
                          <strong style={{ textDecoration: dimmed ? "line-through" : "none" }}>{g.name}</strong>
                          {isDns && <span style={{ display: "block", fontSize: 9, color: "var(--danger)", fontWeight: 700, letterSpacing: 0.5 }}>DNS</span>}
                          {isWd && !isDns && <span style={{ display: "block", fontSize: 9, color: "#d97706", fontWeight: 700, letterSpacing: 0.5 }}>WD</span>}
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.club}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{g.age || "—"}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            style={{ fontSize: 10, padding: "3px 10px", whiteSpace: "nowrap", fontFamily: "var(--font-display)" }}
                            title="Assign this gymnast to a round and rotation"
                            onClick={() => openMoveModal(g.id)}>
                            Assign to round
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                                      {renderVaultFinals(g.id, a, appScore)}
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
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch" }}>
                                {!isDns && !canMoveGymnasts && (
                                  <button
                                    className="btn btn-sm"
                                    style={{
                                      fontSize: 10, padding: "3px 8px",
                                      background: hasQuery ? "rgba(240,173,78,0.15)" : "var(--surface2)",
                                      color: hasQuery ? "#f0ad4e" : "var(--muted)",
                                      border: `1px solid ${hasQuery ? "rgba(240,173,78,0.4)" : "var(--border)"}`,
                                      borderRadius: 4, cursor: "pointer",
                                      fontFamily: "var(--font-display)",
                                    }}
                                    onClick={() => {
                                      const firstApp = scoringApparatus[0];
                                      if (hasQuery) resolveQuery(g.id, firstApp);
                                      else openQueryModal(g.id, firstApp);
                                    }}>
                                    {hasQuery ? "Clear" : "Flag"}
                                  </button>
                                )}
                                {canMoveGymnasts && (
                                  <button
                                    className="btn btn-sm"
                                    style={{
                                      fontSize: 10, padding: "3px 8px",
                                      background: "var(--surface2)", color: "var(--muted)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 4, cursor: "pointer",
                                      fontFamily: "var(--font-display)",
                                    }}
                                    title="Move this gymnast to another round"
                                    onClick={() => openMoveModal(g.id)}>
                                    Move
                                  </button>
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
            ))}
          </div>
        ))}
      </div>

      {/* ── Score Modal — Two-column card ── */}
      {scoreModal && (() => {
        const g = gymnasts.find(x => x.id === scoreModal.gid);
        if (!g) return null;
        const dual = modalFields._dual;
        const modalTotal = dual ? calcDualVaultModalTotal() : (isNGA ? calcNGAModalTotal() : calcModalTotal());
        const ngaCourtesyApplied = isNGA && modalTotal === NGA_COURTESY_SCORE && (parseFloat(modalFields.dv) || 0) > 0;
        const n = judgeCount(scoreModal.app);

        const _lbl = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#001af7", fontFamily: "var(--font-display)", marginBottom: 4 };
        const _inp = { caretColor: "transparent", width: "100%", fontSize: 18, padding: "12px 16px", fontWeight: 700, textAlign: "center", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", boxSizing: "border-box" };
        const cardInput = (field, max, autoFocus) => (
          <input className="score-input" type="text" inputMode="decimal"
            value={scoreDisplay(field)}
            style={_inp}
            onChange={() => {}}
            onFocus={() => { if (modalBufs[field]) setModalPristine(p => ({ ...p, [field]: true })); }}
            onKeyDown={handleScoreKey(field, max)}
            onBeforeInput={handleBeforeInput(field, max)}
            autoFocus={autoFocus} />
        );

        const vaultSection = (prefix, label, autoFocusFirst) => (
          <div style={{ background: "rgba(0,13,255,0.04)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ ..._lbl, fontSize: 11, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {label}
              {(() => { const f = calcVaultFinal(modalFields, prefix, scoreModal.app); return f > 0 ? <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{f.toFixed(3)}</span> : null; })()}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>D Score</div>{cardInput(`${prefix}dv`, 10, autoFocusFirst)}</div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>Bonus</div>{cardInput(`${prefix}bon`, 2)}</div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>Penalty</div>{cardInput(`${prefix}pen`, 10)}</div>
            </div>
            <div style={{ ..._lbl, color: "var(--muted)", marginBottom: 6 }}>
              E Score {n > 0 ? `(${n} Judge${n !== 1 ? "s" : ""})` : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>J{i + 1}</div>{cardInput(`${prefix}e${i + 1}`, 10)}</div>
              ))}
            </div>
          </div>
        );

        const infoLbl = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#001af7", fontFamily: "var(--font-display)", marginBottom: 4 };
        const infoVal = { background: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600, color: "var(--text)" };

        return createPortal(
          <div className="modal-backdrop" onClick={() => setScoreModal(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              display: "flex", flexWrap: "wrap",
              maxWidth: dual ? 780 : 720, width: "94%", maxHeight: "94vh",
              borderRadius: 16, overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
            }}>
              {/* ── Left panel — context ── */}
              <div style={{
                flex: "1 1 220px", background: "#f0f0ff", padding: "28px 24px",
                display: "flex", flexDirection: "column", gap: 16,
              }}>
                <div style={{
                  display: "inline-flex", alignSelf: "flex-start",
                  background: isNGA ? "#222" : "#001af7", color: "#fff",
                  fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                  padding: "5px 14px", borderRadius: 56, fontFamily: "var(--font-display)",
                }}>
                  {isNGA ? "NGA Scoring" : "FIG Scoring"}
                </div>
                <div><div style={infoLbl}>Number</div><div style={infoVal}>#{g.number}</div></div>
                <div><div style={infoLbl}>Name</div><div style={infoVal}>{g.name}</div></div>
                {g.club && <div><div style={infoLbl}>Club</div><div style={infoVal}>{g.club}</div></div>}
                <div>
                  <div style={infoLbl}>Apparatus</div>
                  <div style={infoVal}>{getApparatusIcon(scoreModal.app)} {scoreModal.app}</div>
                </div>
                {dual && (
                  <div style={{
                    display: "inline-flex", alignSelf: "flex-start",
                    background: "rgba(0,13,255,0.08)", color: "#001af7",
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                    padding: "4px 12px", borderRadius: 4,
                  }}>Dual Vault</div>
                )}
                <div style={{ flex: 1 }} />
                {scoreModal.isEdit && (
                  <button onClick={() => setDeleteConfirm({ gid: scoreModal.gid, app: scoreModal.app })}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "none", border: "none", color: "var(--danger)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 0",
                    }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M6.67 7.33v4M9.33 7.33v4"/><path d="M3.33 4l.67 9.33a1.33 1.33 0 001.33 1.34h5.34a1.33 1.33 0 001.33-1.34L12.67 4"/></svg>
                    Delete score
                  </button>
                )}
              </div>

              {/* ── Right panel — scoring ── */}
              <div style={{
                flex: "2 1 340px", background: "var(--surface)", padding: "28px 24px",
                overflowY: "auto", maxHeight: "94vh",
                display: "flex", flexDirection: "column",
              }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <button className="btn-icon" onClick={() => setScoreModal(null)} aria-label="Close"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}>×</button>
                </div>

                {dual ? (
                  <>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 240px" }}>{vaultSection("v1", "Vault 1", true)}</div>
                      <div style={{ flex: "1 1 240px" }}>{vaultSection("v2", "Vault 2", false)}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5, fontStyle: "italic" }}>
                      Enter deductions — subtracted from 10. Final = average of both vaults.
                    </div>
                  </>
                ) : isNGA ? (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        <div style={_lbl}>Start Value (SV)</div>
                        {cardInput("dv", NGA_MAX_SV, true)}
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Max 10.0</div>
                      </div>
                    </div>
                    <div style={{ ..._lbl, color: "var(--muted)", marginBottom: 4 }}>
                      Execution Deductions {n > 0 ? `(${n} Judge${n !== 1 ? "s" : ""})` : ""}{n === 0 && <span style={{ color: "#f0ad4e" }}> (none configured)</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10, fontStyle: "italic" }}>
                      Total execution deductions for this routine (0.05 increments)
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                        <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
                          <div style={_lbl}>Judge {i + 1}</div>
                          {cardInput(`e${i + 1}`, 10)}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        <div style={_lbl}>Neutral deductions</div>
                        {cardInput("bon", 10)}
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Missing requirements, restricted skills, etc.</div>
                      </div>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        <div style={_lbl}>Falls</div>
                        <input className="score-input" type="number" inputMode="numeric" min="0" step="1"
                          value={modalFields._falls || 0}
                          onChange={e => { const v = Math.max(0, parseInt(e.target.value) || 0); mf("_falls", v); }}
                          style={{ ..._inp, fontSize: 18 }} />
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Each fall = 0.5 penalty</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>D Score</div>{cardInput("dv", 10, true)}</div>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>Bonus</div>{cardInput("bon", 2)}</div>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}><div style={_lbl}>Penalty</div>{cardInput("pen", 10)}</div>
                    </div>
                    <div style={{ ..._lbl, color: "var(--muted)", marginBottom: 4 }}>
                      Execution {n > 0 ? `(${n} Judge${n !== 1 ? "s" : ""})` : ""}{n === 0 && <span style={{ color: "#f0ad4e" }}> (none configured)</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10, fontStyle: "italic" }}>
                      Enter deductions — subtracted from 10 (e.g. 2.50 = E score of 7.50)
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      {Array.from({ length: Math.max(n, 1) }, (_, i) => (
                        <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
                          <div style={_lbl}>Judge {i + 1}</div>
                          {cardInput(`e${i + 1}`, 10)}
                        </div>
                      ))}
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

                <button className="btn btn-primary" onClick={submitScoreModal}
                  style={{
                    width: "100%", background: "#000dff", color: "#fff",
                    borderRadius: 56, padding: "14px 24px",
                    fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)",
                  }}>
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

      {/* ── Move to Round Modal ── */}
      {moveModal && (() => {
        const g = gymnasts.find(x => x.id === moveModal.gid);
        if (!g) return null;
        const source = g.round;
        // A gymnast not in a valid round+rotation is being assigned, not moved.
        const isUnassigned = !isValidGroup(compData, g.round, g.group);
        const sourceName = compData.rounds.find(r => r.id === source)?.name || "their current round";
        const blocked = hasPositiveScoreInRound(source, g.id);
        // Rounds with rotations configured. For an unassigned gymnast every such
        // round is a target (incl. their current invalid-rotation round); for a
        // normal move the current round is excluded.
        const targetRounds = (compData.rounds || []).filter(r => (isUnassigned || r.id !== source) && roundGroups(compData, r.id).length > 0);
        const rotations = roundGroups(compData, moveRound);
        const canConfirm = !blocked && !!moveRound && isValidGroup(compData, moveRound, moveGroup);
        const ds = { fontFamily: "var(--font-display)" };

        return createPortal(
          <div className="modal-backdrop" onClick={() => setMoveModal(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: "94%", ...ds }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, ...ds }}>{isUnassigned ? "Assign to round" : "Move to another round"}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16, ...ds }}>
                {g.name} · #{g.number}{isUnassigned ? "" : ` · currently in ${sourceName}`}
              </div>

              {blocked ? (
                <div style={{
                  background: "var(--surface2)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "var(--danger)", ...ds,
                }}>
                  {g.name} has already been scored in {sourceName} and cannot be moved.
                </div>
              ) : targetRounds.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)", ...ds }}>
                  No rounds with rotations are available to {isUnassigned ? "assign" : "move"} to.
                </div>
              ) : (
                <>
                  <label className="label" style={ds}>Target round</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {targetRounds.map(r => (
                      <button key={r.id} className={`btn btn-sm ${moveRound === r.id ? "btn-primary" : "btn-secondary"}`}
                        style={ds}
                        onClick={() => { setMoveRound(r.id); setMoveGroup(""); }}>
                        {r.name}
                      </button>
                    ))}
                  </div>

                  {moveRound && (
                    <>
                      <label className="label" style={ds}>Rotation</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        {rotations.map(grp => {
                          const count = gymnasts.filter(x => x.round === moveRound && (x.group || "") === grp && !x.dns && !x.withdrawn).length;
                          return (
                            <button key={grp} className={`btn btn-sm ${moveGroup === grp ? "btn-primary" : "btn-secondary"}`}
                              style={ds}
                              onClick={() => setMoveGroup(grp)}>
                              {grp} ({count})
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, ...ds }}>
                        Added to the end of the selected rotation's running order.
                      </div>
                    </>
                  )}
                </>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn btn-ghost" style={ds} onClick={() => setMoveModal(null)}>
                  {blocked || targetRounds.length === 0 ? "Close" : "Cancel"}
                </button>
                {!blocked && targetRounds.length > 0 && (
                  <button className="btn btn-primary" style={{ ...ds, opacity: canConfirm ? 1 : 0.5 }}
                    disabled={!canConfirm} onClick={confirmMove}>
                    {isUnassigned ? "Assign gymnast" : "Move gymnast"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}

export default Phase2_Step1;
