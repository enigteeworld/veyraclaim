import { createClient } from "@supabase/supabase-js";

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const SUPABASE_URL = required("SUPABASE_URL", process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = required(
  "SUPABASE_SERVICE_ROLE_KEY",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Server-side only client (service role)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
