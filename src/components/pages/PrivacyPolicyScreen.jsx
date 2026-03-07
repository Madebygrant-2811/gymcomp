import GymCompLogo from "../../assets/GymComp-Logo.svg";

// ============================================================
// PRIVACY POLICY (public, no auth required)
// ============================================================
function PrivacyPolicyScreen() {
  const sectionStyle = { marginBottom: 28 };
  const headingStyle = { fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 };
  const paraStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px" };
  const listStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px", paddingLeft: 24 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-light)", fontFamily: "var(--font-display)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Logo */}
        <a href="/" style={{ display: "inline-block", marginBottom: 48 }}>
          <img src={GymCompLogo} alt="GymComp" style={{ height: 25 }} />
        </a>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 40 }}>Last updated: March 2026</p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Who we are</h2>
          <p style={paraStyle}>
            GymComp is a gymnastics competition management platform operated by Grant Thompson, trading as GymComp, accessible at gymcomp.co.uk.
          </p>
          <p style={paraStyle}>
            For the purposes of UK GDPR, GymComp acts as a data processor. The competition organiser acts as the data controller for competitor data entered into their competitions.
          </p>
          <p style={paraStyle}>Contact: hello@gymcomp.co.uk</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. What data we collect</h2>
          <p style={{ ...paraStyle, fontWeight: 600 }}>Account data (organisers):</p>
          <ul style={listStyle}>
            <li>Email address</li>
            <li>Display name</li>
            <li>Authentication tokens (managed securely via Supabase)</li>
          </ul>
          <p style={{ ...paraStyle, fontWeight: 600 }}>Competition data (entered by organisers):</p>
          <ul style={listStyle}>
            <li>Gymnast names, numbers, ages, club affiliations and scores</li>
            <li>Competition dates and locations</li>
          </ul>
          <p style={{ ...paraStyle, fontWeight: 600 }}>Technical data:</p>
          <ul style={listStyle}>
            <li>Browser type and device information</li>
            <li>IP address (via Supabase infrastructure)</li>
            <li>Session tokens</li>
          </ul>
          <p style={paraStyle}>
            We do not collect payment information. We do not run advertising. We do not sell data to third parties.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Why we collect it</h2>
          <ul style={listStyle}>
            <li>Email address and display name: account creation and sign-in (contract performance)</li>
            <li>Gymnast data: competition management and results (legitimate interests of the organiser)</li>
            <li>Technical data: security, fraud prevention, platform stability (legitimate interests)</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Competitor data and children</h2>
          <p style={paraStyle}>
            GymComp is used to manage gymnastics competitions which may include competitors under the age of 18.
          </p>
          <p style={paraStyle}>Organisers are responsible for:</p>
          <ul style={listStyle}>
            <li>Obtaining appropriate consent to enter competitor data into GymComp</li>
            <li>Ensuring their use of GymComp complies with their own data protection obligations</li>
            <li>Confirming they have permission to enter each competitor's data (confirmed via consent checkbox at competition setup)</li>
          </ul>
          <p style={paraStyle}>GymComp does not knowingly collect data directly from children.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. How we store and protect your data</h2>
          <ul style={listStyle}>
            <li>All data stored securely via Supabase, hosted on EU infrastructure</li>
            <li>Protected by Row Level Security — each organiser can only access their own data</li>
            <li>Authentication via magic links and Google OAuth — no passwords stored</li>
            <li>Competition PINs stored using SHA-256 hashing — plain text PINs never stored</li>
            <li>All data transmitted over HTTPS</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. How long we keep your data</h2>
          <ul style={listStyle}>
            <li>Account data: until you delete your account</li>
            <li>Competition data: until the organiser deletes the competition</li>
            <li>Authentication logs: 90 days</li>
            <li>Technical/session data: 30 days</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Your rights under UK GDPR</h2>
          <p style={paraStyle}>
            You have the right to access, correct, erase, restrict, port and object to processing of your personal data. Contact hello@gymcomp.co.uk to exercise any of these rights. We will respond within 30 days.
          </p>
          <p style={paraStyle}>
            For competitor data entered by an organiser, requests should be directed to the organiser in the first instance as they are the data controller.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Third parties</h2>
          <ul style={listStyle}>
            <li>Supabase: database, authentication, storage (supabase.com/privacy)</li>
            <li>Netlify: hosting and deployment (netlify.com/privacy)</li>
            <li>Google OAuth: optional sign-in (policies.google.com/privacy)</li>
            <li>GoDaddy: domain registration (godaddy.com/legal/agreements/privacy-policy)</li>
            <li>Mapbox: address lookup (mapbox.com/legal/privacy)</li>
          </ul>
          <p style={paraStyle}>No data is shared beyond what is necessary to operate these services.</p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Cookies</h2>
          <p style={paraStyle}>
            GymComp uses minimal cookies and local storage for maintaining your authenticated session and storing competition state locally for offline resilience. We do not use advertising or tracking cookies.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Changes to this policy</h2>
          <p style={paraStyle}>
            Significant changes will be notified via email to registered account holders. The latest version will always be available at gymcomp.co.uk/privacy.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Complaints</h2>
          <p style={paraStyle}>
            You have the right to lodge a complaint with the UK Information Commissioner's Office (ICO) at ico.org.uk.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, marginTop: 40, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
          All Rights Reserved 2026 GymComp©
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TERMS OF SERVICE (public, no auth required)
// ============================================================

export default PrivacyPolicyScreen;
