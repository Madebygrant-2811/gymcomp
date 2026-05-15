// ── Generic Loops event function ─────────────────────────────────────
// Fires any named event to Loops, optionally upserting contact
// properties first. All Loops failures are non-throwing by design —
// errors are logged but the function always returns 200.
//
// Example POST bodies:
//   { "email": "jane@club.com", "eventName": "comp_created" }
//   { "email": "jane@club.com", "eventName": "comp_completed",
//     "eventProperties": { "compName": "Spring Cup" },
//     "contactProperties": { "compCount": 3 } }
// ─────────────────────────────────────────────────────────────────────

import { upsertContact, sendEvent } from './_lib/loops.js';

const PREFIX = '[loops-event]';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email, eventName, eventProperties = {}, contactProperties = null } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!eventName || typeof eventName !== 'string') {
      return new Response(JSON.stringify({ error: 'eventName is required and must be a string' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`${PREFIX} Processing "${eventName}" for ${email}`);

    // Optionally upsert contact properties before firing the event
    if (contactProperties && typeof contactProperties === 'object') {
      const contactResult = await upsertContact(email, contactProperties);
      if (!contactResult) {
        console.error(`${PREFIX} upsertContact failed for ${email} (event: ${eventName})`);
        return new Response(JSON.stringify({ success: false, error: 'Failed to update contact in Loops' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const eventResult = await sendEvent(email, eventName, eventProperties);

    if (!eventResult) {
      console.error(`${PREFIX} sendEvent "${eventName}" failed for ${email}`);
      return new Response(JSON.stringify({ success: false, error: `Failed to send "${eventName}" event to Loops` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`${PREFIX} "${eventName}" complete for ${email}`);
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
