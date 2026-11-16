# Gerätetest: 3D-Medaille auf dem iPhone

Der iOS-Simulator emuliert OpenGL und ist für die 3D-Medaille nicht aussagekräftig. Dieser Test läuft auf einem echten iPhone – **ohne Netzwerk**: Die App wird als Release gebaut (JavaScript eingebettet), der Testbildschirm braucht weder API noch Anmeldung. API, Mock-Anmeldung und Datenbank bleiben auf dem Mac nur unter 127.0.0.1 erreichbar.

## Einmalig vorbereiten

1. **iPhone verbinden** (Kabel), entsperren, dem Mac vertrauen.
2. **Entwicklermodus** auf dem iPhone einschalten: Einstellungen → Datenschutz & Sicherheit → Entwicklermodus (Neustart nötig).
3. **Signierung in Xcode** (dein Apple-Account):
   - `apps/app/ios/BestBadges.xcworkspace` in Xcode öffnen
   - Ziel *BestBadges* → *Signing & Capabilities* → *Team* wählen
   - Meldet Xcode, die Bundle-ID sei vergeben: unter *Bundle Identifier* eine eigene setzen, z. B. `de.machmitgoslar.bestbadges.test`

## Bauen und installieren

```bash
cd apps/app
LANG=en_US.UTF-8 corepack pnpm exec expo run:ios --device --configuration Release
```

Expo fragt nach dem Gerät – dein iPhone wählen. Der erste Build dauert einige Minuten.

> Beim ersten Start meldet iOS evtl. „Nicht vertrauenswürdiger Entwickler“: Einstellungen → Allgemein → VPN und Geräteverwaltung → deinem Account vertrauen.

## Testen

1. Auf dem iPhone in **Safari** diese Adresse eingeben: `bestbadges://dev/medaille` → „Öffnen“.
2. Der Testbildschirm zeigt eine Medaille, darunter Auswahl und Messwerte.

| Was prüfen | Wie |
|---|---|
| Sichtbar? | Erscheint nach kurzer Zeit die 3D-Medaille (vorher kurz die 2D-Fassung)? |
| Ladezeit | „Erstes Bild nach … ms“ – Ziel unter 500 ms |
| Flüssig? | „… Bilder/s“ – Ziel 60 (ProMotion-Geräte bis 120) |
| Massiv? | Mit dem Finger kippen: Ist die Münzkante zu sehen, wandern Glanzlichter über das Metall? |
| Materialien | Gold, Silber, Bronze, Holz, Kristall, Emaille, Sammlung, Gesperrt durchschalten |
| Vergleich | Zwischen „3D nativ“ (expo-gl), „3D WebView“ (volle Browser-Qualität) und „2D“ wechseln – Aussehen, erstes Bild und Bildrate notieren |
| Seltenheit | Gewöhnlich, Selten, Episch, Legendär durchschalten |
| Fehlerbilder | Flackernde Flächen, Keile über dem Emblem, schwarze oder leere Fläche |

Die übrigen Bildschirme zeigen in diesem Build „Verbindung fehlgeschlagen“ – das ist erwartet (kein Netzwerk zum Mac).

## Danach

- **Entschieden (16.11.2026):** Die WebView-Fassung ist Standard für Detailseite, Erfolgsbildschirm und die 3D-Ansicht der Vitrine (iPhone: erstes Bild 333 ms, Wechsel 65 ms, 60 fps). Zum Vergleichen in `apps/app/.env` `EXPO_PUBLIC_BADGE_3D=gl` (expo-gl) oder `=2d` setzen.
- **Probleme:** Screenshot und die beiden Messwerte genügen für die Fehlersuche.

## WebView-Fassung

„3D WebView“ zeigt dieselbe 3D-Darstellung wie im Browser in einer eingebetteten Seite (offline, lädt nichts nach).
Die Seite (`apps/app/src/web3d/medal-html.generated.ts`) liegt nicht im Repository; sie entsteht bei `pnpm install` und bei `pnpm start`, `pnpm ios` und `pnpm typecheck` in `apps/app`. Nach Änderungen an `packages/badge-3d` von Hand neu erzeugen, wenn die App anders gestartet wird (z. B. `expo run:ios --device` oder ein Build aus Xcode):

```bash
corepack pnpm --filter @best-badges/badge-3d build:webview
```

### Ladezeiten der WebView

- **Vorwärmen beim App-Start:** Rund 1,5 s nach dem Start lädt `Medal3DPrewarm` unsichtbar die 3D-Seite und übersetzt die Shader aller Materialien. Danach verschwindet die WebView wieder (keine Bildschleife im Hintergrund). Das System behält seine Caches, die erste sichtbare Medaille startet danach ohne die Wartezeit des Kaltstarts.
- **Eine WebView pro Ansicht:** Ein Wechsel der Medaille schickt nur neue Daten hinein; das kostet im Browser 60–100 ms. Nach dem ersten Bild wärmt die Ansicht die übrigen Materialien vor.
- **Anzeige im Testbildschirm:** „Erstes Bild“ zählt jetzt aus Sicht der App ab dem Einblenden, also einschließlich Start der WebView. Dazu kommen „Wechsel“ und die Dauer des Vorwärmens. „WebView neu starten“ misst einen frischen Start bei warmen Caches.
- Die WebView läuft ohne `incognito`: Sonst bekommt jede WebView einen eigenen Datenspeicher und einen neuen Prozess. Die Seite speichert nichts und lädt nichts nach.
