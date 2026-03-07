import { useState, useRef, useEffect } from "react";
import { supabaseAuth, SUPABASE_URL } from "../../lib/supabase.js";
import GymCompLogo from "../../assets/GymComp-Logo.svg";

// ============================================================
// AUTH SCREEN — Google OAuth + Magic Link (replaces LoginScreen + RegisterScreen)
// ============================================================
function AuthScreen({ onResume }) {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showJudgePin, setShowJudgePin] = useState(false);

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    const { error: err } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) { setError(err.message); setLoading(false); }
  };

  const handleMagicLink = async () => {
    setError("");
    const trimmed = email.trim();
    if (!trimmed) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Please enter a valid email address."); return; }
    setLoading(true);
    const { error: err } = await supabaseAuth.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  const googleIconUrl = "https://www.figma.com/api/mcp/asset/ecdc4d55-f8d8-4a06-ae78-791219f31494";
  const heroImageUrl = "https://www.figma.com/api/mcp/asset/aaec2cb4-9483-4034-9b9a-89218ba8373d";
  const heroImage2Url = LaptopSignUp;

  /* ── Shared form elements ── */
  const googleBtn = (
    <button
      onClick={handleGoogle}
      disabled={loading}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        gap: 10, padding: "12px 21px", border: "1px solid var(--brand-01)", borderRadius: 72,
        background: "#fff", cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16,
        color: "#050505", letterSpacing: "0.3px",
      }}
    >
      <img src={googleIconUrl} alt="" width={16} height={16} style={{ flexShrink: 0 }} />
      Continue with Google
    </button>
  );

  const divider = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>or sign in with email</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  const emailInput = (
    <input
      type="email"
      placeholder="your@email.com"
      value={email}
      onChange={e => setEmail(e.target.value)}
      onKeyDown={e => e.key === "Enter" && handleMagicLink()}
      autoFocus
      style={{
        width: "100%", boxSizing: "border-box", background: "#fff",
        border: "1px solid var(--border)", borderRadius: 72, padding: "12px 24px",
        fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-primary)",
        outline: "none",
      }}
    />
  );

  const sendBtn = (
    <button
      onClick={handleMagicLink}
      disabled={loading}
      style={{
        width: "100%", background: "var(--brand-01)", border: "none", borderRadius: 72,
        padding: "12px 16px", fontFamily: "var(--font-display)", fontWeight: 400,
        fontSize: 16, color: "var(--text-alternate)", textAlign: "center",
        letterSpacing: "0.3px", cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Sending…" : "Send sign-in link →"}
    </button>
  );

  const judgeCard = (
    <div
      onClick={() => setShowJudgePin(true)}
      style={{
        width: "100%", border: "1px solid var(--border)", borderRadius: 16,
        padding: "12px 24px", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", boxSizing: "border-box", cursor: "pointer",
      }}
    >
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 14, color: "var(--brand-02)",
        textAlign: "center", letterSpacing: "0.3px",
      }}>
        Enter as Scorer or Judge — PIN access →
      </div>
    </div>
  );

  const footer = (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
      All Rights Reserved 2026 GymComp© · <a href="/privacy" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Privacy Policy</a> · <a href="/terms" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Terms of Service</a>
    </div>
  );

  /* ── "Check your inbox" state ── */
  if (sent) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--background-light)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Saans', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📬</div>
          <div style={{ fontFamily: "'Saans', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--text-primary)", marginBottom: 12 }}>
            Check your inbox
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>
            We sent a sign-in link to{" "}
            <strong style={{ color: "var(--text-primary)" }}>{email}</strong>.<br />
            Click it to continue — no password needed.
          </div>
          <button
            onClick={() => { setSent(false); setLoading(false); }}
            style={{ fontFamily: "'Saans', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--brand-01)", background: "var(--background-neutral)", border: "none", padding: "10px 20px", borderRadius: 72, cursor: "pointer", letterSpacing: "0.3px" }}
          >
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

  /* ── DESKTOP (≥768px): two-column split ── */
  /* ── MOBILE (<768px): single column ── */
  return (
    <>
      <style>{`
        .auth-wrapper { position:fixed;inset:0;display:flex;font-family:var(--font-display);background:var(--background-light);--border:#ddd;--background-neutral:#efefef; }
        .auth-left { width:550px;flex-shrink:0;padding:48px;display:flex;flex-direction:column;justify-content:space-between;background:var(--background-light);box-sizing:border-box; }
        .auth-left-logo img { height:25px; }
        .auth-left-middle { display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:363px;padding:0 40px; }
        .auth-left-form { width:100%;display:flex;flex-direction:column;gap:16px; }
        .auth-right { flex:1;padding:24px;min-width:0;height:100%;box-sizing:border-box; }
        .auth-right-inner { background:#000dff;border-radius:32px;overflow:hidden;height:100%;width:100%;position:relative; }
        .auth-right-inner .auth-hero-bg { position:absolute;width:200%;height:200%;top:-80%;left:-25%;max-width:none;pointer-events:none;object-fit:cover; }
        .auth-right-inner .auth-hero-laptop { position:absolute;left:0;top:-2%;width:100%;height:102%;max-width:none;pointer-events:none;object-fit:cover; }

        @media(max-width:767px) {
          .auth-wrapper { flex-direction:column; }
          .auth-left { width:100%;flex-shrink:initial;padding:40px 16px;align-items:center;gap:64px;justify-content:flex-start; }
          .auth-left-middle { height:auto;gap:32px;padding:0; }
          .auth-left-form { width:100%;max-width:396px; }
          .auth-right { display:none; }
        }
      `}</style>
      <div className="auth-wrapper">
        {/* ── Left Panel ── */}
        <div className="auth-left">
          <div className="auth-left-logo">
            <img src={GymCompLogo} alt="GymComp" />
          </div>

          <div className="auth-left-middle">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, color: "var(--text-primary)", lineHeight: 1.1, textAlign: "center", width: "100%" }}>
                Welcome to GymComp
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--text-secondary)", textAlign: "center", lineHeight: "18px", maxWidth: 200 }}>
                Sign in or sign up for free<br />with your email
              </div>
            </div>
            <div className="auth-left-form">
              {googleBtn}
              {divider}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {emailInput}
                {error && <div style={{ fontSize: 13, color: "#e53e3e", paddingLeft: 24 }}>{error}</div>}
                {sendBtn}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.4, maxWidth: 246, alignSelf: "center" }}>
                By signing up to a free account you agree to the GymComp <a href="/privacy" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Privacy Policy</a> and <a href="/terms" style={{ color: "var(--text-tertiary)", textDecoration: "underline" }}>Terms of Service</a>.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" }}>
            {judgeCard}
            {footer}
          </div>
        </div>

        {/* ── Right Panel (hero image) ── */}
        <div className="auth-right">
          <div className="auth-right-inner">
            <img className="auth-hero-bg" src={heroImageUrl} alt="" />
            <img className="auth-hero-laptop" src={heroImage2Url} alt="" />
          </div>
        </div>
      </div>

      {showJudgePin && (
        <JudgePinModal
          onResume={onResume}
          onClose={() => setShowJudgePin(false)}
        />
      )}
    </>
  );
}

export default AuthScreen;
