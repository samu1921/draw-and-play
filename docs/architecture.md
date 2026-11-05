# Architecture

**English** · [Deutsch](architecture.de.md)

How draw-and-play is built and why. For the individual endpoints see the [HTTP API](api.md), for running it see the [deployment guide](deploy.md).

## 1. Overview

```
 Browser (Vue SPA)                       Server (Docker Compose)
 ┌──────────────────────────┐            ┌───────────────────────────────────────────┐
 │ planner, desk, displays, │  HTTPS     │ Caddy ── reverse proxy, HTTPS, headers    │
 │ phones, public views     │ ─────────▶ │   │                                       │
 │                          │  JSON API  │ Fastify app ── serves the SPA and /api    │
 │ domain library (planner  │ ◀───────── │   │  domain library (draw, standings,     │
 │ runs in the browser too) │  SSE push  │   │  knockout, forecast)                  │
 └──────────────────────────┘            │ PostgreSQL ◀── backup service (pg_dump)   │
                                         └───────────────────────────────────────────┘
```

- **One container image** contains the server and the built frontend. The same Compose setup runs on a laptop, on a cloud server and in development.
- **The tournament logic exists once**, as a pure TypeScript library used by the server (authoritative state) and by the browser (instant planner).
- **Commands go to the server**, which validates them, writes them in a transaction and announces the change over Server-Sent Events. Clients then reload what they are allowed to see.

## 2. Repository and stack

| Path | Contents |
|---|---|
| `packages/domain` | Tournament logic: sport profiles, result notation, round robin schedules, group and pair draw, standings, knockout, transitions, formats, scheduler, planner, competition state. No UI or database dependencies; runs in Node and in the browser. Consumed as TypeScript source without a build step of its own. |
| `apps/server` | Fastify API, Drizzle ORM + PostgreSQL, sessions, live updates, audit log, export/import, demo data. Also serves the built frontend in production. |
| `apps/web` | Vue 3 + Vite + Vue Router + Pinia (SPA), localized with vue-i18n (English, German), a small service worker for the app shell. |
| `docker/` | Caddy configuration, backup script, demo settings |
| `e2e/` | Playwright walkthrough of a whole tournament day |

Stack: Node 22, TypeScript 6.0, Vitest, npm workspaces, PostgreSQL 18, Caddy 2. TypeScript 7 is not used yet because `vue-tsc` needs the compiler's JavaScript API.

**Language-neutral core:** the domain library and the API return stable codes (`playerBusy`, `alreadyDrawn`, `invalidGame` …), never text. The frontend translates them. Every visible string lives in both locale files under `apps/web/src/i18n/locales/`.

## 3. Domain library

**Facts are stored, state is derived.** The database holds only what cannot be recalculated: the competition format, the draw (who sits where), the match results, withdrawals and calls. Group standings, qualifiers, bracket progression, walkovers after withdrawals and placements are recalculated by `resolveCompetition` whenever they are needed. This keeps corrections simple: change a result and everything downstream follows.

| Module | Purpose |
|---|---|
| `sport/` | `SportProfile`: match rules (games to win, points per game, lead), result parser, ranking criteria, rating name, match duration estimate. `tableTennis` with the short notation. |
| `roundRobin`, `standings` | Round robin schedules (circle method, single or double), standings with the profile's tie-breakers (head-to-head among tied entries). |
| `bracket`, `knockout` | Bracket size, seed positions, byes, placement matches (none / 3rd place / all places). |
| `groupDraw`, `pairDraw`, `rng` | Seeded group draw with snake order or pots and club separation, doubles pair draw, a deterministic random generator (same seed, same draw). |
| `transition` | From groups to knockout: qualifier order and crossover that keeps entries of the same group apart. |
| `format` | `CompetitionFormat` as data (`{ groups?, knockout? }`), validation, the match structure of a format. |
| `scheduler`, `planner` | List scheduling on shared tables, simulation of a day, generation and comparison of format variants. |
| `competition` | Draw for a structure, resolving the live state, dependent matches (for corrections and withdrawals). |

Formats are data, not code paths. That is what lets the planner generate variants, and what will let the format change during an event.

## 4. Planner and forecast

**Rule of thumb:** duration ≈ max(matches ÷ tables, longest chain of dependent rounds) × match duration. A player cannot play two matches at once, so groups are played round by round, and **the group size limits the minimum duration**: a group of six needs 5 rounds, however many tables are free.

**Simulation:** the planner distributes every match of every competition of the day onto the tables (list scheduling) with these constraints:

- no player plays two matches at the same time, also across competitions (doubles and singles players overlap);
- knockout matches wait for the matches that decide their players;
- a competition starts at its earliest start or after the competition it depends on, and only uses its allowed tables;
- optionally a minimum rest per player.

A buffer (percent or minutes) turns the end into a range ("final between 15:30 and 16:00").

**Variants:** for a competition the planner generates every sensible format (round robin up to a sensible size, 1 to *n* groups with top *k*, pure knockout) and simulates each together with the rest of the day.

**Live forecast:** during the event the server runs the same simulation from the real state. Finished matches drop out, called matches keep their table until their expected end, the rest is planned from now on. After three played matches of a competition their measured average duration replaces the estimate.

**Example** (6 tables, 30 min per match, no buffer; the knockout starts when all groups are done; "top 2" means the first two of each group advance):

Singles, 10 entries

| Variant | Matches | Per player | Duration |
|---|---|---|---|
| 1 group, round robin | 45 | 9 | ~4:30 h |
| 2 × 5, top 2 → semifinals/final | 23 (+1 for 3rd place) | 4–6 | ~3:30 h |
| 3 × (4/3/3), top 2 → knockout of 8 (2 byes) | 17 | 2–6 | ~3:00 h |

Singles, 12 entries

| Variant | Matches | Per player | Duration |
|---|---|---|---|
| 1 group, round robin | 66 | 11 | ~5:30 h |
| 2 × 6, top 2 → semifinals/final | 33 (+1) | 5–7 | ~3:30 h |
| 2 × 6, top 4 → quarterfinals | 37 | 5–8 | ~4:00 h |
| 3 × 4, top 2 → knockout of 8 (byes for the best group winners) | 23 | 3–6 | ~3:00 h |
| 4 × 3, top 2 → quarterfinals | 19 | 2–5 | ~3:00 h |

Singles, 16 entries

| Variant | Matches | Per player | 6 tables | 8 tables |
|---|---|---|---|---|
| 2 × 8, top 2 → semifinals/final | 59 | 7–9 | ~6:00 h | ~4:30 h |
| 3 × (6/5/5), top 2 → knockout of 8 (2 byes) | 40 | 4–8 | ~4:30 h | ~4:00 h |
| 4 × 4, top 2 → quarterfinals | 31 | 3–6 | ~3:30 h | ~3:00 h |

Youth or hobby, 5 entries: round robin, 10 matches, 4 per player, 5 rounds of 2 matches, about 2:30 h at best of 5; a final adds 30 min. Three such competitions fit side by side on 6 tables. At best of 3 (about 20 min) it takes about 1:40 h.

What the numbers show:

- With 16 players, 2 × 8 is too long on 6 tables. 4 × 4 halves the duration, at the price of fewer matches per player.
- More tables only help while the tables are the bottleneck, not the group size.
- Playing out all places costs little time, because placement matches run in parallel to the knockout round, as long as tables are free.

## 5. Consistency and live updates

- **Optimistic locking:** competitions, matches and display profiles carry a `version`. Every command names the version it saw; a stale command is refused with `versionConflict`, and the client reloads.
- **Per-event lock:** match commands run in a transaction holding a PostgreSQL advisory lock per event, so two devices can never call the same table or the same player twice. The database also enforces at most one called match per table with a partial unique index.
- **Idempotent results:** repeating a result request is safe. If the match already holds exactly that result, the answer is `200`; this is what lets phones resend after a dead spot.
- **Server-Sent Events:** `GET /api/events/:ref/stream` announces *what* changed (`match`, `competition`, `persons`, `draw` …) but carries no data. Public and admin clients share the stream and reload what their access allows. A heartbeat every 25 seconds keeps proxies from closing the connection; clients reconnect by themselves.
- **Offline tolerance on phones:** a service worker caches the built app shell (never `/api`). Results that cannot be sent wait in a local outbox and are retried on reconnect, after every stream `ready` and every 15 seconds.

## 6. Security and privacy

| Topic | Implementation |
|---|---|
| Admin and desk accounts | username + password (at least 12 characters), Argon2 hashes, session cookie `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, 24 hours by default (`SESSION_TTL_HOURS`). A password change signs out the user's other sessions. |
| Roles | `admin` and `desk`, checked on every route |
| Result entry | six-digit PIN per event, rotatable; a device session (72 hours) that may only enter results of called matches |
| Public views | optional six-character viewer code per event; a viewer session lasts until the day after the event |
| CSRF | state-changing requests must be JSON (`415 jsonRequired` otherwise), on top of `SameSite` cookies |
| Brute force | rate limits: login 10, PIN 5, viewer code 10 attempts per 15 minutes |
| HTTP headers | Caddy sends a strict Content Security Policy (only own scripts, no framing), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Data minimisation | public views show name and club only; ratings and short names per event; `noindex` for search engines; exports exclude PIN, sessions, users and the audit log |
| Traceability | every change goes to the audit log with actor (user or device) and details |

## 7. Data model

```
users ── sessions
events (slug, days, sport, time zone, PIN hash, viewer code,
        settings: public ratings, short names, legal links, privacy note)
 ├─ event_tables
 ├─ persons (first name, last name?, club, gender, year of birth, licence no., rating)
 ├─ display_profiles (settings)
 ├─ device_sessions, viewer_sessions
 ├─ audit_log (actor, action, entity, data)
 └─ competitions (kind, format, match rules, day, earliest start, start after, table ids, draw)
       ├─ entries (seed, status: registered | present | withdrawn)
       │     └─ entry_members ──> persons   (1 = singles, 2 = doubles)
       └─ matches (structure key such as GA-1-1 or KO-r2p1m1, status, table, result,
                   sides at the time of calling, called/finished at, version)
```

One database holds any number of events. Migrations live in `apps/server/drizzle/` and run on startup.

## 8. Design decisions

| Decision | Reason |
|---|---|
| Web app with a central server instead of a desktop program | Phones, projector and public views need the live state; the desk is not tied to one PC. |
| Cloud server first, laptop as fallback | Players reach result entry and public views from their own phones without the hall's network. The same image runs on a laptop; the event moves by export/import. |
| Pure domain library, formats as data | Testable without a database, planner runs in the browser, format changes during the event are possible. |
| Server-Sent Events instead of WebSockets | Updates only flow from server to client; commands are ordinary HTTP requests. SSE reconnects by itself and passes proxies easily. |
| Outbox for results instead of full offline operation | A dead spot must not lose a result, but calling matches needs the overall state, so the desk stays online. |
| Generic CSV import instead of a federation format | Player lists come from many sources (club software, Excel); a header-based import covers them all. Federation XML stays an idea for official tournaments. |
| Withdrawal turns remaining matches into walkovers | Keeps standings and brackets valid without rebuilding groups; results already played count. |
| Viewer code in plain text, display links carry the code | It only grants reading; the notice must be printable again at any time, and projector PCs need no input. |
| AGPL-3.0-or-later | Anyone may use and host draw-and-play; whoever offers a modified version over a network must publish its source. |
