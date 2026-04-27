// ============================================================
// PAYMENT SUCCESS — shown after Stripe Checkout redirect
// ============================================================
export default function PaymentSuccessScreen({ onContinue }) {
  return (
    <div className="ps-wrap">
      <div className="ps-card">
        <div className="ps-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="ps-title">You're all set!</div>
        <div className="ps-subtitle">
          Your subscription is now active. You have full access to cloud sync, live results, and all premium features.
        </div>
        <button className="btn btn-primary" onClick={onContinue}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
