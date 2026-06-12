window.BATCH_BREW_CLOUD = {
  mode: "supabase",
  supabaseUrl: "https://hvkrksymwzqhihxbmqnl.supabase.co",
  supabaseAnonKey: "sb_publishable_ztQAOXPmN60DHpIxLEVU2Q_4SizSzjS",
  table: "batch_brew_records"
};

document.addEventListener("DOMContentLoaded", () => {
  if (!location.pathname.endsWith("/") && !location.pathname.endsWith("/index.html")) return;
  const actions = document.querySelector(".topbar .actions");
  if (!actions) return;
  const style = document.createElement("style");
  style.textContent = `
    .chart-switcher { display:flex; gap:6px; padding:5px; border:2px solid var(--green); border-radius:8px; background:#fff; box-shadow:0 5px 14px rgba(31,78,70,.12); }
    .chart-switcher a { min-height:38px; display:inline-flex; align-items:center; justify-content:center; padding:0 15px; border-radius:5px; color:var(--green); font-size:13px; font-weight:900; text-decoration:none; white-space:nowrap; }
    .chart-switcher a:hover { background:var(--green-soft); }
    .chart-switcher a[aria-current="page"] { color:#fff; background:var(--green); }
    @media (max-width:760px) { .chart-switcher { width:100%; } .chart-switcher a { flex:1; } }
  `;
  document.head.append(style);
  const nav = document.createElement("nav");
  nav.className = "chart-switcher";
  nav.setAttribute("aria-label", "Recipe charts");
  nav.innerHTML = '<a href="./index.html" aria-current="page">Batch Brew</a><a href="./cold-brew-decaf.html">Cold Brew + Decaf</a>';
  actions.prepend(nav);
});

if (location.pathname.endsWith("/") || location.pathname.endsWith("/index.html")) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");
    if (!response.ok || !url.includes("/rest/v1/batch_brew_records") || !url.includes("select=payload")) return response;
    const rows = await response.clone().json();
    const filtered = rows.filter((row) => row?.payload?.logType !== "cold-brew-decaf");
    return new Response(JSON.stringify(filtered), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  };
}
