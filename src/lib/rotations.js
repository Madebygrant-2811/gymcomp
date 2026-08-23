// Rotation helpers shared between the rounds/rotations kanban (RoundsGroupsPage)
// and the live "move to round" action (Phase2_Step1). Keeping the round / group /
// orderIndex semantics in one place avoids the two screens drifting apart.

import { buildRotations } from "./utils.js";
import { roundGroups, runningOrderCompare, roundRunningOrderCompare } from "../../public/shared/ranking.js";

// The running-order comparators and roundGroups live in the shared module so
// the standalone public pages use the identical implementation.
export { roundGroups, runningOrderCompare, roundRunningOrderCompare };

// Whether a group label is a valid rotation in the given round.
export function isValidGroup(compData, roundId, groupLabel) {
  return !!groupLabel && roundGroups(compData, roundId).includes(groupLabel);
}

// Rest slots configured for a round (compData.restsByRound). Each rest slot
// adds one rotation beyond the apparatus count — that rotation is resting
// while the others are on apparatus, and the cascade staggers where each
// rotation's rest falls in its sequence.
export function restCount(compData, roundId) {
  return Math.max(0, (compData?.restsByRound || {})[roundId] || 0);
}

// A round's full rotation cycle — Rotation 1's sequence; every other rotation
// cascades one step behind. Defaults to apparatus in canonical order with the
// round's Rest slots at the end; an organiser-edited order (cycleByRound) can
// place Rests anywhere in the sequence. A stored order is reconciled against
// the CURRENT apparatus membership and rest count on every read, so changing
// either never leaves a stale cycle: removed apparatus drop out, missing ones
// append in canonical order, and the rest count is enforced.
export function roundCycle(compData, roundId) {
  const apparatus = (compData?.apparatus || []).filter((a) => a !== "Rest");
  const rests = restCount(compData, roundId);
  const stored = (compData?.cycleByRound || {})[roundId];
  if (!stored || !stored.length) return [...apparatus, ...Array(rests).fill("Rest")];
  const out = [];
  let restsUsed = 0;
  stored.forEach((entry) => {
    if (entry === "Rest") {
      if (restsUsed < rests) { out.push("Rest"); restsUsed++; }
      return;
    }
    if (apparatus.includes(entry) && !out.includes(entry)) out.push(entry);
  });
  apparatus.forEach((a) => { if (!out.includes(a)) out.push(a); });
  while (restsUsed < rests) { out.push("Rest"); restsUsed++; }
  return out;
}

// Effective apparatus order for every group in a round: the stored per-group
// order from compData.rotations when the round has one, otherwise the automatic
// cascade over the round's cycle (apparatus + rest slots). Orders are
// independent per group — one group's edit never shifts another.
export function effectiveRotations(compData, roundId) {
  const groups = roundGroups(compData, roundId);
  const cycle = roundCycle(compData, roundId);
  const cascade = buildRotations(groups, cycle, {});
  const stored = (compData?.rotations || {})[roundId] || {};
  const out = {};
  groups.forEach((grp) => { out[grp] = stored[grp] || cascade[grp] || cycle; });
  return out;
}

// Gymnast ids in competition-wide running order — rounds in configured order,
// groups in order within each round, gymnasts in running order within each
// group — followed by everyone outside it (unassigned or in an invalid group)
// in their relative number order.
function competitionOrderIds(compData, gymnasts) {
  const orderedIds = [];
  (compData?.rounds || []).forEach((rd) => {
    roundGroups(compData, rd.id).forEach((grp) => {
      gymnasts
        .filter((g) => g.round === rd.id && (g.group || "") === grp)
        .sort(runningOrderCompare)
        .forEach((g) => orderedIds.push(g.id));
    });
  });
  const seen = new Set(orderedIds);
  gymnasts
    .filter((g) => !seen.has(g.id))
    .sort((a, b) => (parseInt(a.number) || Number.MAX_SAFE_INTEGER) - (parseInt(b.number) || Number.MAX_SAFE_INTEGER))
    .forEach((g) => orderedIds.push(g.id));
  return orderedIds;
}

// The single place gymnast numbers are written: every gymnast is numbered
// sequentially from 1 in competition-wide running order — rounds in order,
// groups in the round's configured rotation order, orderIndex within each
// group — with unassigned gymnasts last. Called on every Rounds & Groups save,
// at any competition status.
export function numberByRunningOrder(compData, gymnasts) {
  const numById = {};
  competitionOrderIds(compData, gymnasts).forEach((id, i) => { numById[id] = String(i + 1); });
  return gymnasts.map((g) => (numById[g.id] ? { ...g, number: numById[g.id] } : g));
}

// Propose a full schedule from level, club and age. Pure — returns a proposal
// the page previews and applies only on confirmation.
//
// Sizing: every active gymnast is averaged across the rounds, each round gets
// one group per apparatus (more only when the per-group maximum implies it),
// and groups target round total ÷ group count with a variance of ±3 — never
// fill-to-maximum, never a small remainder group. The maximum is a soft
// ceiling: a group may run up to three over its target where that keeps a
// club whole, and every over-target group is reported.
//
// Isolation: the condition to eliminate is a gymnast who is BOTH the only one
// from their club AND the only one at their level in their group. A repair
// pass moves such gymnasts to a group where they have clubmates (preferred —
// cohesion wins over level purity) or level peers, staying within target+3.
// Moves may cross rounds, but only into a round that already contains the
// gymnast's level. A club-of-one or a level-of-one alone is not a problem.
// Anyone still isolated on both counts after the pass is reported.
//
// Levels follow configured order and stay contiguous through the initial
// running order; within a level clubs stay together where the balanced sizes
// allow, and club splits are reported. Within a club, order is by age.
export function proposeSchedule(compData, gymnasts, maxPerGroup) {
  const members = gymnasts.filter((g) => !g.dns && !g.withdrawn);
  const total = members.length;
  const cap = Math.max(1, Math.floor(maxPerGroup) || 1);
  const rounds = compData.rounds || [];
  const apparatusCount = Math.max(1, (compData.apparatus || []).filter((a) => a !== "Rest").length);
  const VARIANCE = 3; // acceptable drift either side of a group's target

  // Near-even share per round
  const rCount = Math.max(1, rounds.length);
  const rBase = Math.floor(total / rCount);
  const rRem = total % rCount;

  let maxNum = 0;
  Object.values(compData.groupsByRound || {}).forEach((list) =>
    (list || []).forEach((n) => {
      const m = String(n).match(/^Rotation (\d+)$/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    })
  );

  // One slot per group, flat across rounds. `size` is the balanced target for
  // this slot (round share ÷ group count, remainder spread); the soft-ceiling
  // maximum only influences how many groups a round gets.
  const slots = [];
  rounds.forEach((rd, ri) => {
    const share = rBase + (ri < rRem ? 1 : 0);
    // Baseline rotations per round: one per apparatus plus the round's rest
    // slots (a round with 4 apparatus and 2 rests runs 6 rotations).
    const baseline = apparatusCount + restCount(compData, rd.id);
    const gCount = Math.max(baseline, Math.ceil(share / cap) || 1);
    const gBase = Math.floor(share / gCount);
    const gRem = share % gCount;
    const existing = (compData.groupsByRound || {})[rd.id] || [];
    for (let i = 0; i < gCount; i++) {
      slots.push({
        round: rd.id,
        name: existing[i] || `Rotation ${++maxNum}`,
        target: Math.max(1, gBase + (i < gRem ? 1 : 0)),
        members: [],
      });
    }
  });

  const levelRank = new Map((compData.levels || []).map((l, i) => [l.id, i]));
  const levelName = (id) => (compData.levels || []).find((l) => l.id === id)?.name || id || "No level";
  const byLevel = new Map();
  members.forEach((g) => {
    const k = g.level || "";
    if (!byLevel.has(k)) byLevel.set(k, []);
    byLevel.get(k).push(g);
  });
  const levelIds = [...byLevel.keys()].sort((a, b) => {
    const ra = levelRank.has(a) ? levelRank.get(a) : 999;
    const rb = levelRank.has(b) ? levelRank.get(b) : 999;
    return ra - rb || String(levelName(a)).localeCompare(String(levelName(b)));
  });

  const ageCmp = (a, b) =>
    (a.age || "").localeCompare(b.age || "", undefined, { numeric: true }) ||
    (a.name || "").localeCompare(b.name || "");

  // Minimum the tail of slots must still receive so no group ends up a small
  // remainder — a stretch is only allowed when the leftovers still cover it.
  const tailMinimum = (from) => {
    let sum = 0;
    for (let j = from; j < slots.length; j++) sum += Math.max(1, slots[j].target - VARIANCE);
    return sum;
  };

  // ── Phase 1: balanced packing ─────────────────────────────
  // Levels in order, clubs as blocks (largest first; a split remainder stays
  // at index 0 so clubmates land in adjacent groups). Groups fill to their
  // balanced target; a club may stretch a group to target+3 to stay whole —
  // never beyond, and never by starving the remaining groups.
  const clubSplits = [];
  let si = 0;
  let remaining = total;

  levelIds.forEach((lid) => {
    const byClub = new Map();
    byLevel.get(lid).forEach((g) => {
      const c = g.club || "";
      if (!byClub.has(c)) byClub.set(c, []);
      byClub.get(c).push(g);
    });
    const blocks = [...byClub.entries()]
      .map(([club, list]) => ({ club, list: list.sort(ageCmp) }))
      .sort((a, b) => b.list.length - a.list.length || a.club.localeCompare(b.club));

    while (blocks.length) {
      if (si >= slots.length) {
        // Defensive only — targets sum to the member count, so the walk ends
        // exactly; spill anything left into the final group.
        const last = slots[slots.length - 1];
        blocks.forEach((b) => last.members.push(...b.list));
        blocks.length = 0;
        break;
      }
      const slot = slots[si];
      const u = slot.members.length;
      const rt = slot.target - u;
      if (rt <= 0) { si++; continue; }

      // First block that fits within the balanced target
      const fitIdx = blocks.findIndex((b) => b.list.length <= rt);
      if (fitIdx !== -1) {
        const [b] = blocks.splice(fitIdx, 1);
        slot.members.push(...b.list);
        remaining -= b.list.length;
        continue;
      }

      const b = blocks[0];
      const s = b.list.length;

      // Stretch to keep the club whole: up to target+3, and only while the
      // remaining groups can still each reach target−3.
      if (s <= slot.target + VARIANCE - u && remaining - s >= tailMinimum(si + 1)) {
        blocks.shift();
        slot.members.push(...b.list);
        remaining -= s;
        si++; // stretched past target — this group is done
        continue;
      }

      // Split at the balanced boundary; the remainder continues next group.
      const taken = b.list.splice(0, rt);
      slot.members.push(...taken);
      remaining -= taken.length;
      clubSplits.push({ club: b.club || "No club", level: levelName(lid), placed: taken.length, remaining: b.list.length });
    }
  });

  // ── Phase 2: isolation repair ─────────────────────────────
  // The condition to eliminate: only one from their club AND only one at
  // their level in the group. Move such gymnasts to a group with clubmates
  // (cohesion wins) or level peers, within target+3 — across rounds only when
  // the destination round already contains their level.
  const findIsolated = () => {
    const out = [];
    slots.forEach((slot, idx) => {
      slot.members.forEach((m) => {
        const clubmates = slot.members.filter((o) => o !== m && (o.club || "") === (m.club || "")).length;
        const levelPeers = slot.members.filter((o) => o !== m && (o.level || "") === (m.level || "")).length;
        if (clubmates === 0 && levelPeers === 0) out.push({ m, idx });
      });
    });
    return out;
  };

  for (let pass = 0; pass < 5; pass++) {
    const isolated = findIsolated();
    if (isolated.length === 0) break;
    let moved = false;
    isolated.forEach(({ m, idx }) => {
      const from = slots[idx];
      if (!from.members.includes(m)) return; // already moved this pass
      const roundLevels = new Map();
      slots.forEach((s) => {
        if (!roundLevels.has(s.round)) roundLevels.set(s.round, new Set());
        s.members.forEach((o) => roundLevels.get(s.round).add(o.level || ""));
      });
      const candidates = slots
        .map((s, j) => ({ s, j }))
        .filter(({ s, j }) => {
          if (j === idx) return false;
          if (s.members.length >= s.target + VARIANCE) return false;
          if (s.round !== from.round && !roundLevels.get(s.round)?.has(m.level || "")) return false;
          const hasClub = s.members.some((o) => (o.club || "") === (m.club || ""));
          const hasLevel = s.members.some((o) => (o.level || "") === (m.level || ""));
          return hasClub || hasLevel;
        })
        .sort((a, b) => {
          const clubA = a.s.members.filter((o) => (o.club || "") === (m.club || "")).length;
          const clubB = b.s.members.filter((o) => (o.club || "") === (m.club || "")).length;
          if ((clubB > 0) !== (clubA > 0)) return (clubB > 0) - (clubA > 0); // cohesion first
          if (clubA !== clubB) return clubB - clubA;
          return a.s.members.length - b.s.members.length; // then lightest group
        });
      if (candidates.length) {
        from.members.splice(from.members.indexOf(m), 1);
        candidates[0].s.members.push(m);
        moved = true;
      }
    });
    if (!moved) break;
  }

  const stillIsolated = findIsolated().map(({ m, idx }) => ({
    name: m.name,
    club: m.club || "No club",
    level: levelName(m.level),
    group: slots[idx].name,
    roundName: rounds.find((rd) => rd.id === slots[idx].round)?.name || "",
  }));

  const overTarget = slots
    .filter((s) => s.members.length > s.target)
    .map((s) => ({
      roundName: rounds.find((rd) => rd.id === s.round)?.name || "",
      name: s.name,
      count: s.members.length,
      target: s.target,
    }));

  const assignments = [];
  slots.forEach((s) =>
    s.members.forEach((g, j) => assignments.push({ id: g.id, round: s.round, group: s.name, orderIndex: j }))
  );

  return {
    total,
    maxPerGroup: cap,
    apparatusCount,
    clubSplits,
    overTarget,
    isolated: stillIsolated,
    rounds: rounds.map((rd) => {
      const roundSlots = slots.filter((s) => s.round === rd.id);
      const baseline = apparatusCount + restCount(compData, rd.id);
      return {
        roundId: rd.id,
        roundName: rd.name,
        total: roundSlots.reduce((sum, s) => sum + s.members.length, 0),
        baseline,
        extraGroups: roundSlots.length - baseline,
        groups: roundSlots.map((s) => ({
          name: s.name,
          count: s.members.length,
          target: s.target,
          levels: [...new Set(s.members.map((g) => levelName(g.level)))],
        })),
      };
    }),
    assignments,
  };
}

// Next running-order index to append a gymnast to the end of a round+group bucket.
export function nextOrderIndex(gymnasts, roundId, groupLabel) {
  const bucket = gymnasts.filter(
    (g) => g.round === roundId && (g.group || "") === (groupLabel || "")
  );
  if (bucket.length === 0) return 0;
  const indices = bucket.map((g) => (typeof g.orderIndex === "number" ? g.orderIndex : -1));
  return Math.max(...indices) + 1;
}
