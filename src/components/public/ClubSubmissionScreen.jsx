import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { generateId } from "../../lib/utils.js";

// ============================================================
// HOME SCREEN
// ============================================================
// ============================================================
// CLUB SUBMISSION SCREEN — public form for clubs to submit gymnasts
// ============================================================
function ClubSubmissionScreen({ compId }) {
  const [compConfig, setCompConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [clubName, setClubName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [gymnasts, setGymnasts] = useState([
    { id: generateId(), name: "", level: "", ageCategory: "" }
  ]);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!compId) { setError("No competition ID provided."); setLoading(false); return; }
    let cancelled = false;
    supabase.from("competitions").select("*").eq("id", compId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setError("Competition not found. Please check your link."); setLoading(false); return; }
      const cd = data.data?.compData;
      setCompConfig(cd);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [compId]);

  const addGymnast = () => {
    setGymnasts(g => [...g, { id: generateId(), name: "", level: "", ageCategory: "" }]);
  };

  const removeGymnast = (id) => {
    setGymnasts(g => g.filter(x => x.id !== id));
  };

  const updateGymnast = (id, field, value) => {
    setGymnasts(g => g.map(x => x.id === id ? { ...x, [field]: value } : x));
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!clubName.trim()) { setFormError("Please enter your club name."); return; }
    const filled = gymnasts.filter(g => g.name.trim());
    if (!filled.length) { setFormError("Please add at least one gymnast."); return; }
    const incomplete = filled.find(g => !g.level);
    if (incomplete) { setFormError(`Please select a level for ${incomplete.name}.`); return; }

    setSubmitting(true);
    const submission = {
      id: generateId(),
      comp_id: compId,
      club_name: clubName.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      gymnasts: filled.map(g => ({ id: generateId(), name: g.name.trim(), level: g.level, ageCategory: g.ageCategory })),
      submitted_at: new Date().toISOString(),
      status: "pending",
    };

    const { error } = await supabase.from("submissions").insert(submission);
    setSubmitting(false);
    if (error) { setFormError("Submission failed — please try again or contact the organiser."); return; }
    setSubmitted(true);
  };

  const colour = compConfig?.brandColour || "#000dff";

  const inputStyle = { width: "100%", padding: "12px 16px", background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 56, color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-display)", boxSizing: "border-box", outline: "none" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", display: "block", marginBottom: 8, fontFamily: "var(--font-display)" };
  const selectStyle = { ...inputStyle, borderRadius: 56, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center", paddingRight: 40 };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", fontFamily: "var(--font-display)" }}>
      <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Loading competition details…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", padding: 24, fontFamily: "var(--font-display)" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8, color: "var(--text-primary)" }}>Unable to load</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--background-neutral)", padding: 24, fontFamily: "var(--font-display)" }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎉</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: colour, marginBottom: 8 }}>Submitted!</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          Your gymnast list has been sent to the organiser for review.
          You will be contacted if any details need to be confirmed.
        </div>
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "20px 24px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "left" }}>
          <strong style={{ color: "var(--text-primary)", fontSize: 15 }}>{compConfig.name}</strong><br />
          {compConfig.date && <span style={{ fontSize: 12 }}>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>}<br />
          <span style={{ color: colour, fontWeight: 600, marginTop: 8, display: "block" }}>
            {gymnasts.filter(g => g.name.trim()).length} gymnast{gymnasts.filter(g => g.name.trim()).length !== 1 ? "s" : ""} submitted from {clubName}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-neutral)", fontFamily: "var(--font-display)" }}>
      {/* Header */}
      <div style={{ background: "var(--background-light)", borderBottom: "1px solid #e4e4e4", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        {compConfig.logo && <img src={compConfig.logo} alt="Logo" style={{ height: 44, objectFit: "contain" }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 20, color: "var(--text-primary)" }}>{compConfig.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", display: "flex", gap: 16, marginTop: 3 }}>
            {compConfig.date && <span>{new Date(compConfig.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
            {(compConfig.venue || compConfig.location) && <span>{compConfig.venue || compConfig.location}</span>}
          </div>
        </div>
        <div style={{ background: colour + "14", border: "1px solid " + colour + "30", borderRadius: 56, padding: "6px 14px", fontSize: 11, fontWeight: 600, color: colour, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
          Gymnast Submission
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>

        {/* Club details */}
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "28px", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20, color: "var(--text-primary)" }}>Club Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Club Name <span style={{ color: colour }}>*</span></label>
              <input style={inputStyle} placeholder="e.g. Acton Gymnastics Club" value={clubName} onChange={e => setClubName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Contact Name <span style={{ fontWeight: 400, color: "#bbb" }}>(optional)</span></label>
                <input style={inputStyle} placeholder="Your name" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Contact Email <span style={{ fontWeight: 400, color: "#bbb" }}>(optional)</span></label>
                <input type="email" style={inputStyle} placeholder="coach@example.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Gymnast list */}
        <div style={{ background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 16, padding: "28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)" }}>
              Gymnasts <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)" }}>({gymnasts.filter(g => g.name.trim()).length} entered)</span>
            </div>
            <button onClick={addGymnast}
              style={{ padding: "8px 16px", background: colour, color: "var(--text-alternate)", border: "none", borderRadius: 56, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-display)" }}>
              + Add gymnast
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gymnasts.map((g, idx) => (
              <div key={g.id} style={{ background: "var(--background-neutral)", border: "1px solid #e4e4e4", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: colour + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: colour, flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <input style={{ ...inputStyle, flex: 1, width: "auto" }} placeholder="Full name" value={g.name} onChange={e => updateGymnast(g.id, "name", e.target.value)} />
                  {gymnasts.length > 1 && (
                    <button onClick={() => removeGymnast(g.id)}
                      style={{ width: 32, height: 32, background: "var(--background-light)", border: "1px solid #e4e4e4", borderRadius: 8, color: "var(--text-tertiary)", cursor: "pointer", fontSize: 16, flexShrink: 0, fontFamily: "var(--font-display)" }}>
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11, marginBottom: 6 }}>Level <span style={{ color: colour }}>*</span></label>
                    <select style={{ ...selectStyle, color: g.level ? "var(--text-primary)" : "var(--text-tertiary)" }} value={g.level} onChange={e => updateGymnast(g.id, "level", e.target.value)}>
                      <option value="">Select level…</option>
                      {(compConfig.levels || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                  {(compConfig.levels || []).some(l => l.rankBy === "level+age") && (
                    <div style={{ flex: 1 }}>
                      <label style={{ ...labelStyle, fontSize: 11, marginBottom: 6 }}>Age Category</label>
                      <select style={{ ...selectStyle, color: g.ageCategory ? "var(--text-primary)" : "var(--text-tertiary)" }} value={g.ageCategory} onChange={e => updateGymnast(g.id, "ageCategory", e.target.value)}>
                        <option value="">Select…</option>
                        <option value="Junior">Junior</option>
                        <option value="Senior">Senior</option>
                        <option value="U9">Under 9</option>
                        <option value="U11">Under 11</option>
                        <option value="U13">Under 13</option>
                        <option value="U15">Under 15</option>
                        <option value="U18">Under 18</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {formError && (
          <div style={{ background: "rgba(220,53,69,0.06)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#c53030", marginBottom: 16, fontFamily: "var(--font-display)" }}>
            {formError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: "100%", padding: "16px", background: colour, color: "var(--text-alternate)", border: "none", borderRadius: 56,
            fontWeight: 600, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, fontFamily: "var(--font-display)" }}>
          {submitting ? "Submitting…" : "Submit Gymnast List"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", marginTop: 20, fontFamily: "var(--font-display)" }}>
          Powered by GYMCOMP · Your details will only be used for this competition
        </div>
      </div>
    </div>
  );
}


export default ClubSubmissionScreen;
