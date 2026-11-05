# draw-and-play

[English](README.md) · **Deutsch**

Webbasierte Turniersoftware: mehrtägige Veranstaltungen mit mehreren Konkurrenzen auf gemeinsam genutzten Tischen planen, auslosen und durchführen, komplett im Browser. Zuerst für Tischtennis-Vereinsmeisterschaften, von Anfang an sportneutral gebaut.

Was sie besonders macht:

- **Turnierplaner mit Simulation.** Vor dem Turnier vergleicht er alle sinnvollen Modi für die erwartete Teilnehmerzahl (Gruppen, KO, Platzierungsspiele) nach Spielen pro Spieler, Uhrzeit des Finales und Tischauslastung.
- **Live-Prognose.** Während des Turniers wird der Zeitplan aus dem echten Stand neu berechnet, und Verzug ist sofort sichtbar.
- **Modus im laufenden Turnier änderbar.** Was noch nicht begonnen hat, lässt sich ändern, mit Vorschau der Auswirkungen.
- **Alles im Browser.** Turnierleitung, Ergebniseingabe per Handy (QR-Code und PIN), Beamer-Anzeige und öffentliche Leseansicht, alles live aktualisiert.

Hintergrund: [Konzept](docs/02-konzept-draw-and-play.md). Für Entwickler: [HTTP-API](docs/api.md) (Englisch).

> Stand: bereit für eine erste Vereinsmeisterschaft. Planer, Auslosung, Spielbetrieb, Ergebniseingabe per Handy (auch bei Funklöchern), Beamer-Anzeige, öffentliche Seiten mit Zugangscode, Druckansichten, CSV-Import und Backups stehen; als Nächstes folgen Benutzerverwaltung und Modusänderung im laufenden Turnier.

## Demo

Ein eigener Demo-Stack mit eigener Datenbank enthält eine komplette Vereinsmeisterschaft mit erfundenen Spielern: Freitag drei Jugendkonkurrenzen, Samstag Doppel, Einzel (nach dem Doppel) und Hobby, auf vier Tischen. Alles ist gemeldet, aber noch nicht ausgelost.

```bash
npm run demo          # http://localhost:8090 – Anmeldung admin / demo-admin-2026, Tisch-PIN 123456
npm run demo:reset    # Demo-Daten verwerfen und neu anlegen
npm run demo:down     # stoppen
```

Er läuft neben dem normalen Stack und berührt dessen Daten nie.

## Turniertag in Kürze

1. Unter `/login` anmelden (erster Admin aus `ADMIN_USERNAME` / `ADMIN_PASSWORD` in der `.env`). Unter **Benutzer** weitere Admins oder Konten für die Meldestelle anlegen, die nur Spieler, Meldungen und Anwesenheit pflegen darf; das eigene Passwort ändert jede Person unter **Mein Konto**.
2. **Turnierleitung → Veranstaltung anlegen**, dann Spieler erfassen, Konkurrenzen anlegen (Modus wie im Planer), Spieler melden und auslosen.
3. **Einrichtung:** PIN erzeugen und die QR-Codes für die Tische drucken. Neue Veranstaltungen zeigen ihre öffentlichen Seiten nur mit Zugangscode; den Aushang mit QR-Code drucken und in der Halle aufhängen (oder die Seiten für alle öffnen). Unter **Anzeigen** für jeden Bildschirm (Beamer, Fernseher) ein Profil anlegen und dort dessen Link öffnen. Die Anzeige ist eine 16:9-Bühne, die nie scrollt; Pfeiltasten oder ein Presenter blättern, die Leertaste pausiert, F schaltet Vollbild.
4. **Spielbetrieb:** Spielbereite Spiele auf freie Tische aufrufen. Die Spieler scannen den QR-Code am Tisch, geben einmal die PIN ein und tippen das Ergebnis; die Turnierleitung kann jederzeit selbst eintragen oder korrigieren. Hat ein Handy gerade kein Netz, bleibt das Ergebnis auf dem Handy und wird gesendet, sobald die Verbindung zurück ist (Seite dafür offen lassen).
5. **Drucken:** Schiedsrichterzettel (auch als Rückfall auf Papier, wenn das Netz ausfällt), Zeitplan des Tages, Gruppenblätter mit Kreuztabelle und KO-Baum, Ergebnislisten und Urkunden, jeweils als Druckseite oder PDF; Platzierungen und alle Ergebnisse auch als CSV.
6. Alle anderen verfolgen das Turnier unter `/e/<kurzname>` (mit Zugangscode, falls die Veranstaltung einen hat).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `packages/domain` | Reine Turnierlogik in TypeScript (Spielpläne, Auslosung, Tabellen, KO, Planer). Keine UI- oder DB-Abhängigkeit, läuft in Node und im Browser. Wird als TS-Quelltext eingebunden, ohne eigenen Build-Schritt. Liefert sprachneutrale Codes, nie UI-Texte. |
| `apps/server` | Fastify-API, Drizzle ORM + PostgreSQL. Liefert in Produktion auch das gebaute Frontend aus. |
| `apps/web` | Vue 3 + Vite + Vue Router + Pinia (SPA), übersetzt mit vue-i18n (Englisch, Deutsch). |
| `docker/` | Caddy-Konfiguration (Reverse Proxy, automatisches HTTPS) |

Stack: Node 22, TypeScript 6.0 (nicht 7, weil `vue-tsc` die JavaScript-API des Compilers braucht), Vitest, npm-Workspaces.

## Komplett per Docker starten

```bash
cp .env.example .env   # Passwort setzen
docker compose up -d --build
```

Danach erreichbar unter http://localhost:8080 (Health-Check: http://localhost:8080/api/health).

Auf einem Server in `.env` `SITE_ADDRESS=turnier.example.de`, `HTTP_PORT=80` und `HTTPS_PORT=443` setzen. Caddy holt das Zertifikat dann automatisch. Die [Server-Anleitung](docs/deploy.de.md) beschreibt den Server Schritt für Schritt, Updates, Backups und eine Checkliste für den Turniertag.

## Backups

Der Dienst `backup` legt jede Stunde einen Datenbank-Dump in `./backups` ab (`BACKUP_INTERVAL_MINUTES`, `BACKUP_KEEP_DAYS` und `BACKUP_DIR` in `.env`). Am Turniertag ist ein kürzerer Abstand sinnvoll, etwa 15 Minuten. Einen Dump sofort anlegen, zum Beispiel vor Turnierbeginn:

```bash
docker compose exec backup sh /usr/local/bin/backup.sh once
```

Einen Dump wiederherstellen (ersetzt die ganze Datenbank):

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U drawandplay -d drawandplay < backups/drawandplay-<zeitstempel>.dump
docker compose start app
```

Die Dumps liegen auf demselben Server wie die Datenbank. Kopiere sie ab und zu woandershin, zum Beispiel mit `scp` oder `rclone`.

Eine einzelne Veranstaltung lässt sich außerdem als JSON-Datei sichern und wieder importieren (**Einrichtung → Exportieren**, **Turnierleitung → Veranstaltung importieren**), etwa um sie vom Server auf einen Laptop und zurück umzuziehen.

## Entwicklung mit Hot Reload

```bash
npm install
docker compose up -d db   # nur die Datenbank
npm run dev               # Server (tsx watch, :3000) + Vite (:5173, Proxy /api → :3000)
```

Frontend: http://localhost:5173

## Befehle

| Befehl | Zweck |
|---|---|
| `npm test` | Alle Tests (Vitest) |
| `npm run typecheck` | Typprüfung aller Pakete |
| `npm run build` | Frontend und Server bauen |
| `npm run e2e` | Einen ganzen Turniertag im echten Browser durchklicken (Playwright in Docker, Stack muss laufen); Screenshots in `e2e/screenshots/` |
| `npm run db:generate -w @draw-and-play/server` | Migration aus dem Drizzle-Schema erzeugen |

## Mitarbeit

- Commit-Nachrichten folgen [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/), z. B. `feat(domain): add knockout placements`. Scopes sind die Workspace-Namen `domain`, `server`, `web` sowie `docker` und `docs`.
- Code, Kommentare und Tests sind auf Englisch. Jeder sichtbare Text kommt in beide Sprachdateien unter `apps/web/src/i18n/locales/`.

## Lizenz

[GNU Affero General Public License v3.0 oder später](LICENSE). draw-and-play darf genutzt, verändert und betrieben werden, auch kommerziell. Wer eine veränderte Version weitergibt oder anderen über ein Netzwerk anbietet, muss deren Quellcode unter derselben Lizenz veröffentlichen.
