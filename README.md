# ᛉ Yggdrasil Defense — Mobile Edition

Ein Norse-Mythologie **Tower-Defense Roguelite**, gebaut nach dem Game Design Document
*„Yggdrasil Defense — Mobile Edition v1.0"*. Touch-optimierte PWA, offline spielbar,
läuft direkt im Browser und lässt sich „Zum Homescreen hinzufügen".

**▶️ Spielen:** einfach `index.html` öffnen (oder via GitHub Pages, siehe unten).

---

## 🎨 Grafik
Komplett **selbst gezeichnete Vektorgrafik** (keine Emoji) im UE5-inspirierten Look:
metallische Turm-Sprites mit rotierenden Läufen & Glow-Kernen, volumetrisch schattierte
Gegner, glühendes Spawn-Rift & Festung, additive Projektil-Bloom-Effekte, Ambient-Licht,
schattierte Felsen und cinematische Vignette. HUD-Icons als Inline-SVG, Runen als
prozedurale Sigille. Performance-optimiert (vorgerendertes Terrain + Sprite-Cache) für 60 FPS.

## 🎮 Was drin ist (aktueller Stand)

Dies ist der spielbare **Kern-Loop** — im GDD die Module **01–08**, dort als *„Spielbar!"* markiert:

| Modul | Feature | Status |
|-------|---------|--------|
| 01 Fundament | Canvas-Karte, Kamera, Retina/HiDPI, Portrait+Landscape | ✅ |
| 02 Touch-Input | Tap (bauen), Drag (Kamera), Pinch (Zoom), Haptik | ✅ |
| 03 Mobile HUD | Top-Statusbar, Turm-Auswahlleiste, Action-Buttons, Inspector-Sheet | ✅ |
| 04 Ressourcen | Gold-Ökonomie (Kills + Wellen-Bonus), kompakte Zahlen | ✅ |
| 05 Gebäude | Türme platzieren/upgraden/verkaufen, Pfad-Blockade-Schutz | ✅ |
| 06 Pathfinding | BFS-Flow-Field von der Basis — Gegner umlaufen deine Türme (Maze-Building) | ✅ |
| 07 Feinde & Wellen | 5 Gegnertypen, skalierende Wellen, Boss alle 5 Wellen, Welle-früh-starten | ✅ |
| 08 Türme & Kampf | 5 Turmtypen, 3 Ziel-Modi, Upgrades, Projektile, Splash & Slow | ✅ |
| 13 Roguelite-Loop | Runen-Wahl (1 von 3) nach jeder Welle, 14 Runen (Common/Rare/Legendary), Meta-Bestwert | ✅ |
| 12 Events & Wetter | 5 Wetterlagen (Frost/Sturm/Asche/Göttlich) mit Effekten & Partikeln, 14 Mid-Wave-Events | ✅ |
| 17 Schwierigkeit* | 3 Modi: Leicht / Normal / Ragnarök (Kern; Achievements/Game Center offen) | 🟡 |
| 15 Save & Settings | Auto-Save zwischen Wellen + „Fortsetzen", Settings-Sheet (Sound/Vibration/Sprache) | ✅ |
| 18 Audio* | Prozeduraler Web-Audio-Sound (Schuss/Treffer/Bau/Upgrade/Boss/Rune/Event …) | 🟡 |

### Türme
🏹 **Einherjar** (Bogen) · ᛟ **Runestein** (verlangsamt) · ⚡ **Walküre** (schnellfeuer) · 🔨 **Mjölnir** (Flächenschaden) · 🌈 **Bifröst** (Scharfschütze)

### Gegner
🧟 Draugr · 🪓 Berserker · 👹 Troll · 🐺 Helhound · 🐉 Jörmungandr (Boss)

---

## 📱 Steuerung

- **Tippen** auf ein freies Feld → gewählten Turm bauen
- **Tippen** auf einen Turm → Upgrade / Ziel-Modus / Verkaufen
- **Ziehen** (1 Finger) → Karte bewegen
- **Pinch** (2 Finger) → Zoom · Maus: Scrollrad zoomt, Ziehen bewegt
- **▶︎ Welle starten** · **⏸︎ Pause** · **1× / 2× / 3×** Geschwindigkeit

Gegner suchen sich per Flow-Field automatisch den kürzesten Weg zur Basis — mit Türmen
zwingst du sie durch dein Labyrinth. Ein Bau, der den **letzten** Weg blockieren würde,
wird abgelehnt.

---

## 🗺️ Roadmap (restliche GDD-Module)

Noch offen, modulweise erweiterbar: **10** Online-Coop (WebRTC P2P), **11** Fog of War & Minimap,
**14** Tech-Baum, **16** Capacitor App-Store-Build, **17** Achievements/Game Center
(Schwierigkeit steht bereits), **18** Balance-Politur (Sound steht bereits).
Das GDD (`docs/`) beschreibt jedes Modul.

---

## 🚀 Deploy als PWA (GitHub Pages)

1. Repo → **Settings → Pages** → Branch `main`, Ordner `/ (root)` → **Save**.
2. Nach ~1 Min ist das Spiel unter `https://<user>.github.io/yggdrasil-defense/` live.
3. Auf dem Handy im Browser öffnen → **„Zum Homescreen hinzufügen"** → läuft wie eine App, offline.

Kein Build-Schritt nötig — reines HTML/CSS/JS, ein Service Worker cached alles.

---

## 🧱 Technik

- **Canvas2D**, keine Frameworks, keine Dependencies.
- **Flow-Field-Pathfinding** (BFS von der Basis) statt teurem Per-Gegner-A*.
- **Pointer Events** mit Tap/Pan/Pinch-Erkennung.
- **PWA:** `manifest.webmanifest` + `sw.js` (cache-first, offline).
- Getestet headless (Playwright) auf mobilem Viewport, 60 FPS, fehlerfrei.

## 📄 Lizenz

MIT — siehe `LICENSE`.
