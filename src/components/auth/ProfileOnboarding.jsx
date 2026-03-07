import { useState, useRef, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import GymCompLogo from "../../assets/GymComp-Logo.svg";
import ClubPicker from "../shared/ClubPicker.jsx";
import AddressLookup from "../shared/AddressLookup.jsx";

// ============================================================
// PROFILE ONBOARDING — shown once on first login
// ============================================================
function ProfileOnboardingScreen({ user, onComplete }) {
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ""
  );
  const [clubName,  setClubName]  = useState("");
  const [location,  setLocation]  = useState("");
  const [role,      setRole]      = useState("");
  const [referral,  setReferral]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const handleSave = async () => {
    setError("");
    if (!fullName.trim()) { setError("Please enter your name."); return; }
    if (!role)            { setError("Please select your role."); return; }
    setSaving(true);
    const profile = {
      id:        user.id,
      full_name: fullName.trim(),
      club_name: clubName.trim(),
      location:  location.trim(),
      role,
      referral,
    };
    const { error: err } = await supabase.from("profiles").upsert(profile);
    setSaving(false);
    if (err) { setError("Couldn't save your profile — please try again."); return; }
    onComplete(profile);
  };

  const lbl = (text) => (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", display: "block", marginBottom: 7 }}>
      {text}
    </label>
  );

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", minHeight: "100vh" }}>
      <div style={{ width: "100%", maxWidth: 500 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, letterSpacing: 3, color: "var(--accent)", lineHeight: 1, marginBottom: 14 }}>
            GYMCOMP
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
            Welcome — let's get you set up
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
            Just a few quick details and you'll be ready to run your first competition.
          </div>
        </div>

        <div className="card" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Name */}
            <div>
              {lbl("Your name *")}
              <input className="input" placeholder="Jane Smith" value={fullName}
                onChange={e => setFullName(e.target.value)} autoFocus />
            </div>

            {/* Club + Location */}
            <div className="grid-2">
              <div>
                {lbl("Club / Organisation")}
                <input className="input" placeholder="Springers GC" value={clubName}
                  onChange={e => setClubName(e.target.value)} />
              </div>
              <div>
                {lbl("Location")}
                <input className="input" placeholder="Manchester" value={location}
                  onChange={e => setLocation(e.target.value)} />
              </div>
            </div>

            {/* Role */}
            <div>
              {lbl("Your role *")}
              <select className="select" value={role} onChange={e => setRole(e.target.value)}>
                <option value="">Select your role…</option>
                <option value="Organiser">Organiser</option>
                <option value="Club Secretary">Club Secretary</option>
                <option value="Coach">Coach</option>
              </select>
            </div>

            {/* Referral */}
            <div>
              {lbl("How did you hear about us?")}
              <select className="select" value={referral} onChange={e => setReferral(e.target.value)}>
                <option value="">Select an option…</option>
                <option value="Google">Google</option>
                <option value="Social Media">Social Media</option>
                <option value="Word of Mouth">Word of Mouth</option>
                <option value="British Gymnastics">British Gymnastics</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 15, marginTop: 4 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Let's go →"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
          Signed in as <strong style={{ color: "var(--text)" }}>{user?.email}</strong>
        </div>
      </div>
    </div>
  );
}

export default ProfileOnboardingScreen;
