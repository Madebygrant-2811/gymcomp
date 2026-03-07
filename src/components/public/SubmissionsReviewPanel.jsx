import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase.js";
import { generateId } from "../../lib/utils.js";

// ============================================================
// SUBMISSIONS REVIEW PANEL — organiser reviews pending submissions
// ============================================================
function SubmissionsReviewPanel({ compId, compData, gymnasts, onAccept, onDecline, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  // Per-gymnast round assignment (set during review)
  const [roundAssignments, setRoundAssignments] = useState({});
  // Editable gymnast names
  const [editedNames, setEditedNames] = useState({});

  const inSandbox = typeof window !== "undefined" &&
    (window.location.href.includes("claudeusercontent") || window.location.href.includes("claude.ai"));

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const load = async () => {
    setLoading(true);
    if (inSandbox) {
      // Demo data in sandbox
      setSubmissions([
        { id: "demo1", club_name: "Acton GC", contact_name: "Jane Smith", status: "pending", submitted_at: new Date().toISOString(),
          gymnasts: [
            { id: "g1", name: "Emma Wilson", level: compData.levels[0]?.name || "Level 1", ageCategory: "U13" },
            { id: "g2", name: "Sophie Brown", level: compData.levels[0]?.name || "Level 1", ageCategory: "U11" },
          ]},
        { id: "demo2", club_name: "Harrow Gymnastics", contact_name: "Mike Jones", status: "pending", submitted_at: new Date(Date.now() - 3600000).toISOString(),
          gymnasts: [
            { id: "g3", name: "Lily Chen", level: compData.levels[1]?.name || "Level 2", ageCategory: "U15" },
          ]},
      ]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("submissions").select("*").eq("comp_id", compId).order("submitted_at", { ascending: false });
    if (error) console.error("[SubmissionsReviewPanel] load error:", error);
    if (!mountedRef.current) return;
    setSubmissions(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [compId]);

  const pending = submissions.filter(s => s.status === "pending");
  const accepted = submissions.filter(s => s.status === "accepted");

  const nextNumber = () => {
    const used = gymnasts.map(g => parseInt(g.number)).filter(n => !isNaN(n));
    if (!used.length) return 1;
    return Math.max(...used) + 1;
  };

  const acceptSubmission = async (sub) => {
    setProcessing(sub.id);

    if (!inSandbox) {
      const { data: rows, error } = await supabase.from("submissions").update({ status: "accepted" }).eq("id", sub.id).select();
      if (error) {
        console.error("[acceptSubmission] Supabase update failed:", error.message);
        alert("Could not save acceptance to Supabase — please check your RLS policies on the submissions table, then try again.\n\n" + error.message);
        setProcessing(null);
        return;
      }
    }

    let num = nextNumber();
    const newGymnasts = sub.gymnasts.map(g => ({
      id: generateId(),
      name: (editedNames[g.id] ?? g.name).trim(),
      club: sub.club_name,
      level: compData.levels.find(l => l.name === g.level)?.id || "",
      ageCategory: g.ageCategory || "",
      round: roundAssignments[g.id] || compData.rounds[0]?.id || "",
      group: "",
      number: String(num++),
      dns: false,
    }));

    onAccept(newGymnasts);
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "accepted" } : x));
    setProcessing(null);
  };

  const declineSubmission = async (sub) => {
    setProcessing(sub.id);
    if (!inSandbox) {
      const { error } = await supabase.from("submissions").update({ status: "declined" }).eq("id", sub.id).select();
      if (error) {
        console.error("[declineSubmission] Supabase update failed:", error);
        setProcessing(null);
        return;
      }
    }
    setSubmissions(s => s.map(x => x.id === sub.id ? { ...x, status: "declined" } : x));
    setProcessing(null);
    onDecline?.();
  };

  const colour = compData.brandColour || "#000dff";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end"
    }}>
      <div style={{
        width: "min(560px, 100vw)", height: "100vh", background: "var(--surface)", overflowY: "auto",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Gymnast Submissions</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {pending.length} pending · {accepted.length} accepted
            </div>
          </div>
          <button onClick={load} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>↻ Refresh</button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>

        {inSandbox && (
          <div style={{ margin: "12px 24px 0", padding: "8px 12px", background: "rgba(0,13,255,0.05)", border: "1px solid rgba(0,13,255,0.12)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }}>
            ⚪ Preview mode — showing demo submissions. Real submissions load when deployed.
          </div>
        )}

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading submissions…</div>}

          {!loading && submissions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No submissions yet</div>
              <div style={{ fontSize: 12 }}>Share your submission link with clubs to get started</div>
            </div>
          )}

          {!loading && pending.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", marginBottom: 12 }}>
                Pending Review ({pending.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {pending.map(sub => (
                  <div key={sub.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    {/* Club header */}
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{sub.club_name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          {sub.contact_name && <span>{sub.contact_name} · </span>}
                          {sub.contact_email && <><a href={`mailto:${sub.contact_email}`} style={{ color: "var(--muted)", textDecoration: "underline" }}>{sub.contact_email}</a>{" · "}</>}
                          {new Date(sub.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(sub.submitted_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          · {sub.gymnasts.length} gymnast{sub.gymnasts.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Gymnast rows */}
                    <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {sub.gymnasts.map(g => (
                        <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            style={{ flex: 1, minWidth: 120, padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13 }}
                            value={editedNames[g.id] ?? g.name}
                            onChange={e => setEditedNames(n => ({ ...n, [g.id]: e.target.value }))}
                          />
                          <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", whiteSpace: "nowrap" }}>
                            {g.level}{g.ageCategory ? ` · ${g.ageCategory}` : ""}
                          </div>
                          <select
                            style={{ padding: "6px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, minWidth: 90 }}
                            value={roundAssignments[g.id] || ""}
                            onChange={e => setRoundAssignments(r => ({ ...r, [g.id]: e.target.value }))}>
                            <option value="">Round…</option>
                            {(compData.rounds || []).map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => declineSubmission(sub)} disabled={!!processing}
                        className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--muted)" }}>
                        Decline
                      </button>
                      <button onClick={() => acceptSubmission(sub)} disabled={!!processing}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: 12, background: colour, color: "#fff" }}>
                        {processing === sub.id ? "Accepting…" : "Accept All →"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && accepted.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--muted)", marginBottom: 12 }}>
                Accepted ({accepted.length})
              </div>
              {accepted.map(sub => (
                <div key={sub.id} style={{ padding: "10px 14px", background: "rgba(0,13,255,0.04)", border: "1px solid rgba(0,13,255,0.12)", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span> {sub.club_name} · {sub.gymnasts.length} gymnast{sub.gymnasts.length !== 1 ? "s" : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubmissionsReviewPanel;
