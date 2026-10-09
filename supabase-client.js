"use strict";
// Public browser configuration only. Supabase owns customer session persistence.
window.SelcoreSupabase = (() => {
  const url = "https://ffznkypurnocabqyxpps.supabase.co";
  const key = "sb_publishable_i00ElHRCxIzfXVTW--x85w___PFrTPS";
  if (!window.supabase?.createClient) {
    console.warn("Supabase SDK unavailable");
    return null;
  }
  return window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: "selcore-auth-ffznkypurnocabqyxpps",
    },
  });
})();
