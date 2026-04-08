import { printDocument, buildDiagnosticHTML, buildResultsHTML, buildPublicQRPdf, buildCoachQRPdf } from "../../lib/pdf.js";

function Phase2_Exports({ compData, gymnasts, scores, compId, onSharePublic, onShareCoach }) {
  const colour = "#000dff";
  const hasGymnasts = gymnasts.length > 0;
  const hasScores = Object.keys(scores).length > 0;

  const docs = [
    {
      id: "links",
      title: "Result Links",
      icon: "🔗",
      desc: "Share live result links with parents, coaches and spectators. Links update in real-time as scores are entered.",
      use: "Share during the event so coaches and parents can follow along live.",
      available: hasScores,
      unavailableMsg: "Enter scores in Score Input first.",
      isLinks: true,
    },
    {
      id: "results",
      title: "Results Sheet",
      icon: "🏆",
      desc: "Ranked results per level showing gymnast name, club, score and placing. Medal positions highlighted. Ready to share with clubs post-competition.",
      use: "Email to clubs after the event. Display at the awards ceremony.",
      available: hasScores,
      unavailableMsg: "Enter scores in Score Input to generate results.",
      action: () => printDocument(buildResultsHTML(compData, gymnasts, scores), "gymcomp-results.pdf"),
    },
    {
      id: "diagnostic",
      title: "Gymnast Diagnostic Report",
      icon: "📊",
      desc: "Per-gymnast breakdown comparing Difficulty vs Execution against level peers. Identifies strengths, flags areas for development, and highlights performance patterns across apparatus.",
      use: "Share with coaches post-competition for full D/E analysis.",
      available: hasScores,
      unavailableMsg: "Enter D/E scores in Score Input to generate diagnostics.",
      action: () => printDocument(buildDiagnosticHTML(compData, gymnasts, scores), "gymcomp-diagnostic.pdf"),
    },
    {
      id: "qr-public",
      title: "Public Live Scores QR",
      icon: "📱",
      desc: "Printable A4 page with a large QR code linking to the live public results page. Display at the venue for parents and spectators to scan.",
      use: "Print and display at the venue entrance or near the scoreboard.",
      available: true,
      action: () => buildPublicQRPdf(compData, compId),
    },
    {
      id: "qr-coach",
      title: "Coach View QR",
      icon: "📱",
      desc: "Printable A4 page with a QR code linking to the coach live view. Coaches will need their unique Club ID to access their club's scores.",
      use: "Print and display in the coaches' waiting area.",
      available: true,
      action: () => buildCoachQRPdf(compData, compId),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Post-Competition <span>Exports</span></div>
        <div className="page-sub">Results and diagnostic reports — generated after scoring is complete</div>
      </div>

      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "var(--muted)" }}>
        ℹ Pre-competition documents (Agenda, Judge Sheets, Attendance List) are available on the <strong style={{ color: "var(--text)" }}>Competition Dashboard</strong> — accessible before you start.
      </div>

      {/* Document cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {docs.map(doc => (
          <div key={doc.id} className="card" style={{
            opacity: doc.available || doc.coming ? 1 : 0.7,
            position: "relative", overflow: "hidden"
          }}>
            {doc.coming && (
              <div style={{
                position: "absolute", top: 12, right: 12,
                background: "var(--surface2)", color: "var(--muted)",
                fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 4
              }}>Coming soon</div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                background: doc.available && !doc.coming ? `${colour}22` : "var(--surface2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22
              }}>{doc.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{doc.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{doc.desc}</div>
              </div>
            </div>
            <div style={{
              background: "var(--surface2)", borderRadius: 6, padding: "8px 12px",
              fontSize: 11, color: "var(--muted)", lineHeight: 1.4, marginBottom: 14
            }}>
              <strong style={{ color: "var(--text)" }}>When to use:</strong> {doc.use}
            </div>
            {doc.available && !doc.coming && doc.isLinks ? (
              <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                <button className="btn btn-tertiary" style={{ width: "100%" }} onClick={onSharePublic}>
                  Share — Public
                </button>
                <button className="btn btn-tertiary" style={{ width: "100%" }} onClick={onShareCoach}>
                  Share — Coaches
                </button>
              </div>
            ) : doc.available && !doc.coming ? (
              <button
                className="btn btn-primary"
                style={{ width: "100%", background: colour, color: "#fff" }}
                onClick={doc.action}>
                ⬇ Generate PDF
              </button>
            ) : doc.coming ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                Coming in next update
              </button>
            ) : (
              <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                ⚠ {doc.unavailableMsg}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16, background: "rgba(0,13,255,0.03)", borderColor: "rgba(0,13,255,0.12)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>How it works:</strong> Click "Generate PDF" to download a .pdf file directly to your device.
          All documents are automatically branded with your competition name and organiser details.
        </div>
      </div>
    </div>
  );
}



export default Phase2_Exports;
