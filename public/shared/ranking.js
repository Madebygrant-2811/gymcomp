// Shared ranking logic for GymComp — a plain ESM module used by BOTH the Vite
// bundle (src files import it by relative path) and the standalone vanilla
// pages (results.html / coach.html import it directly as a module script).
// Single implementation of the score-key builder, the ranking sort with its
// quantisation helper, the rank-group builder and the running-order
// comparators. Surface-level behavioural differences (age fallback label,
// group ordering, within-group sorting, ranking mode sourcing) are parameters
// — this module must reproduce each caller's existing output exactly.

// ── Score keys ──────────────────────────────────────────────
export function gymnast_key(roundId, gymnastId, apparatus) {
  return `${roundId}__${gymnastId}__${apparatus}`;
}

// ── Ranking sort ────────────────────────────────────────────
// Quantise to 3dp (the precision scores are displayed/judged at) for
// comparison only, so floating-point sums identical on screen share a rank.
export const quantise3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

// Competition ranking. Equal scores always share a rank.
// mode "standard" (default): next rank skips tied places (1, 1, 3)
// mode "dense": next rank does not skip (1, 1, 2)
export function denseRank(items, scoreKey, mode = "standard") {
  const q = (item) => quantise3(item[scoreKey]);
  const sorted = [...items].sort((a, b) => q(b) - q(a));
  const result = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && q(sorted[i]) < q(sorted[i - 1])) {
      rank = mode === "dense" ? rank + 1 : i + 1;
    }
    result.push({ ...sorted[i], rank });
  }
  return result;
}

// ── Running order ───────────────────────────────────────────
// Rotation (group) labels configured for a given round.
export function roundGroups(compData, roundId) {
  return (compData?.groupsByRound || {})[roundId] || [];
}

// Running-order comparison within one round+group bucket: orderIndex first,
// then number, then name. Numbers are only rewritten on save, so they can lag
// a just-edited order — they only tiebreak gymnasts without an orderIndex.
export function runningOrderCompare(a, b) {
  const ai = typeof a.orderIndex === "number" ? a.orderIndex : Number.MAX_SAFE_INTEGER;
  const bi = typeof b.orderIndex === "number" ? b.orderIndex : Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  const an = parseInt(a.number) || Number.MAX_SAFE_INTEGER;
  const bn = parseInt(b.number) || Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  return (a.name || "").localeCompare(b.name || "");
}

// Comparator for a whole round: rotations in configured order, running order
// within each rotation. Gymnasts in unknown rotations sort last.
export function roundRunningOrderCompare(compData, roundId) {
  const groupOrder = roundGroups(compData, roundId);
  const gi = (g) => {
    const i = groupOrder.indexOf(g.group || "");
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return (a, b) => {
    const d = gi(a) - gi(b);
    return d !== 0 ? d : runningOrderCompare(a, b);
  };
}

// ── Rank groups ─────────────────────────────────────────────
// Groups a gymnast list along an explicit dimension:
//   "rankBy"    — by level, sub-split by age where that level's rankBy is
//                 "level+age" (what every current surface uses)
//   "level"     — by level only
//   "age"       — by age only
//   "level+age" — by level and age unconditionally
//   "club"      — by club (club carried in levelName)
//   "all"       — the whole competition as one group
//
// Options:
//   ageFallback  — label when an age-grouped gymnast has no age. Converged
//                  default "Age not set" (used by the results screen, results
//                  PDF, XLSX export and both public pages); MC Mode still
//                  passes "" explicitly. The start-competition checklist
//                  blocks this case at source, so the label is a backstop.
//   sortGroups   — "levelOrder" (default): configured level order, unknown
//                  last — every surface except MC Mode, which passes
//                  "keyAlpha" (localeCompare on the "level|||age" key).
//                  "labelAlpha" (localeCompare on levelName+ageLabel) and
//                  null (insertion order) remain available.
//   sortGymnasts — comparator applied within each group, or null to keep the
//                  input order
//   roundId      — when set, the pool is that round's gymnasts PLUS every
//                  gymnast (any round) whose level has rankScope
//                  "competition": a level split across rounds ranks as one
//                  group. Levels default to rankScope "round".
//   rounds       — the competition's rounds array, for round ordering.
//   crossRoundPlacement — with roundId set: "every" (default) emits a
//                  cross-round group under every round it spans (screens);
//                  "first" emits it only under its first participating round
//                  (print / announcements, so awards appear once). "first"
//                  requires `rounds`.
export function buildRankGroups(gymnasts, {
  levels = [],
  dimension = "rankBy",
  ageFallback = "Age not set",
  sortGroups = "levelOrder",
  sortGymnasts = null,
  roundId = null,
  rounds = null,
  crossRoundPlacement = "every",
} = {}) {
  let pool = gymnasts;
  if (roundId != null) {
    const isCrossRound = (g) =>
      levels.find((l) => l.id === g.level)?.rankScope === "competition";
    // Rounds each cross-round level actually spans — the combined group only
    // appears under those rounds, never under uninvolved ones.
    const levelRounds = {};
    gymnasts.forEach((g) => {
      if (!g.round || !isCrossRound(g)) return;
      (levelRounds[g.level] = levelRounds[g.level] || new Set()).add(g.round);
    });
    // First round (in configured order) containing each cross-round level
    const firstRoundOf = {};
    if (crossRoundPlacement === "first" && rounds) {
      const order = new Map(rounds.map((r, i) => [r.id, i]));
      Object.entries(levelRounds).forEach(([lid, rids]) => {
        firstRoundOf[lid] = [...rids].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999))[0];
      });
    }
    pool = gymnasts.filter((g) => {
      if (!g.round) return false;
      if (isCrossRound(g)) {
        if (!levelRounds[g.level]?.has(roundId)) return false;
        return crossRoundPlacement === "first" && rounds
          ? firstRoundOf[g.level] === roundId
          : true;
      }
      return g.round === roundId;
    });
  }

  const map = {};
  pool.forEach((g) => {
    const levelObj = levels.find((l) => l.id === g.level);
    const levelName = levelObj?.name || "Unknown";
    const rankBy = levelObj?.rankBy || "level";
    const age = g.age || ageFallback;
    let entry;
    switch (dimension) {
      case "level": entry = { levelName, ageLabel: "" }; break;
      case "age": entry = { levelName: "", ageLabel: age }; break;
      case "level+age": entry = { levelName, ageLabel: age }; break;
      case "club": entry = { levelName: g.club || "No club", ageLabel: "" }; break;
      case "all": entry = { levelName: "", ageLabel: "" }; break;
      case "rankBy":
      default: entry = { levelName, ageLabel: rankBy === "level+age" ? age : "" };
    }
    const key = `${entry.levelName}|||${entry.ageLabel}`;
    if (!map[key]) map[key] = { ...entry, gymnasts: [] };
    map[key].gymnasts.push(g);
  });

  if (sortGymnasts) Object.values(map).forEach((grp) => grp.gymnasts.sort(sortGymnasts));

  let entries = Object.entries(map);
  if (sortGroups === "levelOrder") {
    const levelOrder = levels.map((l) => l.name);
    entries = entries.sort(([a], [b]) => {
      const ai = levelOrder.indexOf(a.split("|||")[0]);
      const bi = levelOrder.indexOf(b.split("|||")[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } else if (sortGroups === "keyAlpha") {
    entries = entries.sort(([a], [b]) => a.localeCompare(b));
  } else if (sortGroups === "labelAlpha") {
    entries = entries.sort(([, a], [, b]) =>
      (a.levelName + a.ageLabel).localeCompare(b.levelName + b.ageLabel)
    );
  }

  return entries.map(([key, val]) => {
    // Mark groups holding a competition-scoped (cross-round) level, and note
    // the rounds they span (configured order when `rounds` is given), so
    // surfaces can badge them.
    const crossRound = val.gymnasts.some(
      (g) => levels.find((l) => l.id === g.level)?.rankScope === "competition"
    );
    let roundIds = [...new Set(val.gymnasts.map((g) => g.round).filter(Boolean))];
    if (rounds) {
      const order = new Map(rounds.map((r, i) => [r.id, i]));
      roundIds = roundIds.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    }
    return { key, crossRound, roundIds, ...val };
  });
}
