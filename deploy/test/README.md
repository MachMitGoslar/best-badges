# Testumgebung auf stuffdev

| Adresse | Was |
|---|---|
| https://badges.stuffdev.de | Verwaltung (Anmeldung über authentik) |
| https://badges-api.stuffdev.de | API für die App; öffentliche Doku unter `/docs` |

- **Server:** Stack-Ordner `/srv/stacks/badges` (Compose-Projekt `best-badges`), am Traefik-Netz `rag-stack_rag`. Zertifikate über Let's Encrypt (`le`).
- **Anmeldung:** authentik-Anwendung „Best Badges (Test)“, Blueprint `rag_stuffdev/rag_setup/authentik/blueprints/best-badges.yaml`. Zugang nur mit der Gruppe `badges-testers`; der zweite Faktor ist Pflicht. `sub` ist der Benutzername.
- **Organisationen:** Statt des echten HSP läuft das Test-HSP, nur intern erreichbar. Wer zu welcher Organisation gehört, steht in `/srv/stacks/badges/hsp.json`, geordnet nach Benutzername.
- **Daten:** Datenbank `best_badges` im vorhandenen `postgres`-Container mit eigenem Benutzer. Das nächtliche `pg_dumpall` sichert sie mit; `backup.sh` sichert zusätzlich den Stack-Ordner.
- **Speicher:** Die Container haben feste Grenzen: API 256 MB, Verwaltung 160 MB, HSP 96 MB. Der Server hat kaum Reserven. Deshalb bündelt `deploy.sh` API und Verwaltung auf dem Mac und lädt nur die Bündel hoch, etwa 17 MB. Auf dem Server werden sie nur in Node-Images kopiert (`runtime.Dockerfile`); installiert oder gebaut wird dort nichts.
- **Absicherung:**
  - Ratenbegrenzung pro IP in Traefik; die API begrenzt außerdem pro Person und pro API-Schlüssel.
  - Anfragen sind auf höchstens 512 KB begrenzt.
  - Container laufen mit `read_only`, ohne Capabilities und ohne Root-Rechte.
  - Die interne API-Doku ist aus, und `X-Robots-Tag: noindex` hält die Seiten aus Suchmaschinen.
- **Seltenheit:** In der Testumgebung gilt sie schon ab 3 Sammelnden je Organisation (`RARITY_MIN_COLLECTORS=3`), im Normalbetrieb erst ab 50.

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

## Push einrichten (Apple)

Ohne Schlüssel läuft alles außer Push: Mitteilungen landen im Postfach der App.

1. **Schlüssel (stuff):** Im Apple-Entwicklerkonto (bezahltes Konto) unter Certificates, Identifiers & Profiles → Keys einen neuen Schlüssel mit „Apple Push Notifications service (APNs)“ anlegen. Die `.p8`-Datei lässt sich nur **einmal** herunterladen; die Key ID (10 Zeichen) notieren und beides im Passwortmanager ablegen.
2. **Auf den Server (stuff):** Die Datei als `/srv/stacks/badges/secrets/apns.p8` ablegen, Rechte `600`. Danach in `.env` die vier `APNS_*`-Zeilen aus `env.example` eintragen.
3. **Neu starten:** `cd /srv/stacks/badges && docker compose up -d`. Im Log muss „Push an (APNs …)“ stehen.
4. **App:** Neu bauen, weil `expo-notifications` ein natives Modul ist. Builds mit Entwicklungs-Signatur (Xcode, Gerät per Kabel) nutzen die APNs-Sandbox (`development`). Für TestFlight gilt `EXPO_PUBLIC_APNS_ENV=production`.

**So läuft es ab:**
- Neue Abzeichen und Sammelanfragen sind an; Neuigkeiten, Sonderaktionen und Erinnerungen nur nach Einwilligung in der App. Die Einwilligung wird mit Zeitpunkt gespeichert.
- Werbliches kommt nur zwischen 9 und 20 Uhr an. Erinnerungen gibt es frühestens nach 14 Tagen ohne Besuch, zwischen 17 und 19 Uhr.
- Rundschreiben schickt die Haupt-Admin-Organisation in der Verwaltung unter „Rundschreiben“, höchstens 3 in 24 Stunden.
- Der Versand läuft über die Warteschlange `push_outbox` mit Wiederholungen. Tokens, die Apple ablehnt, werden deaktiviert.
