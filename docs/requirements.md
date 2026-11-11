# Requirements

**English** · [Deutsch](requirements.de.md)

This document records what draw-and-play was built for: the starting point, the goals, the scenario it was designed against and the requirements derived from it. Each requirement shows its current status and links to the [feature description](features.md) where it is implemented.

Status: ✅ implemented · 🟡 partly implemented · 🔜 next on the [roadmap](roadmap.md) · 💡 idea for later

## 1. Starting point

Club championships and small open tournaments in table tennis are often run with Windows desktop software: a single PC at the desk, a local database, printed draw sheets, results carried to the desk on paper slips, and a projector showing a second program window. Planning the day is guesswork: whether a format with groups of five or one with groups of four finishes in time only becomes clear on the day itself.

draw-and-play replaces this with a web application. The organisers plan, draw and run the event in the browser, players enter results on their phones, and everybody sees the current state live. The project learns from the established workflows of tournament software, but contains no third-party code.

## 2. Goals

| # | Goal | Status |
|---|---|---|
| G1 | Run a whole event with **several days, several competitions at the same time and several tables**. | ✅ |
| G2 | **Plan with a simulation** before the event and **forecast live** during it: which format fits the number of entries, how many matches there are, when the final will be played. This is the main benefit over classic tournament software. | ✅ |
| G3 | **Change the format during the event** where it is still possible, with a preview of the impact. | 🟡 withdrawals ✅, format changes 🔜 |
| G4 | **Everything in the browser**: input (desk, tables) and output (standings, brackets, table overview, schedule, projector, phones). | ✅ |
| G5 | **Live without reloading**: the logic runs on the server, every change is pushed to all clients. | ✅ |
| G6 | **Sport-neutral core**: table tennis is a *sport profile* with defaults, not hard-wired knowledge. | ✅ |
| G7 | **Robust in the hall**: a dead spot must not lose a result, and the event can move to a laptop if the internet fails. | ✅ |

## 3. Reference scenario: a club championship

The first real use is the club championship of a table tennis club. It served as the test case for every requirement.

| Day | Competition | Entries (approx.) | Scoring | Format (proposal) |
|---|---|---|---|---|
| Friday | Youth U19 | ~5 | best of 5 | round robin, optionally a final 1st vs. 2nd |
| Friday | Youth U14 | ~5 | best of 5 | like U19 |
| Friday | Youth beginners | ~5 | best of 5 (maybe 3) | like U19 |
| Saturday morning | Doubles (own competition, also players who do not play singles) | open | best of 5 | 2 groups, top 2 of each into a knockout, placement matches configurable |
| Saturday after the doubles | Singles | 10–16 | best of 5 | groups + knockout, chosen in the planner depending on the number of entries |
| Saturday from noon | Hobby | ~5 | **best of 3** | round robin |

Saturday has 4 tables, doubles from 10 to 12 o'clock, singles from 12 o'clock or as soon as the doubles are done. With 4 tables the time window becomes tight quickly, which makes this a good test for the planner.

Consequences for planning:

- **Players are locked across competitions.** Doubles and singles players are partly the same people, and hobby may run in parallel to the singles.
- **Tables are shared between competitions.** A competition can be limited to some of the tables (for example hobby on tables 3–4).
- **Scoring per competition**: games to win and estimated match duration (best of 5 ≈ 30 min, best of 3 ≈ 20 min).

## 4. Roles

| Role | Device | May | Status |
|---|---|---|---|
| Admin (tournament desk) | laptop | everything: planning, players, competitions, draw, calling matches, corrections, settings, print and export, users | ✅ |
| Registration desk | laptop or tablet | look up and create players, enter them, set attendance | ✅ |
| Table / umpire | phone or tablet via **QR code at the table** and PIN | enter the result of the match called to this table | ✅ |
| Display | projector or TV in kiosk mode | rotating slides: tables, next matches, groups, brackets, entry lists, live draw | ✅ |
| Public / players | own phone, read only | schedule, own matches, standings, results; behind an access code if the event wants that | ✅ |

## 5. Functional requirements

### 5.1 Event and players

| # | Requirement | Status | Where |
|---|---|---|---|
| F1 | An event spans one or more days and has a fixed list of named tables. | ✅ | [Events](features.md#2-events-and-tables) |
| F2 | A floor plan of the hall with table positions. | 💡 | |
| F3 | Players with first name, last name, club, gender, year of birth, licence number and rating (QTTR in table tennis). A first name alone is enough, for guests or children. | ✅ | [Players](features.md#3-players-and-entries) |
| F4 | Import players from a CSV file prepared in advance, optionally entering them into competitions at the same time. | ✅ | [Players](features.md#3-players-and-entries) |
| F5 | Import from and export to the federation systems (click-TT/nuLiga XML) for official tournaments. | 💡 | |

### 5.2 Competitions and formats

| # | Requirement | Status | Where |
|---|---|---|---|
| F6 | Singles and doubles competitions, each with its own scoring (games to win), estimated match duration, day, earliest start, start after another competition and allowed tables. | ✅ | [Competitions](features.md#4-competitions-and-formats) |
| F7 | Formats are built from a few combinable **stages** instead of hard-coded special formats: round robin (single or double), groups followed by a knockout (top *k* of each group), pure knockout. | ✅ | [Formats](features.md#4-competitions-and-formats) |
| F8 | Knockout with automatic bracket size, byes for the best seeds and a choice of placement matches: none, 3rd place, all places. | ✅ | [Formats](features.md#4-competitions-and-formats) |
| F9 | Crossover from groups to knockout (A1–B2, B1–A2 …) that keeps entries of the same group apart in the first rounds. | ✅ | [Formats](features.md#4-competitions-and-formats) |
| F10 | Eligibility rules per competition (gender, year of birth, rating range), mixed doubles as doubles with a gender rule. | 💡 | |
| F11 | Further stages: best third-placed entries advancing, consolation round, double elimination, Swiss system, team matches, handicap. | 💡 | |

### 5.3 Planner and forecast

| # | Requirement | Status | Where |
|---|---|---|---|
| F12 | Input: number of entries per competition, tables, start time, match duration, optional minimum rest, dependencies between competitions, buffer. | ✅ | [Planner](features.md#1-tournament-planner) |
| F13 | The planner **generates every sensible format** per competition and compares them by total matches, matches per entry, end of group stage, end, table utilisation and longest wait. Each variant is simulated together with all other competitions of the day. | ✅ | [Planner](features.md#1-tournament-planner) |
| F14 | The chosen variant gives a schedule: roughly which match on which table at what time. | ✅ | [Planner](features.md#1-tournament-planner) |
| F15 | During the event the forecast is recalculated continuously from the real state and actual match durations, and delays show immediately. | ✅ | [Forecast](features.md#6-match-desk) |

### 5.4 Draw

| # | Requirement | Status | Where |
|---|---|---|---|
| F16 | Seeding by manual seed, else by rating; snake order into groups; random draw that can be reproduced from a seed value. | ✅ | [Draw](features.md#5-draw) |
| F17 | Keep players of the same club apart in groups where possible. | ✅ | [Draw](features.md#5-draw) |
| F18 | Doubles pairs: entered as pairs, or drawn on site (seeded or freely). | ✅ | [Draw](features.md#5-draw) |
| F19 | Adjust a draw by hand before the start. | 🟡 undo and redraw (with seed) ✅, moving single entries 💡 | [Draw](features.md#5-draw) |

### 5.5 Match operation

| # | Requirement | Status | Where |
|---|---|---|---|
| F20 | A queue of matches ready to play. A player who is on a table is locked, also across competitions. | ✅ | [Match desk](features.md#6-match-desk) |
| F21 | Suggest the next calls according to the schedule; call a match to a table; undo a call. | ✅ | [Match desk](features.md#6-match-desk) |
| F22 | Enter results in short notation (`4 -5 9 7`), walkovers, corrections with recalculation. A correction is refused once a later match that builds on it has started. | ✅ | [Match desk](features.md#6-match-desk) |
| F23 | Standings, qualification, bracket and placements update automatically after every result. | ✅ | [Match desk](features.md#6-match-desk) |
| F24 | Two devices can never call the same table or the same player at once. | ✅ | [Architecture](architecture.md#5-consistency-and-live-updates) |
| F25 | Result entry on phones at the table (QR code + PIN). | ✅ | [Result entry](features.md#7-result-entry-at-the-table) |
| F26 | Optional confirmation of a result by the opponent. | 💡 | |

### 5.6 Changes during the event

Principle: **what has not started yet can be changed, what has been played is kept.** Every change is written to the audit log; format changes are to show the new forecast before they are confirmed.

| # | Requirement | Status | Where |
|---|---|---|---|
| F27 | A player withdraws or does not turn up: remaining matches become walkovers, also in later knockout rounds, their group matches are annulled (DTTB WO D 7.9); a withdrawal can be taken back while nothing builds on it. | ✅ | [Withdrawals](features.md#5-draw) |
| F28 | Change the scoring or match duration for matches not called yet. | ✅ | [Competitions](features.md#4-competitions-and-formats) |
| F29 | Move a competition to other tables or a later start. | ✅ | [Competitions](features.md#4-competitions-and-formats) |
| F30 | Change knockout size or top *k* while the knockout has not started; add or remove placement matches; rebuild groups without results; late entries into groups without results. Each with a preview of the new forecast. | 🔜 | [Roadmap](roadmap.md#next-format-changes-during-the-event) |

### 5.7 Output

| # | Requirement | Status | Where |
|---|---|---|---|
| F31 | Live table overview, group standings, brackets, schedule, placements. | ✅ | [Public views](features.md#9-public-views) |
| F32 | Projector display with configurable rotating slides. | ✅ | [Displays](features.md#8-displays) |
| F33 | Print pages / PDF: score sheets, schedule, group sheets with cross tables, brackets, result lists, certificates. | ✅ | [Print](features.md#10-print-and-export) |
| F34 | Export results as CSV; back up and restore a whole event as a file. | ✅ | [Export](features.md#10-print-and-export) |
| F35 | Entry fees, cash desk and receipts. | 💡 | |
| F36 | Push notifications to players ("you are on table 5"). | 💡 | |

## 6. Non-functional requirements

| # | Requirement | Status | Where |
|---|---|---|---|
| N1 | **Hosting**: Docker Compose (app, PostgreSQL, reverse proxy with automatic HTTPS), the same setup locally, on a small cloud server and on a laptop. | ✅ | [Deployment](deploy.md) |
| N2 | **Access**: public pages read only; result entry with a rotating PIN per event; admins with username and password (Argon2 hashes, secure session cookies, rate limits). | ✅ | [Architecture](architecture.md#6-security-and-privacy) |
| N3 | **Privacy**: public views show name and club only, ratings only if enabled, short names ("Max M.") per event on request; public pages are excluded from search engines and can be put behind an access code; legal notice and privacy links on every public page. | ✅ | [Architecture](architecture.md#6-security-and-privacy) |
| N4 | **Traceability**: every change is logged with who (user or device), when and what. | ✅ | [Audit log](features.md#12-audit-log) |
| N5 | **Unreliable networks**: results entered without a connection are kept on the phone and sent later; the app shell loads offline. Full offline operation of the desk is not a goal. | ✅ | [Result entry](features.md#7-result-entry-at-the-table) |
| N6 | **Backups**: periodic database dumps, plus a JSON export of an event at the push of a button. | ✅ | [Deployment](deploy.md#6-backups) |
| N7 | **Bilingual**: user interface in English and German; the tournament logic returns language-neutral codes. | ✅ | [Architecture](architecture.md#2-repository-and-stack) |
| N8 | **Tested logic**: the tournament logic is a pure library with unit tests, independent of UI and database. | ✅ | [Architecture](architecture.md#3-domain-library) |
| N9 | Optional two-factor authentication for admins. | 💡 | |

## 7. Out of scope

- Full offline operation of the tournament desk. Calling matches needs the current overall state, so the desk relies on the server (with a mobile hotspot as fallback).
- League operation and team match days.
- Payment processing and online registration.
