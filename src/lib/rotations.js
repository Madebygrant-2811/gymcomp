// Rotation helpers shared between the rounds/rotations kanban (RoundsGroupsPage)
// and the live "move to round" action (Phase2_Step1). Keeping the round / group /
// orderIndex semantics in one place avoids the two screens drifting apart.

// Group (rotation) labels configured for a given round.
export function roundGroups(compData, roundId) {
  return (compData?.groupsByRound || {})[roundId] || [];
}

// Whether a group label is a valid rotation in the given round.
export function isValidGroup(compData, roundId, groupLabel) {
  return !!groupLabel && roundGroups(compData, roundId).includes(groupLabel);
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
