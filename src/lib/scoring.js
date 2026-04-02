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

// ── Scores table ↔ flat object conversion ────────────────────────────────
// Convert scores table rows → flat scores object (used by app state)
export function scoresToFlat(rows) {
  const flat = {};
  for (const row of rows) {
    const bk = `${row.round_id}__${row.gymnast_id}__${row.apparatus}`;
    flat[bk] = row.final_score != null ? String(row.final_score) : "";
    if (row.d_score != null) flat[`${bk}__dv`] = String(row.d_score);
    if (row.bonus != null && row.bonus !== 0) flat[`${bk}__bon`] = String(row.bonus);
    if (row.penalty != null && row.penalty !== 0) flat[`${bk}__pen`] = String(row.penalty);
    const eScores = row.e_scores || [];
    for (let i = 0; i < eScores.length; i++) {
      if (eScores[i] != null) flat[`${bk}__e${i + 1}`] = String(eScores[i]);
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
