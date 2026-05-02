import { useState, useEffect, useCallback } from "react";

const PLANS = [
  { id: "quarterly", name: "Quarterly", commitment: "3-MONTH COMMITMENT", termLabel: "PER QUARTER",
    standard: { monthly: 69, total: 207 },
    founding: { monthly: 35, total: 103.50 } },
  { id: "six_month", name: "6 Months", commitment: "6-MONTH COMMITMENT", termLabel: "PER 6 MONTHS",
    standard: { monthly: 59, total: 354 },
    founding: { monthly: 30, total: 177.00 } },
  { id: "annual", name: "Annual", commitment: "12-MONTH COMMITMENT", termLabel: "ANNUALLY",
    standard: { monthly: 49, total: 588 },
    founding: { monthly: 25, total: 294.00 } },
];

export default function PlanPickerModal({ isOpen, onClose, onPlanSelected }) {
  const [founding, setFounding] = useState(null); // { remaining, total } or null while loading
  const [loadingPlan, setLoadingPlan] = useState(null); // planId being submitted
  const [error, setError] = useState(null);

  // Fetch founding spots on mount
  useEffect(() => {
    if (!isOpen) return;
    setFounding(null);
    setError(null);
    setLoadingPlan(null);
    fetch("/.netlify/functions/get-founding-spots")
      .then(r => r.json())
      .then(data => {
        if (data.error) setFounding({ remaining: 0, total: data.total });
        else setFounding(data);
      })
      .catch(() => setFounding({ remaining: 0, total: 10 }));
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSelect = useCallback(async (planId) => {
    setLoadingPlan(planId);
    setError(null);
    try {
      await onPlanSelected(planId);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
      setLoadingPlan(null);
    }
  }, [onPlanSelected]);

  if (!isOpen) return null;

  const isLoading = founding === null;
  const hasFoundingSpots = founding && founding.remaining > 0;

  return (
    <div className="pp-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`pp-modal${isLoading ? " pp-loading" : ""}`}>
        <button className="pp-close" onClick={onClose} title="Close">&times;</button>

        <div className="pp-header">
          {hasFoundingSpots && (
            <span className="pp-early-pill">EARLY BIRD PRICING — 50% OFF SUBSCRIPTIONS</span>
          )}
          <div className="pp-headline">
            One plan. Every feature.<br />Pick your commitment.
          </div>
          <div className="pp-desc">
            Every plan includes unlimited everything, FIG and simple scoring, live judge sync, PDF and Excel exports, club submissions, coach and parent views, and real human support. Upgrade any time. Cancel before renewal.
          </div>
        </div>

        <div className="pp-cards">
          {PLANS.map(plan => {
            const prices = hasFoundingSpots ? plan.founding : plan.standard;
            const showStrike = hasFoundingSpots;
            return (
              <div key={plan.id} className={`pp-card pp-card-${plan.id}`}>
                <span className="pp-commit-pill">{plan.commitment}</span>

                <div>
                  <div className="pp-plan-name">{plan.name}</div>
                </div>

                <div className="pp-pricing">
                  <div className="pp-price-col">
                    <div className="pp-price-nums">
                      {showStrike && <span className="pp-price-old">£{plan.standard.monthly}</span>}
                      <span className="pp-price-new">£{prices.monthly}</span>
                    </div>
                    <span className="pp-price-unit">PER MONTH</span>
                  </div>
                  <span className="pp-price-sep">//</span>
                  <div className="pp-price-col">
                    <div className="pp-price-nums">
                      {showStrike && <span className="pp-price-old">£{plan.standard.total}</span>}
                      <span className="pp-price-new">£{prices.total % 1 === 0 ? prices.total : prices.total.toFixed(2)}</span>
                    </div>
                    <span className="pp-price-unit">{plan.termLabel}</span>
                  </div>
                </div>

                <div className="pp-feature-pills">
                  <span className="pp-feature-pill">ONE CLUB</span>
                  <span className="pp-feature-pill">UNLIMITED COMPS</span>
                </div>

                <div className="pp-renew">Auto-renews. Cancel anytime before renewal.</div>

                <button
                  className="pp-start-btn"
                  disabled={loadingPlan !== null}
                  onClick={() => handleSelect(plan.id)}
                >
                  {loadingPlan === plan.id ? "Redirecting…" : "Start Plan →"}
                </button>
              </div>
            );
          })}
        </div>

        {hasFoundingSpots && (
          <div className="pp-founding-count">{founding.remaining} founding spot{founding.remaining !== 1 ? "s" : ""} remaining</div>
        )}

        {error && <div className="pp-error">{error}</div>}
      </div>
    </div>
  );
}
