/* Browser-safe Supabase configuration. Publishable/anon key only. */
(() => {
  const SUPABASE_URL = 'https://rkxywhsjbnhtoflwgovh.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VsCzROFFnLZtR8ghg3t9Cw_jFiuLpcI';
  if (!window.supabase?.createClient) {
    console.error('Supabase JS library did not load.');
    return;
  }
  if (!SUPABASE_URL.startsWith('https://') || SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_')) {
    console.error('Set the Supabase project URL and publishable key in supabase.js.');
    return;
  }
  window.arcSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
