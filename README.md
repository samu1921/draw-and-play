<img src="apps/web/public/favicon.svg" alt="" width="64" height="64">

# Draw & Play

[![CI](https://github.com/samu1921/draw-and-play/actions/workflows/ci.yml/badge.svg)](https://github.com/samu1921/draw-and-play/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/samu1921/draw-and-play?include_prereleases)](https://github.com/samu1921/draw-and-play/releases)

**English** · [Deutsch](README.de.md)

Web-based tournament software: plan, draw and run multi-day events with several competitions on shared tables, entirely in the browser. It starts with table tennis club championships and is built sport-neutral from day one.

What sets it apart:

- **Planner with simulation.** Before the event it compares every sensible format for the expected number of entries (groups, knockout, placement matches) by matches per player, finishing time and table usage.
- **Live forecast.** During the event the schedule is recalculated from the actual state, and delays show up immediately.
- **Everything in the browser, live.** Tournament desk, result entry on phones via QR code and PIN (also through dead spots), projector displays and public views, all updated without reloading.
- **Made for the hall.** Print pages as paper fallback, backups, and the whole event can move between a cloud server and a laptop.

> **Status:** ready for a first club championship. Format changes during a running event come next, see the [roadmap](docs/roadmap.md).

## Documentation

| Document | For whom | Contents |
|---|---|---|
| [Requirements](docs/requirements.md) | everybody | starting point, goals, reference scenario, roles, requirements with their status |
| [Features](docs/features.md) | organisers, users | what the app does, area by area, and a tournament day in practice |
| [Architecture](docs/architecture.md) | developers | structure, domain library, planner algorithm, consistency, security, data model, design decisions |
| [Roadmap](docs/roadmap.md) | everybody | what is done, what comes next, ideas |
| [Deployment](docs/deploy.md) | operators | server setup, updates, backups, tournament day checklist |
| [HTTP API](docs/api.md) | developers | every endpoint, error codes, live updates |

Every document exists in English and German.

## Try the demo

A separate demo stack with its own database contains a complete club championship with made-up players: on Friday three youth competitions, on Saturday doubles, singles (after the doubles) and hobby, on four tables. Everything is entered but not drawn yet.

```bash
npm run demo          # http://localhost:8090 – sign in as admin / demo-admin-2026, table PIN 123456
npm run demo:reset    # throw the demo data away and start fresh
npm run demo:down     # stop
```

It runs next to the normal stack and never touches its data. Requires Docker and Node 22.

## Run with Docker

```bash
cp .env.example .env   # set the passwords
docker compose up -d --build
```

Then open http://localhost:8080 and sign in at `/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` (health check: http://localhost:8080/api/health). After signing in, the events open.

For a server with its own domain and HTTPS, backups and restoring, follow the [deployment guide](docs/deploy.md).

## Development

```bash
npm install
docker compose up -d db   # database only
npm run dev               # server (tsx watch, :3000) + Vite (:5173, proxies /api → :3000)
```

Frontend: http://localhost:5173. The code is organised as npm workspaces: `packages/domain` (tournament logic), `apps/server` (Fastify API), `apps/web` (Vue app); details in the [architecture](docs/architecture.md#2-repository-and-stack).

| Command | Purpose |
|---|---|
| `npm test` | Run all tests (Vitest; the server tests need the database) |
| `npm run typecheck` | Type-check all packages |
| `npm run build` | Build frontend and server |
| `npm run e2e` | Click through a whole tournament day in a real browser (Playwright in Docker, needs the stack running); screenshots in `e2e/screenshots/` |
| `npm run db:generate -w @draw-and-play/server` | Generate a migration from the Drizzle schema |
| `npm run release -- 0.2.0` | Prepare a release as a pull request (see below) |
| `npm run release:publish` | Publish the release after its pull request is merged |

Every push and pull request runs the [CI](.github/workflows/ci.yml): type check, all tests against PostgreSQL, build, and the end-to-end walkthrough against the Docker stack.

### Releases

Versions follow [Semantic Versioning](https://semver.org/). Like every change, a release reaches `main` through a pull request:

1. `npm run release -- 0.2.0` on an up-to-date `main` runs the checks, sets the version in every package, writes the [CHANGELOG](CHANGELOG.md) from the commit messages, commits `chore(release): v0.2.0` on the branch `release/v0.2.0` and pushes it.
2. Open the pull request from the link it prints, check the changelog and merge once CI is green.
3. `npm run release:publish` tags the merged release commit and pushes the tag. The [release workflow](.github/workflows/release.yml) then runs CI again, publishes the Docker image `ghcr.io/samu1921/draw-and-play` (amd64 and arm64) and creates the GitHub release.

Versions with a suffix such as `0.2.0-rc.1` become pre-releases.

## Contributing

- `main` only accepts pull requests whose CI is green; merged by squash or rebase, so the history stays linear. Work on a branch such as `feat/print-layout`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), e.g. `feat(domain): add knockout placements`. Scopes are the workspace names `domain`, `server`, `web`, plus `docker`, `docs` and `ci`. The changelog is generated from them, so with squash merging the pull request title follows the same format.
- Code, comments and tests are in English. Every user-facing string goes into both locale files in `apps/web/src/i18n/locales/`; the domain library and the API return codes, never text.
- Tournament logic belongs in `packages/domain`, test-driven. API changes go into [docs/api.md](docs/api.md), user-visible changes into the [features](docs/features.md), always in both languages.

## License

[GNU Affero General Public License v3.0 or later](LICENSE). You may use, modify and host draw-and-play, also commercially. If you distribute a modified version or offer it to others over a network, you must publish its source code under the same license.
