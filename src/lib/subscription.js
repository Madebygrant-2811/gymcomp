// ── Subscription helpers ──────────────────────────────────────────────

export const PLAN_LABELS = {
  quarterly: "Quarterly",
  six_month: "6 Month",
  annual: "Annual",
};

/**
 * Normalise profile → subscription state for UI.
 * Returns { status, plan, periodEnd, isActive, isPastDue, isFree }
 */
export function getSubscriptionStatus(profile) {
  const status = profile?.subscription_status || "none";
  const plan = profile?.plan || null;
  const periodEnd = profile?.current_period_end || null;
  return {
    status,
    plan,
    periodEnd,
    isActive: status === "active",
    isPastDue: status === "past_due",
    isFree: status === "none" || status === "cancelled",
  };
}

/** Label for display, e.g. "Quarterly" */
export function getPlanLabel(plan) {
  return PLAN_LABELS[plan] || "Free";
}

/** Can the user start a new competition? Currently always true — gate later. */
export function canStartCompetition(/* profile */) {
  return true;
}
