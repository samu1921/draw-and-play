<img src="apps/web/public/favicon.svg" alt="" width="64" height="64">

# Draw & Play

[![CI](https://github.com/samu1921/draw-and-play/actions/workflows/ci.yml/badge.svg)](https://github.com/samu1921/draw-and-play/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/samu1921/draw-and-play?include_prereleases)](https://github.com/samu1921/draw-and-play/releases)

[English](README.md) · **Deutsch**

Webbasierte Turniersoftware: mehrtägige Veranstaltungen mit mehreren Konkurrenzen auf gemeinsam genutzten Tischen planen, auslosen und durchführen, komplett im Browser. Zuerst für Tischtennis-Vereinsmeisterschaften, von Anfang an sportneutral gebaut.

Was sie besonders macht:

- **Turnierplaner mit Simulation.** Vor dem Turnier vergleicht er alle sinnvollen Modi für die erwartete Teilnehmerzahl (Gruppen, KO, Platzierungsspiele) nach Spielen pro Spieler, Uhrzeit des Finales und Tischauslastung.
- **Live-Prognose.** Während des Turniers wird der Zeitplan aus dem echten Stand neu berechnet, und Verzug ist sofort sichtbar.
- **Alles im Browser, alles live.** Turnierleitung, Ergebniseingabe per Handy mit QR-Code und PIN (auch bei Funklöchern), Beamer-Anzeigen und öffentliche Ansichten, alles ohne Neuladen aktuell.
- **Gemacht für die Halle.** Druckseiten als Rückfall auf Papier, Backups, und die ganze Veranstaltung kann zwischen Cloud-Server und Laptop umziehen.

> **Stand:** bereit für eine erste Vereinsmeisterschaft. Als Nächstes folgt die Modusänderung im laufenden Turnier, siehe [Roadmap](docs/roadmap.de.md).

## Dokumentation

| Dokument | Für wen | Inhalt |
|---|---|---|
| [Anforderungen](docs/requirements.de.md) | alle | Ausgangslage, Ziele, Referenzszenario, Rollen, Anforderungen mit Stand |
| [Funktionen](docs/features.de.md) | Turnierleitung, Nutzer | was die App kann, Bereich für Bereich, und ein Turniertag in der Praxis |
| [Architektur](docs/architecture.de.md) | Entwickler | Aufbau, Domänenbibliothek, Planer-Algorithmus, Konsistenz, Sicherheit, Datenmodell, Entscheidungen |
| [Roadmap](docs/roadmap.de.md) | alle | was erledigt ist, was als Nächstes kommt, Ideen |
| [Deployment](docs/deploy.de.md) | Betreiber | Server einrichten, Updates, Backups, Checkliste für den Turniertag |
| [HTTP-API](docs/api.md) | Entwickler | alle Endpunkte, Fehlercodes, Live-Updates (Englisch) |

Alle Dokumente gibt es auf Englisch und Deutsch, die API-Referenz nur auf Englisch.

## Demo ausprobieren

Ein eigener Demo-Stack mit eigener Datenbank enthält eine komplette Vereinsmeisterschaft mit erfundenen Spielern: Freitag drei Jugendkonkurrenzen, Samstag Doppel, Einzel (nach dem Doppel) und Hobby, auf vier Tischen. Alles ist gemeldet, aber noch nicht ausgelost.

```bash
npm run demo          # http://localhost:8090 – Anmeldung admin / demo-admin-2026, Tisch-PIN 123456
npm run demo:reset    # Demodaten verwerfen und neu anlegen
npm run demo:down     # stoppen
```

Er läuft neben dem normalen Stack und fasst dessen Daten nie an. Voraussetzung: Docker und Node 22.

## Mit Docker starten

```bash
cp .env.example .env   # Passwörter setzen
docker compose up -d --build
```

Danach http://localhost:8080 öffnen und unter `/login` mit `ADMIN_USERNAME` / `ADMIN_PASSWORD` aus der `.env` anmelden (Health-Check: http://localhost:8080/api/health). Nach der Anmeldung öffnen sich die Veranstaltungen.

Für einen Server mit eigener Domain und HTTPS, Backups und Wiederherstellung siehe die [Deployment-Anleitung](docs/deploy.de.md).

## Entwicklung

```bash
npm install
docker compose up -d db   # nur die Datenbank
npm run dev               # Server (tsx watch, :3000) + Vite (:5173, leitet /api → :3000 weiter)
```

Frontend: http://localhost:5173. Der Code ist in npm-Workspaces gegliedert: `packages/domain` (Turnierlogik), `apps/server` (Fastify-API), `apps/web` (Vue-App); Details in der [Architektur](docs/architecture.de.md#2-repository-und-stack).

| Befehl | Zweck |
|---|---|
| `npm test` | Alle Tests ausführen (Vitest; die Server-Tests brauchen die Datenbank) |
| `npm run typecheck` | Typprüfung aller Pakete |
| `npm run build` | Frontend und Server bauen |
| `npm run e2e` | Einen ganzen Turniertag im echten Browser durchklicken (Playwright in Docker, Stack muss laufen); Screenshots in `e2e/screenshots/` |
| `npm run db:generate -w @draw-and-play/server` | Migration aus dem Drizzle-Schema erzeugen |
| `npm run release -- 0.2.0` | Ein Release als Pull Request vorbereiten (siehe unten) |
| `npm run release:publish` | Das Release veröffentlichen, nachdem sein Pull Request gemergt ist |

Jeder Push und jeder Pull Request durchläuft die [CI](.github/workflows/ci.yml): Typprüfung, alle Tests gegen PostgreSQL, Build und den End-to-End-Durchlauf gegen den Docker-Stack.

### Releases

Versionen folgen [Semantic Versioning](https://semver.org/lang/de/). Wie jede Änderung kommt auch ein Release über einen Pull Request nach `main`:

1. `npm run release -- 0.2.0` auf einem aktuellen `main` führt die Prüfungen aus, setzt die Version in allen Paketen, schreibt das [CHANGELOG](CHANGELOG.md) aus den Commit-Nachrichten, committet `chore(release): v0.2.0` auf den Branch `release/v0.2.0` und pusht ihn.
2. Den Pull Request über den ausgegebenen Link öffnen, das Changelog prüfen und mergen, sobald die CI grün ist.
3. `npm run release:publish` taggt den gemergten Release-Commit und pusht den Tag. Der [Release-Workflow](.github/workflows/release.yml) lässt dann die CI erneut laufen, veröffentlicht das Docker-Image `ghcr.io/samu1921/draw-and-play` (amd64 und arm64) und erstellt das GitHub-Release.

Versionen mit Zusatz wie `0.2.0-rc.1` werden Vorabversionen.

## Mitwirken

- `main` nimmt nur Pull Requests mit grüner CI an, gemergt per Squash oder Rebase, damit die Historie linear bleibt. Gearbeitet wird auf einem Branch wie `feat/print-layout`.
- Commit-Nachrichten folgen [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/), z. B. `feat(domain): add knockout placements`. Scopes sind die Workspace-Namen `domain`, `server`, `web` sowie `docker`, `docs` und `ci`. Aus ihnen entsteht das Changelog, deshalb folgt beim Squash-Merge auch der Titel des Pull Requests diesem Format.
- Code, Kommentare und Tests sind auf Englisch. Jeder sichtbare Text kommt in beide Locale-Dateien unter `apps/web/src/i18n/locales/`; Domänenbibliothek und API liefern Codes, nie Text.
- Turnierlogik gehört testgetrieben nach `packages/domain`. API-Änderungen kommen in [docs/api.md](docs/api.md), sichtbare Änderungen in die [Funktionen](docs/features.de.md), immer in beiden Sprachen.

## Lizenz

[GNU Affero General Public License v3.0 oder später](LICENSE). Du darfst draw-and-play nutzen, verändern und betreiben, auch kommerziell. Wenn du eine veränderte Version weitergibst oder anderen über ein Netzwerk anbietest, musst du ihren Quelltext unter derselben Lizenz veröffentlichen.
