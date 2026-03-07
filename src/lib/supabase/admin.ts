import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client that uses the service role key.
 * Bypasses RLS — use ONLY in server actions / route handlers, never in browser code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin env vars. Add SUPABASE_SERVICE_ROLE_KEY to your environment variables."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
