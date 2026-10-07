// Offline-Cache: App-Dateien netzwerk-zuerst, Datenkacheln cache-zuerst (URLs sind pro Datenstand versioniert).
// __BUILD__ setzt der Deploy-Workflow bei jedem Deploy automatisch – nichts von Hand hochzählen.
const SHELL = 'af-shell-__BUILD__', DATA = 'af-data-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'categories.json', 'manifest.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png',
  'fonts/archivo-latin-wdth-normal.woff2', 'fonts/archivo-latin-ext-wdth-normal.woff2',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  // Alte App-Caches löschen, den Datenspeicher behalten
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('af-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.origin !== location.origin || e.request.method !== 'GET') return;
  if(url.pathname.includes('/data/tiles/')){
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(e.request); if(hit) return hit;
      const r = await fetch(e.request); if(r.ok) c.put(e.request, r.clone()); return r;
    }));
  }else if(!url.pathname.endsWith('meta.json') && !url.pathname.endsWith('categories.json')){
    e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(m => m || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  }
});
