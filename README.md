# Abstecher-Finder

Findet Freizeitparks, Spaßbäder, Zoos, Museen & Co. entlang einer Route in Deutschland.
Statische Web-App (läuft kostenlos auf GitHub Pages), installierbar am Handy, mit Merkliste,
Zwischenstopps und Teilen per Link.

## So funktioniert's

- **Daten:** Ein GitHub-Action-Job lädt jeden Montag den Deutschland-Auszug von OpenStreetMap
  (Geofabrik), filtert die Attraktionen heraus und legt sie als kleine Kacheln (0,5° Raster) ab.
  Die App lädt nur die Kacheln entlang der Route – kein Overpass, kein Rate-Limit.
- **Route:** öffentlicher OSRM-Dienst, Ortssuche über Photon.
- **Kategorien:** stehen ausschließlich in `web/categories.json` und gelten für Build und App.

## Einrichten am PC (einmalig, ca. 20 Minuten)

1. **ZIP entpacken.** Du bekommst den Ordner `abstecher-finder` mit `.github`, `scripts`, `web`,
   `README.md` und `.gitignore`.
2. **Repository anlegen:** github.com → **+ → New repository** → Name `abstecher-finder`,
   **Public**, *keine* Haken bei README, .gitignore oder Lizenz → **Create repository**.
3. **Pages einschalten:** Im Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Dateien hochladen** – eine der beiden Varianten:
   - **Mit Git** (empfohlen), im Ordner `abstecher-finder` ein Terminal öffnen:
     ```bash
     git init
     git add .
     git commit -m "Abstecher-Finder"
     git branch -M main
     git remote add origin https://github.com/DEIN-NAME/abstecher-finder.git
     git push -u origin main
     ```
   - **Über die Weboberfläche:** im leeren Repo auf *uploading an existing file* klicken und den
     **Inhalt** des Ordners `abstecher-finder` (nicht den Ordner selbst) hineinziehen → **Commit changes**.
     Der Ordner `.github` muss mit! Unter macOS blendet der Finder ihn aus – mit `Cmd + Shift + .`
     sichtbar machen. Unter Windows ist er normalerweise sichtbar.
5. **Kontrolle:** Im Repo liegen `.github`, `scripts`, `web`, `.gitignore`, `README.md`.
6. **Zuschauen:** Der Upload startet den Workflow automatisch (Tab **Actions**). Der erste Lauf dauert
   ca. 10–15 Minuten (4 GB Download + Filtern), spätere Änderungen 1–2 Minuten.
   Falls nichts startet: **Actions → „Daten bauen und veröffentlichen“ → Run workflow**.
7. **Fertig:** Die App läuft unter `https://DEIN-NAME.github.io/abstecher-finder/`
   (Link steht auch im Workflow-Lauf und unter Settings → Pages).
   Am Handy im Browser-Menü „Zum Startbildschirm hinzufügen“ – dann verhält sie sich wie eine App.

Wird ein Lauf rot: auf den fehlgeschlagenen Schritt klicken und die Fehlermeldung ansehen.

## Anpassen

- **Kategorien ändern/ergänzen:** `web/categories.json` bearbeiten und pushen. Der Workflow baut die
  Daten automatisch neu. Felder: `q` = OSM-Tags, `need` = Zusatzbedingung (eine reicht:
  Tag-Wert, vorhandenes Tag oder Namensmuster), `place` = `in`/`out`.
  Speziellere Unterkategorien müssen vor allgemeineren stehen (z. B. „Wildpark“ vor „Zoo“).
- **Datenstand:** wird in der App oben angezeigt. Manuell aktualisieren über *Run workflow*.

## Lokal testen

Die App muss über eine Webadresse laufen, nicht als Datei:
```bash
# Daten für ein Bundesland bauen (schneller als ganz Deutschland)
curl -LO https://download.geofabrik.de/europe/germany/niedersachsen-latest.osm.pbf
osmium tags-filter niedersachsen-latest.osm.pbf $(python3 scripts/build_pois.py --filter web/categories.json) -o filtered.osm.pbf
pip install osmium
python3 scripts/build_pois.py web/categories.json filtered.osm.pbf web/data
python3 -m http.server -d web 8000   # → http://localhost:8000
```

## Fair Use

OSRM-Demoserver, Photon und die OSM-Kartenkacheln sind kostenlose Gemeinschaftsdienste.
Für dich und deine Freunde passt das gut; für eine große öffentliche App sollte man eigene
Dienste oder kommerzielle Anbieter einsetzen.
