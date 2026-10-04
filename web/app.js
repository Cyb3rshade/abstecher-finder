'use strict';
// ===================== Grundlagen =====================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtKm = m => (m/1000).toLocaleString('de-DE', {maximumFractionDigits: m < 10000 ? 1 : 0});
const enc = encodeURIComponent;
function hav(a, b){
  const R=6371000, t=Math.PI/180, dLa=(b[0]-a[0])*t, dLo=(b[1]-a[1])*t;
  const x=Math.sin(dLa/2)**2 + Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function setStatus(msg, err=false){ $('status').textContent = msg; $('status').className = err ? 'err' : ''; }
let toastTimer;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.hidden=true, 2800); }
async function getJSON(url, what, ms=20000){
  let r;
  try{ r = await fetch(url, {signal: AbortSignal.timeout(ms)}); }
  catch(e){ throw new Error(`${what} nicht erreichbar. Internetverbindung prüfen.`); }
  if(!r.ok) throw new Error(`${what} antwortet mit Fehler ${r.status}.`);
  return r.json();
}

// ===================== Extras (Zusatzfilter) =====================
const EXTRAS = [
  {id:'in',    label:'Drinnen',          test:r=>r.indoor, excl:'out'},
  {id:'out',   label:'Draußen',          test:r=>!r.indoor, excl:'in'},
  {id:'wx',    label:'Wetterunabhängig', test:r=>r.indoor || r.t.covered==='yes'},
  {id:'dog',   label:'Hundefreundlich',  test:r=>['yes','leashed','outside'].includes(r.t.dog)},
  {id:'wheel', label:'Rollstuhlgerecht', test:r=>['yes','limited'].includes(r.t.wheelchair)},
  {id:'free',  label:'Kostenlos',        test:r=>r.t.fee==='no'},
  {id:'web',   label:'Mit Website',      test:r=>!!(r.t.website || r.t['contact:website'])},
];

// ===================== Zustand =====================
const state = {
  MAIN: [], SUB: {}, meta: null, tileSet: new Set(),
  stops: ['', ''], radius: 8000,
  mains: new Set(), subs: new Set(), extras: new Set(), kw: '', maxOff: 8000, named: true,
  route: null, results: [], tab: 'hits', favs: loadFavs(), tips: new Set(), markers: {}, activeId: null,
};

// ===================== Karte =====================
const map = L.map('map').setView([51.2, 10.3], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende'}).addTo(map);
const routeLayer = L.layerGroup().addTo(map), poiLayer = L.layerGroup().addTo(map);

// ===================== Merkliste =====================
function loadFavs(){ try{ return JSON.parse(localStorage.getItem('af-favs')) || {}; }catch(e){ return {}; } }
function saveFavs(){ try{ localStorage.setItem('af-favs', JSON.stringify(state.favs)); }catch(e){} }
function toggleFav(id){
  if(state.favs[id]){ delete state.favs[id]; toast('Von der Merkliste entfernt'); }
  else{
    const r = state.results.find(x => x.id === id); if(!r) return;
    state.favs[id] = {id, name: r.name, lat: r.lat, lon: r.lon, sid: r.s.id, web: r.t.website || r.t['contact:website'] || '', added: Date.now()};
    toast('Auf die Merkliste gesetzt');
  }
  saveFavs(); render();
}

// ===================== Haltepunkte =====================
function renderStops(){
  const n = state.stops.length;
  $('stops').innerHTML = state.stops.map((v, i) => {
    const kind = i === 0 ? 'Start' : i === n-1 ? 'Ziel' : `Zwischenstopp ${i}`;
    const hint = i === 0 ? 'Start, z. B. Hannover' : i === n-1 ? 'Ziel, z. B. Köln' : kind;
    const tools = i === 0
      ? `<button type="button" class="icon-btn" data-locate title="Mein Standort" aria-label="Mein Standort als Start">📍</button>`
      : (i < n-1 ? `<button type="button" class="icon-btn" data-remove="${i}" aria-label="${kind} entfernen">✕</button>` : '');
    return `<li class="stop-row ${i>0 && i<n-1 ? 'mid' : ''}"><span class="dot" aria-hidden="true"></span>
      <input type="text" data-stop="${i}" list="places" value="${esc(v)}" placeholder="${hint}" aria-label="${kind}" required>
      <span class="tools">${tools}</span></li>`;
  }).join('');
}
$('stops').addEventListener('input', e => {
  const i = e.target.dataset.stop; if(i == null) return;
  state.stops[+i] = e.target.value; suggest(e.target.value);
});
$('stops').addEventListener('click', e => {
  const rm = e.target.closest('[data-remove]');
  if(rm){ state.stops.splice(+rm.dataset.remove, 1); renderStops(); return; }
  if(e.target.closest('[data-locate]')){
    if(!navigator.geolocation){ toast('Standort wird von diesem Browser nicht unterstützt'); return; }
    navigator.geolocation.getCurrentPosition(
      p => { state.stops[0] = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`; renderStops(); toast('Standort übernommen'); },
      () => toast('Standort nicht verfügbar'), {enableHighAccuracy: false, timeout: 10000});
  }
});
$('addstop').addEventListener('click', () => {
  state.stops.splice(state.stops.length-1, 0, ''); renderStops();
  $('stops').querySelector(`[data-stop="${state.stops.length-2}"]`)?.focus();
});

// Ortsvorschläge (Photon, auf Deutschland begrenzt)
let suggestTimer, suggestCtl;
function suggest(q){
  clearTimeout(suggestTimer);
  if(q.trim().length < 3) return;
  suggestTimer = setTimeout(async () => {
    suggestCtl?.abort(); suggestCtl = new AbortController();
    try{
      const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=de&bbox=5.5,47.2,15.5,55.1&q=${enc(q)}`, {signal: suggestCtl.signal});
      const j = await r.json();
      const labels = [...new Set(j.features.map(f => [f.properties.name, f.properties.city || f.properties.county, f.properties.state]
        .filter((x, i, a) => x && a.indexOf(x) === i).join(', ')))];
      $('places').innerHTML = labels.map(l => `<option value="${esc(l)}">`).join('');
    }catch(e){}
  }, 300);
}

// ===================== Route =====================
async function geocode(q){
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(m) return [+m[1], +m[2]];
  const j = await getJSON(`https://photon.komoot.io/api/?limit=1&lang=de&q=${enc(q)}`, 'Die Ortssuche');
  const f = j.features?.[0];
  if(!f) throw new Error(`„${q}“ nicht gefunden. Ort genauer angeben, z. B. mit Landkreis.`);
  const [lo, la] = f.geometry.coordinates; return [la, lo];
}
async function getRoute(points){
  const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${points.map(p => p[1]+','+p[0]).join(';')}?overview=full&geometries=geojson`, 'Die Routenberechnung', 30000);
  if(!j.routes?.length) throw new Error('Keine Route zwischen den Punkten gefunden.');
  const rt = j.routes[0];
  let c = 0; const legEnds = rt.legs.map(l => c += l.distance);
  return {coords: rt.geometry.coordinates.map(([lo, la]) => [la, lo]), dist: rt.distance, dur: rt.duration, legEnds};
}
function sampleRoute(coords, step){
  const out = [{p: coords[0], c: 0}]; let cum = 0, next = step;
  for(let i = 1; i < coords.length; i++){
    cum += hav(coords[i-1], coords[i]);
    if(cum >= next){ out.push({p: coords[i], c: cum}); next = cum + step; }
  }
  out.push({p: coords[coords.length-1], c: cum}); return out;
}
function tilesForRoute(coords, radius){
  const set = new Set(), dLa = radius / 111320;
  for(const {p: [la, lo]} of sampleRoute(coords, 1500)){
    const dLo = radius / (111320 * Math.cos(la * Math.PI / 180));
    for(let i = Math.floor((la-dLa)*2); i <= Math.floor((la+dLa)*2); i++)
      for(let j = Math.floor((lo-dLo)*2); j <= Math.floor((lo+dLo)*2); j++){
        const id = `${i}_${j}`; if(state.tileSet.has(id)) set.add(id);
      }
  }
  return [...set];
}
async function loadTiles(ids, onTile){
  let next = 0, done = 0;
  const v = enc(state.meta.built);
  const worker = async () => {
    while(next < ids.length){
      const id = ids[next++];
      try{ const r = await fetch(`data/tiles/${id}.json?v=${v}`); if(r.ok) onTile(await r.json()); }catch(e){}
      setStatus(`Abstecher werden geladen … ${++done} von ${ids.length}`);
    }
  };
  await Promise.all(Array.from({length: 6}, worker));
}

async function search(ev){
  ev?.preventDefault();
  if(!state.meta){ setStatus('Es sind noch keine Daten gebaut. Siehe Anleitung (README).', true); return; }
  state.stops = state.stops.map(s => s.trim()).filter(Boolean);
  if(state.stops.length < 2){ setStatus('Bitte mindestens Start und Ziel angeben.', true); renderStops(); return; }
  renderStops();
  const radius = state.radius;
  $('go').disabled = true;
  try{
    setStatus('Orte werden gesucht …');
    const points = await Promise.all(state.stops.map(geocode));
    setStatus('Route wird berechnet …');
    const rt = await getRoute(points);
    routeLayer.clearLayers(); poiLayer.clearLayers();
    const poly = L.polyline(rt.coords, {color: '#1D4F91', weight: 5, opacity: .85}).addTo(routeLayer);
    points.forEach((p, i) => L.circleMarker(p, {radius: i === 0 || i === points.length-1 ? 8 : 6, color: '#fff', weight: 2, fillColor: '#1D4F91', fillOpacity: 1})
      .bindTooltip(state.stops[i]).addTo(routeLayer));
    map.fitBounds(poly.getBounds(), {padding: [30, 30]});

    const dense = sampleRoute(rt.coords, 300);
    let s=90, w=180, n=-90, e=-180;
    rt.coords.forEach(([la, lo]) => { s=Math.min(s,la); n=Math.max(n,la); w=Math.min(w,lo); e=Math.max(e,lo); });
    const pad = radius / 111320, padLo = radius / (111320 * Math.cos((s+n)/2 * Math.PI/180));
    state.route = {...rt, radius, points};
    state.results = [];
    const seen = new Set();
    const tiles = tilesForRoute(rt.coords, radius);
    await loadTiles(tiles, items => {
      for(const [id, lat, lon, sid, t] of items){
        if(lat < s-pad || lat > n+pad || lon < w-padLo || lon > e+padLo) continue;   // schneller Vorfilter
        const sub = state.SUB[sid]; if(!sub) continue;
        const key = (t.name || '') + sid + lat.toFixed(3) + lon.toFixed(3);
        if(seen.has(key)) continue;
        let off = Infinity, km = 0;
        for(const d of dense){ const x = hav([lat, lon], d.p); if(x < off){ off = x; km = d.c; } }
        if(off > radius) continue;
        seen.add(key);
        state.results.push({id, name: t.name || '', s: sub, m: sub.m, lat, lon, off, km, t,
          indoor: sub.place === 'in' ? true : sub.place === 'out' ? false : looksIndoor(t)});
      }
    });
    state.results.sort((a, b) => a.km - b.km);
    $('share').disabled = false;
    history.replaceState(null, '', '#' + shareParams(false).toString());
    render();
  }catch(err){ setStatus(err.message, true); }
  finally{ $('go').disabled = false; }
}
const looksIndoor = t => t.indoor === 'yes' || (t.building && t.building !== 'no') || /indoor|halle|schwarzlicht|blacklight|glow/i.test(t.name || '');

// ===================== Filter =====================
function passBase(r){
  if(!state.mains.has(r.m.id)) return false;
  if(state.named && !r.name) return false;
  if(r.off > state.maxOff) return false;
  if(state.kw && !r.name.toLowerCase().includes(state.kw)) return false;
  const picked = r.m.subs.filter(s => state.subs.has(s.id));
  return !picked.length || picked.includes(r.s);
}
const passExtras = r => EXTRAS.every(x => !state.extras.has(x.id) || x.test(r));
const named = r => !state.named || r.name;

// ===================== Anzeige =====================
const cnt = n => state.route ? ` <span class="n">${n}</span>` : '';
function renderFilters(){
  $('mains').innerHTML = state.MAIN.map(m => `<button type="button" class="chip main" data-main="${m.id}" aria-pressed="${state.mains.has(m.id)}">${m.e} ${m.label}${cnt(state.results.filter(r => r.m === m && named(r)).length)}</button>`).join('');
  const act = state.MAIN.filter(m => state.mains.has(m.id));
  $('subwrap').hidden = !act.length;
  $('subs').innerHTML = act.map(m => {
    let list = m.subs.map(s => ({s, n: state.results.filter(r => r.s === s && named(r)).length}));
    if(state.route) list = list.filter(x => x.n > 0 || state.subs.has(x.s.id)).sort((a, b) => b.n - a.n);
    const inner = list.length
      ? list.map(({s, n}) => `<button type="button" class="chip sm" data-sub="${s.id}" aria-pressed="${state.subs.has(s.id)}">${s.label}${cnt(n)}</button>`).join('')
      : '<span class="note">Keine Treffer auf dieser Strecke</span>';
    return `<div class="subgroup"><span>${m.e} ${m.label}</span><div class="chips">${inner}</div></div>`;
  }).join('');
  const base = state.results.filter(passBase);
  $('extras').innerHTML = EXTRAS.map(x => `<button type="button" class="chip sm extra" data-extra="${x.id}" aria-pressed="${state.extras.has(x.id)}">${x.label}${cnt(base.filter(x.test).length)}</button>`).join('');
}
function popupHtml(r){
  const t = r.t, web = t.website || t['contact:website'];
  const g = `https://www.google.com/maps/search/?api=1&query=${enc((r.name ? r.name + ' ' : '') + r.lat + ',' + r.lon)}`;
  return `<strong>${esc(r.name || 'Ohne Namen')}</strong><br>${r.s.e} ${esc(r.s.label)}<br>
    km ${fmtKm(r.km)} der Strecke, ${fmtKm(r.off)} km daneben
    ${t.opening_hours ? `<br>Öffnungszeiten: ${esc(t.opening_hours)}` : ''}
    <br><a href="${g}" target="_blank" rel="noopener">In Google Maps öffnen</a>${web ? ` | <a href="${esc(web)}" target="_blank" rel="noopener">Website</a>` : ''}
    <br><button type="button" class="popup-star" data-fav="${esc(r.id)}">${state.favs[r.id] ? '★ Von Merkliste entfernen' : '☆ Auf die Merkliste'}</button>`;
}
function hitHtml(r, extra=''){
  return `<li class="hit"><div class="km">${r.km != null ? fmtKm(r.km) + '<small>km</small>' : ''}</div>
    <div class="card${state.activeId === r.id ? ' on' : ''}">
      <button type="button" class="main-btn" data-go="${esc(r.id)}"><span class="e">${r.s.e}</span>
        <span><strong>${esc(r.name || 'Ohne Namen')}${state.tips.has(r.id) ? '<span class="tip">Tipp</span>' : ''}</strong>
        <small>${esc(r.s.label)}${extra}</small></span></button>
      <button type="button" class="star" data-fav="${esc(r.id)}" aria-pressed="${!!state.favs[r.id]}" aria-label="Merken">★</button>
    </div></li>`;
}
function render(){
  renderFilters();
  const items = state.results.filter(r => passBase(r) && passExtras(r));
  // Karte: Treffer + Merkliste/Tipps auf der Route immer sichtbar
  poiLayer.clearLayers(); state.markers = {};
  const onMap = new Map(items.map(r => [r.id, r]));
  state.results.forEach(r => { if(state.favs[r.id] || state.tips.has(r.id)) onMap.set(r.id, r); });
  onMap.forEach(r => {
    const fav = state.favs[r.id] || state.tips.has(r.id);
    const icon = L.divIcon({className: '', html: `<div class="pin${fav ? ' fav' : ''}">${r.s.e}</div>`, iconSize: [30, 30], iconAnchor: [15, 15]});
    state.markers[r.id] = L.marker([r.lat, r.lon], {icon, zIndexOffset: fav ? 500 : 0}).bindPopup(() => popupHtml(r)).addTo(poiLayer);
  });
  const favCount = Object.keys(state.favs).length;
  $('nhits').textContent = state.route ? `(${items.length})` : '';
  $('nfavs').textContent = favCount ? `(${favCount})` : '';
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));

  if(state.route){
    const R = state.route, h = Math.floor(R.dur/3600), mi = Math.round(R.dur%3600/60);
    setStatus(`${items.length} von ${state.results.filter(named).length} Zielen auf ${fmtKm(R.dist)} km (ca. ${h} h ${mi} min Fahrt).`);
  }
  $('list').innerHTML = state.tab === 'hits' ? renderHits(items) : renderFavs();
}
function renderHits(items){
  if(!state.route) return '<li class="empty">Start und Ziel eingeben und „Route suchen“ tippen. Filtern kannst du danach live.</li>';
  if(!items.length) return '<li class="empty">Nichts passt zu den Filtern. Extras abwählen, mehr Kategorien wählen oder den Korridor vergrößern.</li>';
  const R = state.route, out = []; let leg = 0;
  for(const r of items){
    while(leg < R.legEnds.length-1 && r.km > R.legEnds[leg]){
      out.push(`<li class="divider">● ${esc(state.stops[leg+1])} <span class="note">km ${fmtKm(R.legEnds[leg])}</span></li>`); leg++;
    }
    out.push(hitHtml(r, `, ${fmtKm(r.off)} km neben der Route${r.indoor ? ', drinnen' : ''}`));
  }
  return out.join('');
}
function renderFavs(){
  const byId = new Map(state.results.map(r => [r.id, r]));
  const tips = [...state.tips].map(id => byId.get(id)).filter(Boolean);
  const favs = Object.values(state.favs).map(f => byId.get(f.id) || {...f, s: state.SUB[f.sid] || {e: '📍', label: ''}, km: null, t: {website: f.web}, offRoute: true});
  favs.sort((a, b) => (a.km ?? 1e12) - (b.km ?? 1e12) || (b.added || 0) - (a.added || 0));
  let html = '';
  if(tips.length) html += `<li class="section-title">Tipps aus dem geteilten Link</li>` + tips.map(r => hitHtml(r, `, ${fmtKm(r.off)} km neben der Route`)).join('');
  html += `<li class="section-title">Deine Merkliste</li>`;
  html += favs.length ? favs.map(r => hitHtml(r, r.offRoute ? ', nicht auf dieser Route' : `, ${fmtKm(r.off)} km neben der Route`)).join('')
    : '<li class="empty">Noch nichts gemerkt. Tippe bei einem Treffer auf den Stern.</li>';
  return html;
}

// ===================== Teilen =====================
function shareParams(withTips){
  const p = new URLSearchParams();
  p.set('s', state.stops.join('|'));
  p.set('r', state.radius / 1000);
  p.set('m', [...state.mains].join(','));
  if(state.subs.size) p.set('u', [...state.subs].join(','));
  if(state.extras.size) p.set('x', [...state.extras].join(','));
  if(state.kw) p.set('k', state.kw);
  if(withTips){
    const onRoute = new Set(state.results.map(r => r.id));
    const ids = Object.keys(state.favs).filter(id => onRoute.has(id)).slice(0, 40);
    if(ids.length) p.set('t', ids.join(','));
  }
  return p;
}
function readHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  if(!p.get('s')) return false;
  state.stops = p.get('s').split('|');
  const r = +p.get('r'); if(r >= 2 && r <= 25){ state.radius = r * 1000; state.maxOff = state.radius; }
  if(p.has('m')) state.mains = new Set(p.get('m').split(',').filter(id => state.MAIN.some(m => m.id === id)));
  if(p.has('u')) state.subs = new Set(p.get('u').split(','));
  if(p.has('x')) state.extras = new Set(p.get('x').split(','));
  if(p.has('k')) state.kw = p.get('k');
  if(p.has('t')) state.tips = new Set(p.get('t').split(','));
  return true;
}
$('share').addEventListener('click', async () => {
  const p = shareParams(true);
  const url = location.origin + location.pathname + '#' + p.toString();
  const tipCount = p.get('t') ? p.get('t').split(',').length : 0;
  const text = `Abstecher von ${state.stops[0]} nach ${state.stops[state.stops.length-1]}` + (tipCount ? ` – mit ${tipCount} Tipp${tipCount > 1 ? 's' : ''} von mir` : '');
  try{
    if(navigator.share){ await navigator.share({title: 'Abstecher-Finder', text, url}); }
    else{ await navigator.clipboard.writeText(url); toast('Link kopiert'); }
  }catch(e){ if(e.name !== 'AbortError') toast('Teilen nicht möglich'); }
});

// ===================== Ereignisse =====================
$('f').addEventListener('submit', search);
const syncSliders = () => {
  $('rv').textContent = state.radius/1000 + ' km';
  $('maxoff').max = state.radius/1000;
  if(state.maxOff > state.radius) state.maxOff = state.radius;
  $('maxoff').value = state.maxOff/1000; $('mv').textContent = fmtKm(state.maxOff) + ' km';
};
$('radius').addEventListener('input', e => { const grow = state.maxOff === state.radius; state.radius = +e.target.value * 1000; if(grow) state.maxOff = state.radius; syncSliders(); });
$('maxoff').addEventListener('input', e => { state.maxOff = +e.target.value * 1000; $('mv').textContent = fmtKm(state.maxOff) + ' km'; render(); });
$('kw').addEventListener('input', e => { state.kw = e.target.value.trim().toLowerCase(); render(); });
$('named').addEventListener('change', e => { state.named = e.target.checked; render(); });
const toggle = (set, id) => set.has(id) ? set.delete(id) : set.add(id);
$('mains').addEventListener('click', e => { const b = e.target.closest('[data-main]'); if(b){ toggle(state.mains, b.dataset.main); render(); } });
$('subs').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if(b){ toggle(state.subs, b.dataset.sub); render(); } });
$('extras').addEventListener('click', e => {
  const b = e.target.closest('[data-extra]'); if(!b) return;
  const x = EXTRAS.find(x => x.id === b.dataset.extra);
  toggle(state.extras, x.id); if(state.extras.has(x.id) && x.excl) state.extras.delete(x.excl);
  render();
});
$('reset').addEventListener('click', () => {
  state.subs.clear(); state.extras.clear(); state.kw = ''; $('kw').value = ''; state.maxOff = state.radius; syncSliders(); render();
});
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b){ state.tab = b.dataset.tab; render(); } });
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]');
  if(f){ toggleFav(f.dataset.fav); map.closePopup(); return; }
  const g = e.target.closest('[data-go]');
  if(g){
    const id = g.dataset.go; state.activeId = id;
    document.querySelectorAll('.card.on').forEach(x => x.classList.remove('on')); g.parentElement.classList.add('on');
    const mk = state.markers[id], fav = state.favs[id];
    if(mk){ map.setView(mk.getLatLng(), 13); mk.openPopup(); }
    else if(fav){ map.setView([fav.lat, fav.lon], 13); L.popup().setLatLng([fav.lat, fav.lon]).setContent(`<strong>${esc(fav.name)}</strong>${fav.web ? `<br><a href="${esc(fav.web)}" target="_blank" rel="noopener">Website</a>` : ''}<br><button type="button" class="popup-star" data-fav="${esc(id)}">★ Von Merkliste entfernen</button>`).openOn(map); }
    if(window.innerWidth <= 760) $('map').scrollIntoView({behavior: 'smooth', block: 'center'});
  }
});

// Leaflet stoppt Klicks im Popup, daher eigener Handler für den Merken-Knopf
map.on('popupopen', e => {
  const b = e.popup.getElement()?.querySelector('[data-fav]');
  if(b) b.onclick = () => { toggleFav(b.dataset.fav); map.closePopup(); };
});

// ===================== Start =====================
(async function init(){
  try{
    const cats = await getJSON('categories.json', 'Die Kategorien');
    state.MAIN = cats.main;
    state.MAIN.forEach(m => m.subs.forEach(s => { s.m = m; state.SUB[s.id] = s; }));
    state.mains = new Set(state.MAIN.filter(m => m.on).map(m => m.id));
  }catch(e){ setStatus('App-Dateien konnten nicht geladen werden. Läuft die Seite über eine Webadresse (nicht als lokale Datei)?', true); return; }
  try{
    const r = await fetch('data/meta.json', {cache: 'no-store'});
    if(r.ok){ state.meta = await r.json(); state.tileSet = new Set(state.meta.tiles); }
  }catch(e){}
  $('databadge').textContent = state.meta
    ? `${state.meta.count.toLocaleString('de-DE')} Ziele in Deutschland, Stand ${new Date(state.meta.built).toLocaleDateString('de-DE')}`
    : 'Noch keine Daten gebaut';
  const fromLink = readHash();
  $('radius').value = state.radius/1000; $('kw').value = state.kw; syncSliders();
  renderStops(); render();
  if(fromLink){ if(state.tips.size) state.tab = 'favs'; search(); }
  if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
