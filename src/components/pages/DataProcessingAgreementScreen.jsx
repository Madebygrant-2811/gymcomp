import GymCompLogo from "../../assets/GymComp-Logo.svg";

// ============================================================
// DATA PROCESSING AGREEMENT (public, no auth required)
// ============================================================
function DataProcessingAgreementScreen() {
  const sectionStyle = { marginBottom: 28 };
  const headingStyle = { fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 };
  const paraStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px" };
  const listStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px", paddingLeft: 24 };
  const thStyle = { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border)" };
  const tdStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, verticalAlign: "top", padding: "8px 12px", borderBottom: "1px solid var(--border)" };

  const subProcessors = [
    ["Supabase, Inc.", "Database, authentication and application data storage", "EU (Frankfurt region) — primary data storage"],
    ["Netlify, Inc.", "Application hosting and serverless functions", "Global CDN; functions in EU/US"],
    ["Stripe, Inc.", "Payment processing (organiser billing data only — no competitor data)", "EU / US"],
    ["Loops (Astrodon, Inc.)", "Transactional and account email delivery", "US"],
    ["Google LLC", "Optional sign-in via Google OAuth (organiser accounts only)", "EU / US"],
    ["Mapbox, Inc.", "Venue address lookup (no competitor personal data)", "EU / US"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--background-light)", fontFamily: "var(--font-display)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Logo */}
        <a href="/" style={{ display: "inline-block", marginBottom: 48 }}>
          <img src={GymCompLogo} alt="GymComp" style={{ height: 25 }} />
        </a>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 8 }}>
          Data Processing Agreement
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 40 }}>Version 1.0 — July 2026</p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Parties</h2>
          <p style={paraStyle}>
            This Data Processing Agreement ("Agreement") is entered into between:
          </p>
          <p style={paraStyle}>
            (1) The Controller: the club, event organiser or organisation holding a GymComp account and accepting the GymComp Terms of Service ("Controller"); and
          </p>
          <p style={paraStyle}>
            (2) The Processor: Grant Thompson, trading as GymComp, of 56 Arnfield Drive, Hilton, Derby, DE65 5AA, contactable at hello@gymcomp.co.uk ("Processor"). ICO registration reference: C1986326.
          </p>
          <p style={paraStyle}>
            This Agreement is incorporated into the GymComp Terms of Service and takes effect automatically for every Controller upon account creation. Organisations requiring a countersigned copy may request one at hello@gymcomp.co.uk.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Background and scope</h2>
          <p style={paraStyle}>
            1.1 The Processor provides a web-based gymnastics competition management platform accessible at app.gymcomp.co.uk (the "Service").
          </p>
          <p style={paraStyle}>
            1.2 In providing the Service, the Processor processes personal data on behalf of the Controller, including personal data relating to children. This Agreement sets out the terms of that processing as required by Article 28 of the UK GDPR.
          </p>
          <p style={paraStyle}>
            1.3 This Agreement supplements the GymComp Terms of Service and Privacy Policy, available at <a href="/terms" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>gymcomp.co.uk/terms</a> and <a href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>gymcomp.co.uk/privacy</a>. In the event of conflict concerning the processing of personal data, this Agreement prevails.
          </p>
          <p style={paraStyle}>
            1.4 "UK GDPR", "personal data", "processing", "data subject", "personal data breach" and related terms have the meanings given in the UK GDPR and the Data Protection Act 2018.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Details of processing</h2>
          <p style={paraStyle}>
            2.1 The details of the processing are set out in Annex 1 (Details of Processing).
          </p>
          <p style={paraStyle}>
            2.2 The Controller warrants that it has a lawful basis for the processing, has provided all required privacy information to data subjects (or their parents/guardians where data subjects are children), and has obtained any consents required to enter personal data into the Service.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Processor obligations</h2>
          <p style={paraStyle}>The Processor shall:</p>
          <ul style={listStyle}>
            <li>process personal data only on the documented instructions of the Controller, including as given through the Controller's use of the Service, unless required to do otherwise by law (in which case the Processor will inform the Controller unless prohibited from doing so);</li>
            <li>ensure that all persons authorised to process the personal data are subject to obligations of confidentiality;</li>
            <li>implement and maintain appropriate technical and organisational measures to protect the personal data, as described in Annex 3 (Security Measures);</li>
            <li>taking into account the nature of the processing, assist the Controller by appropriate technical and organisational measures in responding to requests from data subjects exercising their rights under UK GDPR;</li>
            <li>assist the Controller in ensuring compliance with its obligations regarding security of processing, personal data breach notification, and data protection impact assessments, taking into account the nature of the processing and the information available to the Processor;</li>
            <li>at the Controller's choice, delete or return all personal data at the end of the provision of the Service, and delete existing copies unless retention is required by law, in accordance with clause 7;</li>
            <li>make available to the Controller all information reasonably necessary to demonstrate compliance with this Agreement, and allow for and contribute to audits as set out in clause 9.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Sub-processors</h2>
          <p style={paraStyle}>
            4.1 The Controller provides general written authorisation for the Processor to engage the sub-processors listed in Annex 2.
          </p>
          <p style={paraStyle}>
            4.2 The Processor shall notify the Controller of any intended addition or replacement of a sub-processor at least 14 days in advance, giving the Controller the opportunity to object on reasonable data protection grounds. If the objection cannot be resolved, the Controller may terminate its use of the Service.
          </p>
          <p style={paraStyle}>
            4.3 The Processor shall impose data protection obligations on each sub-processor that are materially equivalent to those in this Agreement, and remains fully liable to the Controller for the performance of each sub-processor's obligations.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. International transfers</h2>
          <p style={paraStyle}>
            5.1 All competition and competitor personal data is stored in the European Union (Supabase, Frankfurt region).
          </p>
          <p style={paraStyle}>
            5.2 Where a sub-processor processes limited personal data outside the UK or EEA (for example, email delivery), the Processor shall ensure the transfer is protected by a lawful transfer mechanism under UK GDPR, such as UK adequacy regulations, the UK International Data Transfer Agreement, or the UK Addendum to the EU Standard Contractual Clauses.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Personal data breach</h2>
          <p style={paraStyle}>
            6.1 The Processor shall notify the Controller without undue delay after becoming aware of a personal data breach affecting the Controller's personal data, and in any event within 48 hours of becoming aware.
          </p>
          <p style={paraStyle}>
            6.2 The notification shall describe, to the extent known, the nature of the breach, the categories and approximate number of data subjects and records affected, the likely consequences, and the measures taken or proposed to address the breach.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Deletion and return of data</h2>
          <p style={paraStyle}>
            7.1 The Controller may delete individual competitions, and the personal data within them, at any time through the Service.
          </p>
          <p style={paraStyle}>
            7.2 On written request following the conclusion of an event, the Processor shall delete the personal data relating to that event within 30 days, unless retention is required by law.
          </p>
          <p style={paraStyle}>
            7.3 On termination of the Controller's account, personal data is retained for 30 days (to allow for reinstatement) and then permanently deleted, unless the Controller requests earlier deletion.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Data subject rights</h2>
          <p style={paraStyle}>
            8.1 If the Processor receives a request from a data subject relating to the Controller's personal data, it shall promptly forward the request to the Controller and shall not respond directly except to acknowledge receipt and redirect the data subject, unless legally required to do so.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Audit and information</h2>
          <p style={paraStyle}>
            9.1 The Processor shall respond to reasonable written information requests from the Controller concerning the processing of personal data under this Agreement within 14 days.
          </p>
          <p style={paraStyle}>
            9.2 No more than once in any 12-month period, and on at least 30 days' written notice, the Controller may audit the Processor's compliance with this Agreement. Audits shall be conducted during normal business hours, shall not unreasonably interfere with the Processor's business, and shall in the first instance be satisfied by written responses and documentation where reasonably possible.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Liability</h2>
          <p style={paraStyle}>
            10.1 Each party's liability arising under or in connection with this Agreement is subject to the limitations and exclusions of liability set out in the GymComp Terms of Service, except that nothing in this Agreement limits either party's liability to data subjects under UK GDPR or any liability that cannot be limited by law.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>11. Term and termination</h2>
          <p style={paraStyle}>
            11.1 This Agreement takes effect upon the Controller's acceptance of the GymComp Terms of Service and remains in force for as long as the Processor processes personal data on behalf of the Controller.
          </p>
          <p style={paraStyle}>
            11.2 Clauses 6, 7, 8 and 10 survive termination.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>12. Governing law</h2>
          <p style={paraStyle}>
            12.1 This Agreement is governed by the laws of England and Wales, and the parties submit to the exclusive jurisdiction of the courts of England and Wales.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Annex 1 — Details of Processing</h2>
          <p style={paraStyle}>
            <strong>Subject matter:</strong> provision of the GymComp competition management platform for the Controller's gymnastics events.
          </p>
          <p style={paraStyle}>
            <strong>Duration:</strong> the duration of the Controller's use of the Service, plus the retention periods in clause 7.
          </p>
          <p style={paraStyle}>
            <strong>Nature and purpose:</strong> hosting, storage, display and export of competition entry data, live scoring, results and rankings; distribution of results; account administration. Where agreed, this includes GymComp setting up and operating competitions within the Service on the Controller's behalf as a managed service, acting at all times on the Controller's instructions.
          </p>
          <p style={paraStyle}>
            <strong>Categories of data subjects:</strong> competitors (including children under 18), coaches, judges and officials, and the Controller's staff and volunteers.
          </p>
          <p style={paraStyle}>
            <strong>Categories of personal data:</strong> competitor names, ages and/or dates of birth, club affiliations, competitor numbers, scores and results; coach names and email addresses; organiser account names and email addresses.
          </p>
          <p style={paraStyle}>
            <strong>Special category data:</strong> none. The Service is not designed or intended for the processing of special category data, and the Controller agrees not to enter it.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Annex 2 — Approved Sub-processors</h2>
          <div style={{ overflowX: "auto", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Sub-processor</th>
                  <th style={thStyle}>Service provided</th>
                  <th style={thStyle}>Location of processing</th>
                </tr>
              </thead>
              <tbody>
                {subProcessors.map(([name, service, location]) => (
                  <tr key={name}>
                    <td style={tdStyle}>{name}</td>
                    <td style={tdStyle}>{service}</td>
                    <td style={tdStyle}>{location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={paraStyle}>
            Each sub-processor is engaged under its standard data processing terms incorporating UK GDPR-compliant safeguards.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Annex 3 — Technical and Organisational Security Measures</h2>
          <ul style={listStyle}>
            <li>All personal data is stored in the European Union (Supabase, Frankfurt region) on infrastructure with encryption at rest and automated backups.</li>
            <li>All data in transit is encrypted using HTTPS/TLS.</li>
            <li>Row Level Security is enforced at the database level: each organiser can access only their own competition data.</li>
            <li>Authentication is via magic link email or Google OAuth. No passwords are created or stored by the Service.</li>
            <li>Judge and scorer access is controlled by per-competition PINs, stored only as SHA-256 hashes; plain-text PINs are never stored.</li>
            <li>Public results pages display competition results only; coach live views are gated by club access codes.</li>
            <li>Administrative access to production data is restricted to the Processor and protected by the same authentication controls.</li>
            <li>Payment card data is handled entirely by Stripe; the Service never receives or stores card details.</li>
            <li>Sensitive third-party API operations are performed server-side; API keys are never exposed to the browser.</li>
          </ul>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, marginTop: 40, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
          All Rights Reserved 2026 GymComp©
        </div>
      </div>
    </div>
  );
}

export default DataProcessingAgreementScreen;
