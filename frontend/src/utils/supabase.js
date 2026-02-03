import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Configuration
 * Uses the same credentials as the existing vanilla JS implementation
 * See: static/js/config.js for original source
 */
const SUPABASE_URL = 'https://hgqaqvhveisjzbnefesv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qYKLZ1xwzYDNctAtAZaFiw_FxYNyVhw';

/**
 * Supabase client instance
 * Configured with session persistence and auto-refresh
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist sessions in localStorage
    persistSession: true,
    // Automatically refresh the session
    autoRefreshToken: true,
    // Detect session from URL (for OAuth and magic links)
    detectSessionInUrl: true
  }
});

/**
 * Check if Supabase is properly configured
 * @returns {boolean} True if Supabase credentials are set
 */
export function isSupabaseConfigured() {
  return (
    SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
    SUPABASE_URL.includes('supabase.co')
  );
}

/**
 * Get the current session
 * @returns {Promise<Object|null>} Current session or null
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[Supabase] Error getting session:', error);
    return null;
  }
  return session;
}

/**
 * Get the current user
 * @returns {Promise<Object|null>} Current user or null
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

export default supabase;
