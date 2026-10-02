// Keep preview read-only against the live database. Enable writes only at cutover,
// or point to an isolated staging table before setting readOnly to false.
window.BATCH_BREW_CLOUD = {
  mode: "supabase",
  supabaseUrl: "https://hvkrksymwzqhihxbmqnl.supabase.co",
  supabaseAnonKey: "sb_publishable_ztQAOXPmN60DHpIxLEVU2Q_4SizSzjS",
  table: "batch_brew_records",
  readOnly: true,
  brandLogo: "" // Set to the original uploaded CRU+ clover asset when available.
};
