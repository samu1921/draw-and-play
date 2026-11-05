# HTTP API

JSON over HTTP, served under `/api`. Admin routes need the session cookie from `POST /api/auth/login`. State-changing requests must be sent as `application/json` (or without a body); anything else is rejected with `415 jsonRequired` as CSRF protection on top of `SameSite=Lax` cookies.

## Errors

Errors carry a stable, language-neutral code that the UI translates:

```json
{ "error": "playerBusy", "details": { "personIds": ["…"] } }
```

| Status | Codes |
|---|---|
| 400 | `validation` (details: zod issues), `invalidFormat`, `invalidResult` (details: parser error code), `incompleteResult`, `wrongMemberCount`, `unpairedPlayers` (details: `count`), `oddPlayerCount` (details: `count`), `notDoubles`, `unknownPerson`, `unknownTable`, `unknownCompetition`, `startAfterSelf`, `unsupportedFormat`, `invalidImport` (details: `reason`, `at`) |
| 401 | `notLoggedIn`, `invalidCredentials`, `invalidPin`, `viewerCodeRequired` (details: `name`, `pinEnabled`), `invalidViewerCode` |
| 403 | `correctionsAdminOnly`, `walkoverAdminOnly` |
| 404 | `notFound` (details: `entity`) |
| 409 | `versionConflict`, `alreadyDrawn`, `notDrawn`, `matchesStarted`, `alreadyEntered`, `alreadyCalled`, `notCalled`, `matchNotReady`, `matchFinished`, `tableBusy`, `tableNotAllowed`, `tableInUse`, `playerBusy`, `dependentMatchStarted`, `personHasEntries`, `matchCalled`, `alreadyWithdrawn`, `notWithdrawn`, `slugTaken`, `duplicateTableName`, `pinDisabled` |
| 415 | `jsonRequired` |
| 429 | `tooManyRequests` (login: 10 attempts, PIN: 5 attempts per 15 minutes) |

## Authentication

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | Sets the `dap_session` cookie (HttpOnly, SameSite=Lax, Secure over HTTPS) |
| POST | `/api/auth/logout` | – | |
| GET | `/api/auth/me` | – | `{ user }`, or `{ user: null }` when signed out |

The first admin is created on startup from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Events, tables, persons

| Method | Path | Access | Body / result |
|---|---|---|---|
| GET | `/api/events` | admin | all events |
| POST | `/api/events` | admin | `{ name, slug?, startsOn?, endsOn?, tableCount?, sport? }` → creates tables "1" … "n"; `sport` (default `table-tennis`) cannot be changed later and decides scoring, result notation and standings order |
| GET | `/api/events/:idOrSlug` | public | event, tables, competitions; `event.legal` holds the footer links (`imprintUrl`, `privacyUrl`: the event's own, else the installation's `IMPRINT_URL` / `PRIVACY_URL`) and `privacyNote` |
| GET | `/api/config` | public | `{ legal: { imprintUrl, privacyUrl } }`, the installation's defaults |
| GET | `/api/events/:id/audit?before=&limit=` | admin | audit log, newest first: `{ entries: [{ id, createdAt, actor: { type, name }, action, entityType, entityId, data }], next }`; pass `next` as `before` for the next page (`limit` up to 200, default 50) |
| DELETE | `/api/events/:id` | admin | deletes the event with all its data |
| PATCH | `/api/events/:id` | admin | `{ name?, startsOn?, endsOn?, settings?: { publicRatings?, shortNames?, imprintUrl?, privacyUrl?, privacyNote? } }`; the links are http(s) URLs, an empty string clears a link or the note |
| PUT | `/api/events/:id/tables` | admin | `{ names: string[] }` replaces the list by name; tables holding a called match stay |
| GET | `/api/events/:id/persons` | admin | persons with personal data |
| POST | `/api/events/:id/persons` | admin | `{ firstName, lastName?, club?, gender?, birthYear?, licenceNo?, rating? }`; a first name alone is enough, an empty `lastName` is stored as `null`. Admin views also carry `publicName`, the name as public views show it |
| POST | `/api/events/:id/persons/import` | admin | `{ rows: [{ ...person fields, updateId?, competitionIds? }], status?: 'registered' \| 'present' }` (up to 1000 rows, all or nothing) → `{ created, updated, entered, skipped: [{ row, competitionId, reason: 'alreadyDrawn' \| 'alreadyEntered' }] }`. `updateId` updates that person (fields left out stay unchanged); `competitionIds` enter the player, in doubles without a partner. Unknown persons or competitions → 400 with `details.row` |
| PATCH / DELETE | `/api/persons/:id` | admin | |
| GET | `/api/events/:idOrSlug/stream` | public | Server-Sent Events, see below |

## Export and import

| Method | Path | Access | Body / result |
|---|---|---|---|
| GET | `/api/events/:idOrSlug/export` | admin | the whole event as a JSON file (`Content-Disposition: attachment`): tables, persons, competitions with draws, entries, matches with results, display profiles. The PIN, device sessions, users and the audit log are not included |
| POST | `/api/events/import` | admin | body: an export file (up to 20 MB) → `201 { event }`. Always creates a new event with new ids; a taken slug gets a random suffix. Result entry by PIN starts switched off |

The file has `format: "draw-and-play-event"` and `formatVersion: 1`; anything else is rejected with `unsupportedFormat`. Files whose parts do not fit together (unknown references, duplicate ids, a draw that does not match the format, matches that do not exist in the structure) are rejected with `invalidImport`, and nothing is written.

## Competitions and entries

| Method | Path | Access | Body / result |
|---|---|---|---|
| POST | `/api/events/:id/competitions` | admin | `{ name, kind?, format, gamesToWin?, matchMinutes?, day?, earliestStart?, startAfterId?, tableIds?, color?, sortOrder? }` |
| PATCH | `/api/competitions/:id` | admin | same fields + `version`; `format` and `kind` only before the draw |
| DELETE | `/api/competitions/:id` | admin | only while no match was called or played |
| GET | `/api/competitions/:id/state` | public | live state, see below; admins also get seeds and the draw seed |
| POST | `/api/competitions/:id/entries` | admin | `{ personIds: [id] or [id, id], seed?, status? }`; in doubles a single player waits for the pair draw |
| PATCH / DELETE | `/api/entries/:id` | admin | before the draw; afterwards only `status: present/registered` |
| POST | `/api/entries/:id/withdraw` | admin | after the draw → `{ walkovers }`: the remaining matches of the entry become walkovers for the opponents, also in later knockout rounds; recorded results stay. A called match of the entry must be taken back first (`matchCalled`) |
| POST | `/api/entries/:id/reinstate` | admin | takes a withdrawal back (status `present`) while no match that builds on one of its walkovers has started (`dependentMatchStarted`) |
| POST | `/api/competitions/:id/draw` | admin | `{ seed?, seedCount?, seedPlacement? }` → `{ draw, seed }`; same seed and options, same draw. Doubles need every player paired |
| POST | `/api/competitions/:id/pairs/draw` | admin | doubles: `{ seed?, mode?: 'seeded' \| 'random' }` → `{ seed, pairs: [{ entryId, personIds }] }`; pairs all players without a partner |
| POST | `/api/competitions/:id/pairs/split` | admin | doubles: `{ entryIds? }` → `{ split }`; splits the given pairs (default all) back into single players |
| DELETE | `/api/competitions/:id/draw` | admin | only while no match was called or played |

Draw options: `seedCount` entries from the top of the seeding list (manual seed, then rating) are seeded, by default the group heads or a quarter of the bracket. `seedPlacement: 'fixed'` puts them on their places by seed number (groups in snake order, the default for groups); `'drawn'` draws them evenly, pot by pot, into the groups, or draws seeds 3/4, 5–8, … among their tier in a knockout (the default there). Unseeded entries are drawn freely, keeping clubs apart in groups where possible.

Pair draw: `mode: 'seeded'` (default) gives each player of the upper half of the seeding list a partner drawn from the lower half; the pair keeps the seeded player's seed. `'random'` pairs everyone freely.

`format` is the domain's `CompetitionFormat`, e.g. `{ "groups": { "groupCount": 2 }, "knockout": { "qualifiersPerGroup": 2, "placements": "thirdPlace" } }`.

### Competition state

```jsonc
{
  "competition": { "id": "…", "name": "Singles", "format": { … }, "drawn": true, "version": 3 },
  "entries": [{ "id": "…", "status": "present", "members": [{ "id": "…", "name": "Max Muster", "club": "TTC" }] }],
  "groups": [{ "group": 0, "entries": ["…"], "standings": [{ "entryId": "…", "rank": 1, "won": 3, … }], "complete": true }],
  "matches": [{
    "id": "…", "key": "GA-1-1", "phase": "group", "group": 0, "round": 1, "places": null,
    "sides": ["entryId", null], "sources": [{ "type": "draw" }, { "type": "winner", "matchKey": "KO-r1p1m2" }],
    "status": "pending", "tableId": null, "result": null, "version": 1
  }],
  "placements": [{ "entryId": "…", "place": 5, "placeTo": 6 }],
  "finished": false
}
```

Match `status`: `pending` (a side depends on unfinished matches), `ready`, `called`, `finished`. `sources` says where each side comes from (`draw`, `qualifier` with group and rank, or `winner`/`loser` of another match), so open sides can be shown as "1st group A" or "winner semifinal 1". Public views contain names and clubs only; ratings only if the event enables `publicRatings`.

## Match commands (admin)

Every command names the match `version` it saw (optimistic locking) and runs under a per-event lock, so two devices can never call the same table or the same player twice.

| Method | Path | Body |
|---|---|---|
| POST | `/api/matches/:id/call` | `{ tableId, version }` |
| POST | `/api/matches/:id/uncall` | `{ version }` |
| POST | `/api/matches/:id/result` | `{ notation: "4 -5 9 7", version }` or `{ walkoverWinner: 0 \| 1, version }` ; repeating a request is safe: if the match already holds exactly this result, the answer is `200` with the unchanged match, whatever `version` says |

A result for a finished match is a correction; it is refused with `dependentMatchStarted` once a later match that builds on it has been called or played. Every command is written to the audit log.

## Viewer code

New (and imported) events start with their public views behind a six character viewer code; existing events from before stay open. While a code is set, every public read (`GET /api/events/:ref`, `/operations`, `/forecast`, `/stream`, `/api/competitions/:id/state`, `/api/displays/:id`) needs an admin session, a result-entry device (PIN) or a viewer session, else `401 viewerCodeRequired`. The overview says `viewerProtected`; admin views of the event carry `viewerCode` in plain text (it only grants reading, and the notice with its QR code can be printed again).

| Method | Path | Access | Body / result |
|---|---|---|---|
| POST | `/api/events/:id/viewer-code` | admin | → `{ code }`; a new code signs out every viewer |
| DELETE | `/api/events/:id/viewer-code` | admin | opens the public views to everybody |
| POST | `/api/events/:idOrSlug/viewer` | public | `{ code }` (case, spaces and dashes do not matter) → sets the `dap_viewer` cookie, valid until the end of the day after the event; 10 attempts per 15 minutes |

## Result entry by PIN

Phones at the tables (QR code) sign in once with the event's six-digit PIN and are remembered as a device session (cookie `dap_device`, 72 hours). A new PIN signs out every device.

| Method | Path | Access | Body / result |
|---|---|---|---|
| POST | `/api/events/:id/pin` | admin | → `{ pin }`, shown only once; rotates the PIN |
| DELETE | `/api/events/:id/pin` | admin | turns result entry by PIN off |
| POST | `/api/events/:idOrSlug/device` | public | `{ pin, label? }` → sets the device cookie |
| GET | `/api/events/:idOrSlug/device` | public | `{ device }`, or `{ device: null }` if this browser is not signed in |

Devices may only use `POST /api/matches/:id/result` with a notation, and only for called matches: no walkovers, no corrections, no calls.

## Operations view

`GET /api/events/:idOrSlug/operations` (public) returns everything the match desk, phones and the projector need: `tables` (each with its called match or `null`), `queue` (ready matches; `busy: true` when a player is currently at another table) and `recent` (latest results). Matches carry the competition id and resolved sides `{ entryId, name, clubs, personIds }`.

## Forecast

`GET /api/events/:idOrSlug/forecast?day=YYYY-MM-DD` (public) plans one tournament day from the real state with the domain planner: finished matches drop out, called matches keep their table until they are expected to end, everything else is scheduled from now on (on the current day) or from the day's first start (on a future day). Once three matches of a competition are played, their average duration replaces the estimate. Without `day` the current day is used, or else the next day with competitions.

Returns `day`, `days`, `live`, `now`, `end`/`endLate` (10 % buffer), per competition `start`, `groupStageEnd`, `end`, `endLate`, `matchMinutes`, and the planned `matches` (`competitionId`, `matchKey`, `tableId`, `start`, `end`) – the desk uses them to suggest the next calls.


## Display profiles

Every admin can build their own displays: a profile is a named configuration with its own link `/e/<slug>/display/<profileId>`. Without a profile id the display uses the defaults.

| Method | Path | Access | Body / result |
|---|---|---|---|
| GET | `/api/events/:id/displays` | admin | `{ displays: [{ id, eventId, name, settings, version, createdBy }] }`, `createdBy` is a username |
| POST | `/api/events/:id/displays` | admin | `{ name, settings? }` → 201 `{ display }` |
| GET | `/api/displays/:id` | public | `{ display }`, for the screen showing it |
| PATCH | `/api/displays/:id` | admin | `{ name?, settings?, version }`; `settings` is merged into the stored ones |
| DELETE | `/api/displays/:id` | admin | |

`settings` (all optional when writing, always complete when read): `slideSeconds` (5–600, default 20), `tables`, `next`, `entries` (entry lists of competitions not drawn yet), `liveDraw` (reveal draws step by step), `todayOnly` (all booleans, default true except `todayOnly`) and `competitionIds` (`null` = all).

## Live updates

`GET /api/events/:idOrSlug/stream` is a Server-Sent Events stream:

```
event: ready
data: {"eventId":"…"}

event: change
data: {"eventId":"…","type":"match","id":"…"}
```

`type` is one of `event`, `tables`, `persons`, `competition`, `match`, `display` (a display profile), `draw` and `pairs` (a competition draw or pair draw just happened, `id` is the competition; displays use it to show the draw live). Messages carry no data, so public and admin clients share the stream and refetch what they are allowed to see. A heartbeat comment is sent every 25 seconds.
