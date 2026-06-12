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
  const link = document.createElement("a");
  link.href = "./cold-brew-decaf.html";
  link.className = "btn secondary";
  link.textContent = "Cold Brew + Decaf";
  link.style.display = "inline-flex";
  link.style.alignItems = "center";
  link.style.textDecoration = "none";
  actions.prepend(link);
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
