# Features

**English** · [Deutsch](features.de.md)

What draw-and-play does today, area by area, in the order a tournament runs through them. The [requirements](requirements.md) explain why each part exists; the [roadmap](roadmap.md) lists what is still missing.

## Overview

| Area | Who | Where in the app |
|---|---|---|
| [Tournament planner](#1-tournament-planner) | admin, registration desk | **Planner** (`/admin/planner`) |
| [Events and tables](#2-events-and-tables) | admin | **Events** (`/admin`, the start page), **Overview**, **Settings** |
| [Players and entries](#3-players-and-entries) | admin, registration desk | **Players**, **Competitions** |
| [Competitions and formats](#4-competitions-and-formats) | admin | **Competitions** |
| [Draw](#5-draw) | admin | **Competitions → competition** |
| [Match desk](#6-match-desk) | admin | **Match desk** |
| [Result entry at the table](#7-result-entry-at-the-table) | players, umpires | `/e/<slug>/table/<table>` via QR code |
| [Displays](#8-displays) | admin sets up, screen shows | **Displays**, `/e/<slug>/display/<profile>` |
| [Public views](#9-public-views) | everybody (with access code if set) | `/e/<slug>` |
| [Print and export](#10-print-and-export) | admin, registration desk | **Print**, **Settings → Backup** |
| [Users and roles](#11-users-and-roles) | admin | **Users**, **My account** |
| [Audit log](#12-audit-log) | admin | **Log** |

The interface is available in English and German and switches with the browser language or the language picker. Light or dark follows the system setting and can be switched in the header (as system → light → dark); the browser remembers the choice.

**Layout:** after signing in, the events open, running ones first, with a direct jump to the match desk. Inside an event a sidebar (a tab bar on phones) leads through Overview, Match desk, Players, Competitions, Displays, Print, Settings and Log. The **Overview** shows a preparation checklist (tables, players, competitions, draw, PIN, first match), the state of the competitions and, during the tournament, tables in use, matches ready to play and the expected end of the day.

## 1. Tournament planner

The planner answers the question "which format fits?" before anything is entered. It works without an event; the draft stays in the browser.

- **Day:** number of tables, start time, optional minimum rest between two matches of a player, buffer in percent or minutes.
- **Competitions** (up to 8 per day): name, number of entries, scoring (best of 1, 3, 5 or 7), minutes per match, format, placement matches, "not before" time, "starts after" another competition and a range of tables.
- **Compare formats:** for each competition the planner generates every sensible format (round robin, groups of different sizes with top *k* into a knockout, pure knockout) and simulates each one *together with all other competitions of the day*. The comparison shows total matches, matches per entry (min–max), end of the group stage, end with buffer, longest wait and the fastest variant. One click applies a variant.
- **Forecast:** start, end of group stage and end per competition, end of the day and table utilisation; a warning if matches cannot be scheduled (for example because the table range is too small).
- **Schedule per table:** a timeline (or list) showing which match runs on which table and when.

How the simulation works, with an example calculation, is described in the [architecture](architecture.md#4-planner-and-forecast).

## 2. Events and tables

- An admin creates an **event** with name, address in the link (slug), first and last day and number of tables. Tables are named "1" … "n" and can be renamed or extended under **Settings** (one name per line).
- The sport is chosen when the event is created and decides scoring, result notation and standings order. Table tennis is the only profile so far, so the choice is not shown yet.
- **Settings** also holds the result PIN, the access to the public views, the legal links, the public display options and the backup (see the following sections).
- An event can be deleted with all its data.

## 3. Players and entries

- **Players:** first name (required), last name, club, gender, year of birth, licence number and rating (QTTR in table tennis). Players without a last name are fine, for example guests or children. If two players would show the same name in public, the list points this out.
- **CSV import:** one row per player, columns are recognised by their header (first name, last name, club, gender, born, licence no., rating, competitions) and can be reassigned by hand. Separator (`;` or `,`) and encoding (UTF-8 or Windows-1252, as Excel saves) are detected automatically. A preview checks every row and finds players who already exist; they can be skipped or updated. The optional column "competitions" enters the players right away. A template can be downloaded.
- **Entries:** players are entered into competitions as *registered* and set to *present* on arrival. Doubles are entered as pairs, or single players wait for the pair draw.
- The **registration desk** role can do all of this, but nothing else (see [users and roles](#11-users-and-roles)).

## 4. Competitions and formats

A competition has a name, a type (singles or doubles), a colour, scoring (games to win), estimated minutes per match, a day, an earliest start, optionally "starts after" another competition and the tables it may use.

**Formats** are built from stages:

| Format | Options |
|---|---|
| Round robin | single or double round robin |
| Groups + knockout | number of groups, top *k* of each group advance |
| Knockout | bracket size is the next power of two, byes go to the best seeds |

Placement matches in the knockout: **none**, **3rd place** or **all places**. Group standings follow the sport profile; in table tennis: match points, game difference, head-to-head, point difference. The crossover from the groups into the knockout keeps entries of the same group apart for as long as possible.

The format and type can be changed until the draw. Scoring, match duration, start time, dependency and tables can be changed at any time; they apply to matches that have not been called yet, and the forecast follows immediately.

## 5. Draw

- **Seeding list:** manual seed first, then rating (in doubles the average of both players). The number of seeded entries is configurable; by default the group heads or a quarter of the bracket.
- **Seed placement:** *fixed* (by seed number, groups in snake order) or *drawn* (pot by pot into the groups, or seeds 3/4, 5–8 … drawn within their tier in a knockout).
- **Unseeded entries** are drawn freely, keeping players of the same club in different groups where possible.
- **Reproducible:** every draw has a seed value. The same seed and options give the same draw, so a draw can be checked or repeated.
- **Doubles pair draw:** *seeded* (each player of the upper half of the seeding list gets a partner drawn from the lower half) or *free*. Pairs can be split again before the draw.
- **Undo:** a draw can be undone as long as no match has been called; entries and format can then be changed again.

### Withdrawals

If a player withdraws after the draw, their remaining matches become walkovers for the opponents, including knockout matches that only arise later. Results already played stay. The dialog shows how many matches are affected. A withdrawal can be taken back as long as no match that builds on one of its walkovers has started.

## 6. Match desk

The match desk is the admin's main screen during play.

- **Tables:** every table with its current match and running time, or "free".
- **Ready to call:** all matches whose players are known, each with its planned start and table from the forecast as a suggestion. A match whose player is currently on another table (in any competition) is marked and cannot be called.
- **Call** a match to a free table (only tables allowed for its competition), **undo** a call, enter a **result** or a **walkover**, **correct** a result. A correction is refused once a later match that depends on it has been called or played.
- **Latest results** at a glance.
- **Forecast:** for the current day the planner runs again on the real state. Finished matches drop out, running matches keep their table until their expected end, the rest is planned from now on. After three played matches of a competition their real average duration replaces the estimate. The desk shows the expected end per competition and of the day (with a 10 % buffer).

Results use the short notation known from table tennis: per game the loser's points, negative if the second player won the game. `4 -5 9 7` means 11:4, 5:11, 11:9, 11:7. Deuce games are written as `-13` (13:15); full scores such as `11:4` are accepted too.

## 7. Result entry at the table

- Under **Settings** the admin generates a six-digit **PIN** (shown once) and prints a sheet with one **QR code per table**.
- A player or umpire scans the code, enters the PIN once, and the phone stays signed in for 72 hours. The page shows the match called to this table and a keypad for the short notation.
- Phones may only enter results of called matches: no walkovers, no corrections, no calls. A new PIN signs out every phone, for example one PIN per day.
- **Dead spots:** if a result cannot be sent, it waits on the phone ("will be sent once the connection is back") and is sent automatically. Sending twice is harmless. If the desk entered a different result meanwhile, the phone shows it. The page itself also loads without a connection.

## 8. Displays

- Under **Displays** every admin builds **display profiles**, one per screen (projector in the hall, TV at the entrance), each with its own link.
- A profile chooses the slides: tables, next matches, groups, brackets, entry lists of competitions not drawn yet and a **live draw** that reveals draws and doubles pairs step by step. It can also limit the competitions, show only today and set the seconds per slide.
- The display is a 16:9 stage that never scrolls. Arrow keys or a presenter remote switch slides, space pauses, F toggles full screen. Changes to the profile show up immediately on every screen.
- If the network drops, the display keeps showing the last state.

## 9. Public views

- `/e/<slug>` shows the tables with their current matches, the forecast per competition and day, and the latest results. Each competition has its own page with entries, groups with standings, the bracket and placements. Everything updates live.
- **Access code:** new events start with their public views behind a six-character code. A notice with a QR code is printed and hung up at the venue; whoever scans it is in and stays signed in until the day after the event. The code can be renewed (signs everybody out) or switched off.
- **Privacy:** public pages show name and club only. Ratings only if enabled, short names ("Max M.") on request. Search engines are told not to index the pages.
- **Legal links:** legal notice and privacy policy in the footer of every public page, plus an optional note (for example "names and results of this event are published here"). Each event can set its own links; otherwise the installation's defaults apply.

## 10. Print and export

All print pages are formatted for A4 and can be saved as PDF from the browser's print dialog.

| Print page | Contents |
|---|---|
| Score sheets | one per match, with boxes for every game and a signature line; for called matches, ready matches or all open matches. Also the paper fallback if the network fails. |
| Schedule | expected start times per day and competition, from the forecast |
| Competitions | group sheets with standings and cross tables, brackets |
| Results | placements and all results per competition |
| Certificates | A4 landscape, choice of places (for example 1–3) |
| QR codes | one code per table for result entry |
| Access notice | the access code with its QR code |

**CSV** (UTF-8, opens in Excel): placements and all matches with game scores.

**Event export:** under **Settings → Backup** the whole event (tables, players, competitions, draws, results, display profiles) is downloaded as a JSON file. Under **Events → New event → Import event** it becomes a new event, on the same or any other installation, for example to move from the server to a laptop and back. PIN, sessions, users and the audit log are not exported.

## 11. Users and roles

| Role | May |
|---|---|
| Admin | everything, including users |
| Registration desk | list events, look up, create, edit and import players, enter players, set attendance, read what the public views show |

- The first admin comes from the configuration (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). Under **Users** admins create further accounts, change roles, reset passwords and delete accounts. The last admin cannot be removed.
- Everybody changes their own password under **My account**; this signs out their other sessions. Passwords need at least 12 characters.

## 12. Audit log

Every change (draw, call, result, correction, withdrawal, settings, players …) is written to the audit log with time, actor (user or table device) and details. The **Log** tab shows it newest first, translated into the interface language.

## A tournament day in practice

1. Sign in at `/login`. Create the event, tables and competitions; choose each format with the planner.
2. Import or enter the players, enter them into the competitions, set attendance on arrival.
3. Draw the doubles pairs and the competitions.
4. Under **Settings**, generate the PIN, print the QR codes for the tables and the access notice. Under **Displays**, open each profile's link on its screen.
5. At the **match desk**, call ready matches to free tables. Players enter the result on their phone; the desk can always enter or correct it.
6. At the end, print result lists and certificates and save the placements as CSV.

The [deployment guide](deploy.md#8-tournament-day-checklist) has a checklist for the week before, the day before and the day itself.
