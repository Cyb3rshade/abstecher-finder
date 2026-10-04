'use strict';
// ===================== Grundlagen =====================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtKm = m => (m/1000).toLocaleString('de-DE', {maximumFractionDigits: m < 10000 ? 1 : 0});
const fmtDur = s => { const m = Math.round(s/60), h = Math.floor(m/60); return h ? `${h} h${m%60 ? ' ' + (m%60) + ' min' : ''}` : `${m} min`; };
const fmtTime = d => d.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
const enc = encodeURIComponent;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function hav(a, b){
  const R=6371000, t=Math.PI/180, dLa=(b[0]-a[0])*t, dLo=(b[1]-a[1])*t;
  const x=Math.sin(dLa/2)**2 + Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function setStatus(msg, err=false){ $('status').textContent = msg; $('status').className = err ? 'err' : ''; }
function setProgress(frac){
  const p = $('progress');
  if(frac == null){ p.hidden = true; return; }
  p.hidden = false; p.firstElementChild.style.width = Math.round(frac*100) + '%';
}
let toastTimer;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.hidden=false; t.style.animation='none'; void t.offsetWidth; t.style.animation=''; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.hidden=true, 2600); }
async function getJSON(url, what, ms=20000){
  let r;
  try{ r = await fetch(url, {signal: AbortSignal.timeout(ms)}); }
  catch(e){ throw new Error(`${what} nicht erreichbar. Internetverbindung prüfen.`); }
  if(!r.ok) throw new Error(`${what} antwortet mit Fehler ${r.status}.`);
  return r.json();
}
const store = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
};

// ===================== Extras & Aufenthaltsdauer =====================
const EXTRAS = [
  {id:'in',    label:'Drinnen',          test:r=>r.indoor, excl:'out'},
  {id:'out',   label:'Draußen',          test:r=>!r.indoor, excl:'in'},
  {id:'wx',    label:'Wetterunabhängig', test:r=>r.indoor || r.t.covered==='yes'},
  {id:'dog',   label:'Hundefreundlich',  test:r=>['yes','leashed','outside'].includes(r.t.dog)},
  {id:'wheel', label:'Rollstuhlgerecht', test:r=>['yes','limited'].includes(r.t.wheelchair)},
  {id:'free',  label:'Kostenlos',        test:r=>r.t.fee==='no'},
  {id:'web',   label:'Mit Website',      test:r=>!!(r.t.website || r.t['contact:website'])},
  {id:'pic',   label:'Mit Bild & Infos', test:r=>!!(r.t.wikipedia || r.t.wikidata)},
];
const STAY = {tpark:300, zoo:180, wild:150, pet:60, bird:120, wpark:180, therme:180, lake:120, ski:120, golf:60, foot:90, bowl:90, escape:75,
  laser:60, tramp:90, kart:60, ropes:150, gym:120, skihall:180, paint:120, rodel:45, play:90, advplay:60, museum:90, tech:120, open:150,
  castle:60, abbey:45, treetop:90, tower:30, view:20, fall:30, heath:60, garden:60, icecream:20, beer:60, cafe:45, outlet:120, factory:45, farm:20, sauna:120};
const STAY_OPTS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];

// ===================== Zustand =====================
const state = {
  MAIN: [], SUB: {}, meta: null, tileSet: new Set(),
  stops: ['', ''], radius: 8000,
  mains: new Set(), subs: new Set(), extras: new Set(), kw: '', maxOff: 8000, named: true,
  route: null, results: [], byId: new Map(), tab: 'hits', favs: store.get('af-favs', {}), tips: new Set(),
  plan: store.get('af-plan', {dep: '09:00', stay: {}}),
  tour: [], tourRoute: null, tourBusy: false, pendingTour: null, baseLines: [],
  markers: {}, activeId: null, lastSurprise: null,
};

// ===================== Karte =====================
const map = L.map('map', {zoomControl: false}).setView([51.2, 10.3], 6);
L.control.zoom({position: 'topright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende'}).addTo(map);
const routeLayer = L.layerGroup().addTo(map), tourLayer = L.layerGroup().addTo(map), poiLayer = L.layerGroup().addTo(map);

function drawRoute(coords, points){
  routeLayer.clearLayers(); tourLayer.clearLayers();
  const poly = L.polyline(coords, {color: '#fff', weight: 9, opacity: .9}).addTo(routeLayer);
  const line = L.polyline(coords, {color: '#1D4F91', weight: 5, opacity: .95}).addTo(routeLayer);
  state.baseLines = [poly, line];
  points.forEach((p, i) => L.circleMarker(p, {radius: i === 0 || i === points.length-1 ? 8 : 6, color: '#fff', weight: 3, fillColor: '#1D4F91', fillOpacity: 1})
    .bindTooltip(state.stops[i]).addTo(routeLayer));
  map.fitBounds(poly.getBounds(), {padding: [40, 40], animate: false});
  if(reduceMotion) return;
  // Die eine große Bewegung: die Route zeichnet sich von Start bis Ziel
  [poly, line].forEach(pl => {
    const path = pl.getElement(); if(!path || !path.getTotalLength) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    path.animate([{strokeDashoffset: len}, {strokeDashoffset: 0}], {duration: 1300, easing: 'cubic-bezier(.4,0,.2,1)'})
      .onfinish = () => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; };
  });
}

// ===================== Merkliste =====================
function toggleFav(id, btn){
  if(state.favs[id]){ delete state.favs[id]; toast('Von der Merkliste entfernt'); }
  else{
    const r = state.byId.get(id); if(!r) return;
    state.favs[id] = {id, name: r.name, lat: r.lat, lon: r.lon, sid: r.s.id, web: r.t.website || r.t['contact:website'] || '', added: Date.now()};
    toast('Auf die Merkliste gesetzt');
  }
  store.set('af-favs', state.favs);
  render();
  if(btn && !reduceMotion){ const nb = document.querySelector(`.star[data-fav="${CSS.escape(id)}"]`); nb?.classList.add('pop'); }
  if($('sheet').classList.contains('open') && state.activeId === id) renderDetailActions(id);
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
let suggestTimer, suggestCtl;
function suggest(q){
  clearTimeout(suggestTimer);
  if(q.trim().length < 3) return;
  suggestTimer = setTimeout(async () => {
    suggestCtl?.abort(); suggestCtl = new AbortController();
    try{
      const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=de&bbox=-5.5,41.3,24.5,58.0&q=${enc(q)}`, {signal: suggestCtl.signal});
      const j = await r.json();
      const labels = [...new Set(j.features.map(f => [f.properties.name, f.properties.city || f.properties.county, f.properties.state]
        .filter((x, i, a) => x && a.indexOf(x) === i).join(', ')))];
      $('places').innerHTML = labels.map(l => `<option value="${esc(l)}">`).join('');
    }catch(e){}
  }, 300);
}

// ===================== Route & Daten =====================
async function geocode(q){
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(m) return [+m[1], +m[2]];
  const j = await getJSON(`https://photon.komoot.io/api/?limit=1&lang=de&q=${enc(q)}`, 'Die Ortssuche');
  const f = j.features?.[0];
  if(!f) throw new Error(`„${q}“ nicht gefunden. Ort genauer angeben, z. B. mit Landkreis.`);
  const [lo, la] = f.geometry.coordinates; return [la, lo];
}
async function osrm(points){
  const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${points.map(p => p[1].toFixed(5)+','+p[0].toFixed(5)).join(';')}?overview=full&geometries=geojson`, 'Die Routenberechnung', 30000);
  if(!j.routes?.length) throw new Error('Keine Route zwischen den Punkten gefunden.');
  return j.routes[0];
}
async function getRoute(points){
  const rt = await osrm(points);
  let c = 0; const legEnds = rt.legs.map(l => c += l.distance);
  return {coords: rt.geometry.coordinates.map(([lo, la]) => [la, lo]), dist: rt.distance, dur: rt.duration, legEnds, legDur: rt.legs.map(l => l.duration)};
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
      setProgress(++done / ids.length);
    }
  };
  await Promise.all(Array.from({length: 6}, worker));
}
const looksIndoor = t => t.indoor === 'yes' || (t.building && t.building !== 'no') || /indoor|halle|schwarzlicht|blacklight|glow/i.test(t.name || '');

async function search(ev){
  ev?.preventDefault();
  if(!state.meta){ setStatus('Es sind noch keine Daten gebaut. Siehe Anleitung (README).', true); return; }
  state.stops = state.stops.map(s => s.trim()).filter(Boolean);
  if(state.stops.length < 2){ setStatus('Bitte mindestens Start und Ziel angeben.', true); renderStops(); return; }
  renderStops();
  const radius = state.radius;
  $('go').disabled = true; closeDetail();
  try{
    setStatus('Orte werden gesucht …');
    const points = await Promise.all(state.stops.map(geocode));
    setStatus('Route wird berechnet …');
    const rt = await getRoute(points);
    poiLayer.clearLayers();
    drawRoute(rt.coords, points);
    setStatus('Abstecher werden geladen …'); setProgress(0);

    const dense = sampleRoute(rt.coords, 300);
    let s=90, w=180, n=-90, e=-180;
    rt.coords.forEach(([la, lo]) => { s=Math.min(s,la); n=Math.max(n,la); w=Math.min(w,lo); e=Math.max(e,lo); });
    const pad = radius / 111320, padLo = radius / (111320 * Math.cos((s+n)/2 * Math.PI/180));
    state.route = {...rt, radius, points};
    state.results = [];
    const seen = new Set();
    await loadTiles(tilesForRoute(rt.coords, radius), items => {
      for(const [id, lat, lon, sid, t] of items){
        if(lat < s-pad || lat > n+pad || lon < w-padLo || lon > e+padLo) continue;
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
    state.byId = new Map(state.results.map(r => [r.id, r]));
    state.tour = (state.pendingTour || []).filter(id => state.byId.has(id)); state.pendingTour = null;
    state.tourRoute = null;
    $('share').disabled = false;
    await updateTour(false);
    history.replaceState(null, '', '#' + shareParams(false).toString());
    render(true);
  }catch(err){ setStatus(err.message, true); }
  finally{ $('go').disabled = false; setProgress(null); }
}

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
const visible = () => state.results.filter(r => passBase(r) && passExtras(r));

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
function renderMarkers(items, animate){
  poiLayer.clearLayers(); state.markers = {};
  const onMap = new Map(items.map(r => [r.id, r]));
  state.results.forEach(r => { if(state.favs[r.id] || state.tips.has(r.id)) onMap.set(r.id, r); });
  const total = state.route?.dist || 1;
  onMap.forEach(r => {
    const fav = state.favs[r.id] || state.tips.has(r.id);
    // Pins erscheinen nach der Route, in Fahrtrichtung gestaffelt
    const delay = animate && !reduceMotion ? Math.round(900 + r.km / total * 700) : 0;
    const cls = `pin${fav ? ' fav' : ''}${r.id === state.activeId ? ' on' : ''}${animate ? ' enter' : ''}`;
    const icon = L.divIcon({className: '', html: `<div class="${cls}" style="--d:${delay}ms">${r.s.e}</div>`, iconSize: [32, 32], iconAnchor: [16, 16]});
    state.markers[r.id] = L.marker([r.lat, r.lon], {icon, zIndexOffset: fav ? 500 : 0, keyboard: true, title: r.name || r.s.label})
      .bindTooltip(esc(r.name || r.s.label), {direction: 'top', offset: [0, -16]})
      .on('click', () => openDetail(r.id))
      .addTo(poiLayer);
  });
}
function cardHtml(r, meta){
  return `<div class="card${state.activeId === r.id ? ' on' : ''}">
      <button type="button" class="open" data-open="${esc(r.id)}"><span class="tile" aria-hidden="true">${r.s.e}</span>
        <span style="min-width:0"><strong>${esc(r.name || 'Ohne Namen')}${state.tips.has(r.id) ? '<span class="tip">Tipp</span>' : ''}</strong>
        <small>${esc(r.s.label)}${meta}</small></span></button>
      ${r.offRoute ? '' : `<button type="button" class="add" data-tour="${esc(r.id)}" aria-pressed="${state.tour.includes(r.id)}" aria-label="${state.tour.includes(r.id) ? 'Aus der Route entfernen' : 'Als Zwischenstopp zur Route hinzufügen'}">${state.tour.includes(r.id) ? '✓' : '+'}</button>`}
      <button type="button" class="star" data-fav="${esc(r.id)}" aria-pressed="${!!state.favs[r.id]}" aria-label="${state.favs[r.id] ? 'Nicht mehr merken' : 'Merken'}">★</button>
    </div>`;
}
const hitHtml = (r, meta) => `<li class="hit"><span class="km">${r.km != null ? fmtKm(r.km) + '<small>km</small>' : ''}</span><span class="pip" aria-hidden="true"></span>${cardHtml(r, meta)}</li>`;
function render(animate=false){
  renderFilters();
  const items = visible();
  renderMarkers(items, animate);
  const favCount = Object.keys(state.favs).length;
  $('nhits').textContent = state.route ? `(${items.length})` : '';
  $('nfavs').textContent = favCount ? `(${favCount})` : '';
  const tabs = ['hits', 'favs', 'plan'];
  $('tabs').style.setProperty('--i', tabs.indexOf(state.tab));
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  if(state.route){
    const R = state.route;
    const T = state.tourRoute, extra = T && state.tour.length ? ` Mit ${state.tour.length} Abstecher${state.tour.length > 1 ? 'n' : ''}: ${fmtDur(T.dur)} Fahrt (+${fmtDur(Math.max(0, T.dur - R.dur))}).` : '';
    setStatus(`${items.length} von ${state.results.filter(named).length} Zielen auf ${fmtKm(R.dist)} km, ca. ${fmtDur(R.dur)} reine Fahrt.${extra}`);
  }
  $('ntour').textContent = state.tour.length ? `(${state.tour.length})` : '';
  $('pane').innerHTML = state.tab === 'hits' ? renderHits(items) : state.tab === 'favs' ? renderFavs() : renderPlan();
}
function renderHits(items){
  if(!state.route) return '<p class="empty">Start und Ziel eingeben und „Route suchen“ tippen. Filtern kannst du danach live.</p>';
  if(!items.length) return '<p class="empty">Nichts passt zu den Filtern. Extras abwählen, mehr Kategorien wählen oder den Korridor vergrößern.</p>';
  const R = state.route, out = []; let leg = 0;
  for(const r of items){
    while(leg < R.legEnds.length-1 && r.km > R.legEnds[leg]){
      out.push(`<li class="stopmark"><span class="km">${fmtKm(R.legEnds[leg])}</span><span class="pip" aria-hidden="true"></span><b>${esc(state.stops[leg+1])}</b></li>`); leg++;
    }
    out.push(hitHtml(r, `, ${fmtKm(r.off)} km neben der Route${r.indoor ? ', drinnen' : ''}`));
  }
  return `<ol class="road">${out.join('')}</ol>`;
}
function favEntries(){
  return Object.values(state.favs).map(f => state.byId.get(f.id) || {...f, s: state.SUB[f.sid] || {e: '📍', label: ''}, km: null, t: {website: f.web}, offRoute: true});
}
function renderFavs(){
  const tips = [...state.tips].map(id => state.byId.get(id)).filter(Boolean);
  const favs = favEntries().sort((a, b) => (a.km ?? 1e12) - (b.km ?? 1e12) || (b.added || 0) - (a.added || 0));
  let html = '';
  if(tips.length) html += `<h3 class="section-title">Tipps aus dem geteilten Link</h3><ol class="road">${tips.map(r => hitHtml(r, `, ${fmtKm(r.off)} km neben der Route`)).join('')}</ol>`;
  html += `<h3 class="section-title">Deine Merkliste</h3>`;
  html += favs.length ? `<ol class="road">${favs.map(r => hitHtml(r, r.offRoute ? ', nicht auf dieser Route' : `, ${fmtKm(r.off)} km neben der Route`)).join('')}</ol>`
    : '<p class="empty">Noch nichts gemerkt. Tippe bei einem Ziel auf den Stern, dann landet es hier und im Tagesplan.</p>';
  return html;
}

// ===================== Detailansicht =====================
const WMO = c => c === 0 ? ['☀️','Sonnig'] : c <= 2 ? ['🌤️','Heiter'] : c === 3 ? ['☁️','Bewölkt'] : c <= 48 ? ['🌫️','Nebel'] : c <= 57 ? ['🌦️','Niesel']
  : c <= 67 ? ['🌧️','Regen'] : c <= 77 ? ['🌨️','Schnee'] : c <= 82 ? ['🌦️','Schauer'] : c <= 86 ? ['🌨️','Schneeschauer'] : ['⛈️','Gewitter'];
const infoCache = new Map();
async function wikiInfo(t){
  const key = t.wikipedia || t.wikidata; if(!key) return null;
  if(infoCache.has(key)) return infoCache.get(key);
  const p = (async () => {
    let lang = 'de', title = null, img = null;
    if(t.wikipedia){ const i = t.wikipedia.indexOf(':'); if(i > 0 && i < 4){ lang = t.wikipedia.slice(0, i); title = t.wikipedia.slice(i+1); } else title = t.wikipedia; }
    if(t.wikidata && /^Q\d+$/.test(t.wikidata)){
      try{
        const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${t.wikidata}&props=sitelinks|claims&sitefilter=dewiki|enwiki&format=json&origin=*`, 'Wikidata');
        const e = j.entities?.[t.wikidata];
        // Deutsche Beschreibung bevorzugen, auch wenn der Ort im Ausland liegt
        const de = e?.sitelinks?.dewiki, en = e?.sitelinks?.enwiki;
        if(de){ title = de.title; lang = 'de'; }
        else if(!title && en){ title = en.title; lang = 'en'; }
        const file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if(file) img = `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(file)}?width=760`;
      }catch(e){}
    }
    let extract = null, url = null;
    if(title){
      try{
        const s = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}`, 'Wikipedia');
        extract = s.extract || null; url = s.content_urls?.desktop?.page || null;
        if(!img && s.thumbnail?.source) img = s.thumbnail.source.replace(/\/\d+px-/, '/760px-');
      }catch(e){}
    }
    return {img, extract, url};
  })();
  infoCache.set(key, p); return p;
}
async function weather(lat, lon){
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FBerlin&forecast_days=3`, 'Wetter', 10000);
  return j.daily.time.map((d, i) => ({d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i]}));
}
const gmapsDest = r => `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}&travelmode=driving`;
function renderDetailActions(id){
  const box = $('d-actions'); if(!box) return;
  const r = state.byId.get(id) || favEntries().find(f => f.id === id); if(!r) return;
  const inTour = state.tour.includes(id);
  box.innerHTML = `${r.offRoute ? '' : `<button type="button" class="btn ${inTour ? 'primary' : ''}" data-tour="${esc(id)}">${inTour ? '✓ In der Route' : '+ Zur Route'}</button>`}
    <button type="button" class="btn ${state.favs[id] ? 'brown' : ''}" data-fav="${esc(id)}">${state.favs[id] ? '★ Gemerkt' : '☆ Merken'}</button>
    <a class="btn wide" href="${gmapsDest(r)}" target="_blank" rel="noopener">Nur hierhin navigieren</a>`;
}
let detailSeq = 0;
async function openDetail(id){
  const r = state.byId.get(id) || favEntries().find(f => f.id === id); if(!r) return;
  const seq = ++detailSeq;
  state.activeId = id;
  document.querySelectorAll('.card.on').forEach(x => x.classList.remove('on'));
  document.querySelector(`.open[data-open="${CSS.escape(id)}"]`)?.parentElement.classList.add('on');
  document.querySelectorAll('.pin.on').forEach(x => x.classList.remove('on'));
  state.markers[id]?.getElement()?.querySelector('.pin')?.classList.add('on');
  const t = r.t || {}, web = t.website || t['contact:website'];
  const facts = [
    t.opening_hours && ['Öffnungszeiten', esc(t.opening_hours)],
    t.fee && ['Eintritt', t.fee === 'no' ? 'kostenlos' : t.fee === 'yes' ? 'kostenpflichtig' : esc(t.fee)],
    t.wheelchair && ['Rollstuhl', {yes: 'geeignet', limited: 'eingeschränkt', no: 'nicht geeignet'}[t.wheelchair] || esc(t.wheelchair)],
    t.dog && ['Hunde', {yes: 'erlaubt', leashed: 'an der Leine', no: 'nicht erlaubt', outside: 'nur draußen'}[t.dog] || esc(t.dog)],
    web && ['Website', `<a href="${esc(web)}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`],
  ].filter(Boolean);
  $('d-body').innerHTML = `
    <div class="hero" id="d-hero">${r.s.e}</div>
    <div class="d-main">
      <div>
        <span class="badge">${r.s.e} ${esc(r.s.label)}</span>
        <h2 id="d-title" style="margin-top:8px">${esc(r.name || 'Ohne Namen')}</h2>
        <p class="meta">${r.km != null ? `Bei km ${fmtKm(r.km)} deiner Strecke, ${fmtKm(r.off)} km daneben` : 'Nicht auf der aktuellen Route'}${r.indoor ? ', drinnen' : ''}</p>
      </div>
      <div class="d-actions" id="d-actions"></div>
      <div class="d-section" id="d-desc" ${t.wikipedia || t.wikidata ? '' : 'hidden'}><h3>Über diesen Ort</h3><div class="shimmer" style="height:64px"></div></div>
      <div class="d-section"><h3>Wetter vor Ort</h3><div class="wx" id="d-wx"><div class="shimmer" style="height:78px"></div><div class="shimmer" style="height:78px"></div><div class="shimmer" style="height:78px"></div></div></div>
      ${facts.length ? `<div class="d-section"><h3>Infos</h3><dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>` : ''}
    </div>`;
  renderDetailActions(id);
  showSheet();
  if(state.markers[id]) map.panTo(state.markers[id].getLatLng(), {animate: !reduceMotion});

  weather(r.lat, r.lon).then(days => {
    if(seq !== detailSeq) return;
    const names = ['Heute', 'Morgen', 'Übermorgen'];
    $('d-wx').innerHTML = days.map((d, i) => { const [ico, txt] = WMO(d.code);
      return `<div><span class="ico" aria-hidden="true">${ico}</span><b>${Math.round(d.max)}° / ${Math.round(d.min)}°</b>${names[i]}<br><span class="note">${txt}, ${d.rain ?? 0} % Regen</span></div>`; }).join('');
  }).catch(() => { if(seq === detailSeq) $('d-wx').innerHTML = '<p class="note">Wetter gerade nicht verfügbar.</p>'; });

  const info = await wikiInfo(t);
  if(seq !== detailSeq) return;
  if(info?.img){
    const img = new Image(); img.alt = ''; img.src = info.img;
    img.onload = () => { img.classList.add('loaded'); };
    $('d-hero').appendChild(img);
    $('d-hero').insertAdjacentHTML('beforeend', '<span class="credit">Bild: Wikimedia Commons</span>');
  }
  const desc = $('d-desc');
  if(info?.extract){ desc.innerHTML = `<h3>Über diesen Ort</h3><p>${esc(info.extract)}</p>${info.url ? `<p style="margin-top:6px"><a class="link" href="${esc(info.url)}" target="_blank" rel="noopener">Weiterlesen auf Wikipedia</a></p>` : ''}`; }
  else desc.hidden = true;
}
function showSheet(){
  const s = $('sheet'), b = $('backdrop');
  s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); s.scrollTop = 0;
  if(innerWidth <= 760){ b.hidden = false; requestAnimationFrame(() => b.classList.add('show')); }
  $('d-close').focus({preventScroll: true});
}
function closeDetail(){
  const s = $('sheet'), b = $('backdrop');
  if(!s.classList.contains('open')) return;
  s.classList.remove('open'); s.setAttribute('aria-hidden', 'true');
  b.classList.remove('show'); setTimeout(() => b.hidden = true, 300);
  document.querySelectorAll('.pin.on').forEach(x => x.classList.remove('on'));
}
$('d-close').addEventListener('click', closeDetail);
$('backdrop').addEventListener('click', closeDetail);
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDetail(); });

// ===================== Überrasch mich =====================
$('surprise').addEventListener('click', () => {
  const die = $('surprise').querySelector('.die');
  die.classList.remove('roll'); void die.offsetWidth; die.classList.add('roll');
  const items = visible().filter(r => r.name);
  if(!state.route){ toast('Erst eine Route suchen, dann würfeln'); return; }
  if(!items.length){ toast('Keine Ziele mit den aktuellen Filtern'); return; }
  let pick; do{ pick = items[Math.floor(Math.random() * items.length)]; }while(items.length > 1 && pick.id === state.lastSurprise);
  state.lastSurprise = pick.id;
  setTimeout(() => {
    map.flyTo([pick.lat, pick.lon], 12, {duration: reduceMotion ? 0 : 1});
    openDetail(pick.id);
  }, reduceMotion ? 0 : 450);
});

// ===================== Tour: Route mit Abstechern =====================
const stayOf = r => state.plan.stay[r.id] ?? STAY[r.s.id] ?? 60;
const tourItems = () => state.tour.map(id => state.byId.get(id)).filter(Boolean).sort((a, b) => a.km - b.km);
function savePlan(){ store.set('af-plan', state.plan); }
function tourWaypoints(){
  const R = state.route, stopKm = [0, ...R.legEnds.slice(0, -1), R.dist];
  // Eigene Stopps + Abstecher, nach Streckenkilometer sortiert (Start bleibt vorn, Ziel hinten)
  return [...R.points.map((p, i) => ({kind: 'stop', p, km: i === 0 ? -1 : i === R.points.length-1 ? Infinity : stopKm[i], label: state.stops[i]})),
          ...tourItems().map(r => ({kind: 'place', p: [r.lat, r.lon], km: r.km, label: r.name || r.s.label, r}))].sort((a, b) => a.km - b.km);
}
function toggleTour(id){
  const i = state.tour.indexOf(id);
  if(i >= 0){ state.tour.splice(i, 1); toast('Aus der Route entfernt'); }
  else{ state.tour.push(id); toast('Als Zwischenstopp hinzugefügt'); }
  history.replaceState(null, '', '#' + shareParams(false).toString());
  render(); updateTour();
  if($('sheet').classList.contains('open') && state.activeId === id) renderDetailActions(id);
}
let tourSeq = 0;
async function updateTour(rerender = true){
  const R = state.route; if(!R) return;
  const seq = ++tourSeq, wps = tourWaypoints();
  if(!state.tour.length){
    state.tourRoute = {coords: R.coords, legs: R.legDur, dur: R.dur, dist: R.dist, wps};
    drawTour();
    if(rerender) render();
    return;
  }
  state.tourBusy = true; if(rerender && state.tab === 'plan') render();
  try{
    const rt = await osrm(wps.map(w => w.p));
    if(seq !== tourSeq) return;
    state.tourRoute = {coords: rt.geometry.coordinates.map(([lo, la]) => [la, lo]), legs: rt.legs.map(l => l.duration), dur: rt.duration, dist: rt.distance, wps};
  }catch(e){ if(seq === tourSeq) toast(e.message); }
  finally{ if(seq === tourSeq){ state.tourBusy = false; drawTour(); if(rerender) render(); } }
}
function drawTour(){
  tourLayer.clearLayers();
  const has = state.tour.length && state.tourRoute;
  // Ursprüngliche Route tritt zurück, sobald Abstecher drin sind
  state.baseLines[1]?.setStyle(has ? {color: '#8C98A8', weight: 4, opacity: .7, dashArray: '6 8'} : {color: '#1D4F91', weight: 5, opacity: .95, dashArray: null});
  state.baseLines[0]?.setStyle({opacity: has ? 0 : .9});
  if(!has) return;
  L.polyline(state.tourRoute.coords, {color: '#fff', weight: 9, opacity: .9}).addTo(tourLayer);
  L.polyline(state.tourRoute.coords, {color: '#1D4F91', weight: 5, opacity: .95}).addTo(tourLayer);
}
function renderPlan(){
  if(!state.route) return '<p class="empty">Zuerst eine Route suchen. Danach fügst du Abstecher mit „+“ hinzu und planst hier deinen Tag.</p>';
  const T = state.tourRoute;
  const head = `<div class="plan-head"><label class="f">Abfahrt<input type="time" id="dep" value="${esc(state.plan.dep)}"></label>
    <span class="note" style="padding-bottom:9px">${state.tour.length ? `${state.tour.length} Abstecher in der Route` : 'Noch keine Abstecher'}</span></div>`;
  if(state.tourBusy || !T) return head + '<div class="shimmer" style="height:60px;margin-bottom:10px"></div><div class="shimmer" style="height:180px"></div>';
  const [hh, mm] = (state.plan.dep || '09:00').split(':').map(Number);
  let t = new Date(); t.setHours(hh, mm, 0, 0);
  let drive = 0, stay = 0; const rows = [];
  T.wps.forEach((w, i) => {
    if(i > 0){ const d = T.legs[i-1] || 0; drive += d; t = new Date(t.getTime() + d*1000); rows.push(`<li class="drive">🚗 ${fmtDur(d)} Fahrt</li>`); }
    if(w.kind === 'stop'){
      const cls = i === 0 ? 'start' : i === T.wps.length-1 ? 'end' : '';
      rows.push(`<li class="tl ${cls}"><time>${fmtTime(t)}</time><span class="pip" aria-hidden="true"></span><div class="tl-body"><strong>${esc(w.label)}</strong><small>${i === 0 ? 'Abfahrt' : i === T.wps.length-1 ? 'Ankunft am Ziel' : 'Zwischenstopp'}</small></div></li>`);
    }else{
      const r = w.r, st = stayOf(r);
      rows.push(`<li class="tl place"><time>${fmtTime(t)}</time><span class="pip" aria-hidden="true"></span><div class="tl-body">
        <div class="tl-row"><span class="tile" style="width:30px;height:30px;font-size:1rem" aria-hidden="true">${r.s.e}</span><button type="button" class="link" data-open="${esc(r.id)}" style="text-decoration:none;color:inherit;font-weight:600">${esc(r.name || r.s.label)}</button></div>
        <div class="tl-row"><small>Aufenthalt</small><select data-stay="${esc(r.id)}" aria-label="Aufenthalt bei ${esc(r.name)}">${STAY_OPTS.map(o => `<option value="${o}"${o === st ? ' selected' : ''}>${fmtDur(o*60)}</option>`).join('')}</select>
        <button type="button" class="link" data-tour="${esc(r.id)}">Entfernen</button></div>
        ${r.t.opening_hours ? `<small>Geöffnet: ${esc(r.t.opening_hours)}</small>` : ''}
      </div></li>`);
      stay += st*60; t = new Date(t.getTime() + st*60000);
    }
  });
  const links = gmapsLinks(T.wps);
  const extra = Math.max(0, T.dur - state.route.dur);
  return head + `<p class="plan-sum">Ankunft am Ziel um <b>${fmtTime(t)}</b> Uhr. Unterwegs ${fmtDur(drive + stay)}, davon ${fmtDur(drive)} Fahrt${state.tour.length ? ` (+${fmtDur(extra)} für Umwege)` : ''} und ${fmtDur(stay)} vor Ort.</p>
    <ol class="timeline">${rows.join('')}</ol>
    <h3 class="section-title">Route exportieren</h3>
    <div class="btn-row" style="margin-top:0">
      ${links.length === 1 ? `<a class="btn primary" href="${links[0]}" target="_blank" rel="noopener">In Google Maps öffnen</a>`
        : links.map((l, i) => `<a class="btn primary" href="${l}" target="_blank" rel="noopener">Google Maps, Teil ${i+1}</a>`).join('')}
      <button type="button" class="btn" id="gpx">GPX-Datei laden</button>
    </div>
    <p class="note">${links.length > 1 ? 'Google Maps nimmt höchstens 9 Zwischenziele pro Link, deshalb ist die Tour aufgeteilt. Teil 2 beginnt dort, wo Teil 1 endet. ' : ''}Die GPX-Datei funktioniert mit OsmAnd, Komoot, Garmin und den meisten anderen Navi-Apps.</p>`;
}
const pt = w => `${w.p[0].toFixed(5)},${w.p[1].toFixed(5)}`;
function gmapsLinks(wps){
  const links = [];
  for(let i = 0; i < wps.length - 1; i += 10){
    const part = wps.slice(i, Math.min(i + 11, wps.length));
    const mid = part.slice(1, -1).map(pt).join('|');
    links.push(`https://www.google.com/maps/dir/?api=1&origin=${pt(part[0])}&destination=${pt(part[part.length-1])}${mid ? '&waypoints=' + enc(mid) : ''}&travelmode=driving`);
  }
  return links;
}
function downloadGpx(){
  const T = state.tourRoute; if(!T) return;
  const x = s => esc(s).replace(/&#39;/g, '&apos;');
  const name = `${state.stops[0]} nach ${state.stops[state.stops.length-1]}`;
  const wpts = T.wps.map(w => `<wpt lat="${w.p[0]}" lon="${w.p[1]}"><name>${x(w.label)}</name></wpt>`).join('\n');
  const rte = T.wps.map(w => `<rtept lat="${w.p[0]}" lon="${w.p[1]}"><name>${x(w.label)}</name></rtept>`).join('\n');
  const step = Math.max(1, Math.floor(T.coords.length / 4000));
  const trk = T.coords.filter((_, i) => i % step === 0 || i === T.coords.length-1).map(([la, lo]) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"/>`).join('');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Abstecher-Finder" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${x(name)}</name></metadata>
${wpts}
<rte><name>${x(name)}</name>
${rte}
</rte>
<trk><name>${x(name)}</name><trkseg>${trk}</trkseg></trk>
</gpx>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], {type: 'application/gpx+xml'}));
  a.download = 'abstecher-tour.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('GPX-Datei gespeichert');
}
$('pane').addEventListener('change', e => {
  if(e.target.id === 'dep'){ state.plan.dep = e.target.value || '09:00'; savePlan(); render(); }
  const st = e.target.dataset.stay; if(st){ state.plan.stay[st] = +e.target.value; savePlan(); render(); }
});

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
    const ids = Object.keys(state.favs).filter(id => state.byId.has(id)).slice(0, 40);
    if(ids.length) p.set('t', ids.join(','));
  }
  if(state.tour.length) p.set('w', state.tour.join(','));
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
  if(p.has('w')) state.pendingTour = p.get('w').split(',');
  return true;
}
$('share').addEventListener('click', async () => {
  const p = shareParams(true);
  const url = location.origin + location.pathname + '#' + p.toString();
  const tipCount = p.get('t') ? p.get('t').split(',').length : 0;
  const text = `Abstecher von ${state.stops[0]} nach ${state.stops[state.stops.length-1]}` + (state.tour.length ? `, Tour mit ${state.tour.length} Abstecher${state.tour.length > 1 ? 'n' : ''}` : tipCount ? `, mit ${tipCount} Tipp${tipCount > 1 ? 's' : ''} von mir` : '');
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
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b){ state.tab = b.dataset.tab; render(); } });
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]'); if(f){ toggleFav(f.dataset.fav, f); return; }
  const o = e.target.closest('[data-open]');
  if(o){ openDetail(o.dataset.open); return; }
  const tr = e.target.closest('[data-tour]'); if(tr){ toggleTour(tr.dataset.tour); return; }
  if(e.target.closest('#gpx')) downloadGpx();
});

// ===================== Start =====================
(async function init(){
  try{
    const r = await fetch('data/meta.json', {cache: 'no-store'});
    if(r.ok){ state.meta = await r.json(); state.tileSet = new Set(state.meta.tiles); }
  }catch(e){}
  try{
    const r = await fetch('categories.json?v=' + enc(state.meta?.built || Date.now()), {cache: 'no-store'});
    if(!r.ok) throw new Error();
    const cats = await r.json();
    state.MAIN = cats.main;
    state.MAIN.forEach(m => m.subs.forEach(s => { s.m = m; state.SUB[s.id] = s; }));
    state.mains = new Set(state.MAIN.filter(m => m.on).map(m => m.id));
  }catch(e){ setStatus('App-Dateien konnten nicht geladen werden. Läuft die Seite über eine Webadresse (nicht als lokale Datei)?', true); return; }
  $('databadge').textContent = state.meta
    ? `${state.meta.count.toLocaleString('de-DE')} Ziele in Deutschland und den Nachbarländern, Stand ${new Date(state.meta.built).toLocaleDateString('de-DE')}`
    : 'Noch keine Daten gebaut';
  const fromLink = readHash();
  $('radius').value = state.radius/1000; $('kw').value = state.kw; syncSliders();
  renderStops(); render();
  if(fromLink){ if(state.pendingTour?.length) state.tab = 'plan'; else if(state.tips.size) state.tab = 'favs'; search(); }
  if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
