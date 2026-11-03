# draw-and-play

**English** · [Deutsch](README.de.md)

Web-based tournament software: plan, draw and run multi-day events with several competitions on shared tables, entirely in the browser. It starts with table tennis club championships and is built sport-neutral from day one.

What sets it apart:

- **Planner with simulation.** Before the event it compares every sensible format for the expected number of entries (groups, knockout, placement matches) by matches per player, finishing time and table usage.
- **Live forecast.** During the event the schedule is recalculated from the actual state, and delays show up immediately.
- **Format changes on the fly.** Whatever has not started yet can still be changed, with a preview of the impact.
- **Everything in the browser.** Admin desk, result entry on phones via QR code and PIN, projector display and a public read-only view, all updated live.

Background (German): [concept](docs/02-konzept-draw-and-play.md). Developer reference: [HTTP API](docs/api.md).

> Status: early development. The test-driven domain library (draw, standings, knockout, scheduling) the planner UI, the data model and the API with live updates are in place; the match operation UI (table overview, result entry by phone, projector display) comes next.

## Demo

A separate demo stack with its own database contains a complete club championship with made-up players: Friday three youth competitions, Saturday doubles, singles (after the doubles) and hobby, on four tables. Everything is entered but not drawn yet.

```bash
npm run demo          # http://localhost:8090 – sign in as admin / demo-admin-2026, table PIN 123456
npm run demo:reset    # throw the demo data away and start fresh
npm run demo:down     # stop
```

It runs next to the normal stack and never touches its data.

## Tournament day in short

1. Sign in at `/login` (first admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`).
2. **Tournament desk → create event**, then add players, create competitions (format chosen like in the planner), enter players and draw.
3. **Setup:** generate a PIN and print the QR codes for the tables. Open the projector display at `/e/<slug>/display` (rotating; `?view=tables` or `?view=next` pins a view, `?interval=30` changes the pace).
4. **Match desk:** call ready matches to free tables. Players scan the QR code at their table, enter the PIN once and type the result; the desk can always enter or correct results itself.
5. Everybody else follows along at `/e/<slug>`.

## Repository layout

| Path | Contents |
|---|---|
| `packages/domain` | Pure tournament logic in TypeScript (schedules, draw, standings, knockout, planner). No UI or database dependencies; runs in Node and in the browser. Consumed as TypeScript source, without a build step of its own. Returns language-neutral codes, never UI text. |
| `apps/server` | Fastify API, Drizzle ORM + PostgreSQL. Also serves the built frontend in production. |
| `apps/web` | Vue 3 + Vite + Vue Router + Pinia (SPA), localized with vue-i18n (English, German). |
| `docker/` | Caddy configuration (reverse proxy, automatic HTTPS) |

Stack: Node 22, TypeScript 6.0 (not 7, because `vue-tsc` needs the compiler's JavaScript API), Vitest, npm workspaces.

## Run everything with Docker

```bash
cp .env.example .env   # set a password
docker compose up -d --build
```

Then open http://localhost:8080 (health check: http://localhost:8080/api/health).

On a server, set `SITE_ADDRESS=tournament.example.org`, `HTTP_PORT=80` and `HTTPS_PORT=443` in `.env`. Caddy then obtains the certificate automatically.

## Development with hot reload

```bash
npm install
docker compose up -d db   # database only
npm run dev               # server (tsx watch, :3000) + Vite (:5173, proxies /api → :3000)
```

Frontend: http://localhost:5173

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run all tests (Vitest) |
| `npm run typecheck` | Type-check all packages |
| `npm run build` | Build frontend and server |
| `npm run e2e` | Click through a whole tournament day in a real browser (Playwright in Docker, needs the stack running); screenshots in `e2e/screenshots/` |
| `npm run db:generate -w @draw-and-play/server` | Generate a migration from the Drizzle schema |

## Contributing

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), e.g. `feat(domain): add knockout placements`. Scopes are the workspace names: `domain`, `server`, `web`, plus `docker` and `docs`.
- Code, comments and tests are in English. Every user-facing string goes into both locale files in `apps/web/src/i18n/locales/`.

## License

[GNU Affero General Public License v3.0 or later](LICENSE). You may use, modify and host draw-and-play, also commercially. If you distribute a modified version or offer it to others over a network, you must publish its source code under the same license.
