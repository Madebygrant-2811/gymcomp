import { upsertContact, sendEvent } from './_lib/loops.js';

const PREFIX = '[loops-signup]';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email, firstName, clubName, marketingConsent } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`${PREFIX} Processing signup for ${email}`);

    const contactResult = await upsertContact(email, {
      firstName: firstName || '',
      clubName: clubName || '',
      marketingConsent: !!marketingConsent,
      marketingConsentAt: marketingConsent ? new Date().toISOString() : null,
      subscriptionStatus: 'none',
      foundingClub: false,
      compCount: 0,
    });

    if (!contactResult) {
      console.error(`${PREFIX} upsertContact failed for ${email}`);
      return new Response(JSON.stringify({ success: false, error: 'Failed to create contact in Loops' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const eventResult = await sendEvent(email, 'signup');

    if (!eventResult) {
      console.error(`${PREFIX} sendEvent "signup" failed for ${email}`);
      return new Response(JSON.stringify({ success: false, error: 'Failed to send signup event to Loops' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`${PREFIX} Signup complete for ${email}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`${PREFIX} Error:`, err.message);
    return new Response(JSON.stringify({ success: false, error: 'Unexpected error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
