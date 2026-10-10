import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigError =
  url && anonKey ? null : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server.";

// No auth for the hackathon: the browser uses the anon key, and every query filters on profile_id.
export const supabase = createClient(url || "http://localhost", anonKey || "missing");
