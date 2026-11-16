# Testumgebung auf stuffdev

| Adresse | Was |
|---|---|
| https://badges.stuffdev.de | Verwaltung (Anmeldung über authentik) |
| https://badges-api.stuffdev.de | API für die App; öffentliche Doku unter `/docs` |

- **Server:** Stack-Ordner `/srv/stacks/badges` (Compose-Projekt `best-badges`), am Traefik-Netz `rag-stack_rag`. Zertifikate über Let's Encrypt (`le`).
- **Anmeldung:** authentik-Anwendung „Best Badges (Test)“, Blueprint `rag_stuffdev/rag_setup/authentik/blueprints/best-badges.yaml`. Zugang nur mit der Gruppe `badges-testers`; der zweite Faktor ist Pflicht. `sub` ist der Benutzername.
- **Organisationen:** Statt des echten HSP läuft das Test-HSP, nur intern erreichbar. Wer zu welcher Organisation gehört, steht in `/srv/stacks/badges/hsp.json`, geordnet nach Benutzername.
- **Daten:** Datenbank `best_badges` im vorhandenen `postgres`-Container mit eigenem Benutzer. Das nächtliche `pg_dumpall` sichert sie mit; `backup.sh` sichert zusätzlich den Stack-Ordner.
- **Speicher:** Die Container haben feste Grenzen: API 256 MB, Verwaltung 160 MB, HSP 96 MB. Der Server hat kaum Reserven, deshalb baut `deploy.sh` die Images auf dem Mac.
- **Absicherung:**
  - Ratenbegrenzung pro IP in Traefik; die API begrenzt außerdem pro Person und pro API-Schlüssel.
  - Anfragen sind auf höchstens 512 KB begrenzt.
  - Container laufen mit `read_only`, ohne Capabilities und ohne Root-Rechte.
  - Die interne API-Doku ist aus, und `X-Robots-Tag: noindex` hält die Seiten aus Suchmaschinen.

## Einrichten (einmalig)

1. **DNS (stuff):** In Cloudflare `badges.stuffdev.de` und `badges-api.stuffdev.de` als A-Eintrag auf `87.106.195.90` anlegen, Modus „nur DNS“.
2. **Geheimnis (stuff):** `/srv/stacks/badges/.env` nach `env.example` anlegen, Rechte `600`. Das Passwort zusätzlich im Passwortmanager ablegen.
3. **authentik:** Blueprint anwenden mit `docker exec authentik-worker ak apply_blueprint /blueprints/custom/best-badges.yaml`.
4. **Datenbank:** `/srv/stacks/badges/setup-db.sh` ausführen. Das Skript kann gefahrlos mehrfach laufen.
5. **Ausrollen vom Mac:** `deploy/test/deploy.sh`.
6. **Überwachung (stuff):** In Uptime Kuma einen HTTP-Monitor auf `https://badges-api.stuffdev.de/health` anlegen.

Eingerichtet am 16.11.2026. Speicherbedarf im Betrieb: etwa 80 MB für alle drei Container.

## Testperson hinzufügen

1. In authentik ein Konto anlegen und es in die Gruppe `badges-testers` aufnehmen.
2. In `/srv/stacks/badges/hsp.json` unter `users` einen Eintrag mit dem Benutzernamen und den Organisationen ergänzen.
3. `docker compose restart mock-hsp` ausführen.

## App gegen die Testumgebung

Release-Builds nutzen `apps/app/.env.production` und sprechen damit mit der Testumgebung. Die Datei liegt im Repository, weil sie keine Geheimnisse enthält: Die App ist ein öffentlicher Client mit PKCE. Die lokale Entwicklung (Debug) nutzt weiter `apps/app/.env`.

```bash
cd apps/app && LANG=en_US.UTF-8 corepack pnpm exec expo run:ios --device --configuration Release
```
