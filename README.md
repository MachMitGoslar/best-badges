# Best Badges

Sammelspiel für Goslar: Organisationen gestalten und vergeben Abzeichen, Bürgerinnen und Bürger sammeln sie in der App.
Konzept: [Architektur-Konzept](https://claude.ai/artifact/JLQ3bcAjBD2quuUVji4fjP) · Aufgaben: Vikunja-Projekt BBPOC

> Stand: lokaler Proof of Concept, noch nicht veröffentlicht.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `apps/api` | Badge-API (Hono, Node) |
| `apps/manage` | Verwaltungs-Website (React, Vite) mit BFF (Hono) |
| `apps/app` | Sammel-App (Expo, React Native, Skia) |
| `packages/badge-spec` | Schema des Abzeichen-Baukastens, Paletten, Icons |
| `packages/badge-render` | Spezifikation → SVG |
| `packages/api-client` | Aus OpenAPI generierter, typisierter Client |
| `dev/mock-hsp` | Ersatz für das HSP-Organisationsportal |
| `dev/mock-oidc` | Konfiguration des Ersatzes für die Goslar ID |

## Design

Oberfläche im Look „MMH Game“: MachMit!Haus-Designsystem in dunkler Fassung mit Spiel-Ebene. Alle Farben, Schriften und Radien kommen aus `packages/design-tokens`. Konzept: [docs/design-mmh-game.md](docs/design-mmh-game.md).

## Lokal starten

```bash
cp .env.example .env
pnpm install
pnpm dev:infra   # Postgres, Mock-OIDC, Mock-HSP (nur 127.0.0.1)
pnpm dev:api     # Badge-API auf http://127.0.0.1:3001 (wendet Migrationen beim Start an)
```

Verwaltung starten (BFF auf 5174, Oberfläche auf http://localhost:5173):

```bash
pnpm --filter @best-badges/manage dev
```

Die Verwaltung spricht nur mit ihrem BFF. Das BFF meldet per OIDC mit PKCE an, hält die Tokens serverseitig (Browser bekommt nur ein httpOnly-Cookie) und leitet `/api/*` an die Badge-API weiter.
API-Client neu erzeugen, wenn sich die API ändert: `pnpm --filter @best-badges/api-client generate`.

Sammel-App im iOS-Simulator (Development-Build, beim ersten Mal 10–20 Minuten):

```bash
cd apps/app && cp .env.example .env
LANG=en_US.UTF-8 pnpm exec expo run:ios --device "iPhone 17"   # baut und installiert die App
pnpm start                                                     # Metro-Bundler für spätere Starts
```

Hinweis: `patches/expo-modules-jsi@58.0.23.patch` umgeht einen Swift-6-Fehlalarm mit Xcode 26.3 (eine Zeile, Zeiger in Sendable-Hülle). Entfernen, sobald Expo das behebt.

Im Simulator gibt es keine Kamera: Codes lassen sich im Reiter „Scannen“ von Hand eingeben oder als Link `bestbadges://c/{token}` öffnen.

API-Doku (Swagger), zwei Fassungen:
- **Öffentlich** (App, Partner): http://127.0.0.1:3001/docs · http://127.0.0.1:3001/openapi.json – Entdecken, Einlösen, Sammlung, Profil, Integrationen. Versteckte Abzeichen erscheinen dort nur als `{ secret: true, id, orgId, hint }`.
- **Intern** (Verwaltung, Nachkontrolle): http://127.0.0.1:3001/internal/docs – in Produktion standardmäßig aus (`INTERNAL_DOCS`). Die Endpunkte sind unabhängig davon durch Anmeldung und Rechteprüfung geschützt.
Migrationen von Hand: `pnpm --filter @best-badges/api migrate` (SQL-Dateien in `apps/api/migrations/`).

Anmelden am Mock-OIDC: Login-Seite unter `http://localhost:8080/goslarid/authorize?…` öffnet sich aus App oder Verwaltung.
Als Benutzername `admin` (Haupt-Admin-Org), `waldpfad`, `museum` (Museum + Bibliothek) oder ein beliebiger Name (Bürger ohne Organisation) eingeben.
Die Testdaten stehen in `dev/mock-hsp/data/hsp.json`.

## 3D-Medaille auf dem iPhone testen

Ohne Netzwerk, mit eigenem Testbildschirm: [docs/geraetetest-3d.md](docs/geraetetest-3d.md).

## Tests

```bash
pnpm test
```

Die API-Tests laufen gegen eine echte Postgres-Datenbank `badges_test` im lokalen Stack (`pnpm dev:infra` vorher starten). Sie wird automatisch angelegt und vor jeder Testdatei geleert.

## Badge-Vorschau

```bash
pnpm --filter @best-badges/badge-render preview   # erzeugt packages/badge-render/preview/index.html
```
