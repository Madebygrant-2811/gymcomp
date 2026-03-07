import { useState } from "react";

function LiveViewPanel({ compId, compData }) {
  const [coachCopied, setCoachCopied] = useState(false);
  const [parentCopied, setParentCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const coachUrl = `${origin}/coach.html?comp=${compId}`;
  const parentUrl = `${origin}/results.html?comp=${compId}`;

  const copy = async (url, setFlag) => {
    try { await navigator.clipboard.writeText(url); } catch {}
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>Live:</div>
      <button className="btn btn-sm btn-secondary" onClick={() => copy(coachUrl, setCoachCopied)}>
        {coachCopied ? "✅ Coach link copied" : "📋 Coach View"}
      </button>
      <button className="btn btn-sm btn-secondary" onClick={() => copy(parentUrl, setParentCopied)}>
        {parentCopied ? "✅ Parent link copied" : "👪 Parent View"}
      </button>
    </div>
  );
}

export default LiveViewPanel;
