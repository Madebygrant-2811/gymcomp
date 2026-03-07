import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import QRDisplay from "./QRDisplay.jsx";
function SubmissionsDashboardSection({ compId, compData, gymnasts, onAcceptGymnasts, SubmissionsReviewPanel }) {
  const [showReview, setShowReview] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
  const submitUrl = `${origin}/submit.html?comp=${compId}`;
  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  useEffect(() => {
    if (inSandbox) { setPendingCount(2); return; }
    let cancelled = false;
    supabase.fetchSubmissions(compId).then(({ data }) => {
      if (!cancelled && data) setPendingCount(data.filter(s => s.status === "pending").length);
    });
    return () => { cancelled = true; };
  }, [compId]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(submitUrl); } catch {}
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const refreshCount = () => {
    if (!inSandbox) {
      supabase.fetchSubmissions(compId).then(({ data }) => {
        if (data) setPendingCount(data.filter(s => s.status === "pending").length);
      });
    } else {
      setPendingCount(c => Math.max(0, (c || 1) - 1));
    }
  };

  const handleAccept = (newGymnasts) => {
    onAcceptGymnasts(newGymnasts);
    refreshCount();
  };

  const handleDecline = () => {
    refreshCount();
  };

  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--muted)", marginBottom: 14, fontFamily: "var(--font-display)" }}>
          Gymnast Submissions
        </div>
        <div
          style={{
            background: "var(--background-light)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px 28px",
            position: "relative"
          }}
        >
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* QR + link */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 6 }}>Submission Link</div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16, lineHeight: 1.6, fontFamily: "var(--font-display)" }}>
                Share this with club contacts so they can submit their gymnast list before the competition.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, fontSize: 12, color: "var(--text-tertiary)", background: "var(--background-neutral)", borderRadius: 56, padding: "10px 16px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid var(--border)" }}>
                  {submitUrl}
                </div>
                <button onClick={copyLink} style={{
                  flexShrink: 0, padding: "10px 18px", borderRadius: 56, border: "none", cursor: "pointer",
                  background: "var(--brand-01)", color: "var(--text-alternate)",
                  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600
                }}>
                  {linkCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>
            {/* QR */}
            <QRDisplay url={submitUrl} size={110} label="Scan to submit" />
          </div>

          {/* Review button with badge */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", fontFamily: "var(--font-display)" }}>
              {pendingCount === null ? "Loading…" : pendingCount === 0 ? "No pending submissions" : (
                <span style={{ color: "var(--brand-01)", fontWeight: 600 }}>{pendingCount} submission{pendingCount !== 1 ? "s" : ""} awaiting review</span>
              )}
            </div>
            <button onClick={() => setShowReview(true)} style={{
              padding: "10px 20px", borderRadius: 56, border: "1.5px solid var(--border)", background: "none", cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
              display: "inline-flex", alignItems: "center", gap: 8
            }}>
              Review Submissions
              {pendingCount > 0 && <span style={{ background: "var(--brand-01)", color: "var(--text-alternate)", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{pendingCount}</span>}
            </button>
          </div>
        </div>

      </div>

      {showReview && (
        <SubmissionsReviewPanel
          compId={compId}
          compData={compData}
          gymnasts={gymnasts}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onClose={() => setShowReview(false)}
        />
      )}
    </>
  );
}

export default SubmissionsDashboardSection;
