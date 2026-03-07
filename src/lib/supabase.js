import { createClient } from "@supabase/supabase-js";

// ============================================================
// SUPABASE — lightweight REST client (no external imports)
// ============================================================
export const SUPABASE_URL = "https://xjuwbgitqsvrmoejvzwb.supabase.co";
export const SUPABASE_KEY = "sb_publishable_7jhhejhXAH8hlX-gnsElnA_1ih0G-2f";

// ── Supabase Auth client (official SDK — auth only; data ops use the hand-rolled client below) ──
export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_KEY);

export const supabase = {
  async upsert(table, record, token = SUPABASE_KEY) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(record),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  async patch(table, id, fields, token = SUPABASE_KEY) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(fields),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  async fetchOne(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { data: null, error: await res.text() };
    const rows = await res.json();
    return { data: rows[0] || null, error: null };
  },
  async fetchList(table, limit = 20) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,data->compData->>name,data->compData->>date,data->compData->>location,created_at&order=created_at.desc&limit=${limit}`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { data: [], error: await res.text() };
    return { data: await res.json(), error: null };
  },
  // Fetch all competitions belonging to the authenticated user
  async fetchListForUser(token, userId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/competitions?user_id=eq.${userId}&select=id,data,status,created_at&order=created_at.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return { data: [], error: await res.text() };
    return { data: await res.json(), error: null };
  },
  // Fetch submissions for a competition (requires user JWT — RLS checks comp ownership)
  async fetchSubmissions(compId) {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) {
      console.warn("[fetchSubmissions] no session — cannot fetch submissions without auth");
      return { data: [], error: "Not authenticated" };
    }
    const token = session.access_token;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?comp_id=eq.${compId}&order=submitted_at.desc&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[fetchSubmissions] HTTP", res.status, err);
      return { data: [], error: err };
    }
    const data = await res.json();
    return { data, error: null };
  },
  // Insert a new club submission
  async insertSubmission(submission) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(submission),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  // Update a submission status (requires user JWT — RLS checks comp ownership)
  async updateSubmission(id, patch) {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) {
      console.error("[updateSubmission] no session — cannot update without auth");
      return { error: "Not authenticated" };
    }
    const token = session.access_token;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { const err = await res.text(); console.error("[updateSubmission] HTTP error:", err); return { error: err }; }
    const rows = await res.json();
    if (!rows.length) {
      console.error("[updateSubmission] 0 rows updated for id:", id, "— RLS may have blocked the update");
      return { error: "No rows updated — you may not own this competition." };
    }
    return { error: null };
  },
  // Fetch a user's profile row — requires session JWT
  async fetchProfile(userId, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) return { data: null, error: await res.text() };
    const rows = await res.json();
    return { data: rows[0] || null, error: null };
  },
  // Delete a competition row — requires session JWT (RLS: auth.uid() = user_id)
  async deleteCompetition(compId, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/competitions?id=eq.${compId}`, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  // Upsert a user's profile row — requires session JWT
  async upsertProfile(profile, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(profile),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  // ── Scores table methods ──────────────────────────────────
  async upsertScores(rows, token = SUPABASE_KEY) {
    if (!rows.length) return { error: null };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  async fetchScores(compId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?comp_id=eq.${compId}&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { data: [], error: await res.text() };
    return { data: await res.json(), error: null };
  },
  async deleteScore(compId, roundId, gymnastId, apparatus, token = SUPABASE_KEY) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?comp_id=eq.${encodeURIComponent(compId)}&round_id=eq.${encodeURIComponent(roundId)}&gymnast_id=eq.${encodeURIComponent(gymnastId)}&apparatus=eq.${encodeURIComponent(apparatus)}`,
      { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
  async deleteAllScores(compId, token = SUPABASE_KEY) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?comp_id=eq.${encodeURIComponent(compId)}`, {
      method: "DELETE",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) { const err = await res.text(); return { error: err }; }
    return { error: null };
  },
};
