import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.\n' +
      'Copy .env.local.example to .env.local and fill in your Supabase project credentials.'
  );
}

/**
 * Singleton Supabase client — safe to call from any client component.
 * Uses the anon (public) key; RLS policies on the database control access.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // No auth needed for this dashboard
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
