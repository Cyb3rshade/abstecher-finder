# CLAUDE.md – Sidequest by Cybershade

Arbeitsanweisungen für Claude Code in diesem Repo. Die Entstehungsgeschichte und alle Entscheidungen stehen in `UEBERGABE-SIDEQUEST.md`.

Gemeinsame Regeln: `../../CLAUDE.md` und `../../ARCHITEKTUR.md` (Cybershade Workspace, Repo `cybershade-kit`, diese App liegt dort unter `apps/sidequest/`).

## Ziel und Zielgruppe

Sidequest findet Ausflugsziele entlang einer Autoroute: Start und Ziel (plus Zwischenstopps) eingeben, die App zeigt Freizeitparks, Spaßbäder, Zoos, Seen, Burgen, Restaurants und mehr in einem Korridor um die Strecke. Gefundene Ziele lassen sich filtern, merken, als Zwischenstopps zu einer Tour hinzufügen und an Google Maps oder als GPX exportieren.

Zielgruppe: Melvin (Cybershade) und seine Freunde. Nutzung gleich viel am Handy und am Rechner, installierbar als PWA. Abdeckung: Deutschland plus alle neun Nachbarländer.

## Marke

Name, Logo, Farben, Schrift und Tonalität stehen im gemeinsamen Cybershade Kit: `BRAND.md`, `STYLEGUIDE.md`, `cybershade.css`. Dort nachlesen, nicht hier duplizieren. App-spezifisch: Das App-Symbol in der Öffnung des „C“ ist eine Standort-Nadel.

## Dateien und Architektur

Statische Web-App ohne Build-Schritt und ohne Framework. Daten werden wöchentlich in GitHub Actions vorberechnet.

```
.github/workflows/build.yml   Datenbau + Deploy auf GitHub Pages
scripts/build_pois.py         OSM-Auszug → Kacheln mit Zielen
web/                          wird 1:1 veröffentlicht
  index.html                  Gerüst: Kopfleiste, Karte, Panel, Overlays (Sheets)
  app.js                      gesamte App-Logik, in kommentierte Abschnitte gegliedert
  style.css                   Themes, Layouts, Komponenten
  categories.json             EINZIGE Quelle für Kategorien (Build und App)
  sw.js                       Service Worker (Offline-Cache, Cache-Name mit __BUILD__)
  manifest.webmanifest        PWA-Manifest
  icon*.png, icon.svg, apple-touch-icon.png, favicon-32.png
  fonts/                      Archivo (variabel, latin + latin-ext), lokal, mit OFL-Lizenz
  vendor/leaflet/             Leaflet 1.9.4 (BSD-2, Lizenzdatei dabei), lokal statt CDN
  data/                       entsteht erst im Workflow, nicht im Repo (.gitignore)
    meta.json                 {built, count, tileSize, tiles}
    tiles/<i>_<j>.json        0,5°-Raster: i = floor(lat*2), j = floor(lon*2)
```

### Datenbau (`scripts/build_pois.py`, `build.yml`)
- `python3 scripts/build_pois.py --filter web/categories.json` gibt die `osmium tags-filter`-Ausdrücke aus.
- `python3 scripts/build_pois.py web/categories.json gefiltert.osm.pbf web/data` klassifiziert und schreibt die Kacheln.
- Kachel-Eintrag: `[id, lat, lon, unterkategorie, {tags}]`. Behaltene Tags stehen in `KEEP`. Neue Tags, die die App braucht, dort ergänzen.
- Flächen bekommen ein Pseudo-Tag `_area` in m² (für `min_area`, z. B. Seen).
- Workflow: Länder aus `COUNTRIES` nacheinander von Geofabrik laden, sofort filtern, zusammenführen (`osmium merge`), danach mit `osmium time-filter` auf die jeweils neueste Version je Objekt bringen (Grenzobjekte stehen sonst doppelt in verschiedenen Versionen, der Kachelbau bricht mit „Way ID twice in input“ ab), Kacheln bauen, `web/` deployen. Der gefilterte Auszug wird pro Kalenderwoche gecacht. Der Cache-Schlüssel enthält den Hash von `categories.json` und `build.yml`: Ändert sich eins davon, wird komplett neu geladen (ca. 30–45 min), sonst dauert ein Deploy wenige Minuten.

### App (`web/app.js`)
- Zustand in einem Objekt `state`. Einstellungen in `settings`. Persistiert in `localStorage`: `af-settings`, `af-favs` (Merkliste), `af-plan` (Abfahrt, Aufenthaltsdauern).
- Ablauf einer Suche: Orte per Photon auflösen (Koordinaten und lesbare Bezeichnung landen in `state.stopInfo`), Route per OSRM, nötige Kacheln aus dem Korridor bestimmen, laden, pro Ziel den nächsten Routenpunkt über ein Raster suchen (`near()`), Abstand und Streckenkilometer berechnen.
- Umweg-Minuten in der Liste sind eine Schätzung (`detourMin`: hin und zurück, Straßenfaktor 1,3, 55 km/h). Echte Fahrzeiten gibt es nur in der Tour (OSRM mit allen Wegpunkten).
- Karte: Leaflet mit `preferCanvas`. Alle Ziele zeichnet eine eigene Canvas-Ebene `PoiLayer` in einem Durchgang, inklusive Bündelung unter Zoom 13 (Raster 62 px, überlappende Bündel werden zusammengelegt, Radius wächst mit `log2(n)`, Ring zeigt Kategorieanteile). Klick und Hover laufen über `_nearest()`. Tour-Ziele und das aktive Ziel werden nie gebündelt.
- Liste: baut 150 Einträge, hängt beim Scrollen weitere 150 an (IntersectionObserver). `.hit` nutzt `content-visibility:auto`. Symbole kommen aus einem SVG-Sprite (`<use href="#i-…">`), nicht inline.
- Ab `LIST_LIMIT` (1000) Treffern: Hinweis im Listenkopf, Toast und automatisch geöffneter Filter.
- Overlays: `routeSheet`, `filterSheet`, `detailSheet`, `tourSheet`, `settingsSheet`, `installSheet`. Immer nur eins offen (`openSheet`/`closeSheet`).
- Layout nach Breite, nicht nach Gerät: unter 760 px Karte vollflächig mit ziehbarem Panel (peek/half/full), ab 760 px Liste links und Karte rechts, ab 1100 px zusätzlich Kategorie-Chips sichtbar. `(hover:hover)` steuert Hover-Effekte und Tooltips.
- Themes: `data-theme="light"|"dark"` auf `<html>`, Einstellung Hell, Dunkel oder Automatisch. Kartenkacheln werden per CSS-Filter grau bzw. dunkel. Kategoriefarben als `--c-<oberkategorie>` (Schrift darauf `--o-<…>`).
- Teilen per URL-Hash: `s` Stopps, `c` Koordinaten, `r` Korridor, `m` Oberkategorien, `u` Unterkategorien, `x` Extras, `k` Stichwort, `t` Tipps (Merkliste), `w` Tour.
- Service Worker: App-Dateien netzwerk-zuerst, Kacheln cache-zuerst (URL mit `?v=<built>`), `meta.json` und `categories.json` nie aus dem Cache. Der Cache-Name `af-shell-__BUILD__` wird im Deploy gestempelt (nie von Hand hochzählen), beim Aktivieren löscht der Service Worker alte `af-shell-*`-Caches. Neue Dateien, die offline gebraucht werden, in `FILES` in `sw.js` eintragen.

## Datenquellen und APIs

Alle ohne API-Schlüssel.

| Zweck | Quelle |
|---|---|
| Ziele und Infos | OpenStreetMap über Geofabrik-Auszüge (wöchentlich) |
| Kartenhintergrund | tile.openstreetmap.org |
| Ortssuche, Vorschläge, Adresse zum Standort | Photon (photon.komoot.io, `/api` und `/reverse`) |
| Route und Fahrzeiten | OSRM-Demoserver (router.project-osrm.org) |
| Wikipedia-Verknüpfung, Hauptbild, Bildersammlung | Wikidata (P18, P373, Sitelinks, bevorzugt dewiki) |
| Kurzbeschreibung | Wikipedia REST API (`/page/summary`) |
| Galerie | Wikimedia Commons (Hauptbild, Kategorie, Umkreissuche `geosearch`), mit Fotograf und Lizenz im Bild |
| Wetter | Open-Meteo |
| Nur verlinkt | Google Maps (Navigation, „Bewertungen auf Google“, „Speisekarte suchen“) |

Nicht mehr verwenden: Overpass API (Rate-Limits, Timeouts), Nominatim. OSRM, Photon und die OSM-Kacheln sind Gemeinschaftsdienste mit Fair-Use-Regeln: keine Massenabfragen, Daten nur beim Öffnen eines Ziels laden, nicht für die ganze Liste.

## Kategorien und Filterlogik

`web/categories.json` ist die einzige Quelle. Aufbau: Oberkategorie (`id`, `label`, `on` = standardmäßig aktiv) mit Unterkategorien:
- `q`: OSM-Tags, die abgefragt werden (`[key, value]`, Werte mit Semikolon-Listen zählen)
- `need`: zusätzliche Bedingungen, **eine** reicht: `{"tag", "in"}`, `{"has"}`, `{"name": regex}`
- `exclude`: Ausschluss bei diesen Tag-Werten
- `named`: nur Orte mit Namen
- `min_area`: Mindestfläche in m² (nur Flächen)
- `place`: `in` oder `out` für Drinnen/Draußen, sonst Heuristik

**Reihenfolge zählt:** Das erste passende Element gewinnt, speziellere Unterkategorien und Oberkategorien gehören nach vorn (Wildpark vor Zoo, Wellness vor Wasser wegen Thermen, Ausflugscafé vor den Restaurant-Küchen, `r_other` ganz ans Ende). Namensmuster sind mehrsprachig für die Nachbarländer.

Oberkategorien: Action, Spiel & Spaß, Wellness, Wasser, Tiere, Natur, Kultur, Essen & Trinken (inklusive Restaurants nach Küche `r_*`), Einkaufen. Standardmäßig aktiv: Action, Spiel & Spaß, Wasser, Tiere.

Filter in der App:
- Oberkategorien: keine gewählt = alle.
- Unterkategorien: innerhalb einer Oberkategorie, keine gewählt = alle dieser Oberkategorie. Nach der Suche nur die mit Treffern, nach Anzahl sortiert.
- Extras (`EXTRAS` in `app.js`) haben `cats`: Ein Extra filtert **nur innerhalb seiner Kategorien**, alle anderen Ziele bleiben unberührt (keine vegetarischen Gewässer). Im Filter erscheinen nur Extras, die zu den gewählten Kategorien passen und nach der Suche Treffer haben. Wird eine Kategorie abgewählt, schalten sich ihre Extras ab. Drinnen und Draußen schließen sich gegenseitig aus.
- Dazu: Abstand zur Route, Namenssuche, Einstellung „Nur Orte mit Namen“.
- Die Kategoriefarbe einer neuen Oberkategorie muss in `style.css` für beide Themes als `--c-<id>`/`--o-<id>` ergänzt werden, das Symbol in `MAIN_ICON`.

## Regeln

- Kommunikation und Oberflächentexte auf Deutsch, Ton locker und direkt.
- Knapp und iterativ: kleine, überprüfbare Schritte statt großer Umbauten. Vorher kurz sagen, was geändert wird.
- **Keine API-Schlüssel im öffentlichen Repo**, auch nicht als GitHub-Secret, das im ausgelieferten Code landet. Freunde dürfen nie einen eigenen Schlüssel brauchen. Falls je ein Dienst mit Schlüssel nötig wird: nur über einen Zwischenserver (z. B. Cloudflare Worker), vorher mit Melvin abstimmen.
- In der Oberfläche nie das Wort „Abstecher“. Gefundene Ziele heißen „Sidequests“, in erklärenden Texten „Ausflugsziele“.
- Keine persönlichen Orte als Vorbelegung. Platzhalter bleiben „z. B. Hannover“ und „z. B. Köln“.
- Neue Daten nur aus kostenlosen, schlüsselfreien Quellen. Lizenzen beachten (Commons-Fotos immer mit Fotograf und Lizenz).
- Barrierefreiheit: echte Buttons, `aria-label` für Symbol-Knöpfe, Tippflächen mindestens 44 px, `prefers-reduced-motion` respektieren.
- Nichts von Dritten nachladen: Schriften und Bibliotheken liegen im Repo (`fonts/`, `vendor/`). Der Deploy bricht bei Google-Fonts- oder CDN-Adressen ab.
- Neue Datenquelle oder Bibliothek: Lizenz prüfen und in Einstellungen → „Datenquellen und Lizenzen“ ergänzen.

## Deploy

Push auf `main` startet `.github/workflows/build.yml`: Key-Scan, Syntax- und Strukturprüfung (JS, Manifest, `categories.json`, Python, keine externen Schrift-/CDN-Adressen), Kacheln bauen, Version stempeln, dann wird `web/` (als `_site/`) auf GitHub Pages veröffentlicht (`https://<nutzer>.github.io/sidequest/`). Zusätzlich läuft der Workflow jeden Montag um 03:00 UTC für frische OSM-Daten und lässt sich manuell starten (Run workflow).

Nach dem Deploy: GitHub Pages hält Dateien bis zu 10 Minuten im Cache. Installierte Apps einmal ganz schließen und neu öffnen. Icons und Namen auf dem iPhone-Homescreen aktualisieren sich nie von selbst.

## Testvorgehen

1. Syntax: `node --check web/app.js`
2. Lokal starten (nie als `file://`, sonst blockiert der Browser die Abfragen): `python3 -m http.server -d web 8000`
3. Testdaten:
   - klein und schnell: eine synthetische `.osm`-Datei mit den betroffenen Tags durch `build_pois.py` schicken und das Ergebnis prüfen (Klassifizierung, `KEEP`, `min_area`, `exclude`)
   - realistisch: einen kleinen Geofabrik-Auszug (z. B. Bremen) filtern und bauen
   - Last: künstliche Kacheln mit mehreren Tausend Zielen entlang einer Strecke erzeugen
4. Browser-Test mit Playwright: externe Dienste (Photon, OSRM, Open-Meteo, Wikipedia, Wikidata, Commons, Kartenkacheln) per Route-Interception mocken. Immer beide Größen (390 × 844 und 1440 × 900) und beide Themes prüfen, dazu Konsole ohne Fehler.
5. Performance: mit 4-facher CPU-Drosselung messen. Richtwerte bei 6.000 Treffern: Neuaufbau etwa 100 ms, Filterwechsel unter 100 ms, keine Aufgaben über 50 ms beim Scrollen.
6. Vor dem Commit: Neue Dateien in `FILES` (`sw.js`)? Neue Tags in `KEEP`? Kategoriefarbe und Symbol ergänzt? Neue Quelle in „Datenquellen und Lizenzen“?

## Offene Abweichungen von den gemeinsamen Regeln

- `web/style.css` definiert die Farb-Tokens noch selbst und nutzt `cybershade.css` aus dem Kit nicht. Schrittweise auf die Variablen aus dem Kit umstellen, App-Spezifisches (Kategoriefarben, Layout) bleibt in `style.css`.
- Offen aus der Übergabe: Update-Hinweis mit Changelog, „Geöffnet bei Ankunft“, echte Umweg-Minuten, Rundtour, Ladestationen, Lieblingsfilter.
