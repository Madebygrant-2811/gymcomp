import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fire-and-forget: update last_active_at on the user's profile row
export const touchLastActive = async (userId) => {
  try {
    await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
  } catch (_) { /* silently swallow — heartbeat failure must never break the app */ }
};
