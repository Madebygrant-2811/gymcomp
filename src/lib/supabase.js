import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xjuwbgitqsvrmoejvzwb.supabase.co";
const SUPABASE_KEY = "sb_publishable_7jhhejhXAH8hlX-gnsElnA_1ih0G-2f";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
