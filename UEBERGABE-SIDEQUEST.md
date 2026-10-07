# Übergabe: Sidequest by Cybershade

**Startsatz für Claude Code:**
> Lies `CLAUDE.md` und `UEBERGABE-SIDEQUEST.md` in diesem Repo sowie `BRAND.md` aus dem Cybershade Kit, fass mir den aktuellen Stand in fünf Sätzen zusammen und schlag mir die nächsten drei sinnvollen Schritte vor. Ändere noch nichts.

Dieses Dokument fasst den Chat zusammen, in dem Sidequest entstanden ist: von der ersten Frage bis zum aktuellen Stand. Markenregeln stehen in `BRAND.md`, Architektur und Arbeitsregeln in `CLAUDE.md`.

---

## 1. Wie alles anfing

Ausgangspunkt war eine konkrete Frage: Was gibt es an Ausflugszielen auf einer Autostrecke quer durch Norddeutschland? Daraus entstand die Idee einer App, die das für beliebige Strecken herausfindet und nach Interessen filtert. Gesucht war ausdrücklich „was Spaßiges“: Spaßbad, interessante Minigolfanlage, Zoo und Ähnliches.

## 2. Entwicklung in Etappen

### Etappe 1: Eine einzelne HTML-Datei
- Erster Prototyp als eine Datei mit Leaflet, Ortssuche über Nominatim, Route über OSRM und Ausflugsziele über die **Overpass API** (Live-Abfragen an OpenStreetMap).
- Kategorien wurden schnell zu drei Stufen umgebaut, auf Melvins Wunsch: **Oberkategorie** (Action, Kultur …), **Unterkategorie** (Kartbahn, Museum …) und **Extras** (drinnen, draußen, hundefreundlich …). Später kam seine Idee dazu, die Unterkategorien aus den tatsächlichen Treffern zu füllen: Es erscheinen nur die, die es auf der Strecke gibt.

### Etappe 2: Kampf mit den öffentlichen Servern
Diese Phase hat am längsten gedauert und die wichtigste Architekturentscheidung ausgelöst.

| Problem | Ursache | Lösung damals |
|---|---|---|
| Keine Ergebnisse in der Claude-Vorschau | Vorschau sperrt externe Abfragen | Datei im echten Browser öffnen |
| Keine Ergebnisse am Handy aus dem Download-Ordner | Chrome blockiert Abfragen lokaler Dateien | über eine Webadresse (Netlify, später GitHub Pages) |
| overpass-api.de lehnt sofort ab | Anfragen aus dem Browser wurden ohne CORS-Antwort abgewiesen, obwohl Slots frei waren | alternative Server, Diagnose-Protokoll und Verbindungstest eingebaut |
| „Query timed out“ | Mustersuche über häufige Tags wie `sport` und `leisure` war zu teuer | exakte Tag-Abfragen, Strecke in Abschnitte mit Bounding-Box zerlegt |
| HTTP 504 und danach nur noch Netzwerkfehler | Fair-Use-Limit bei maps.mail.ru | Server-Gesundheit, Pausen mit Backoff, zweiter Durchgang, Cache pro Abschnitt |
| Lange Wartezeiten | tote Server wurden immer wieder versucht | tote Server für die Sitzung überspringen |

Ergebnis: Es lief, aber langsam und unzuverlässig, und für mehrere Nutzer wäre es nicht tragbar gewesen.

### Etappe 3: Eigene Daten statt Live-Abfragen (die Grundsatzentscheidung)
- **Entscheidung:** Die Ziele werden einmal pro Woche in GitHub Actions aus den Geofabrik-Auszügen vorberechnet (osmium tags-filter plus pyosmium) und als Kacheln im 0,5°-Raster statisch ausgeliefert. Die App lädt nur die Kacheln entlang der Route.
- **Begründung:** keine Rate-Limits, Ergebnisse in Sekunden, kostenlos, kein eigener Server, für beliebig viele Freunde tragbar.
- **Hosting:** GitHub Pages. Das Repo ist **öffentlich**, weil Pages im kostenlosen Konto nur so geht. Private Alternativen (GitHub Pro oder Cloudflare/Netlify mit Deploy aus Actions) wurden besprochen und verworfen, weil im Repo nichts Geheimes liegt.
- **Abdeckung:** zuerst ganz Deutschland, später alle neun Nachbarländer.
- **Kategorien in einer einzigen Datei** (`categories.json`) für Build und App, damit nichts auseinanderläuft.

### Etappe 4: Einrichtung ohne Git
- Melvin hatte kein Git. Erst sollte es am Handy laufen: Dafür gab es einen Trick, bei dem nur eine `projekt.zip` hochgeladen und die Workflow-Datei per Kopieren angelegt wird. Der Workflow entpackt die ZIP dann selbst (der Schritt steht noch in `build.yml`).
- Tatsächlich eingerichtet wurde es am PC per Web-Upload. Stolpersteine: Der Ordner `.github` wird im Explorer ausgeblendet und beim Upload nicht mitgenommen, deshalb wurde `build.yml` direkt in GitHub angelegt. Die `.gitignore` ist für diesen Weg verzichtbar.
- Vorbelegte persönliche Orte wurden durch leere Felder mit Platzhaltern ersetzt, weil das Repo öffentlich ist.
- Neue Kategorien wurden nicht angezeigt, weil `categories.json` aus dem Browser-Cache kam. Seitdem wird sie passend zum Datenstand und nie aus dem Cache geladen.

### Etappe 5: Funktionen
- **Neue Kategorien:** Einkaufen (Outlet-Center, Fabrikverkauf, Hofläden), Essen, Wellness, Natur, Skihalle, Abenteuerspielplatz. Outlets werden über den Namen erkannt, weil OSM dafür kein einheitliches Tag hat. Bekannte Grenze: Ein Laden ohne „Outlet“ im Namen fehlt (Beispiel EMP in Lingen, ungeprüft).
- **Detailansicht** mit Wikipedia-Beschreibung, Bild und 3-Tage-Wetter (Open-Meteo).
- **„Überrasch mich“**: zufälliges Ziel aus den aktuellen Filtern.
- **Tour:** Ziele per „+“ als Zwischenstopps aufnehmen, Route mit Umwegen neu berechnen, Zeitplan mit Ankunftszeiten. Export an Google Maps (höchstens 9 Zwischenziele pro Link, deshalb automatische Aufteilung in Teile) und als **GPX** für alle anderen Navi-Apps.
- **Merken und Tour wurden getrennt:** Stern = Merkliste „vielleicht mal“, Plus = tatsächliche Tour.
- **Teilen per Link** mit Route, Filtern, Tipps und Tour.
- **Nachbarländer:** Länder werden nacheinander geladen, damit nie mehr als ein großer Auszug auf der Platte liegt. Namensmuster wurden mehrsprachig erweitert, Wikipedia liefert bevorzugt die deutsche Beschreibung.

### Etappe 6: Neues Design und neue Bedienung
- Erst eine Modernisierung (Liste als Straßen-Zeitleiste, Route zeichnet sich animiert), danach eine richtige UX-Überarbeitung mit Entwürfen auf einer Design-Arbeitsfläche.
- Drei Stilrichtungen (Wegweiser, Ausflug-Pop, Nachtfahrt), dann drei Farbwelten. **Gewählt: D hell (Schwarz, Weiß, Rot) und F dunkel (Schwarz, Neongrün, Eisblau)** mit Umschalter Hell, Dunkel oder Automatisch. Feste Farbrollen: eine Farbe für Route und Filter, eine für alles in der Tour.
- **Karte zuerst** wie bei Google Maps: kompakte Kopfleiste, Ergebnisse im ziehbaren Sheet, Filter als Overlay statt eigener Ebene. Melvins Sorge vor zu vielen Bildschirmen führte genau zu dieser Lösung.
- **Filter-Knopf** sitzt im Ergebnis-Sheet statt frei schwebend unten rechts, weil er sonst die Liste oder Tour-Leiste verdecken würde.
- **Aufenthaltsdauer** ist standardmäßig aus, weil sie ohnehin unterschiedlich ist, und in den Einstellungen einschaltbar.
- **Kategoriefarben** auf Pins, Kacheln und Filtern, so gewählt, dass sie den reservierten Akzentfarben nicht in die Quere kommen.
- **Responsiv nach Breite, nicht nach Gerätetyp**, plus Unterscheidung Touch oder Maus.

### Etappe 7: Marke und Name
- Logo B gewählt: das Neon-„C“ mit dem App-Symbol in der Öffnung. Das reine Zeichen ist die Cybershade-Marke für alle künftigen Apps.
- Namenssystem: Begriffe aus der Gaming-Welt. Diese App heißt **Sidequest** (die Nebenmission auf dem Weg). Die Sorge, der Name sei zu abstrakt, wurde mit Linkvorschau, Begrüßungstext und Teilen-Text gelöst.
- Das Wort „Abstecher“ fand Melvin doof. Es wurde komplett durch „Sidequests“ und „Ausflugsziele“ ersetzt. Das Repo heißt inzwischen `sidequest`.

### Etappe 8: Erstes Feedback von Freunden
- **Restaurants** mit Filter nach Küche (13 Küchen plus „sonstige“). **Speisekarte** als direkter Link, wenn in OSM hinterlegt, sonst „Speisekarte suchen“. Dazu „Anrufen“.
- **Adressen statt Koordinaten:** Der Standort-Knopf schreibt die Adresse ins Startfeld, Suchbegriffe werden nach der Suche durch den gefundenen Ort ersetzt (aus „Bagger Platz Ems“ wird z. B. „Baggersee …, PLZ Ort“). Geteilte Links enthalten die genauen Koordinaten.
- **Roadmap aus sechs Feedbackpunkten**, umgesetzt in zwei Phasen:
  - **Extras nur passend zur Kategorie** („es gibt keine vegetarischen Gewässer“)
  - **Kinderfreundlich und Außenbereich** bei Restaurants
  - **Seen** ab 5 Hektar, benannt, ohne Flüsse und Teiche
  - **Performance:** Canvas-Ebene für alle Pins, Liste stückweise, Raster für die Entfernungsberechnung, SVG-Sprite für Symbole. Gemessen bei 6.000 Treffern und 4-facher CPU-Drosselung: Neuaufbau von 519 auf 101 ms, Filterwechsel von 508 auf 76 ms, null Ruckler beim Scrollen.
  - **Mehr Ergebnisse:** Hinweis mit automatisch geöffnetem Filter erst ab 1000 statt 300 Treffern
  - **Bündelung** beim Rauszoomen, Größe nach Anzahl, Ring in Kategoriefarben, überlappende Bündel werden zusammengelegt
  - **Galerie** aus Wikimedia Commons inklusive Umkreissuche nach geotaggten Fotos
  - **Installationsanleitung** passend zu Gerät und Browser, mit „Jetzt installieren“, wo der Browser es erlaubt

## 3. Entscheidungen auf einen Blick

| Entscheidung | Begründung |
|---|---|
| Vorberechnete OSM-Kacheln statt Overpass | keine Rate-Limits, schnell, kostenlos, skaliert für Freunde |
| GitHub Pages, öffentliches Repo | kostenlos, nichts Geheimes im Repo |
| Keine API-Schlüssel, Freunde brauchen keinen eigenen | öffentliches Repo, null Einstiegshürde |
| Bewertungen nur als kostenloser Link zu Google | Google Places kostet und braucht einen Schlüssel, Tripadvisor ebenso |
| Mapillary verworfen | Commons-Umkreissuche deckt das ohne Schlüssel ab |
| Hell D und Dunkel F mit Umschalter | Melvin mochte beide, gleiche Struktur, nur zweiter Farbsatz |
| Karte zuerst, Filter als Overlay | weniger Scrollen, keine zusätzliche Navigationsebene |
| Aufenthaltsdauer optional | ist pro Person verschieden, sonst Ballast |
| Restaurants in „Essen & Trinken“ statt eigener Oberkategorie | eine Farbe für Essen, Küchen als Unterkategorien |
| Extras mit Kategorie-Zuordnung | sinnvolle Filter, keine Seiteneffekte auf andere Kategorien |
| Umweg in Minuten als Schätzung | echte Werte für jedes Ziel wären zu viele Routing-Abfragen |
| Name „Sidequest“, Gaming-Begriffe als System | Wiedererkennung über alle Cybershade-Apps |

## 4. Aktueller Stand

Live auf GitHub Pages, eingerichtet per Web-Upload, wöchentlicher Datenbau für zehn Länder.

Funktionen: Route mit Zwischenstopps und Standort, Adressanzeige, Korridor 2 bis 25 km, neun Oberkategorien mit Unterkategorien und kategoriebezogenen Extras, Restaurants nach Küche, Seen, Liste als Strecke, Bündelung auf der Karte, Detailansicht mit Galerie, Beschreibung, Wetter, Infos, Google-Bewertungslink, Speisekarte und Anrufen, Merkliste, Tour mit Zeitplan und Export (Google Maps, GPX), Teilen per Link, „Überrasch mich“, Einstellungen, Hell- und Dunkel-Theme, PWA mit Installationsanleitung.

Bekannte Grenzen:
- Unterkategorien, die über den Namen erkannt werden (Wildpark, Outlet, Fabrikverkauf), greifen im Ausland schwächer.
- Umkreisfotos zeigen gelegentlich die Nachbarschaft statt das Ziel.
- Extras wie „hundefreundlich“ oder „kinderfreundlich“ sind in OSM lückenhaft gepflegt.
- Umweg-Minuten in der Liste sind geschätzt.
- `style.css` definiert die Farb-Tokens noch selbst und nutzt `cybershade.css` aus dem Kit noch nicht.

## 5. Offene Ideen nach Priorität

1. **Update-Hinweis mit Changelog:** nur nach einem neuen Commit und nur einmal pro Nutzer, mit Übersicht, was sich geändert hat. Bewusst vertagt, bis ein Changelog-Format steht.
2. **Bereich „Datenquellen“ in den Einstellungen** mit Lizenzen und Links (OSM/ODbL, Open-Meteo, Wikipedia-Texte, Commons). Ist für saubere Namensnennung eigentlich fällig.
3. **Abgleich mit dem Cybershade Kit:** Tokens und Grundstile aus `cybershade.css` übernehmen, App-spezifisches in `style.css` belassen.
4. **„Geöffnet bei Ankunft“:** Öffnungszeiten anhand der geplanten Ankunft prüfen (braucht einen opening_hours-Parser).
5. **Echte Umweg-Minuten** für die gerade sichtbaren oder gemerkten Ziele über die OSRM-Table-API, statt nur geschätzt.
6. **Rundtour:** Start gleich Ziel, „was gibt es im Umkreis von 50 km“.
7. **E-Auto-Ladestationen und Rastplätze** als Kategorie, kombinierbar mit Sidequests in der Nähe.
8. **Lieblingsfilter speichern**, z. B. „Familientag“ oder „Regenwetter“.
9. **Gemeinsam planen:** Freunde stimmen per Link über Ziele ab. Bräuchte einen kleinen kostenlosen Server oder eine Datenbank.
10. **Bewertungen per API:** nur, wenn sich die Haltung zu Kosten und Schlüsseln ändert, dann ausschließlich über einen Zwischenserver.

Aufräumen bei Gelegenheit: den Schritt „Projekt-ZIP entpacken“ aus `build.yml` entfernen. `app.js` ist eine große Datei; Aufteilen nur, wenn es die Arbeit wirklich erleichtert.
