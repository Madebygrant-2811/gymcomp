import { useState } from "react";

function QRDisplay({ url, size = 120, label }) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://quickchart.io/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(url)}&choe=UTF-8`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)" }}>{label}</div>}
      <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}>
        <img src={qrUrl} alt={`QR code for ${label}`} width={size} height={size}
          style={{ display: "block" }}
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
        />
        <div style={{ display: "none", width: size, height: size, alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "#999", textAlign: "center", padding: 8 }}>
          QR unavailable offline
        </div>
      </div>
      <button onClick={copy} className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }}>
        {copied ? "✅ Copied" : "📋 Copy link"}
      </button>
      <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", maxWidth: size, wordBreak: "break-all" }}>
        {url}
      </div>
    </div>
  );
}

export default QRDisplay;
