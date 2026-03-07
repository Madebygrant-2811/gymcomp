import { useState } from "react";
import { supabaseAuth, supabase } from "../../lib/supabase.js";
import ClubPicker from "../shared/ClubPicker.jsx";

// ============================================================
// ACCOUNT SETTINGS MODAL
// ============================================================
function AccountSettingsModal({ account, profile, onSave, onLogout, onClose }) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [clubName, setClubName] = useState(profile?.club_name || "");
  const [location, setLocation] = useState(profile?.location || "");
  const [saving,  setSaving]   = useState(false);
  const [error,   setError]    = useState("");
  const [success, setSuccess]  = useState("");

  const handleSave = async () => {
    setError(""); setSuccess("");
    if (!fullName.trim()) { setError("Name cannot be empty."); return; }
    setSaving(true);
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) { setError("Session expired — please sign in again."); setSaving(false); return; }
    const token = session.access_token;
    const updated = { id: account.id, full_name: fullName.trim(), club_name: clubName.trim(), location: location.trim() };
    const { error: err } = await supabase.upsertProfile(updated, token);
    setSaving(false);
    if (err) { setError("Couldn't save changes — please try again."); return; }
    setSuccess("Changes saved.");
    onSave({ ...(profile || {}), ...updated });
  };

  return (
    <>
    <style>{`
      .acct-label{font-family:var(--font-display);font-size:12px;font-weight:600;color:var(--text-primary);display:block;margin-bottom:8px;}
      .acct-input{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-light);font-family:var(--font-display);font-size:14px;color:var(--text-primary);outline:none;box-sizing:border-box;transition:border-color 0.15s;}
      .acct-input:focus{border-color:var(--brand-01);}
      .acct-input-disabled{width:100%;padding:12px 16px;border-radius:56px;border:1px solid #e4e4e4;background:var(--background-neutral);font-family:var(--font-display);font-size:14px;color:var(--text-tertiary);box-sizing:border-box;cursor:default;}
    `}</style>
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--background-light)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 440, fontFamily: "var(--font-display)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>Your Account</div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 80, background: "#efefef", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-tertiary)" }}
          >✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label className="acct-label">Email</label>
            <div className="acct-input-disabled">{account.email}</div>
          </div>
          <div>
            <label className="acct-label">Name</label>
            <input className="acct-input" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="acct-label">Club / Organisation</label>
            <input className="acct-input" value={clubName} onChange={e => setClubName(e.target.value)} />
          </div>
          <div>
            <label className="acct-label">Location</label>
            <input className="acct-input" value={location} onChange={e => setLocation(e.target.value)} />
          </div>

          {error && <div style={{ fontSize: 13, color: "#e53e3e", padding: "10px 16px", background: "#fff5f5", borderRadius: 8 }}>{error}</div>}
          {success && <div style={{ fontSize: 13, color: "#22c55e", padding: "10px 16px", background: "#f0fdf4", borderRadius: 8 }}>{success}</div>}

          <button
            onClick={handleSave} disabled={saving}
            style={{
              width: "100%", padding: "14px", borderRadius: 56, background: "var(--brand-01)", border: "none",
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text-alternate)",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

          <div style={{ height: 1, background: "#f5f5f5" }} />

          <button
            onClick={onLogout}
            style={{
              width: "100%", height: 46, borderRadius: 56, border: "1px solid var(--brand-01)", background: "none",
              cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
    </>
  );
}


export default AccountSettingsModal;
