// ── Loops email platform helper ──────────────────────────────────────
// Wraps the Loops.so REST API for transactional and lifecycle emails.
// All functions are non-throwing by design — any Loops failure is logged
// to console.error but never blocks or breaks the calling flow.
// ─────────────────────────────────────────────────────────────────────

const BASE = 'https://app.loops.so/api/v1';
const PREFIX = '[loops]';

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
  };
}

export async function upsertContact(email, properties = {}) {
  try {
    const res = await fetch(`${BASE}/contacts/update`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, ...properties }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`${PREFIX} upsertContact failed (${res.status}):`, body);
      return null;
    }

    const data = await res.json();
    console.log(`${PREFIX} upsertContact succeeded for ${email}`);
    return data;
  } catch (err) {
    console.error(`${PREFIX} upsertContact error for ${email}:`, err.message);
    return null;
  }
}

export async function sendEvent(email, eventName, eventProperties = {}) {
  try {
    const res = await fetch(`${BASE}/events/send`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, eventName, eventProperties }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`${PREFIX} sendEvent "${eventName}" failed (${res.status}):`, body);
      return null;
    }

    const data = await res.json();
    console.log(`${PREFIX} sendEvent "${eventName}" succeeded for ${email}`);
    return data;
  } catch (err) {
    console.error(`${PREFIX} sendEvent "${eventName}" error for ${email}:`, err.message);
    return null;
  }
}

export async function deleteContact(email) {
  try {
    const res = await fetch(`${BASE}/contacts/delete`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`${PREFIX} deleteContact failed (${res.status}):`, body);
      return null;
    }

    const data = await res.json();
    console.log(`${PREFIX} deleteContact succeeded for ${email}`);
    return data;
  } catch (err) {
    console.error(`${PREFIX} deleteContact error for ${email}:`, err.message);
    return null;
  }
}
