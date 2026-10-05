'use strict';
// ===================== Grundlagen =====================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc = encodeURIComponent;
const fmtKm = m => (m/1000).toLocaleString('de-DE', {maximumFractionDigits: m < 10000 ? 1 : 0});
const fmtDur = s => { const m = Math.max(1, Math.round(s/60)), h = Math.floor(m/60); return h ? `${h} h${m%60 ? ' ' + (m%60) + ' min' : ''}` : `${m} min`; };
const fmtTime = d => d.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover)').matches;
const isNarrow = () => innerWidth < 760;
function hav(a, b){
  const R=6371000, t=Math.PI/180, dLa=(b[0]-a[0])*t, dLo=(b[1]-a[1])*t;
  const x=Math.sin(dLa/2)**2 + Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
// Grobe Schätzung des Umwegs: hin und zurück, Straßenfaktor 1,3, im Schnitt 55 km/h
const detourMin = off => Math.max(2, Math.round(off/1000 * 2 * 1.3 / 55 * 60));
const store = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
};
async function getJSON(url, what, ms=20000){
  let r;
  try{ r = await fetch(url, {signal: AbortSignal.timeout(ms)}); }
  catch(e){ throw new Error(`${what} nicht erreichbar. Internetverbindung prüfen.`); }
  if(!r.ok) throw new Error(`${what} antwortet mit Fehler ${r.status}.`);
  return r.json();
}
let toastTimer;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.hidden=false; t.style.animation='none'; void t.offsetWidth; t.style.animation=''; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.hidden=true, 2600); }
function setProgress(f){ const p=$('progress'); if(f == null){ p.hidden=true; return; } p.hidden=false; p.firstElementChild.style.width=Math.round(f*100)+'%'; }

// ===================== Symbole =====================
const ICONS = {
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>', share:'<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>', filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5L19.8 7"/><circle cx="12" cy="12" r="7"/>',
  dice:'<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', check:'<path d="M5 12l5 5 9-10"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>', nav:'<path d="M3 11l18-8-8 18-2-8z"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5M5 20h14"/>', locate:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', auto:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', web:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
  euro:'<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10h9M4 14h9"/>', wheelchair:'<circle cx="12" cy="4.5" r="1.5"/><path d="M11 8v6h5l2 5M11 11h5M8.5 10.5A5 5 0 1 0 15 18"/>', dog:'<path d="M5 10l2-5 3 3h4l3-3 2 5v4a7 7 0 0 1-14 0z"/><circle cx="10" cy="12" r=".8" fill="currentColor"/><circle cx="14" cy="12" r=".8" fill="currentColor"/>',
  sunny:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  cloud:'<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
  rain:'<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/>',
  snow:'<path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M9 18h.01M13 19h.01M17 18h.01"/>',
  storm:'<path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M12 15l-2 4h3l-2 4"/>', fog:'<path d="M4 10h16M4 14h16M6 18h12M8 6h8"/>',
  // Kategorien
  wheel:'<circle cx="12" cy="11" r="7"/><path d="M12 4v14M5 11h14M7 6l10 10M17 6L7 16M8 22l4-4 4 4"/>',
  spa:'<path d="M12 20c-4-2-6-5-6-9 2 0 4 1 6 3 2-2 4-3 6-3 0 4-2 7-6 9z"/><path d="M12 14V6"/>',
  wave:'<path d="M3 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2M3 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2M12 3v7M9 6l3-3 3 3"/>',
  paw:'<circle cx="7" cy="10" r="1.8"/><circle cx="17" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2.5-4 2.5s-4-.5-4-2.5z"/>',
  tree:'<path d="M12 3l6 10H6z"/><path d="M12 13v8"/>', museum:'<path d="M3 20h18M5 17v-7M9.5 17v-7M14.5 17v-7M19 17v-7M3 10l9-6 9 6z"/>',
  cup:'<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/>',
  utensils:'<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1.5-3 4-3 7h3v11"/>', menu:'<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>', phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', bag:'<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  back:'<path d="M15 5l-7 7 7 7"/>', chev:'<path d="M9 5l7 7-7 7"/>', install:'<path d="M12 3v12M7 10l5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1"/>',
  pin:'<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
};
// Alle Symbole einmal als <symbol> ins Dokument, danach nur noch per <use> referenzieren (spart tausende DOM-Knoten)
(() => { const sp = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sp.setAttribute('aria-hidden', 'true'); sp.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  sp.innerHTML = Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join(''); document.body.prepend(sp); })();
const icon = (n, s=20, w=1.9) => `<svg class="i" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${ICONS[n] ? n : 'pin'}"/></svg>`;
const MAIN_ICON = {action:'wheel', fun:'dice', wellness:'spa', water:'wave', animals:'paw', nature:'tree', culture:'museum', food:'utensils', shopping:'bag'};
const catIcon = m => MAIN_ICON[m?.id] || 'pin';
const tileHtml = (m, size=42, is=22) => `<span class="tile" style="width:${size}px;height:${size}px;background:var(--c-${m.id},#777);color:var(--o-${m.id},#fff)">${icon(catIcon(m), is, 1.8)}</span>`;
function paintIcons(root=document){ root.querySelectorAll('[data-icon]').forEach(el => { if(!el.dataset.painted){ el.innerHTML = icon(el.dataset.icon); el.dataset.painted = 1; } }); }

// ===================== Einstellungen & Theme =====================
const settings = Object.assign({theme: 'auto', stay: false, radius: 8, named: true}, store.get('af-settings', {}));
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const t = settings.theme === 'auto' ? (darkMq.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.dataset.theme = t;
  $('themeColor').setAttribute('content', t === 'dark' ? '#000000' : '#F4F4F4');
  if(state.route){ drawRoute(false); if(state.results.length) render(); }
}
darkMq.addEventListener?.('change', () => settings.theme === 'auto' && applyTheme());
const saveSettings = () => store.set('af-settings', settings);
const cssCache = new Map();
const cssVar = n => { const t = document.documentElement.dataset.theme + n; if(!cssCache.has(t)) cssCache.set(t, getComputedStyle(document.documentElement).getPropertyValue(n).trim()); return cssCache.get(t); };

// ===================== Zusatzfilter =====================
// cats: für welche Oberkategorien ein Extra gilt (fehlt = alle). Andere Kategorien bleiben davon unberührt.
const LEISURE = ['action', 'fun', 'wellness', 'water', 'animals', 'culture'];
const EXTRAS = [
  {id:'in',     label:'Drinnen',             cats:LEISURE, test:r=>r.indoor, excl:'out'},
  {id:'out',    label:'Draußen',             cats:LEISURE, test:r=>!r.indoor, excl:'in'},
  {id:'wx',     label:'Wetterunabhängig',    cats:LEISURE, test:r=>r.indoor || r.t.covered==='yes'},
  {id:'free',   label:'Kostenlos',           cats:['action','fun','water','animals','nature','culture'], test:r=>r.t.fee==='no'},
  {id:'kids',   label:'Kinderfreundlich',    cats:['food'], test:r=>(r.t.kids_area && r.t.kids_area!=='no') || r.t.highchair==='yes' || (r.t.changing_table && r.t.changing_table!=='no')},
  {id:'terrace',label:'Außenbereich',        cats:['food'], test:r=>!!r.t.outdoor_seating && r.t.outdoor_seating!=='no'},
  {id:'veg',    label:'Vegetarisch oder vegan', cats:['food'], test:r=>['yes','only'].includes(r.t['diet:vegetarian']) || ['yes','only'].includes(r.t['diet:vegan']) || /vegetarian|vegan/.test(r.t.cuisine || '')},
  {id:'dog',    label:'Hundefreundlich',     test:r=>['yes','leashed','outside'].includes(r.t.dog)},
  {id:'wheel',  label:'Rollstuhlgerecht',    test:r=>['yes','limited'].includes(r.t.wheelchair)},
  {id:'pic',    label:'Mit Bild und Infos',  test:r=>!!(r.t.wikipedia || r.t.wikidata)},
];
const extraApplies = (x, r) => !x.cats || x.cats.includes(r.m.id);
// Extras, die zu den gewählten Kategorien passen (nichts gewählt = alle)
const relevantExtras = () => EXTRAS.filter(x => !x.cats || !state.mains.size || x.cats.some(c => state.mains.has(c)));
const LIST_LIMIT = 1000, LIST_STEP = 150;
const STAY = {tpark:300, zoo:180, wild:150, pet:60, bird:120, wpark:180, therme:180, lake:120, ski:120, golf:60, foot:90, bowl:90, escape:75,
  laser:60, tramp:90, kart:60, ropes:150, gym:120, skihall:180, paint:120, rodel:45, play:90, advplay:60, museum:90, tech:120, open:150,
  castle:60, abbey:45, treetop:90, tower:30, view:20, fall:30, heath:60, garden:60, icecream:20, beer:60, cafe:45, outlet:120, factory:45, farm:20, sauna:120};
const STAY_OPTS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480];

// ===================== Zustand =====================
const state = {
  MAIN: [], SUB: {}, meta: null, tileSet: new Set(),
  stops: ['', ''], stopInfo: [null, null], radius: settings.radius * 1000,
  mains: new Set(), subs: new Set(), extras: new Set(), kw: '', maxOff: settings.radius * 1000,
  route: null, results: [], byId: new Map(), favs: store.get('af-favs', {}), tips: new Set(), favOnly: false,
  plan: Object.assign({dep: '09:00', stay: {}}, store.get('af-plan', {})),
  tour: [], tourRoute: null, tourBusy: false, pendingTour: null,
  activeId: null, lastSurprise: null, sheet: null, listShown: 150, lastCount: -1,
};

// ===================== Karte =====================
const map = L.map('map', {zoomControl: false, attributionControl: true, preferCanvas: true}).setView([50.5, 9.5], 6);
const pinRenderer = L.canvas({padding: .5, tolerance: 6});
if(!isNarrow()) L.control.zoom({position: 'topright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende'}).addTo(map);
const routeLayer = L.layerGroup().addTo(map);
function mapPadding(){
  if(isNarrow()) return {paddingTopLeft: [30, 110], paddingBottomRight: [30, Math.round(innerHeight * .52) + 20]};
  return {paddingTopLeft: [40, 40], paddingBottomRight: [state.sheet ? 440 : 40, 40]};
}
function drawRoute(animate){
  routeLayer.clearLayers();
  const R = state.route; if(!R) return;
  const coords = state.tour.length && state.tourRoute ? state.tourRoute.coords : R.coords;
  const a1 = cssVar('--a1'), ring = cssVar('--pinring'), line2 = cssVar('--line2');
  if(state.tour.length) L.polyline(R.coords, {color: cssVar('--muted'), weight: 3, opacity: .6, dashArray: '6 8', interactive: false}).addTo(routeLayer);
  const glow = L.polyline(coords, {color: a1, weight: 16, opacity: .16, interactive: false}).addTo(routeLayer);
  const line = L.polyline(coords, {color: a1, weight: 5, opacity: 1, interactive: false}).addTo(routeLayer);
  R.points.forEach((p, i) => L.circleMarker(p, {radius: i === 0 || i === R.points.length-1 ? 8 : 6, color: a1, weight: 3, fillColor: ring, fillOpacity: 1})
    .bindTooltip(esc(state.stops[i]), {direction: 'top', offset: [0, -8]}).addTo(routeLayer));
  if(!animate || reduceMotion) return;
  [glow, line].forEach(pl => {
    const path = pl.getElement(); if(!path?.getTotalLength) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    path.animate([{strokeDashoffset: len}, {strokeDashoffset: 0}], {duration: 1300, easing: 'cubic-bezier(.4,0,.2,1)'})
      .onfinish = () => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; };
  });
}

// ===================== Haltepunkte & Route =====================
function renderStops(){
  const n = state.stops.length;
  $('stops').innerHTML = state.stops.map((v, i) => {
    const kind = i === 0 ? 'Start' : i === n-1 ? 'Ziel' : `Zwischenstopp ${i}`;
    const hint = i === 0 ? 'Start, z. B. Hannover' : i === n-1 ? 'Ziel, z. B. Köln' : 'Zwischenstopp';
    const tool = i === 0 ? `<button type="button" class="icon-btn flat" data-locate aria-label="Mein Standort als Start">${icon('locate')}</button>`
      : i < n-1 ? `<button type="button" class="icon-btn flat" data-remove="${i}" aria-label="${kind} entfernen">${icon('x')}</button>` : '<span style="width:44px"></span>';
    return `<li class="stop-row${i>0 && i<n-1 ? ' mid' : ''}"><span class="dot" aria-hidden="true"></span>
      <input type="text" data-stop="${i}" list="places" value="${esc(v)}" placeholder="${hint}" aria-label="${kind}" required>${tool}</li>`;
  }).join('');
}
// Lesbare Bezeichnung aus Photon-Daten: Name, Straße, PLZ Ort, bei Ausland das Land
function placeLabel(pr){
  const city = pr.city || pr.town || pr.village || pr.locality || pr.district || pr.county;
  const street = pr.street ? pr.street + (pr.housenumber ? ' ' + pr.housenumber : '') : '';
  const parts = [];
  if(pr.name && pr.name !== city && pr.name !== pr.street) parts.push(pr.name);
  if(street) parts.push(street);
  if(city) parts.push((pr.postcode ? pr.postcode + ' ' : '') + city);
  else if(pr.state && pr.state !== pr.name) parts.push(pr.state);
  if(pr.countrycode && pr.countrycode !== 'DE' && pr.country) parts.push(pr.country);
  return [...new Set(parts)].join(', ') || pr.name || '';
}
const placeShort = pr => pr.name || pr.city || pr.town || pr.village || pr.street || '';
const featureInfo = f => ({p: [f.geometry.coordinates[1], f.geometry.coordinates[0]], label: placeLabel(f.properties), short: placeShort(f.properties)});
const sugMap = new Map();
$('stops').addEventListener('input', e => {
  const i = e.target.dataset.stop; if(i == null) return;
  const v = e.target.value; state.stops[+i] = v;
  state.stopInfo[+i] = sugMap.get(v) || null;   // aus der Vorschlagsliste gewählt: Koordinaten direkt übernehmen
  if(!state.stopInfo[+i]) suggest(v);
});
$('stops').addEventListener('click', e => {
  const rm = e.target.closest('[data-remove]');
  if(rm){ const i = +rm.dataset.remove; state.stops.splice(i, 1); state.stopInfo.splice(i, 1); renderStops(); return; }
  if(e.target.closest('[data-locate]')){
    if(!navigator.geolocation){ toast('Standort wird von diesem Browser nicht unterstützt'); return; }
    state.stops[0] = 'Standort wird ermittelt …'; state.stopInfo[0] = null; renderStops();
    navigator.geolocation.getCurrentPosition(async pos => {
      const p = [pos.coords.latitude, pos.coords.longitude];
      state.stopInfo[0] = {p, label: 'Mein Standort', short: 'Mein Standort'}; state.stops[0] = 'Mein Standort'; renderStops();
      const info = await reverseGeocode(p);
      if(info && state.stopInfo[0]?.p === p){ state.stopInfo[0] = {...info, p}; state.stops[0] = info.label; renderStops(); }
      toast('Standort übernommen');
    }, () => { state.stops[0] = ''; renderStops(); toast('Standort nicht verfügbar'); }, {timeout: 10000, enableHighAccuracy: true});
  }
});
$('addStop').addEventListener('click', () => {
  const at = state.stops.length - 1; state.stops.splice(at, 0, ''); state.stopInfo.splice(at, 0, null);
  renderStops(); $('stops').querySelector(`[data-stop="${at}"]`)?.focus();
});
let sugT, sugCtl;
function suggest(q){
  clearTimeout(sugT); if(q.trim().length < 3) return;
  sugT = setTimeout(async () => {
    sugCtl?.abort(); sugCtl = new AbortController();
    try{
      const j = await (await fetch(`https://photon.komoot.io/api/?limit=6&lang=de&bbox=-5.5,41.3,24.5,58.0&q=${enc(q)}`, {signal: sugCtl.signal})).json();
      const infos = j.features.map(featureInfo).filter(x => x.label);
      infos.forEach(x => sugMap.set(x.label, x));
      $('places').innerHTML = [...new Set(infos.map(x => x.label))].map(l => `<option value="${esc(l)}">`).join('');
    }catch(e){}
  }, 280);
}
async function reverseGeocode(p){
  try{
    const f = (await getJSON(`https://photon.komoot.io/reverse?lat=${p[0].toFixed(6)}&lon=${p[1].toFixed(6)}&lang=de&limit=1`, 'Die Adresssuche', 10000)).features?.[0];
    return f ? featureInfo(f) : null;
  }catch(e){ return null; }
}
// Liefert Koordinaten plus ausgeschriebene Bezeichnung des gefundenen Orts
async function geocode(q){
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(m){ const p = [+m[1], +m[2]]; const info = await reverseGeocode(p); return info ? {...info, p} : {p, label: q.trim(), short: q.trim()}; }
  const f = (await getJSON(`https://photon.komoot.io/api/?limit=1&lang=de&q=${enc(q)}`, 'Die Ortssuche')).features?.[0];
  if(!f) throw new Error(`„${q}“ nicht gefunden. Ort genauer angeben, z. B. mit Landkreis.`);
  return featureInfo(f);
}
async function osrm(points){
  const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${points.map(p => p[1].toFixed(5)+','+p[0].toFixed(5)).join(';')}?overview=full&geometries=geojson`, 'Die Routenberechnung', 30000);
  if(!j.routes?.length) throw new Error('Keine Route zwischen den Punkten gefunden.');
  return j.routes[0];
}
function sampleRoute(coords, step){
  const out = [{p: coords[0], c: 0}]; let cum = 0, next = step;
  for(let i = 1; i < coords.length; i++){ cum += hav(coords[i-1], coords[i]); if(cum >= next){ out.push({p: coords[i], c: cum}); next = cum + step; } }
  out.push({p: coords[coords.length-1], c: cum}); return out;
}
function tilesForRoute(coords, radius){
  const set = new Set(), dLa = radius / 111320;
  for(const {p: [la, lo]} of sampleRoute(coords, 1500)){
    const dLo = radius / (111320 * Math.cos(la * Math.PI / 180));
    for(let i = Math.floor((la-dLa)*2); i <= Math.floor((la+dLa)*2); i++)
      for(let j = Math.floor((lo-dLo)*2); j <= Math.floor((lo+dLo)*2); j++){ const id = `${i}_${j}`; if(state.tileSet.has(id)) set.add(id); }
  }
  return [...set];
}
async function loadTiles(ids, onTile){
  let next = 0, done = 0; const v = enc(state.meta.built);
  const worker = async () => { while(next < ids.length){ const id = ids[next++];
    try{ const r = await fetch(`data/tiles/${id}.json?v=${v}`); if(r.ok) onTile(await r.json()); }catch(e){}
    setProgress(++done / ids.length); } };
  await Promise.all(Array.from({length: 6}, worker));
}
const looksIndoor = t => t.indoor === 'yes' || (t.building && t.building !== 'no') || /indoor|halle|schwarzlicht|blacklight|glow/i.test(t.name || '');
function routeStatus(msg, err=false){ const s = $('routeStatus'); s.textContent = msg; s.className = 'status' + (err ? ' err' : ''); }

async function search(ev){
  ev?.preventDefault();
  if(!state.meta){ routeStatus('Es sind noch keine Daten gebaut. Siehe Anleitung (README).', true); return; }
  const keep = state.stops.map((s, i) => [s.trim(), state.stopInfo[i]]).filter(([s]) => s);
  state.stops = keep.map(k => k[0]); state.stopInfo = keep.map(k => k[1] || null);
  if(state.stops.length < 2){ routeStatus('Bitte mindestens Start und Ziel angeben.', true); while(state.stops.length < 2){ state.stops.push(''); state.stopInfo.push(null); } renderStops(); return; }
  renderStops();
  const radius = state.radius;
  $('goBtn').disabled = true;
  try{
    routeStatus('Orte werden gesucht …');
    const infos = await Promise.all(state.stops.map((q, i) => state.stopInfo[i] || geocode(q)));
    state.stopInfo = infos; state.stops = infos.map(x => x.label);
    renderStops();
    const points = infos.map(x => x.p);
    routeStatus('Route wird berechnet …');
    const rt = await osrm(points);
    let c = 0; const legEnds = rt.legs.map(l => c += l.distance);
    const coords = rt.geometry.coordinates.map(([lo, la]) => [la, lo]);
    state.route = {coords, dist: rt.distance, dur: rt.duration, legEnds, legDur: rt.legs.map(l => l.duration), radius, points};
    closeSheet(); routeStatus('');
    poiCanvas.setItems([]); state.results = []; state.byId = new Map();
    drawRoute(true);
    map.fitBounds(L.latLngBounds(coords), {...mapPadding(), animate: false});
    setPanel('half');
    $('listSub').textContent = 'Sidequests werden geladen …'; setProgress(0);

    const dense = sampleRoute(coords, 300);
    // Routenpunkte in ein Raster einsortieren: pro Ziel nur die Punkte in der Nachbarschaft prüfen
    const cellLa = radius / 111320, cellLo = radius / (111320 * Math.cos(coords[0][0] * Math.PI / 180)), grid = new Map();
    dense.forEach(d => { const k = Math.floor(d.p[0] / cellLa) + ':' + Math.floor(d.p[1] / cellLo); (grid.get(k) || grid.set(k, []).get(k)).push(d); });
    const near = (lat, lon) => { const i = Math.floor(lat / cellLa), j = Math.floor(lon / cellLo), out = [];
      for(let a = -1; a <= 1; a++) for(let b = -1; b <= 1; b++){ const g = grid.get((i + a) + ':' + (j + b)); if(g) out.push(...g); } return out; };
    let s=90, w=180, n=-90, e=-180;
    coords.forEach(([la, lo]) => { s=Math.min(s,la); n=Math.max(n,la); w=Math.min(w,lo); e=Math.max(e,lo); });
    const pad = radius / 111320, padLo = radius / (111320 * Math.cos((s+n)/2 * Math.PI/180));
    const seen = new Set();
    await loadTiles(tilesForRoute(coords, radius), items => {
      for(const [id, lat, lon, sid, t] of items){
        if(lat < s-pad || lat > n+pad || lon < w-padLo || lon > e+padLo) continue;
        const sub = state.SUB[sid]; if(!sub) continue;
        const key = (t.name || '') + sid + lat.toFixed(3) + lon.toFixed(3); if(seen.has(key)) continue;
        const cand = near(lat, lon); if(!cand.length) continue;
        let off = Infinity, km = 0;
        for(const d of cand){ const x = hav([lat, lon], d.p); if(x < off){ off = x; km = d.c; } }
        if(off > radius) continue;
        seen.add(key);
        state.results.push({id, name: t.name || '', s: sub, m: sub.m, lat, lon, off, km, t, mins: detourMin(off),
          indoor: sub.place === 'in' ? true : sub.place === 'out' ? false : looksIndoor(t)});
      }
    });
    state.results.sort((a, b) => a.km - b.km);
    state.byId = new Map(state.results.map(r => [r.id, r]));
    state.tour = (state.pendingTour || []).filter(id => state.byId.has(id)); state.pendingTour = null; state.tourRoute = null;
    $('shareBtn').disabled = false;
    await updateTour(false);
    syncHash(); render(true);
    const found = visible().length;
    if(found > LIST_LIMIT){ toast(`${found} Sidequests gefunden, grenze die Auswahl ein`); setTimeout(() => openSheet('filterSheet'), 600); }
  }catch(err){ routeStatus(err.message, true); openSheet('routeSheet'); }
  finally{ $('goBtn').disabled = false; setProgress(null); }
}
$('routeForm').addEventListener('submit', search);
$('radius').addEventListener('input', e => { const grow = state.maxOff >= state.radius; state.radius = +e.target.value * 1000; if(grow) state.maxOff = state.radius; $('radiusOut').textContent = e.target.value + ' km'; });

// ===================== Filter =====================
function passBase(r){
  if(state.mains.size && !state.mains.has(r.m.id)) return false;
  if(settings.named && !r.name) return false;
  if(r.off > state.maxOff) return false;
  if(state.kw && !r.name.toLowerCase().includes(state.kw)) return false;
  const picked = r.m.subs.filter(s => state.subs.has(s.id));
  return !picked.length || picked.includes(r.s);
}
const passExtras = r => EXTRAS.every(x => !state.extras.has(x.id) || !extraApplies(x, r) || x.test(r));
const named = r => !settings.named || r.name;
const visible = () => state.results.filter(r => passBase(r) && passExtras(r));
const refineCount = () => state.subs.size + state.extras.size + (state.kw ? 1 : 0) + (state.route && state.maxOff < state.route.radius ? 1 : 0);
const toggle = (set, id) => set.has(id) ? set.delete(id) : set.add(id);

function renderFilter(){
  const cnt = m => state.results.filter(r => r.m === m && named(r)).length;
  const R = state.route;
  let h = `<label class="field" style="margin-top:4px">Nach Namen suchen<input type="search" id="kw" value="${esc(state.kw)}" placeholder="z. B. Schwarzlicht, Piraten, Burg"></label>`;
  h += `<div class="group-label">Was möchtest du erleben?</div><div class="cat-grid">${state.MAIN.map(m => `
    <button type="button" class="cat-tile" data-main="${m.id}" aria-pressed="${state.mains.has(m.id)}">${tileHtml(m, 36, 20)}
      <span class="t"><b>${esc(m.label)}</b><small>${R ? cnt(m) + ' Ziele' : '&nbsp;'}</small></span><span class="chk">${icon('check', 13, 3)}</span></button>`).join('')}</div>
    <p class="note">${state.mains.size ? '' : 'Nichts gewählt heißt: alle Kategorien.'}</p>`;
  for(const m of state.MAIN.filter(m => state.mains.has(m.id))){
    let subs = m.subs.map(s => ({s, n: state.results.filter(r => r.s === s && named(r)).length}));
    if(R) subs = subs.filter(x => x.n > 0 || state.subs.has(x.s.id)).sort((a, b) => b.n - a.n);
    if(!subs.length) continue;
    h += `<div class="group-label">${esc(m.label)} genauer</div><div class="chips">${subs.map(({s, n}) =>
      `<button type="button" class="chip" data-sub="${s.id}" aria-pressed="${state.subs.has(s.id)}">${esc(s.label)}${R ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  }
  const base = state.results.filter(passBase);
  const scope = x => { if(!x.cats) return ''; const names = state.MAIN.filter(m => x.cats.includes(m.id) && (!state.mains.size || state.mains.has(m.id))).map(m => m.label);
    return x.cats.length < 4 && names.length ? ` <span class="n">(${esc(names.join(', '))})</span>` : ''; };
  const exCount = x => base.filter(r => extraApplies(x, r) && x.test(r)).length;
  // Nach der Suche nur Extras zeigen, für die es Treffer gibt (aktive bleiben sichtbar)
  const exList = relevantExtras().filter(x => !R || state.extras.has(x.id) || exCount(x) > 0);
  if(exList.length) h += `<div class="group-label">Extras</div><div class="chips">${exList.map(x =>
    `<button type="button" class="chip" data-extra="${x.id}" aria-pressed="${state.extras.has(x.id)}">${x.label}${scope(x)}${R ? ` <span class="n">${exCount(x)}</span>` : ''}</button>`).join('')}</div>`;
  const max = R ? R.radius : state.radius;
  const opts = [2000, 5000, 10000].filter(v => v < max).concat([max]);
  h += `<div class="group-label">Höchstens so weit von der Route</div><div class="seg">${opts.map(v =>
    `<button type="button" data-dist="${v}" aria-pressed="${Math.min(state.maxOff, max) === v}">${v === max ? `Alle (${fmtKm(v)} km)` : fmtKm(v) + ' km'}</button>`).join('')}</div>`;
  $('filterBody').innerHTML = h;
  $('applyFilters').textContent = R ? `${visible().length} Ziele anzeigen` : 'Übernehmen';
}
$('filterBody').addEventListener('click', e => {
  const m = e.target.closest('[data-main]'), s = e.target.closest('[data-sub]'), x = e.target.closest('[data-extra]'), d = e.target.closest('[data-dist]');
  if(m){ toggle(state.mains, m.dataset.main); if(!state.mains.has(m.dataset.main)) state.MAIN.find(k => k.id === m.dataset.main).subs.forEach(su => state.subs.delete(su.id)); }
  else if(s) toggle(state.subs, s.dataset.sub);
  else if(x){ const ex = EXTRAS.find(k => k.id === x.dataset.extra); toggle(state.extras, ex.id); if(state.extras.has(ex.id) && ex.excl) state.extras.delete(ex.excl); }
  else if(d) state.maxOff = +d.dataset.dist;
  else return;
  const rel = new Set(relevantExtras().map(x => x.id)); [...state.extras].forEach(id => { if(!rel.has(id)) state.extras.delete(id); });
  render(); renderFilter();
});
$('filterBody').addEventListener('input', e => { if(e.target.id === 'kw'){ state.kw = e.target.value.trim().toLowerCase(); render(); $('applyFilters').textContent = state.route ? `${visible().length} Ziele anzeigen` : 'Übernehmen'; } });
$('resetFilters').addEventListener('click', () => { state.subs.clear(); state.extras.clear(); state.kw = ''; state.maxOff = state.route?.radius || state.radius;
  state.mains = new Set(state.MAIN.filter(m => m.on).map(m => m.id)); render(); renderFilter(); });

// ===================== Anzeige: Liste, Pins, Tour-Leiste =====================
function renderQuickCats(){
  $('quickCats').innerHTML = state.MAIN.map(m => `<button type="button" class="chip" data-quick="${m.id}" aria-pressed="${state.mains.has(m.id)}"><span class="dotc" style="background:var(--c-${m.id})"></span>${esc(m.label)}</button>`).join('');
}
$('quickCats').addEventListener('click', e => { const b = e.target.closest('[data-quick]'); if(b){ toggle(state.mains, b.dataset.quick); render(); } });

// Alle Ziele werden in EINEM Canvas gezeichnet. Klick und Hover laufen über eine Suche nach dem nächsten Punkt.
const PoiLayer = L.Layer.extend({
  onAdd(m){
    this._c = L.DomUtil.create('canvas', 'poi-canvas'); this._c.style.position = 'absolute'; this._c.style.pointerEvents = 'none';
    m.getPane('overlayPane').appendChild(this._c);
    this._items = this._items || []; this._pts = [];
    m.on('moveend resize viewreset', this._reset, this);
    m.on('zoomstart', this._hide, this); m.on('zoomend', this._reset, this);
    m.on('click', this._click, this); if(canHover) m.on('mousemove', this._hover, this);
    this._tip = L.tooltip({direction: 'top', offset: [0, -10]});
    this._reset();
  },
  onRemove(m){ this._c.remove(); m.off('moveend resize viewreset', this._reset, this).off('zoomstart', this._hide, this).off('zoomend', this._reset, this).off('click', this._click, this).off('mousemove', this._hover, this); },
  setItems(items){ this._items = items; this.redraw(); },
  _hide(){ this._c.style.visibility = 'hidden'; },
  _reset(){
    const m = this._map, size = m.getSize(), dpr = window.devicePixelRatio || 1, c = this._c;
    c.width = size.x * dpr; c.height = size.y * dpr; c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
    L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0])); c.style.visibility = ''; this.redraw();
  },
  redraw(){
    if(!this._map) return;
    const m = this._map, c = this._c, ctx = c.getContext('2d'), dpr = window.devicePixelRatio || 1, size = m.getSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size.x, size.y);
    const z = m.getZoom(), base = z <= 7 ? 4 : z <= 9 ? 5.5 : 7, ring = cssVar('--pinring'), a2 = cssVar('--a2'), pts = [];
    const tourSet = new Set(state.tour), surf = cssVar('--surf'), text = cssVar('--text'), a1 = cssVar('--a1');
    const cluster = z < 13, cell = 62, groups = new Map(), special = [];
    for(const r of this._items){
      const p = m.latLngToContainerPoint([r.lat, r.lon]);
      if(p.x < -40 || p.y < -40 || p.x > size.x + 40 || p.y > size.y + 40) continue;
      if(tourSet.has(r.id) || r.id === state.activeId || !cluster){ special.push([p, r]); continue; }
      const k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell);
      (groups.get(k) || groups.set(k, []).get(k)).push([p, r]);
    }
    const pin = (p, r) => {
      const inTour = tourSet.has(r.id), active = r.id === state.activeId, rad = active ? 11 : inTour ? base + 2.5 : base;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fillStyle = cssVar('--c-' + r.m.id) || '#777'; ctx.fill();
      ctx.lineWidth = inTour ? 4 : z <= 7 ? 1.5 : 2.5; ctx.strokeStyle = inTour ? a2 : ring; ctx.stroke();
      if(active){ ctx.beginPath(); ctx.arc(p.x, p.y, rad + 5, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = a1; ctx.stroke(); }
      pts.push([p.x, p.y, rad, r]);
    };
    // Benachbarte Bündel, die sich überlappen würden, zusammenlegen
    const radOf = n => n === 1 ? base + 3 : Math.min(27, 10 + Math.log2(n) * 3.2);
    let cl = [...groups.values()].map(g => ({g, x: g.reduce((s, [p]) => s + p.x, 0) / g.length, y: g.reduce((s, [p]) => s + p.y, 0) / g.length}));
    cl.sort((a, b) => b.g.length - a.g.length);
    for(let i = 0; i < cl.length; i++){ const A = cl[i]; if(!A) continue;
      for(let j = i + 1; j < cl.length; j++){ const B = cl[j]; if(!B) continue;
        const lim = radOf(A.g.length) + radOf(B.g.length) + 2;
        if((A.x - B.x) ** 2 + (A.y - B.y) ** 2 < lim * lim){
          const n = A.g.length + B.g.length; A.x = (A.x * A.g.length + B.x * B.g.length) / n; A.y = (A.y * A.g.length + B.y * B.g.length) / n; A.g = A.g.concat(B.g); cl[j] = null; j = i; } } }
    cl = cl.filter(Boolean);
    // kleine Bündel zuerst, große obendrauf
    for(const {g, x: cx, y: cy} of cl.sort((a, b) => a.g.length - b.g.length)){
      if(g.length === 1){ pin(g[0][0], g[0][1]); continue; }
      // Bündel: Größe wächst mit der Anzahl, Ring zeigt die Kategorien anteilig in ihren Farben
      const x = cx, y = cy, n = g.length, rad = radOf(n), counts = {};
      g.forEach(([, r]) => counts[r.m.id] = (counts[r.m.id] || 0) + 1);
      ctx.beginPath(); ctx.arc(x, y, rad + 2, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
      let ang = -Math.PI / 2;
      for(const [cat, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])){
        const sweep = c / n * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x, y, rad - 2.5, ang, ang + sweep); ctx.lineWidth = 5; ctx.strokeStyle = cssVar('--c-' + cat) || '#777'; ctx.stroke(); ang += sweep;
      }
      ctx.beginPath(); ctx.arc(x, y, rad - 5, 0, Math.PI * 2); ctx.fillStyle = surf; ctx.fill();
      ctx.fillStyle = text; ctx.font = `700 ${Math.round(Math.min(15, 9 + rad / 4))}px Archivo, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n > 999 ? (n / 1000).toLocaleString('de-DE', {maximumFractionDigits: 1}) + 'k' : String(n), x, y + .5);
      pts.push([x, y, rad, {cluster: true, members: g.map(([, r]) => r), n}]);
    }
    special.sort((a, b) => (tourSet.has(a[1].id) - tourSet.has(b[1].id)) || ((a[1].id === state.activeId) - (b[1].id === state.activeId))).forEach(([p, r]) => pin(p, r));
    this._pts = pts;
  },
  _nearest(cp){
    let best = null, bd = Infinity;
    for(const [x, y, rad, r] of this._pts){ const d = (x - cp.x) ** 2 + (y - cp.y) ** 2, lim = (rad + 8) ** 2; if(d <= lim && d < bd){ bd = d; best = r; } }
    return best;
  },
  _click(e){
    const r = this._nearest(e.containerPoint); if(!r) return;
    if(!r.cluster){ openDetail(r.id); return; }
    // Bündel antippen: hineinzoomen, bis es sich auflöst
    const b = L.latLngBounds(r.members.map(x => [x.lat, x.lon]));
    if(b.getNorthEast().equals(b.getSouthWest())) this._map.setView(b.getCenter(), Math.min(18, this._map.getZoom() + 3));
    else this._map.fitBounds(b, {padding: [70, 70], maxZoom: Math.min(18, this._map.getZoom() + 4)});
  },
  _hover(e){
    const r = this._nearest(e.containerPoint), el = this._map.getContainer();
    el.style.cursor = r ? 'pointer' : '';
    if(r){ const ll = r.cluster ? this._map.containerPointToLatLng(e.containerPoint) : [r.lat, r.lon];
      this._tip.setLatLng(ll).setContent(r.cluster ? `${r.n} Sidequests, zum Vergrößern tippen` : esc(r.name || r.s.label)); if(!this._map.hasLayer(this._tip)) this._tip.addTo(this._map); }
    else if(this._map.hasLayer(this._tip)) this._map.removeLayer(this._tip);
  },
});
const poiCanvas = new PoiLayer().addTo(map);
function renderMarkers(items){
  const show = new Map(items.map(r => [r.id, r]));
  state.tour.forEach(id => { const r = state.byId.get(id); if(r) show.set(id, r); });
  poiCanvas.setItems([...show.values()]);
}
const highlightPin = () => poiCanvas.redraw();
function hitHtml(r){
  const inTour = state.tour.includes(r.id);
  const meta = r.offRoute ? `${esc(r.s.label)}, nicht auf dieser Route` : `${esc(r.s.label)}, ca. +${r.mins} min`;
  return `<li class="hit${inTour ? ' in-tour' : ''}${state.activeId === r.id ? ' active' : ''}"><span class="km">${r.km != null ? fmtKm(r.km) : ''}</span>
    <div class="hit-main"><button type="button" class="hit-open" data-open="${esc(r.id)}">${tileHtml(r.m)}
      <span class="hit-text"><strong>${esc(r.name || r.s.label)}${state.tips.has(r.id) ? ' <small style="display:inline;color:var(--a2)">Tipp</small>' : ''}</strong><small>${meta}</small></span></button>
    ${r.offRoute ? '' : `<button type="button" class="add" data-tour="${esc(r.id)}" aria-pressed="${inTour}" aria-label="${inTour ? 'Aus der Tour entfernen' : 'Zur Tour hinzufügen'}">${icon(inTour ? 'check' : 'plus', 18, 2.3)}</button>`}</div></li>`;
}
function favEntries(){
  return Object.values(state.favs).map(f => state.byId.get(f.id) || {...f, s: state.SUB[f.sid] || {label: ''}, m: state.SUB[f.sid]?.m || {id: 'culture'}, km: null, t: {website: f.web}, offRoute: true});
}
function renderList(items){
  const R = state.route;
  if(!R) return `<div class="empty"><p><b style="color:var(--text)">Sidequest findet Ausflugsziele entlang deiner Route.</b><br>Gib Start und Ziel ein, dann siehst du Freizeitparks, Spaßbäder, Zoos, Burgen und mehr, die unterwegs nur einen kleinen Umweg entfernt sind.</p><button type="button" class="primary-btn" data-open-route>Route planen</button>${isInstalled() ? '' : `<button type="button" class="text-btn" data-open-install style="margin-top:6px;padding-left:0">${icon('install', 16, 2)} Sidequest als App installieren</button>`}</div>`;
  if(state.favOnly){
    const favs = favEntries().sort((a, b) => (a.km ?? 1e12) - (b.km ?? 1e12));
    const tips = [...state.tips].map(id => state.byId.get(id)).filter(r => r && !state.favs[r.id]);
    if(!favs.length && !tips.length) return '<p class="empty">Noch nichts gemerkt. Öffne ein Ziel und tippe auf den Stern.</p>';
    return (tips.length ? `<div class="section-label">Tipps aus dem geteilten Link</div><ol class="road">${tips.map(hitHtml).join('')}</ol>` : '')
      + (favs.length ? `<div class="section-label">Gemerkt</div><ol class="road">${favs.map(hitHtml).join('')}</ol>` : '');
  }
  if(!items.length) return '<p class="empty">Nichts passt zu deinen Filtern. Lockere die Filter oder plane die Route mit größerem Abstand.</p>';
  const out = []; let leg = 0;
  const many = items.length > LIST_LIMIT ? `<div class="many"><p style="margin:0"><b>${items.length} Sidequests</b> sind eine Menge. Grenze die Auswahl ein, dann wird es übersichtlicher.</p><button type="button" class="filter-btn" data-open-filter>${icon('filter', 18, 2.2)}Filter öffnen</button></div>` : '';
  for(const r of items.slice(0, state.listShown)){
    while(leg < R.legEnds.length-1 && r.km > R.legEnds[leg]){ out.push(`<li class="stopmark"><span class="km">${fmtKm(R.legEnds[leg])}</span><b>${esc(state.stops[leg+1])}</b></li>`); leg++; }
    out.push(hitHtml(r));
  }
  const more = items.length > state.listShown ? `<li class="more" id="listMore"><button type="button" class="secondary-btn" data-more>Weitere ${Math.min(LIST_STEP, items.length - state.listShown)} anzeigen</button></li>` : '';
  return `${many}<ol class="road">${out.join('')}${more}</ol>`;
}
// Beim Scrollen automatisch nachladen
const moreObserver = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if(es.some(e => e.isIntersecting)) showMore(); }, {rootMargin: '1200px'}) : null;
function showMore(){
  const items = state.lastItems || visible(), from = state.listShown; state.listShown += LIST_STEP;
  const road = $('list').querySelector('.road'), more = $('listMore'); if(!road || !more){ $('list').innerHTML = renderList(items); observeMore(); return; }
  const R = state.route, out = []; let leg = R.legEnds.findIndex(e => e >= (items[from - 1]?.km ?? 0)); if(leg < 0) leg = R.legEnds.length - 1;
  for(const r of items.slice(from, state.listShown)){
    while(leg < R.legEnds.length-1 && r.km > R.legEnds[leg]){ out.push(`<li class="stopmark"><span class="km">${fmtKm(R.legEnds[leg])}</span><b>${esc(state.stops[leg+1])}</b></li>`); leg++; }
    out.push(hitHtml(r));
  }
  more.insertAdjacentHTML('beforebegin', out.join(''));
  if(state.listShown >= items.length) more.remove(); else more.querySelector('button').textContent = `Weitere ${Math.min(LIST_STEP, items.length - state.listShown)} anzeigen`;
  observeMore();
}
function observeMore(){ moreObserver?.disconnect(); const m = $('listMore'); if(m && moreObserver) moreObserver.observe(m); }
function arrival(){
  const T = state.tourRoute; if(!T) return null;
  const [hh, mm] = (state.plan.dep || '09:00').split(':').map(Number);
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  const stay = settings.stay ? tourItems().reduce((a, r) => a + stayOf(r) * 60, 0) : 0;
  return new Date(d.getTime() + (T.dur + stay) * 1000);
}
function renderTourbar(){
  const bar = $('tourbar');
  if(!state.route){ bar.hidden = true; return; }
  bar.hidden = false;
  const n = state.tour.length, T = state.tourRoute, extra = T ? Math.max(0, T.dur - state.route.dur) : 0, arr = arrival();
  bar.innerHTML = `<div class="t"><strong>${n ? `Tour mit ${n} Sidequest${n > 1 ? 's' : ''}` : 'Noch keine Sidequests'}</strong>
    <small>${n ? `+${fmtDur(extra)} Umweg${arr ? ', Ankunft ca. ' + fmtTime(arr) : ''}` : 'Tippe auf + bei einem Ziel'}</small></div>
    <button type="button" data-open-tour>${n ? 'Tour ansehen' : 'Route öffnen'}</button>`;
}
function render(animate=false){
  const items = visible();
  if(!animate && state.lastCount !== items.length) state.listShown = LIST_STEP;
  state.lastCount = items.length; state.lastItems = items;
  renderMarkers(items);
  renderQuickCats();
  const R = state.route;
  $('listTitle').textContent = state.favOnly ? 'Gemerkt' : R ? `${items.length} Sidequest${items.length === 1 ? '' : 's'}` : 'Sidequests';
  $('listSub').textContent = R ? `entlang ${fmtKm(R.dist)} km, nach Strecke sortiert` : 'Plane zuerst eine Route';
  const rc = refineCount(); $('filterBadge').hidden = !rc; $('filterBadge').textContent = rc;
  const fc = Object.keys(state.favs).length; $('favCount').textContent = fc || '';
  $('favToggle').setAttribute('aria-pressed', state.favOnly);
  $('list').innerHTML = renderList(items); observeMore();
  renderTourbar(); renderTopbar();
  if(state.sheet === 'tourSheet') renderTour();
}
function renderTopbar(){
  const R = state.route;
  if(!R){ $('routeTitle').textContent = 'Route planen'; $('routeSub').textContent = 'Sidequest findet Ausflugsziele unterwegs'; return; }
  const short = i => state.stopInfo[i]?.short || state.stops[i].split(',')[0];
  $('routeTitle').innerHTML = `${esc(short(0))}<span class="sep">/</span>${esc(short(state.stops.length-1))}`;
  const cats = state.mains.size ? state.MAIN.filter(m => state.mains.has(m.id)).map(m => m.label).join(', ') : 'alle Kategorien';
  $('routeSub').textContent = `${fmtKm(R.radius)} km Korridor${state.stops.length > 2 ? `, ${state.stops.length - 2} Zwischenstopp${state.stops.length > 3 ? 's' : ''}` : ''}, ${cats}`;
}
$('favToggle').addEventListener('click', () => { state.favOnly = !state.favOnly; render(); });

// ===================== Panel am Handy: ziehbares Sheet =====================
let panelState = 'peek';
const panelHeights = () => ({peek: 250, half: Math.round(innerHeight * .52), full: innerHeight - 96});
function setPanel(st){
  panelState = st;
  if(!isNarrow()){ $('panel').style.removeProperty('--panel-h'); return; }
  const h = panelHeights()[st];
  $('panel').style.setProperty('--panel-h', h + 'px');
  document.documentElement.style.setProperty('--panel-visible', Math.min(h, innerHeight * .52) + 'px');
}
(() => {
  const drag = $('panelDrag'), panel = $('panel'); let y0 = null, base = 0, moved = false;
  drag.addEventListener('pointerdown', e => { if(!isNarrow() || e.target.closest('.panel-tools')) return; y0 = e.clientY; moved = false;
    base = panel.offsetHeight; panel.classList.add('dragging'); drag.setPointerCapture(e.pointerId); });
  drag.addEventListener('pointermove', e => { if(y0 == null) return; const dy = e.clientY - y0; if(Math.abs(dy) > 4) moved = true;
    panel.style.setProperty('--panel-h', Math.max(160, Math.min(innerHeight - 96, base - dy)) + 'px'); });
  const end = e => { if(y0 == null) return; panel.classList.remove('dragging'); y0 = null;
    if(!moved){ if(e.target.closest('#grip')) setPanel(panelState === 'peek' ? 'half' : panelState === 'half' ? 'full' : 'peek'); else setPanel(panelState); return; }
    const h = panel.offsetHeight, opts = panelHeights();
    setPanel(Object.entries(opts).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0]); };
  drag.addEventListener('pointerup', end); drag.addEventListener('pointercancel', end);
})();
addEventListener('resize', () => { setPanel(panelState); map.invalidateSize(); });

// ===================== Overlays =====================
function openSheet(id){
  if(state.sheet && state.sheet !== id) $(state.sheet).classList.remove('open'), $(state.sheet).hidden = true;
  const s = $(id); s.hidden = false; state.sheet = id;
  if(id === 'filterSheet') renderFilter();
  if(id === 'tourSheet') renderTour();
  if(id === 'settingsSheet') renderSettings();
  if(id === 'installSheet') renderInstall();
  if(id === 'routeSheet'){ renderStops(); $('radius').value = state.radius/1000; $('radiusOut').textContent = state.radius/1000 + ' km'; }
  paintIcons(s);
  const scrim = $('scrim');
  if(isNarrow() || id !== 'detailSheet'){ scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('show')); }
  requestAnimationFrame(() => s.classList.add('open'));
  setTimeout(() => (s.querySelector('input:not([type=range]), [data-close]') || s).focus({preventScroll: true}), 60);
}
function closeSheet(){
  const id = state.sheet; if(!id) return;
  const s = $(id); s.classList.remove('open'); state.sheet = null;
  const scrim = $('scrim'); scrim.classList.remove('show');
  setTimeout(() => { if(state.sheet !== id) s.hidden = true; if(!state.sheet) scrim.hidden = true; }, 340);
  if(id === 'detailSheet'){ state.activeId = null; highlightPin(null); document.querySelectorAll('.hit.active').forEach(h => h.classList.remove('active')); }
}
document.addEventListener('click', e => { if(e.target.closest('[data-close]')) closeSheet(); });
$('scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSheet(); });
$('routeBtn').addEventListener('click', () => openSheet('routeSheet'));
$('filterBtn').addEventListener('click', () => openSheet('filterSheet'));
$('settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));

// ===================== Detail =====================
const CUISINE = {italian:'Italienisch', pizza:'Pizza', german:'Deutsch', regional:'Regional', bavarian:'Bayerisch', austrian:'Österreichisch', swiss:'Schweizerisch',
  dutch:'Niederländisch', danish:'Dänisch', polish:'Polnisch', czech:'Tschechisch', belgian:'Belgisch', greek:'Griechisch', mediterranean:'Mediterran', balkan:'Balkan',
  croatian:'Kroatisch', asian:'Asiatisch', chinese:'Chinesisch', thai:'Thailändisch', vietnamese:'Vietnamesisch', japanese:'Japanisch', sushi:'Sushi', korean:'Koreanisch',
  ramen:'Ramen', indian:'Indisch', pakistani:'Pakistanisch', nepalese:'Nepalesisch', sri_lankan:'Sri-lankisch', turkish:'Türkisch', kebab:'Kebab', lebanese:'Libanesisch',
  arab:'Arabisch', persian:'Persisch', syrian:'Syrisch', oriental:'Orientalisch', burger:'Burger', american:'Amerikanisch', steak_house:'Steakhaus', barbecue:'Barbecue',
  grill:'Grill', fish:'Fisch', seafood:'Meeresfrüchte', spanish:'Spanisch', tapas:'Tapas', mexican:'Mexikanisch', 'tex-mex':'Tex-Mex', latin_american:'Lateinamerikanisch',
  argentinian:'Argentinisch', peruvian:'Peruanisch', french:'Französisch', vegetarian:'Vegetarisch', vegan:'Vegan', international:'International', coffee_shop:'Café',
  cake:'Kuchen', ice_cream:'Eis', breakfast:'Frühstück', local:'Regional', fine_dining:'Gehobene Küche'};
const cuisineText = c => (c || '').split(';').map(x => x.trim()).filter(Boolean).map(x => CUISINE[x] || x.replace(/_/g, ' ').replace(/^./, m => m.toUpperCase())).join(', ');
const WMO = c => c === 0 ? ['sunny','Sonnig'] : c <= 2 ? ['sunny','Heiter'] : c === 3 ? ['cloud','Bewölkt'] : c <= 48 ? ['fog','Nebel'] : c <= 67 ? ['rain','Regen']
  : c <= 77 ? ['snow','Schnee'] : c <= 82 ? ['rain','Schauer'] : c <= 86 ? ['snow','Schneeschauer'] : ['storm','Gewitter'];
const infoCache = new Map();
function wikiInfo(t){
  const key = t.wikidata || t.wikipedia; if(!key) return Promise.resolve(null);
  if(infoCache.has(key)) return infoCache.get(key);
  const p = (async () => {
    let lang = 'de', title = null, img = null, file = null, category = null;
    if(t.wikipedia){ const i = t.wikipedia.indexOf(':'); if(i > 0 && i < 4){ lang = t.wikipedia.slice(0, i); title = t.wikipedia.slice(i+1); } else title = t.wikipedia; }
    if(t.wikidata && /^Q\d+$/.test(t.wikidata)){
      try{
        const e = (await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${t.wikidata}&props=sitelinks|claims&sitefilter=dewiki|enwiki&format=json&origin=*`, 'Wikidata')).entities?.[t.wikidata];
        const de = e?.sitelinks?.dewiki, en = e?.sitelinks?.enwiki;
        if(de){ title = de.title; lang = 'de'; } else if(!title && en){ title = en.title; lang = 'en'; }
        file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
        category = e?.claims?.P373?.[0]?.mainsnak?.datavalue?.value || null;
      }catch(e){}
    }
    let extract = null, url = null;
    if(title){ try{ const s = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}`, 'Wikipedia');
      extract = s.extract || null; url = s.content_urls?.desktop?.page || null; if(!img && s.thumbnail?.source) img = s.thumbnail.source.replace(/\/\d+px-/, '/760px-'); }catch(e){} }
    return {img, extract, url, file, category};
  })();
  infoCache.set(key, p); return p;
}
// Bilder: Hauptbild aus Wikidata, Bildersammlung (Commons-Kategorie) und geotaggte Fotos im Umkreis. Kein API-Schlüssel nötig.
const galleryCache = new Map();
const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&iiextmetadatafilter=Artist|LicenseShortName&';
const SKIP_FILE = /map|karte|plan|logo|wappen|coat.of.arms|diagram|grundriss|schild|sign\b|flag|fahne|icon|svg$|\.tif|\.pdf/i;
const stripHtml = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80); };
function galleryRadius(r){
  if(['see', 'heath', 'tpark', 'zoo', 'wild', 'open', 'garden'].includes(r.s.id)) return 600;
  return r.id[0] === 'n' ? 150 : 350;   // Punkte eng, Flächen weiter
}
function gallery(r, info){
  if(galleryCache.has(r.id)) return galleryCache.get(r.id);
  const p = (async () => {
    const files = new Map();
    const take = pages => Object.values(pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).forEach(pg => {
      const ii = pg.imageinfo?.[0]; if(!ii?.thumburl || SKIP_FILE.test(pg.title) || files.has(pg.title)) return;
      files.set(pg.title, {src: ii.thumburl, page: ii.descriptionurl, artist: stripHtml(ii.extmetadata?.Artist?.value), license: ii.extmetadata?.LicenseShortName?.value || ''});
    });
    const ask = async q => { try{ take((await getJSON(COMMONS + q, 'Wikimedia Commons', 12000)).query?.pages); }catch(e){} };
    if(info?.file) await ask(`titles=${enc('File:' + info.file)}`);
    if(info?.category) await ask(`generator=categorymembers&gcmtitle=${enc('Category:' + info.category)}&gcmtype=file&gcmlimit=12`);
    if(files.size < 8) await ask(`generator=geosearch&ggscoord=${r.lat.toFixed(5)}|${r.lon.toFixed(5)}&ggsradius=${galleryRadius(r)}&ggsnamespace=6&ggslimit=12`);
    if(!files.size && info?.img) files.set('wiki', {src: info.img, page: info.url, artist: '', license: ''});
    return [...files.values()].slice(0, 10);
  })();
  galleryCache.set(r.id, p); return p;
}
function renderGallery(imgs){
  const hero = $('dHero'); if(!hero || !imgs.length) return;
  hero.innerHTML = `<div class="gal" id="gal">${imgs.map((im, i) => `<figure><img src="${esc(im.src)}" alt="" loading="${i ? 'lazy' : 'eager'}" decoding="async"></figure>`).join('')}</div>
    ${imgs.length > 1 ? `<div class="gal-dots" aria-hidden="true">${imgs.map((_, i) => `<span${i ? '' : ' class="on"'}></span>`).join('')}</div>
      <button type="button" class="gal-nav prev" aria-label="Vorheriges Bild">${icon('back', 18, 2.4)}</button><button type="button" class="gal-nav next" aria-label="Nächstes Bild">${icon('chev', 18, 2.4)}</button>` : ''}
    <a class="credit" id="galCredit" target="_blank" rel="noopener"></a>`;
  const gal = $('gal'), credit = $('galCredit');
  gal.querySelectorAll('img').forEach(img => img.addEventListener('load', () => img.classList.add('loaded'), {once: true}));
  const show = i => { const im = imgs[i]; credit.href = im.page || '#'; credit.textContent = im.artist || im.license ? `Foto: ${[im.artist, im.license].filter(Boolean).join(', ')}` : 'Foto: Wikimedia Commons';
    hero.querySelectorAll('.gal-dots span').forEach((d, k) => d.classList.toggle('on', k === i)); };
  show(0);
  gal.addEventListener('scroll', () => show(Math.round(gal.scrollLeft / gal.clientWidth)), {passive: true});
  hero.querySelectorAll('.gal-nav').forEach(b => b.addEventListener('click', () => gal.scrollBy({left: (b.classList.contains('next') ? 1 : -1) * gal.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth'})));
}
async function weather(lat, lon){
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`, 'Wetter', 10000);
  return j.daily.time.map((d, i) => ({code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i]}));
}
const findEntry = id => state.byId.get(id) || favEntries().find(f => f.id === id);
function detailActions(r){
  const inTour = state.tour.includes(r.id), fav = !!state.favs[r.id];
  return `${r.offRoute ? '' : `<button type="button" class="main" data-tour="${esc(r.id)}" aria-pressed="${inTour}">${icon(inTour ? 'check' : 'plus', 18, 2.3)}${inTour ? 'In deiner Tour' : 'Zur Tour'}</button>`}
    <button type="button" class="icon-btn" data-fav="${esc(r.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Nicht mehr merken' : 'Merken'}">${icon('star')}</button>
    <a class="icon-btn" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}&travelmode=driving" target="_blank" rel="noopener" aria-label="Nur hierhin navigieren">${icon('nav')}</a>`;
}
let detailSeq = 0;
async function openDetail(id){
  const r = findEntry(id); if(!r) return;
  const seq = ++detailSeq; state.activeId = id;
  highlightPin(id);
  document.querySelectorAll('.hit.active').forEach(h => h.classList.remove('active'));
  document.querySelector(`[data-open="${CSS.escape(id)}"]`)?.closest('.hit')?.classList.add('active');
  const t = r.t || {}, web = t.website || t['contact:website'];
  const isFood = r.s.id.startsWith('r_') || ['cafe', 'beer'].includes(r.s.id);
  const menu = t['website:menu'] || t['menu:url'], phone = t.phone || t['contact:phone'];
  const menuSearch = `https://www.google.com/search?q=${enc([r.name, t['addr:city'], 'Speisekarte'].filter(Boolean).join(' '))}`;
  const gQuery = [r.name, t['addr:city']].filter(Boolean).join(', ') || `${r.lat},${r.lon}`;
  const foodRow = r.name ? `<div class="btn-row link-row" style="margin-top:0">
      <a class="secondary-btn" href="https://www.google.com/maps/search/?api=1&query=${enc(r.name + ' ' + (t['addr:city'] || ''))}" target="_blank" rel="noopener">${icon('star', 18)}Bewertungen auf Google</a>
      ${isFood ? `<a class="secondary-btn" href="${esc(menu || menuSearch)}" target="_blank" rel="noopener">${icon(menu ? 'menu' : 'search', 18)}${menu ? 'Speisekarte' : 'Speisekarte suchen'}</a>` : ''}
      ${phone ? `<a class="secondary-btn" href="tel:${esc(phone.split(';')[0].replace(/[^+\d]/g, ''))}">${icon('phone', 18)}Anrufen</a>` : ''}</div>` : '';
  const kidsBits = [t.kids_area && t.kids_area !== 'no' && 'Spielecke', t.highchair === 'yes' && 'Hochstuhl', t.changing_table && t.changing_table !== 'no' && 'Wickeltisch'].filter(Boolean);
  const facts = [
    t.cuisine && ['utensils', esc(cuisineText(t.cuisine))],
    kidsBits.length && ['paw', 'Für Kinder: ' + kidsBits.join(', ')],
    t.outdoor_seating && t.outdoor_seating !== 'no' && ['sunny', 'Mit Außenbereich'],
    t.opening_hours && ['clock', esc(t.opening_hours)],
    t.fee && ['euro', t.fee === 'no' ? 'Eintritt frei' : t.fee === 'yes' ? 'Eintritt kostenpflichtig' : esc(t.fee)],
    t.wheelchair && ['wheelchair', {yes: 'Rollstuhlgerecht', limited: 'Eingeschränkt rollstuhlgerecht', no: 'Nicht rollstuhlgerecht'}[t.wheelchair] || esc(t.wheelchair)],
    t.dog && ['dog', {yes: 'Hunde erlaubt', leashed: 'Hunde an der Leine', no: 'Keine Hunde', outside: 'Hunde nur draußen'}[t.dog] || esc(t.dog)],
    web && ['web', `<a href="${esc(web)}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`],
  ].filter(Boolean);
  $('detailBody').innerHTML = `
    <div class="hero" id="dHero">${icon(catIcon(r.m), 56, 1.2)}</div>
    <div class="d-body">
      <div><span class="d-cat" style="--catc:var(--c-${r.m.id})">${esc(r.s.label)}</span>
        <h2 id="detailTitle">${esc(r.name || r.s.label)}</h2>
        <p class="d-meta">${r.km != null ? `Bei km ${fmtKm(r.km)}, ca. ${r.mins} min Umweg` : 'Nicht auf der aktuellen Route'}${r.indoor ? ', drinnen' : ''}</p></div>
      <div class="d-actions" id="dActions">${detailActions(r)}</div>
      ${foodRow}
      <div class="d-desc" id="dDesc"${t.wikipedia || t.wikidata ? '' : ' hidden'}><div class="shimmer" style="height:60px"></div></div>
      <div><div class="group-label" style="margin-top:0">Wetter vor Ort</div><div class="wx" id="dWx">${'<div class="shimmer" style="height:84px"></div>'.repeat(3)}</div></div>
      ${facts.length ? `<dl class="facts">${facts.map(([i, v]) => `<dt>${icon(i)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
    </div>`;
  openSheet('detailSheet'); $('detailSheet').scrollTop = 0;
  if(r.lat != null){ const ll = L.latLng(r.lat, r.lon); if(!map.getBounds().pad(-.15).contains(ll)) map.panTo(ll, {animate: !reduceMotion}); }
  weather(r.lat, r.lon).then(days => { if(seq !== detailSeq) return;
    $('dWx').innerHTML = days.map((d, i) => { const [ic, txt] = WMO(d.code);
      return `<div>${icon(ic, 24, 1.6)}<b>${Math.round(d.max)}° / ${Math.round(d.min)}°</b>${['Heute', 'Morgen', 'Übermorgen'][i]}<span>${txt}, ${d.rain ?? 0} % Regen</span></div>`; }).join('');
  }).catch(() => { if(seq === detailSeq) $('dWx').innerHTML = '<p class="note">Wetter gerade nicht verfügbar.</p>'; });
  const info = await wikiInfo(t); if(seq !== detailSeq) return;
  gallery(r, info).then(imgs => { if(seq === detailSeq) renderGallery(imgs); });
  const desc = $('dDesc');
  if(info?.extract) desc.innerHTML = `<p>${esc(info.extract)}</p>${info.url ? `<p style="margin-top:8px"><a class="text-btn" style="padding:0;min-height:0" href="${esc(info.url)}" target="_blank" rel="noopener">Weiterlesen auf Wikipedia</a></p>` : ''}`;
  else desc.hidden = true;
}

// ===================== Merken & Tour =====================
function toggleFav(id){
  if(state.favs[id]){ delete state.favs[id]; toast('Nicht mehr gemerkt'); }
  else{ const r = state.byId.get(id); if(!r) return;
    state.favs[id] = {id, name: r.name, lat: r.lat, lon: r.lon, sid: r.s.id, web: r.t.website || r.t['contact:website'] || '', added: Date.now()}; toast('Gemerkt'); }
  store.set('af-favs', state.favs); render();
  if(state.activeId === id && $('dActions')) $('dActions').innerHTML = detailActions(findEntry(id));
}
const stayOf = r => state.plan.stay[r.id] ?? STAY[r.s.id] ?? (r.s.id.startsWith('r_') ? 75 : 60);
const tourItems = () => state.tour.map(id => state.byId.get(id)).filter(Boolean).sort((a, b) => a.km - b.km);
const savePlan = () => store.set('af-plan', state.plan);
function tourWaypoints(){
  const R = state.route, stopKm = [0, ...R.legEnds.slice(0, -1), R.dist];
  return [...R.points.map((p, i) => ({kind: 'stop', p, km: i === 0 ? -1 : i === R.points.length-1 ? Infinity : stopKm[i], label: state.stops[i]})),
          ...tourItems().map(r => ({kind: 'place', p: [r.lat, r.lon], km: r.km, label: r.name || r.s.label, r}))].sort((a, b) => a.km - b.km);
}
function toggleTour(id){
  const i = state.tour.indexOf(id);
  if(i >= 0){ state.tour.splice(i, 1); toast('Aus der Tour entfernt'); } else { state.tour.push(id); toast('Zur Tour hinzugefügt'); }
  syncHash(); render(); updateTour();
  if(state.activeId === id && $('dActions')) $('dActions').innerHTML = detailActions(findEntry(id));
}
let tourSeq = 0;
async function updateTour(rerender = true){
  const R = state.route; if(!R) return;
  const seq = ++tourSeq, wps = tourWaypoints();
  if(!state.tour.length){ state.tourRoute = {coords: R.coords, legs: R.legDur, dur: R.dur, dist: R.dist, wps}; drawRoute(false); if(rerender) render(); return; }
  state.tourBusy = true; if(rerender && state.sheet === 'tourSheet') renderTour();
  try{ const rt = await osrm(wps.map(w => w.p)); if(seq !== tourSeq) return;
    state.tourRoute = {coords: rt.geometry.coordinates.map(([lo, la]) => [la, lo]), legs: rt.legs.map(l => l.duration), dur: rt.duration, dist: rt.distance, wps}; }
  catch(e){ if(seq === tourSeq) toast(e.message); }
  finally{ if(seq === tourSeq){ state.tourBusy = false; drawRoute(false); if(rerender) render(); } }
}
function renderTour(){
  const body = $('tourBody'), foot = $('tourFoot'), R = state.route, T = state.tourRoute;
  if(!R){ body.innerHTML = '<p class="empty">Plane zuerst eine Route.</p>'; foot.innerHTML = ''; return; }
  if(state.tourBusy || !T){ body.innerHTML = '<div class="shimmer" style="height:40px;margin-bottom:12px"></div><div class="shimmer" style="height:240px"></div>'; foot.innerHTML = ''; return; }
  const [hh, mm] = (state.plan.dep || '09:00').split(':').map(Number);
  let t = new Date(); t.setHours(hh, mm, 0, 0);
  let stay = 0; const rows = [];
  T.wps.forEach((w, i) => {
    if(i > 0) t = new Date(t.getTime() + (T.legs[i-1] || 0) * 1000);
    const edge = i === 0 || i === T.wps.length-1;
    if(w.kind === 'stop'){
      rows.push(`<li class="tl${edge ? ' edge' : ''}"><time>${i === 0 ? '' : 'ca. '}${fmtTime(t)}</time><span class="pip"></span><div class="tl-card"><div class="txt"><strong>${esc(w.label)}</strong><small>${i === 0 ? 'Start' : edge ? 'Ziel' : 'Zwischenstopp'}</small></div></div></li>`);
    }else{
      const r = w.r, st = stayOf(r);
      rows.push(`<li class="tl place"><time>ca. ${fmtTime(t)}</time><span class="pip"></span><div class="tl-card">${tileHtml(r.m, 36, 20)}
        <div class="txt"><button type="button" class="txt-btn" data-open="${esc(r.id)}"><strong>${esc(r.name || r.s.label)}</strong><small>${esc(r.s.label)}, ca. +${r.mins} min</small></button>
        ${settings.stay ? `<select data-stay="${esc(r.id)}" aria-label="Aufenthalt bei ${esc(r.name)}">${STAY_OPTS.map(o => `<option value="${o}"${o === st ? ' selected' : ''}>${fmtDur(o*60)} vor Ort</option>`).join('')}</select>` : ''}</div>
        <button type="button" class="tl-remove" data-tour="${esc(r.id)}" aria-label="${esc(r.name)} aus der Tour entfernen">${icon('x', 18, 2)}</button></div></li>`);
      if(settings.stay){ stay += st * 60; t = new Date(t.getTime() + st * 60000); }
    }
  });
  const extra = Math.max(0, T.dur - R.dur), n = state.tour.length;
  body.innerHTML = `<div class="tour-top"><p class="tour-sum" style="margin:0">${fmtDur(T.dur)} Fahrt${n ? `, davon ${fmtDur(extra)} für ${n} Sidequest${n > 1 ? 's' : ''}` : ''}${settings.stay && stay ? `, dazu ${fmtDur(stay)} vor Ort` : ''}</p>
      <label>Abfahrt<input type="time" id="dep" value="${esc(state.plan.dep)}"></label></div>
    <ol class="timeline">${rows.join('')}</ol>
    ${n ? '' : '<p class="note">Noch keine Sidequests in der Tour. Tippe in der Liste auf +.</p>'}
    <button type="button" class="text-btn" data-close style="padding-left:0">Weitere Sidequests hinzufügen</button>`;
  const links = gmapsLinks(T.wps);
  foot.innerHTML = `${links.map((l, i) => `<a class="primary-btn" href="${l}" target="_blank" rel="noopener"${i ? ' style="margin-top:8px"' : ''}>${icon('nav', 20, 2)}${links.length > 1 ? `Google Maps, Teil ${i+1} von ${links.length}` : 'In Google Maps starten'}</a>`).join('')}
    <div class="btn-row"><button type="button" class="secondary-btn" id="gpxBtn">${icon('download', 18)}GPX-Datei</button><button type="button" class="secondary-btn" id="tourShare">${icon('share', 18)}Tour teilen</button></div>
    ${links.length > 1 ? '<p class="note">Google Maps nimmt höchstens 9 Zwischenziele pro Link. Teil 2 beginnt, wo Teil 1 endet.</p>' : ''}`;
}
$('tourBody').addEventListener('change', e => {
  if(e.target.id === 'dep'){ state.plan.dep = e.target.value || '09:00'; savePlan(); renderTour(); renderTourbar(); }
  if(e.target.dataset.stay){ state.plan.stay[e.target.dataset.stay] = +e.target.value; savePlan(); renderTour(); renderTourbar(); }
});
const pt = w => `${w.p[0].toFixed(5)},${w.p[1].toFixed(5)}`;
function gmapsLinks(wps){
  const links = [];
  for(let i = 0; i < wps.length - 1; i += 10){
    const part = wps.slice(i, Math.min(i + 11, wps.length)), mid = part.slice(1, -1).map(pt).join('|');
    links.push(`https://www.google.com/maps/dir/?api=1&origin=${pt(part[0])}&destination=${pt(part[part.length-1])}${mid ? '&waypoints=' + enc(mid) : ''}&travelmode=driving`);
  }
  return links;
}
function downloadGpx(){
  const T = state.tourRoute; if(!T) return;
  const x = s => esc(s).replace(/&#39;/g, '&apos;'), name = `${state.stops[0]} nach ${state.stops[state.stops.length-1]}`;
  const step = Math.max(1, Math.floor(T.coords.length / 4000));
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Sidequest by Cybershade" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${x(name)}</name></metadata>
${T.wps.map(w => `<wpt lat="${w.p[0]}" lon="${w.p[1]}"><name>${x(w.label)}</name></wpt>`).join('\n')}
<rte><name>${x(name)}</name>
${T.wps.map(w => `<rtept lat="${w.p[0]}" lon="${w.p[1]}"><name>${x(w.label)}</name></rtept>`).join('\n')}
</rte>
<trk><name>${x(name)}</name><trkseg>${T.coords.filter((_, i) => i % step === 0 || i === T.coords.length-1).map(([la, lo]) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"/>`).join('')}</trkseg></trk>
</gpx>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gpx], {type: 'application/gpx+xml'})); a.download = 'sidequest-tour.gpx';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('GPX-Datei gespeichert');
}

// ===================== Als App installieren =====================
const UA = navigator.userAgent;
const PLATFORM = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
  : /Android/.test(UA) ? 'android' : /Windows/.test(UA) ? 'windows' : /Macintosh/.test(UA) ? 'mac' : 'other';
const BROWSER = /Edg\//.test(UA) ? 'edge' : /SamsungBrowser/.test(UA) ? 'samsung' : /FxiOS|Firefox/.test(UA) ? 'firefox' : /CriOS|Chrome/.test(UA) ? 'chrome' : /Safari/.test(UA) ? 'safari' : 'other';
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if(state.sheet === 'installSheet') renderInstall(); });
addEventListener('appinstalled', () => { installPrompt = null; toast('Sidequest ist installiert'); closeSheet(); render(); });
function installSteps(){
  const P = PLATFORM, B = BROWSER;
  if(P === 'ios'){
    if(B === 'firefox') return {name: 'iPhone und iPad', steps: ['Öffne diese Seite in Safari. Firefox kann auf dem iPhone keine Web-Apps installieren.', 'Tippe unten auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).', 'Wähle „Zum Home-Bildschirm“ und tippe auf „Hinzufügen“.']};
    return {name: 'iPhone und iPad', steps: [B === 'safari' ? 'Tippe unten in der Leiste auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).' : 'Tippe oben rechts neben der Adresszeile auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).',
      'Scrolle nach unten und wähle „Zum Home-Bildschirm“. Fehlt der Eintrag: ganz unten „Aktionen bearbeiten“ und ihn hinzufügen.', 'Tippe oben rechts auf „Hinzufügen“. Sidequest liegt jetzt als App auf deinem Home-Bildschirm.']};
  }
  if(P === 'android'){
    if(B === 'samsung') return {name: 'Android', steps: ['Tippe unten auf das Menü (drei Striche).', 'Wähle „Seite hinzufügen zu“ und dann „Startbildschirm“.', 'Bestätige mit „Hinzufügen“.']};
    if(B === 'firefox') return {name: 'Android', steps: ['Tippe auf das Menü (drei Punkte).', 'Wähle „Installieren“ bzw. „Zum Startbildschirm hinzufügen“.', 'Bestätige mit „Hinzufügen“.']};
    return {name: 'Android', steps: ['Tippe oben rechts auf das Menü (drei Punkte).', 'Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Bestätige mit „Installieren“. Sidequest erscheint bei deinen Apps.']};
  }
  if(P === 'windows' || P === 'mac'){
    const os = P === 'windows' ? 'Windows' : 'Mac';
    if(P === 'mac' && B === 'safari') return {name: os, steps: ['Klicke oben in der Menüleiste auf „Ablage“.', 'Wähle „Zum Dock hinzufügen“ (ab macOS Sonoma).', 'Bestätige mit „Hinzufügen“. Sidequest liegt jetzt im Dock.']};
    if(B === 'firefox') return {name: os, steps: ['Firefox kann Web-Apps nicht als eigene App installieren.', 'Öffne diese Seite in Microsoft Edge oder Google Chrome.', 'Dort erscheint rechts in der Adressleiste ein Installieren-Symbol.']};
    if(B === 'edge') return {name: os, steps: ['Klicke rechts in der Adressleiste auf das Symbol „App verfügbar“, oder öffne das Menü (drei Punkte).', 'Wähle „Apps“ und dann „Diese Website als App installieren“.', 'Bestätige mit „Installieren“. Sidequest startet ab jetzt wie ein eigenes Programm.']};
    return {name: os, steps: ['Klicke rechts in der Adressleiste auf das Installieren-Symbol (Bildschirm mit Pfeil), oder öffne das Menü (drei Punkte).', 'Wähle „Sidequest installieren“ bzw. „Streamen, speichern und teilen“ und dann „Seite als App installieren“.', `Bestätige mit „Installieren“. Sidequest findest du danach ${P === 'windows' ? 'im Startmenü' : 'im Launchpad'}.`]};
  }
  return {name: 'deinem Gerät', steps: ['Öffne das Menü deines Browsers.', 'Suche nach „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Bestätige die Installation.']};
}
function renderInstall(){
  const body = $('installBody');
  if(isInstalled()){ body.innerHTML = '<p class="empty">Sidequest läuft bereits als App. 🎉</p>'; return; }
  const {name, steps} = installSteps();
  body.innerHTML = `<p class="note" style="margin-top:0">Als App startet Sidequest im Vollbild ohne Browserleisten, direkt von deinem ${PLATFORM === 'windows' || PLATFORM === 'mac' ? 'Desktop' : 'Home-Bildschirm'}.</p>
    ${installPrompt ? `<button type="button" class="primary-btn" id="installNow" style="margin:16px 0 8px">${icon('install', 20, 2)}Jetzt installieren</button><p class="note">Oder von Hand:</p>` : ''}
    <div class="group-label">So geht's auf ${esc(name)}</div>
    <ol class="steps">${steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    <p class="note">Merkliste und Einstellungen der App sind getrennt von denen im Browser.</p>`;
}
$('installBody').addEventListener('click', async e => {
  if(e.target.closest('#installNow') && installPrompt){ installPrompt.prompt(); const c = await installPrompt.userChoice; if(c.outcome !== 'accepted') toast('Installation abgebrochen'); installPrompt = null; renderInstall(); }
});

// ===================== Einstellungen =====================
function renderSettings(){
  const sw = (id, on, label) => `<button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}"></button>`;
  const meta = state.meta ? `${state.meta.count.toLocaleString('de-DE')} Ziele, Stand ${new Date(state.meta.built).toLocaleDateString('de-DE')}` : 'Noch keine Daten gebaut';
  $('settingsBody').innerHTML = `
    ${isInstalled() ? '' : `<button type="button" class="install-card" data-open-install>${icon('install', 22, 2)}<span><b>Als App installieren</b><small>Anleitung für ${esc(installSteps().name)}</small></span>${icon('chev', 18, 2)}</button>`}
    <div class="group-label">Darstellung</div>
    <div class="seg big" id="themeSeg">${[['light', 'Hell', 'sun'], ['dark', 'Dunkel', 'moon'], ['auto', 'Automatisch', 'auto']].map(([k, l, i]) =>
      `<button type="button" data-theme-set="${k}" aria-pressed="${settings.theme === k}">${icon(i, 22, 1.8)}${l}</button>`).join('')}</div>
    <p class="note">Automatisch folgt der Einstellung deines Geräts.</p>
    <div class="group-label">Tour planen</div>
    <div class="set-group"><div class="set-row"><div class="t"><b>Aufenthaltsdauer planen</b><small>Pro Sidequest eine Dauer angeben, die Ankunftszeit rechnet sie mit ein</small></div>${sw('setStay', settings.stay, 'Aufenthaltsdauer planen')}</div></div>
    <div class="group-label">Suche</div>
    <div class="set-group">
      <div class="set-row"><div class="t"><b>Standard-Korridor</b><small>Wie weit Sidequests von der Route entfernt sein dürfen</small></div>
        <select id="setRadius" aria-label="Standard-Korridor">${[2, 5, 8, 10, 15, 20, 25].map(v => `<option value="${v}"${settings.radius === v ? ' selected' : ''}>${v} km</option>`).join('')}</select></div>
      <div class="set-row"><div class="t"><b>Nur Orte mit Namen</b><small>Blendet unbenannte Badestellen, Aussichtspunkte und Ähnliches aus</small></div>${sw('setNamed', settings.named, 'Nur Orte mit Namen')}</div>
    </div>
    <div class="group-label">Daten</div>
    <div class="set-group">
      <div class="set-row"><div class="t"><b>Kartendaten</b><small>OpenStreetMap, ${esc(meta)}</small></div></div>
      <div class="set-row"><div class="t"><b>Merkliste leeren</b><small>${Object.keys(state.favs).length} gemerkte Ziele auf diesem Gerät</small></div><button type="button" class="secondary-btn" style="flex:none;padding:0 14px" id="clearFavs">Leeren</button></div>
    </div>
    <p class="signature"><svg class="i" width="28" height="28" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#000"/><path d="M366 157 A148 148 0 1 0 366 355" fill="none" stroke="#C6FF3D" stroke-width="66"/><rect x="72" y="251" width="74" height="10" rx="5" fill="#5CE1FF"/></svg><span><b>Sidequest</b> by Cybershade</span></p>`;
}
$('settingsBody').addEventListener('click', e => {
  const th = e.target.closest('[data-theme-set]');
  if(th){ settings.theme = th.dataset.themeSet; saveSettings(); applyTheme(); renderSettings(); render(); return; }
  if(e.target.id === 'setStay'){ settings.stay = !settings.stay; saveSettings(); renderSettings(); renderTourbar(); return; }
  if(e.target.id === 'setNamed'){ settings.named = !settings.named; saveSettings(); renderSettings(); render(); return; }
  if(e.target.id === 'clearFavs' && Object.keys(state.favs).length && confirm('Alle gemerkten Ziele auf diesem Gerät löschen?')){ state.favs = {}; store.set('af-favs', {}); renderSettings(); render(); toast('Merkliste geleert'); }
});
$('settingsBody').addEventListener('change', e => {
  if(e.target.id === 'setRadius'){ settings.radius = +e.target.value; saveSettings(); if(!state.route){ state.radius = state.maxOff = settings.radius * 1000; } toast('Gilt ab der nächsten Routensuche'); }
});

// ===================== Teilen & Link =====================
function shareParams(withTips){
  const p = new URLSearchParams();
  p.set('s', state.stops.join('|')); p.set('r', (state.route?.radius || state.radius) / 1000);
  if(state.stopInfo.some(Boolean)) p.set('c', state.stopInfo.map(x => x ? x.p[0].toFixed(5) + ',' + x.p[1].toFixed(5) : '').join('|'));
  if(state.mains.size) p.set('m', [...state.mains].join(','));
  if(state.subs.size) p.set('u', [...state.subs].join(','));
  if(state.extras.size) p.set('x', [...state.extras].join(','));
  if(state.kw) p.set('k', state.kw);
  if(withTips){ const ids = Object.keys(state.favs).filter(id => state.byId.has(id)).slice(0, 40); if(ids.length) p.set('t', ids.join(',')); }
  if(state.tour.length) p.set('w', state.tour.join(','));
  return p;
}
const syncHash = () => history.replaceState(null, '', '#' + shareParams(false).toString());
function readHash(){
  const p = new URLSearchParams(location.hash.slice(1)); if(!p.get('s')) return false;
  state.stops = p.get('s').split('|');
  const cs = (p.get('c') || '').split('|');
  state.stopInfo = state.stops.map((label, i) => { const m = (cs[i] || '').split(',').map(Number); return m.length === 2 && m.every(Number.isFinite) ? {p: m, label, short: label.split(',')[0]} : null; });
  const r = +p.get('r'); if(r >= 2 && r <= 25) state.radius = state.maxOff = r * 1000;
  state.mains = new Set((p.get('m') || '').split(',').filter(id => state.MAIN.some(m => m.id === id)));
  if(p.has('u')) state.subs = new Set(p.get('u').split(','));
  if(p.has('x')) state.extras = new Set(p.get('x').split(','));
  if(p.has('k')) state.kw = p.get('k');
  if(p.has('t')) state.tips = new Set(p.get('t').split(','));
  if(p.has('w')) state.pendingTour = p.get('w').split(',');
  return true;
}
async function share(){
  const p = shareParams(true), url = location.origin + location.pathname + '#' + p.toString(), n = state.tour.length;
  const text = `Sidequest: Ausflugsziele von ${state.stops[0]} nach ${state.stops[state.stops.length-1]}${n ? `, Tour mit ${n} Sidequest${n > 1 ? 's' : ''}` : ''}`;
  try{ if(navigator.share) await navigator.share({title: 'Sidequest', text, url}); else{ await navigator.clipboard.writeText(url); toast('Link kopiert'); } }
  catch(e){ if(e.name !== 'AbortError') toast('Teilen nicht möglich'); }
}
$('shareBtn').addEventListener('click', share);

// ===================== Überrasch mich =====================
$('diceBtn').addEventListener('click', () => {
  const b = $('diceBtn'); b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll');
  if(!state.route){ toast('Plane zuerst eine Route, dann würfeln'); return; }
  const items = visible().filter(r => r.name); if(!items.length){ toast('Keine Ziele mit den aktuellen Filtern'); return; }
  let pick; do{ pick = items[Math.floor(Math.random() * items.length)]; }while(items.length > 1 && pick.id === state.lastSurprise);
  state.lastSurprise = pick.id;
  setTimeout(() => { map.flyTo([pick.lat, pick.lon], 12, {duration: reduceMotion ? 0 : 1}); openDetail(pick.id); }, reduceMotion ? 0 : 450);
});

// ===================== Klicks in Listen & Overlays =====================
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if(o){ openDetail(o.dataset.open); return; }
  const tr = e.target.closest('[data-tour]'); if(tr){ toggleTour(tr.dataset.tour); return; }
  const fv = e.target.closest('[data-fav]'); if(fv){ toggleFav(fv.dataset.fav); return; }
  if(e.target.closest('[data-open-tour]')){ openSheet('tourSheet'); return; }
  if(e.target.closest('[data-open-route]')){ openSheet('routeSheet'); return; }
  if(e.target.closest('[data-open-filter]')){ openSheet('filterSheet'); return; }
  if(e.target.closest('[data-open-install]')){ openSheet('installSheet'); return; }
  if(e.target.closest('[data-more]')){ showMore(); return; }
  if(e.target.closest('#gpxBtn')){ downloadGpx(); return; }
  if(e.target.closest('#tourShare')) share();
});

// ===================== Start =====================
(async function init(){
  paintIcons();
  try{ const r = await fetch('data/meta.json', {cache: 'no-store'}); if(r.ok){ state.meta = await r.json(); state.tileSet = new Set(state.meta.tiles); } }catch(e){}
  try{
    const r = await fetch('categories.json?v=' + enc(state.meta?.built || Date.now()), {cache: 'no-store'}); if(!r.ok) throw new Error();
    state.MAIN = (await r.json()).main;
    state.MAIN.forEach(m => m.subs.forEach(s => { s.m = m; state.SUB[s.id] = s; }));
    state.mains = new Set(state.MAIN.filter(m => m.on).map(m => m.id));
  }catch(e){ $('listSub').textContent = 'App-Dateien konnten nicht geladen werden. Läuft die Seite über eine Webadresse?'; return; }
  applyTheme();
  const fromLink = readHash();
  renderStops(); render(); setPanel(isNarrow() ? 'peek' : 'half');
  if(fromLink) search(); else openSheet('routeSheet');
  if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
