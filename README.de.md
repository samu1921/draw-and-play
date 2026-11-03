# draw-and-play

[English](README.md) · **Deutsch**

Webbasierte Turniersoftware: mehrtägige Veranstaltungen mit mehreren Konkurrenzen auf gemeinsam genutzten Tischen planen, auslosen und durchführen, komplett im Browser. Zuerst für Tischtennis-Vereinsmeisterschaften, von Anfang an sportneutral gebaut.

Was sie besonders macht:

- **Turnierplaner mit Simulation.** Vor dem Turnier vergleicht er alle sinnvollen Modi für die erwartete Teilnehmerzahl (Gruppen, KO, Platzierungsspiele) nach Spielen pro Spieler, Uhrzeit des Finales und Tischauslastung.
- **Live-Prognose.** Während des Turniers wird der Zeitplan aus dem echten Stand neu berechnet, und Verzug ist sofort sichtbar.
- **Modus im laufenden Turnier änderbar.** Was noch nicht begonnen hat, lässt sich ändern, mit Vorschau der Auswirkungen.
- **Alles im Browser.** Turnierleitung, Ergebniseingabe per Handy (QR-Code und PIN), Beamer-Anzeige und öffentliche Leseansicht, alles live aktualisiert.

Hintergrund: [Konzept](docs/02-konzept-draw-and-play.md). Für Entwickler: [HTTP-API](docs/api.md) (Englisch).

> Stand: frühe Entwicklung. Die testgetriebene Domänenbibliothek (Auslosung, Tabellen, KO, Zeitplanung) die Planer-Oberfläche, das Datenmodell und die API mit Echtzeit stehen; als Nächstes folgt die Oberfläche für den Spielbetrieb (Tischübersicht, Ergebniseingabe per Handy, Beamer-Anzeige).

## Turniertag in Kürze

1. Unter `/login` anmelden (erster Admin aus `ADMIN_USERNAME` / `ADMIN_PASSWORD` in der `.env`).
2. **Turnierleitung → Veranstaltung anlegen**, dann Spieler erfassen, Konkurrenzen anlegen (Modus wie im Planer), Spieler melden und auslosen.
3. **Einrichtung:** PIN erzeugen und die QR-Codes für die Tische drucken. Die Beamer-Anzeige läuft unter `/e/<kurzname>/display` (rotierend; `?view=tables` oder `?view=next` hält eine Ansicht fest, `?interval=30` ändert das Tempo).
4. **Spielbetrieb:** Spielbereite Spiele auf freie Tische aufrufen. Die Spieler scannen den QR-Code am Tisch, geben einmal die PIN ein und tippen das Ergebnis; die Turnierleitung kann jederzeit selbst eintragen oder korrigieren.
5. Alle anderen verfolgen das Turnier unter `/e/<kurzname>`.

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

Auf einem Server in `.env` `SITE_ADDRESS=turnier.example.de`, `HTTP_PORT=80` und `HTTPS_PORT=443` setzen. Caddy holt das Zertifikat dann automatisch.

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
