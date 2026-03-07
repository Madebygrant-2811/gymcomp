function TermsOfServiceScreen() {
  const sectionStyle = { marginBottom: 28 };
  const headingStyle = { fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 };
  const paraStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px" };
  const listStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px", paddingLeft: 24 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-light)", fontFamily: "var(--font-display)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <a href="/" style={{ display: "inline-block", marginBottom: 48 }}>
          <img src={GymCompLogo} alt="GymComp" style={{ height: 25 }} />
        </a>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 40 }}>Last updated: March 2026</p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Acceptance of Terms</h2>
          <p style={paraStyle}>
            By creating an account or using GymComp you agree to these Terms of Service. If you do not agree, do not use the service. These terms constitute a legally binding agreement between you and GymComp, operated by Grant Thompson.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Description of Service</h2>
          <p style={paraStyle}>
            GymComp is a web-based gymnastics competition management platform that allows authorised organisers to create and manage competitions, record scores, and publish results. The service is accessible at gymcomp.co.uk.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Accounts</h2>
          <ul style={listStyle}>
            <li>You must provide a valid email address to create an account</li>
            <li>You are responsible for maintaining the security of your account</li>
            <li>You must notify us immediately of any unauthorised access at hello@gymcomp.co.uk</li>
            <li>One person or organisation may not maintain more than one free account</li>
            <li>You must be 18 or over to create an organiser account</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Acceptable Use</h2>
          <p style={paraStyle}>You agree not to:</p>
          <ul style={listStyle}>
            <li>Use GymComp for any unlawful purpose</li>
            <li>Enter false, inaccurate or misleading competitor data</li>
            <li>Attempt to gain unauthorised access to other organisers' competitions</li>
            <li>Use the service to store or transmit malicious code</li>
            <li>Resell or sublicense access to the service</li>
            <li>Attempt to reverse engineer or copy the platform</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Competitor Data and Your Responsibilities</h2>
          <p style={paraStyle}>
            As an organiser you are the data controller for all competitor data you enter into GymComp. You confirm that:
          </p>
          <ul style={listStyle}>
            <li>You have obtained appropriate permission to enter each competitor's personal data</li>
            <li>You will comply with UK GDPR and any applicable data protection laws</li>
            <li>You will not enter data for competitors without appropriate authorisation</li>
            <li>You accept full responsibility for the accuracy of data you enter</li>
          </ul>
          <p style={paraStyle}>
            GymComp acts as a data processor only. We process competitor data solely on your instructions and in accordance with our <a href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>Privacy Policy</a>.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Subscription and Payment</h2>
          <ul style={listStyle}>
            <li>GymComp is free to use for competition setup</li>
            <li>Starting a live competition requires an active paid subscription at the current advertised rate</li>
            <li>Subscriptions are billed monthly and can be cancelled at any time</li>
            <li>Cancellation takes effect at the end of the current billing period — no partial refunds are issued</li>
            <li>We reserve the right to change pricing with 30 days notice to active subscribers</li>
            <li>All prices are in GBP and inclusive of VAT where applicable</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Service Availability</h2>
          <ul style={listStyle}>
            <li>We aim to maintain high availability but do not guarantee uninterrupted access to the service</li>
            <li>Scheduled maintenance will be communicated in advance where possible</li>
            <li>We are not liable for any losses arising from service unavailability during a competition or otherwise</li>
            <li>We strongly recommend maintaining a paper or spreadsheet backup of scores during live competitions</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Limitation of Liability</h2>
          <p style={paraStyle}>To the maximum extent permitted by law:</p>
          <ul style={listStyle}>
            <li>GymComp is provided "as is" without warranty of any kind</li>
            <li>We are not liable for any loss of data, loss of revenue, or any indirect or consequential losses arising from your use of the service</li>
            <li>Our total liability to you shall not exceed the amount you have paid us in the 3 months preceding the claim</li>
            <li>Nothing in these terms limits liability for death, personal injury, or fraudulent misrepresentation</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Intellectual Property</h2>
          <ul style={listStyle}>
            <li>GymComp and all associated software, designs and content are owned by Grant Thompson</li>
            <li>You retain ownership of all competition data you enter</li>
            <li>By using the service you grant us a limited licence to process and store your data solely to provide the service</li>
            <li>You may not copy, reproduce or distribute any part of the platform without written permission</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Termination</h2>
          <ul style={listStyle}>
            <li>You may delete your account at any time via the account settings</li>
            <li>We reserve the right to suspend or terminate accounts that violate these terms without notice</li>
            <li>On termination your data will be retained for 30 days then permanently deleted unless you request earlier deletion</li>
            <li>Clauses relating to liability, intellectual property and dispute resolution survive termination</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Changes to These Terms</h2>
          <p style={paraStyle}>
            We may update these terms from time to time. Significant changes will be notified via email at least 14 days before taking effect. Continued use of the service after changes take effect constitutes acceptance of the updated terms. The latest version will always be at gymcomp.co.uk/terms.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>12. Governing Law</h2>
          <p style={paraStyle}>
            These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>13. Contact</h2>
          <p style={paraStyle}>For any questions about these terms contact hello@gymcomp.co.uk</p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, marginTop: 40, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
          All Rights Reserved 2026 GymComp©
        </div>
      </div>
    </div>
  );
}

export default TermsOfServiceScreen;
