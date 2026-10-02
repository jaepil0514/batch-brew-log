const CACHE='cru-shell-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./data.js','./sync.js','./cloud-config.js','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cru-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache Supabase responses, images outside the shell, or write requests.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const path=url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if(!SHELL.includes('./'+path)&&!(event.request.mode==='navigate'&&['','index.html','cold-brew-decaf.html'].includes(path)))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(async()=>await caches.match(event.request,{ignoreSearch:true})||(event.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
