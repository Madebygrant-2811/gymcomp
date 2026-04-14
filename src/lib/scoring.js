import { NGA_COURTESY_SCORE, NGA_FALL_PENALTY } from './constants.js';

// ── NGA scoring ──────────────────────────────────────────────
/**
 * Calculate NGA final score.
 * Formula: max(5.0, SV − avg(judgeDeductions) − neutralDeductions − (falls × 0.5))
 */
export function calculateNGAScore(sv, judgeDeductions = [], neutralDeductions = 0, falls = 0) {
  const svNum = Number(sv) || 0;
  const neutralNum = Number(neutralDeductions) || 0;
  const fallsNum = Number(falls) || 0;

  const validDeductions = judgeDeductions
    .map(d => Number(d))
    .filter(d => !isNaN(d));

  const avgDeduction = validDeductions.length > 0
    ? validDeductions.reduce((sum, d) => sum + d, 0) / validDeductions.length
    : 0;

  const raw = svNum - avgDeduction - neutralNum - (fallsNum * NGA_FALL_PENALTY);
  const rounded = Math.round(raw * 1000) / 1000;

  return Math.max(NGA_COURTESY_SCORE, rounded);
}

// Standard competition ranking: equal scores share rank, next rank skips (1,2,2,4,5,6)
export const denseRank = (items, scoreKey) => {
  const sorted = [...items].sort((a, b) => b[scoreKey] - a[scoreKey]);
  const result = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][scoreKey] < sorted[i - 1][scoreKey]) rank = i + 1;
    result.push({ ...sorted[i], rank });
  }
  return result;
};

export function gymnast_key(roundId, gymnastId, apparatus) {
  return `${roundId}__${gymnastId}__${apparatus}`;
}

// ── Dual vault detection ─────────────────────────────────────────────────
export function isDualVault(apparatus, levelId, compData) {
  const levelObj = (compData.levels || []).find(l => l.id === levelId);
  const levelName = levelObj ? levelObj.name : "";
  return apparatus.toLowerCase().includes("vault") && levelName.toLowerCase().includes("excel");
}

// ── Scores table ↔ flat object conversion ────────────────────────────────
// Convert scores table rows → flat scores object (used by app state)
export function scoresToFlat(rows) {
  const flat = {};
  for (const row of rows) {
    const bk = `${row.round_id}__${row.gymnast_id}__${row.apparatus}`;
    flat[bk] = row.final_score != null ? String(row.final_score) : "";

    const eScores = row.e_scores;

    // Dual vault: e_scores is an object with dualVault flag
    if (eScores && typeof eScores === "object" && !Array.isArray(eScores) && eScores.dualVault) {
      flat[`${bk}__dualVault`] = "1";
      for (const prefix of ["v1", "v2"]) {
        const v = eScores[prefix];
        if (!v) continue;
        if (v.d != null) flat[`${bk}__${prefix}dv`] = String(v.d);
        if (v.e && Array.isArray(v.e)) {
          for (let i = 0; i < v.e.length; i++) {
            if (v.e[i] != null) flat[`${bk}__${prefix}e${i + 1}`] = String(v.e[i]);
          }
        }
        if (v.bon != null && v.bon !== 0) flat[`${bk}__${prefix}bon`] = String(v.bon);
        if (v.pen != null && v.pen !== 0) flat[`${bk}__${prefix}pen`] = String(v.pen);
        if (v.final != null) flat[`${bk}__${prefix}fin`] = String(v.final);
      }
      continue;
    }

    // Normal score
    if (row.d_score != null) flat[`${bk}__dv`] = String(row.d_score);
    if (row.bonus != null && row.bonus !== 0) flat[`${bk}__bon`] = String(row.bonus);
    if (row.penalty != null && row.penalty !== 0) flat[`${bk}__pen`] = String(row.penalty);
    const eArr = eScores || [];
    if (Array.isArray(eArr)) {
      for (let i = 0; i < eArr.length; i++) {
        if (eArr[i] != null) flat[`${bk}__e${i + 1}`] = String(eArr[i]);
      }
    }
  }
  return flat;
}

// Convert flat scores object → scores table rows (for upserting)
export function flatToScoreRows(flat, compId, submittedBy) {
  // Collect unique base keys (roundId__gymnastId__apparatus)
  const baseKeys = new Set();
  for (const key of Object.keys(flat)) {
    const parts = key.split("__");
    if (parts.length < 3) continue;
    // Skip query/note/resolved metadata keys
    const suffix = parts.length > 3 ? parts.slice(3).join("__") : "";
    if (suffix === "query" || suffix === "queryNote" || suffix === "queryResolved") continue;
    baseKeys.add(`${parts[0]}__${parts[1]}__${parts[2]}`);
  }

  const rows = [];
  for (const bk of baseKeys) {
    const [roundId, gymnastId, apparatus] = bk.split("__");
    const finalScore = parseFloat(flat[bk]) || 0;

    // Dual vault path
    if (flat[`${bk}__dualVault`] === "1") {
      const eScoresObj = { dualVault: true };
      for (const prefix of ["v1", "v2"]) {
        const d = parseFloat(flat[`${bk}__${prefix}dv`]) || 0;
        const eArr = [];
        for (let i = 1; ; i++) {
          const ek = `${bk}__${prefix}e${i}`;
          if (!(ek in flat)) break;
          eArr.push(parseFloat(flat[ek]) || 0);
        }
        const bon = parseFloat(flat[`${bk}__${prefix}bon`]) || 0;
        const pen = parseFloat(flat[`${bk}__${prefix}pen`]) || 0;
        const fin = parseFloat(flat[`${bk}__${prefix}fin`]) || 0;
        if (d > 0 || eArr.length > 0 || fin > 0) {
          eScoresObj[prefix] = { d, e: eArr, bon, pen, final: fin };
        }
      }
      if (finalScore === 0 && !eScoresObj.v1 && !eScoresObj.v2) continue;
      rows.push({
        comp_id: compId,
        round_id: roundId,
        gymnast_id: gymnastId,
        apparatus,
        d_score: null,
        e_scores: eScoresObj,
        bonus: 0,
        penalty: 0,
        final_score: finalScore,
        submitted_by: submittedBy || null,
      });
      continue;
    }

    // Normal path
    const dScore = flat[`${bk}__dv`] != null ? parseFloat(flat[`${bk}__dv`]) || 0 : null;
    const bonus = parseFloat(flat[`${bk}__bon`]) || 0;
    const penalty = parseFloat(flat[`${bk}__pen`]) || 0;

    // Collect e-scores
    const eScores = [];
    for (let i = 1; ; i++) {
      const eKey = `${bk}__e${i}`;
      if (!(eKey in flat)) break;
      eScores.push(parseFloat(flat[eKey]) || 0);
    }

    // Skip rows where final_score is 0 and no d_score exists (no real data)
    if (finalScore === 0 && dScore == null) continue;

    rows.push({
      comp_id: compId,
      round_id: roundId,
      gymnast_id: gymnastId,
      apparatus,
      d_score: dScore,
      e_scores: eScores.length > 0 ? eScores : [],
      bonus,
      penalty,
      final_score: finalScore,
      submitted_by: submittedBy || null,
    });
  }
  return rows;
}
