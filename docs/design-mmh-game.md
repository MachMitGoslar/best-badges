# Design: „MMH Game“

Best Badges nutzt das Designsystem des MachMit!Haus (MMH) und erweitert es um eine dunkle Fassung und eine Spiel-Ebene. Alle Werte liegen in **`packages/design-tokens`** – eine Quelle für App, Verwaltung und Badge-Renderer.

## Drei Ebenen

| Ebene | Datei | Inhalt |
|---|---|---|
| **MMH-Skalen** | `src/mmh.ts` | Die Originalskalen (Dead Pixel, Ripe Mango, Cornflower, Ferocious, Pastel Green, Violaceous Greti, Lager) mit 15 Stufen, Schrift Inter. Nichts erfunden. |
| **MMH Dark** | `src/game.ts` → `dark` | Dunkles Layout aus denselben Skalen: Seite Dead Pixel 1500, Karte 1400, Text 100/500. Marke Ripe Mango 700 mit Text in Ripe Mango 1400 (wie im hellen MMH). |
| **Game** | `src/game.ts` → `game` | Kaffee-Verlauf (Dead Pixel 1500 → Ripe Mango 1500 → Karamell), Nebel-Schein (Greti 1000, transparent), Gold-Glühen (Mango 700), warme Panels, Seltenheitsfarben, Fortschrittsbalken. |

Kontraste sind getestet (`tokens.test.ts`, WCAG AA für Text).

## Regeln aus dem MMH-System, die gelten

- Nur Inter. In der App feste Schnitte (`Inter_400Regular` … `Inter_800ExtraBold`), weil React Native pro Schnitt eine Familie braucht.
- Feather-Icons (Web: Strich 1,75; App: `@expo/vector-icons/Feather`). Keine Emoji in der Oberfläche.
- Schaltflächen als Pille, Karten mit Radius 8 (App 12 für Touch-Kacheln).
- Ansprache „du“, Handlungsaufrufe als Infinitiv („Abzeichen gestalten“, „Mit Goslar ID anmelden“).
- „MachMit!Haus“ immer genau so. Wortmarke `machmit-logo.svg`, Text für dunklen Grund weiß.

## Was „Game“ ausmacht

- **Bühne statt Fläche:** Verlauf von Schwarz zu Kaffee und Karamell – Ripe Mango in seinen tiefsten Stufen, also die Markenfarbe selbst – mit violettem Nebel in der Bildmitte. (Anfangs Cornflower-Blau; das passte nicht zur gelben Marke.) Der Schein berührt weder Kopf- noch Tab-Leiste, sonst entsteht eine harte Kante.
- **Gold heißt Belohnung:** Ripe Mango ist für primäre Aktionen, Fortschritt und Zahlen reserviert, mit weichem Glühen (`glowSoft`).
- **Seltenheit:** gewöhnlich Dead Pixel 500, selten Cornflower 600, episch Greti 700, legendär Mango 700 – gleich in Renderer, App und Verwaltung.
- **Bewegung:** Abzeichen wippen und glänzen (Reanimated), beim Einlösen Konfetti in MMH-Farben.

## Sammel-Abzeichen (Kombinationen)

Kombinationen haben einen eigenen Rahmen: Onyx (Dead Pixel 900 → Schwarz) mit Goldkante. Am Rand sitzen so viele Kristalle, wie Teile nötig sind (N von M → N Kristalle). Gesammelte Teile leuchten violett (Greti), offene sind leere Fassungen. Ist die Kombination vollständig, kommt ein goldener Kranz mit violettem Saum dazu. Renderer-Option `gems: { total, filled }`.

## 3D-Medaille

Große Ansichten (Editor-Vorschau, Detailseite, Erfolgsbildschirm) zeigen die Medaille als echtes 3D-Objekt (`packages/badge-3d`, three.js). Stand: im Web (Verwaltung, App-Web) direkt im Canvas; in der nativen App in einer offline eingebetteten WebView mit voller Qualität (`Badge3DWebView`, beim App-Start vorgewärmt). Die Vitrine im Profil bleibt 2D, Antippen (im eigenen Profil langes Drücken) öffnet die Medaille in 3D. `Badge3DGL` (expo-gl) bleibt zum Vergleich (`EXPO_PUBLIC_BADGE_3D=gl`).

- massiver, gewellter Körper mit abgerundeter Münzkante, erhabener Rahmenring, leicht vertiefte Emblemfläche
- physikalische Materialien je Stufe: Holz matt, Bronze/Silber/Gold metallisch mit Spiegelungen, Kristall schillernd, Emaille mit dezentem Lack; Sammel-Abzeichen Onyx
- Licht: Umgebungsspiegelung, warmes Hauptlicht, violettes Kantenlicht (passend zum Nebel)
- Bewegung mit Masse: Federdämpfung statt linearer Drehung, leichtes Schweben, Schwung beim Erhalt

Die Bildinformation ist dieselbe SVG wie in 2D (`renderBadgeSvg(spec, { face: true })` – ohne gemalte Glanzlichter, die übernimmt echtes Licht). Raster und Kacheln bleiben 2D: viele WebGL-Ansichten gleichzeitig kosten Leistung und Akku.

## Paletten der Abzeichen

Die 13 Abzeichen-Paletten (`packages/badge-spec/src/palettes.ts`) sind aus den MMH-Skalen abgeleitet; jede nennt ihre Skala (`scale`). Die IDs sind unverändert, gespeicherte Abzeichen bleiben gültig. „mango“ heißt jetzt „MachMit!-Gelb“, neu ist „lager“.

Materialien (Holz, Bronze, Silber, Gold, Kristall) kommen ebenfalls aus den Skalen: Gold aus Ripe Mango, Kristall aus Cornflower, Greti und Mango.

## Verwendung

- **Verwaltung:** `pnpm --filter @best-badges/design-tokens gen:css` schreibt `apps/manage/src/tokens.css` (CSS-Variablen `--bg-page`, `--brand`, `--game-*`, `--rarity-*`, `--mmh-<skala>-<stufe>`). Nach Änderungen an den Tokens neu erzeugen.
- **App:** `apps/app/src/theme.ts` liest die Tokens direkt. Hintergrund `NightSky` (Skia, Web-Variante mit CSS-Verlauf).
- **Renderer:** `badge-render` importiert `game.rarity` und die Skalen.
