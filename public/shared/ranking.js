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

// ── Results display order ───────────────────────────────────
// Canonical apparatus DISPLAY order: WAG Vault, Bars, Beam, Floor, Range; MAG
// Olympic order. Independent of the competition's stored apparatus order
// (compData.apparatus, which seeds rotation cycles and is never reordered).
// Unrecognised apparatus keep their relative position after the known ones;
// Rest is always last. This is the single implementation — src/lib/constants.js
// re-exports it (as sortApparatusForDisplay) so the Vite bundle and the
// standalone results/coach pages share one definition.
export const RESULTS_ORDER_WAG = ["Vault", "Bars", "Beam", "Floor", "Range"];
export const RESULTS_ORDER_MAG = ["Floor", "Pommel Horse", "Rings", "Vault", "Parallel Bars", "Horizontal Bar"];
function resultsApparatusRank(name) {
  if (name === "Rest") return 999;
  const m = /^(.*?)\s*\((WAG|MAG)\)\s*$/.exec(name || "");
  const base = m ? m[1] : (name || "");
  const list = m && m[2] === "MAG" ? RESULTS_ORDER_MAG : RESULTS_ORDER_WAG;
  const i = list.indexOf(base);
  if (i !== -1) return (m && m[2] === "MAG" ? 100 : 0) + i;
  return 900;
}
export function resultsApparatusOrder(list = []) {
  return list
    .map((a, i) => ({ a, i, r: resultsApparatusRank(a) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(x => x.a);
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

// ── Cross-round ranking groups ──────────────────────────────
// The cross-round unit is the RANKING GROUP — the level, or the level + age
// band when the level ranks by level+age — never the level alone. Stored on
// the level object:
//   rankBy "level":      rankScope: "round" (default) | "competition"
//   rankBy "level+age":  rankScopeByAge: { [age]: "competition" } — bands
//                        absent from the map rank within their round
//   legacy:              rankScope "competition" on a level+age level with no
//                        rankScopeByAge — read as "every band whose gymnasts
//                        span more than one round", which is exactly what
//                        migrateCrossRoundScope expands it to.
// Whatever the setting says, a group is cross-round ONLY if its gymnasts
// actually occupy more than one round (derived from their own round values),
// and it is only ever emitted under rounds where it has gymnasts.
const rankGroupAgeOf = (levelObj, g) =>
  (levelObj?.rankBy || "level") === "level+age" ? (g.age || "") : "";
export const rankGroupKey = (levelObj, g) => `${g.level || ""}|||${rankGroupAgeOf(levelObj, g)}`;

export function isFlaggedCrossRound(levelObj, age) {
  if (!levelObj) return false;
  if ((levelObj.rankBy || "level") === "level+age") {
    if (levelObj.rankScopeByAge && typeof levelObj.rankScopeByAge === "object") {
      return levelObj.rankScopeByAge[age] === "competition";
    }
    return levelObj.rankScope === "competition"; // legacy level-wide flag
  }
  return levelObj.rankScope === "competition";
}

// Every ranking group present in the gymnast list with the rounds it occupies:
// [{ levelId, levelName, rankBy, age, rounds, spans, crossRound }], rounds in
// configured order when `rounds` is given. `crossRound` is the effective
// state: flagged AND actually spanning more than one round.
export function rankGroupSpans(gymnasts, levels = [], rounds = null) {
  const order = rounds ? new Map(rounds.map((r, i) => [r.id, i])) : null;
  const map = {};
  (gymnasts || []).forEach((g) => {
    if (!g.round) return;
    const levelObj = levels.find((l) => l.id === g.level);
    const key = rankGroupKey(levelObj, g);
    if (!map[key]) {
      map[key] = { levelId: g.level || "", levelName: levelObj?.name || "Unknown", rankBy: levelObj?.rankBy || "level", age: rankGroupAgeOf(levelObj, g), rounds: new Set(), levelObj };
    }
    map[key].rounds.add(g.round);
  });
  return Object.values(map).map(({ levelObj, ...e }) => {
    const rids = [...e.rounds];
    if (order) rids.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    const spans = rids.length > 1;
    return { ...e, rounds: rids, spans, crossRound: spans && isFlaggedCrossRound(levelObj, e.age) };
  });
}

// Display guard: a rank group belongs on a round's surface only if it has
// gymnasts in that round (roundIds is derived from the gymnasts themselves).
export const groupInRound = (rg, roundId) => !roundId || (rg?.roundIds || []).includes(roundId);

// ── Pooled-group placement ──────────────────────────────────
// A pooled (cross-round) group has ONE standings table and one set of medals.
// Every surface places it exactly once, under the first round it occupies in
// the competition's configured round order (buildRankGroups with
// crossRoundPlacement "first"); each later round it occupies carries a
// one-line pointer to that table instead of a repeat.

// Label for the rounds a pooled group spans, in the organiser's own round
// names: "Rounds 1–2" when the names are "Round N" and consecutive,
// "Rounds 1 & 3" when numbered but not consecutive, else the names joined.
export function roundSpanLabel(rounds, roundIds) {
  const names = (roundIds || []).map((id) => (rounds || []).find((r) => r.id === id)?.name || "").filter(Boolean);
  if (names.length < 2) return names[0] || "";
  const nums = names.map((n) => { const m = /^\s*round\s+(\d+)\s*$/i.exec(n); return m ? parseInt(m[1], 10) : null; });
  if (nums.every((n) => n != null)) {
    const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    return consecutive ? `Rounds ${nums[0]}–${nums[nums.length - 1]}` : `Rounds ${nums.join(" & ")}`;
  }
  return names.join(" & ");
}

// Pointer entries for a round: pooled groups that occupy `roundId` but whose
// table sits under an earlier round. Shaped like a rank group (levelName,
// ageLabel, roundIds, key) plus pointer:true, homeRoundId/Name, spanLabel.
export function crossRoundPointers(gymnasts, { levels = [], roundId, rounds = [], ageFallback = "Age not set" } = {}) {
  if (!roundId) return [];
  return rankGroupSpans(gymnasts, levels, rounds)
    .filter((s) => s.crossRound && s.rounds.includes(roundId) && s.rounds[0] !== roundId)
    .map((s) => {
      const ageLabel = s.rankBy === "level+age" ? (s.age || ageFallback) : "";
      return {
        pointer: true,
        key: `${s.levelName}|||${ageLabel}`,
        levelName: s.levelName,
        ageLabel,
        roundIds: s.rounds,
        homeRoundId: s.rounds[0],
        homeRoundName: rounds.find((r) => r.id === s.rounds[0])?.name || "",
        spanLabel: roundSpanLabel(rounds, s.rounds),
      };
    });
}

// One list for a round: its rank groups (already in surface order) with the
// pointers slotted in where each group's table would have sat — after the
// last group of the same level, else before the first group of a later level.
export function interleaveRankEntries(groups, pointers, levels = []) {
  if (!pointers || !pointers.length) return groups;
  const order = levels.map((l) => l.name);
  const li = (n) => { const i = order.indexOf(n); return i === -1 ? 999 : i; };
  const out = groups.map((g, i) => ({ entry: g, level: li(g.levelName), seq: i }));
  pointers.forEach((p) => {
    const lvl = li(p.levelName);
    let seq = -0.5;
    out.forEach((o) => { if (!o.entry.pointer && o.level === lvl) seq = o.seq + 0.5; });
    if (seq === -0.5) {
      const later = out.filter((o) => !o.entry.pointer && o.level > lvl);
      seq = later.length ? Math.min(...later.map((o) => o.seq)) - 0.5 : groups.length + 0.5;
    }
    out.push({ entry: p, level: lvl, seq });
  });
  return out.sort((a, b) => a.level - b.level || a.seq - b.seq).map((o) => o.entry);
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
//                  gymnast (any round) whose RANKING GROUP (level, or
//                  level + age band) is cross-round — see the section above.
//                  Groups default to ranking within their round.
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
  // Effective cross-round groups: flagged AND genuinely spanning rounds.
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const keyOf = (g) => rankGroupKey(levelById.get(g.level), g);
  const crossRoundKeys = new Set();
  const groupRounds = {};   // group key → rounds it occupies (from the gymnasts)
  rankGroupSpans(gymnasts, levels, rounds).forEach((s) => {
    const key = `${s.levelId}|||${s.age}`;
    groupRounds[key] = s.rounds;
    if (s.crossRound) crossRoundKeys.add(key);
  });

  let pool = gymnasts;
  if (roundId != null) {
    // First round (in configured order) containing each cross-round group —
    // rankGroupSpans already ordered the rounds when `rounds` was given.
    pool = gymnasts.filter((g) => {
      if (!g.round) return false;
      const key = keyOf(g);
      if (crossRoundKeys.has(key)) {
        const rids = groupRounds[key] || [];
        // Only under rounds the group actually occupies — never an uninvolved one
        if (!rids.includes(roundId)) return false;
        return crossRoundPlacement === "first" && rounds ? rids[0] === roundId : true;
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
    // Mark groups that are effectively cross-round (flagged AND spanning
    // rounds), and note the rounds they span (configured order when `rounds`
    // is given), so surfaces can badge them.
    const crossRound = val.gymnasts.some((g) => crossRoundKeys.has(keyOf(g)));
    let roundIds = [...new Set(val.gymnasts.map((g) => g.round).filter(Boolean))];
    if (rounds) {
      const order = new Map(rounds.map((r, i) => [r.id, i]));
      roundIds = roundIds.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    }
    return { key, crossRound, roundIds, ...val };
  });
}
