# Cybershade – Markenstandards

Gilt für alle Cybershade-Apps (aktuell **Sidequest** und **Skill Tree**). Gleiche Datei in jedem Repo.

## Name und Auftritt

- Marke: **Cybershade**. Apps heißen „<Name> by Cybershade“.
- Namensregel: App-Namen sind **Gaming-Begriffe** (Sidequest, Skill Tree …).
- Sprache der Apps: Deutsch, locker und direkt.

## Logo

- Grundzeichen: neongrünes **C** mit schraffiertem Schatten in der unteren Hälfte und eisblauem Schlitz links.
- Jede App setzt ihr **Symbol in die Öffnung des C** (Sidequest: Standort-Nadel, Skill Tree: kleiner Skill-Baum mit offenem nächsten Knoten), Symbol in Eisblau.
- App-Icon: schwarzer Grund, abgerundetes Quadrat; Maskable-Variante mit Sicherheitsabstand (Inhalt ca. 80 %).
- Helle Oberflächen: C in Schwarz, Akzente in Rot.

## Farben

| Rolle | Dunkel | Hell |
|---|---|---|
| Hintergrund | `#000000` | `#FFFFFF` |
| Fläche | `#0F1012` | `#F5F5F5` |
| Text | `#F4F6F0` | `#0A0A0A` |
| Aktion / Primär | Neongrün `#C6FF3D` (Schrift darauf schwarz) | Rot `#E3192C` (Schrift darauf weiß) |
| Akzent | Eisblau `#5CE1FF` | Rot `#E3192C` |
| Richtig | Neongrün | Schwarz mit Haken |
| Falsch | Orange `#FF8A3D` | Rot mit × |

- Neongrün nie als Schriftfarbe auf Weiß. Bedeutung nie nur über Farbe transportieren (Symbol oder Text dazu).
- Schraffur (diagonale Streifen) als Wiedererkennungsmerkmal, z. B. in Fortschrittsbalken und Kartenecken.

## Schrift

- Überschriften: **Archivo** (variabel, Breite 62–125 %, Stärke 100–900), breit gestellt (`font-stretch` ca. 110–118 %).
- Fließtext: **Atkinson Hyperlegible** (Skill Tree) – sehr gut lesbar.
- Beide unter SIL Open Font License 1.1: frei nutzbar, auch kommerziell. Lizenzdatei neben den Schriftdateien mitliefern.
- **Schriften immer lokal einbinden**, nie von Google Fonts laden (IP-Übertragung an Google, DSGVO-Abmahnrisiko). Quelle für Dateien: Fontsource-Pakete auf npm.

## Technik und Datenschutz

- Hosting: GitHub Pages, Deploy über GitHub Actions.
- Keine API-Keys, Tokens oder persönlichen Daten in Repos – Pages-Seiten sind öffentlich erreichbar.
- Keine Firmen- oder Kundennamen aus Melvins Arbeit in Apps oder Repos.
- Apps, die mit Freunden geteilt werden (Sidequest), dürfen keinen eigenen API-Key der Nutzer voraussetzen.
- Installierbar als PWA (Manifest, Service Worker, Icons in allen Größen).
