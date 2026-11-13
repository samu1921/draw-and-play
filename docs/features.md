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
| [Appearance](#13-appearance) | admin | **Appearance** (`/admin/branding`), **Settings → Appearance** |

The interface is available in English and German and switches with the browser language or the language picker. Light or dark follows the system setting and can be switched in the user menu at the top right (as system, light, dark), next to language, my account and sign-out. The browser remembers the choice.

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

- An admin creates an **event** with name, address in the link (slug), first and last day and number of tables. Name and days can be changed under **Settings → Event**. With several days, each competition's day is chosen when it is created or later under **Schedule**; forecast, match desk and print then work per day. Tables are named "1" … "n" and can be renamed or extended under **Settings** (one name per line).
- The sport is chosen when the event is created and decides scoring, result notation and standings order. Table tennis is the only profile so far, so the choice is not shown yet.
- **Settings** also holds the result PIN, the access to the public views, the legal links, the public display options, the backup and deleting the whole event (see the following sections).
- An event can be deleted with all its data.

## 3. Players and entries

- **Players:** first name (required), last name, club, gender, year of birth, licence number and rating (QTTR in table tennis). Players without a last name are fine, for example guests or children. If two players would show the same name in public, the list points this out. A typo can be corrected at any time, also after the draw: the pencil in the list opens the row for editing (Enter saves, Esc cancels), and every view shows the new name right away.
- **CSV import:** one row per player, columns are recognised by their header (first name, last name, club, gender, born, licence no., rating, competitions) and can be reassigned by hand. Separator (`;` or `,`) and encoding (UTF-8 or Windows-1252, as Excel saves) are detected automatically. A preview checks every row and finds players who already exist; they can be skipped or updated. The optional column "competitions" enters the players right away. A template can be downloaded.
- **Entries:** players are entered into competitions as *registered* and set to *present* on arrival. Doubles are entered as pairs, or single players wait for the pair draw.
- The **registration desk** role can do all of this, but nothing else (see [users and roles](#11-users-and-roles)).

## 4. Competitions and formats

A competition has a name, a type (singles or doubles), a colour, scoring (games to win), estimated minutes per match, a day, an earliest start, optionally "starts after" another competition and the tables it may use.

**Formats** are built from stages:

| Format | Options |
|---|---|
| Round robin | single or double round robin |
| Groups + knockout | number of groups, top *k* of each group advance; optionally the best of the next group rank advance too, and the eliminated entries play a consolation round |
| Swiss system | number of rounds; on its own (the table is the final ranking) or as a preliminary stage, after which the top *k* of the table go into a knockout |
| Rotating partners | a kind of competition of its own for 4–32 players: doubles in which everybody partners everybody once; every player has their own row in the table |
| Knockout | bracket size is the next power of two, byes go to the best seeds |

Placement matches in the knockout: **none**, **3rd place** or **all places**. Group standings follow the sport profile; in table tennis the German federation's rules (DTTB Wettspielordnung D 7.5): more wins, then fewer losses, then game and point difference over all matches, then the matches among those still level (match, game and point difference), and finally lots. Lots are only drawn once the group is finished, automatically with the random key of the draw; until then the order of the draw applies provisionally. The crossover from the groups into the knockout keeps entries of the same group apart for as long as possible.

### Avoiding byes: the best of the next group rank advance

If the qualifiers do not fill a knockout bracket (for example 3 groups × 2 = 6 in a bracket of 8), the best seeded group winners would get a bye. With **avoid byes** the best entries of the next group rank advance instead, here the two best third-placed entries. The option is only offered when there are enough groups for it.

The thirds of all groups are compared with each other: first by the share of matches won, then by the game difference per match, then by the point difference per match, and finally by lot. With groups of the same size the order is the same as wins, game and point difference in the group table. If the groups differ in size (4 and 5), the matches against the bottom of the larger groups do not count: everyone is measured only on the matches against the first four of their group, so that the additional win against a fifth is no advantage. The per-match values even out what still differs after that, for example after a withdrawal. The competition shows this comparison as a table of its own, provisional while group matches are still open. In the bracket these entries are seeded so that they meet players of their own group as late as possible. Knockout matches with them only start when all groups are finished.

### Consolation: eliminated entries play for their places

By default the entries eliminated in the group stage share places by group rank (all thirds share 9th–12th, for example). **Consolation** offers two alternatives:

- **One bracket for everybody:** all eliminated entries play a knockout of their own for the places behind the main bracket. The better group ranks are seeded.
- **One bracket per group rank:** all thirds play among themselves, all fourths among themselves, and so on, so nobody ends up behind a lower group rank. A rank held by a single entry takes its place without a match.

A field of exactly **three entries** (the thirds of three groups, for example) plays **everybody against everybody** instead of a knockout: otherwise there would be a bye, and one entry would be done after a single match. The table of the field is ranked like a group and gives the places; everybody plays two matches. Whoever does not turn up to one of these matches is ranked last, as in a group.

If **byes** are left in a consolation bracket, they go to the best: first the better group ranks, and among entries with the same group rank the same comparison across all groups decides as for the best thirds (share of matches won, game and point difference per match, lots), not the letter of the group. The competition shows this comparison as a table. In the first round nobody meets an entry of the own group if it can be avoided.

Which places are played out in the consolation brackets follows the **placement matches** setting: with **all places** every place is played out in the main bracket and in the consolation, so every entry gets a place of its own.

### Swiss system

In a Swiss system nobody is eliminated: everybody plays a different opponent in every round. It follows the German federation's rules (DTTB Wettspielordnung D 7.6).

- **Rounds:** free to choose. The suggestion is two rounds more than a knockout of the same size would need (6 for 16 entries).
- **Pairings:** round 1 by the seeding list, upper half against lower half. After that, players with the same number of wins meet where possible, the upper half of them against the lower half; whoever is left over plays the best player with fewer wins. Nobody meets the same opponent twice.
- **Next round:** paired automatically as soon as the last result of the round before is entered. While no match of the new round has been called or played, it is paired again after a correction or a withdrawal; after that its pairings stay.
- **Bye:** with an odd number of players a different player sits out in every round, which counts as a win. It goes to the lowest player in the table who has not had one.
- **Table:** wins, then the Buchholz score (the sum of the wins of all opponents so far; a bye counts with the wins of the entry at the bottom of the table), then head-to-head, then lots.
- **Afterwards:** without a knockout the table position is the final place. With a knockout the top *k* go into the bracket with the table as the seeding list; everybody else keeps their table position.

The format and type can be changed until the draw. Scoring, match duration, start time, dependency and tables can be changed at any time (day, start time, dependency, minutes per match and tables on the competition's page under **Schedule**); they apply to matches that have not been called yet, and the forecast follows immediately.

## 5. Draw

- **Swiss system:** the seeds lead the starting order (default: the upper half) and the others are drawn below them, so in round 1 every seed meets a drawn opponent from the lower half.
- **Seeding list:** manual seed first, then rating (in doubles the average of both players). The number of seeded entries is configurable; by default the group heads or a quarter of the bracket.
- **Seed placement:** *fixed* (by seed number, groups in snake order) or *drawn* (pot by pot into the groups, or seeds 3/4, 5–8 … drawn within their tier in a knockout).
- **Unseeded entries** are drawn freely, keeping players of the same club in different groups where possible.
- **Reproducible:** every draw has a seed value. The same seed and options give the same draw, so a draw can be checked or repeated.
- **Doubles pair draw:** *seeded* (each player of the upper half of the seeding list gets a partner drawn from the lower half) or *free*. Pairs can be split again before the draw.
- **Undo:** a draw can be undone as long as no match has been called; entries and format can then be changed again.


### Doubles with rotating partners

A kind of competition of its own next to singles and doubles. Players enter alone, but every match is a doubles match, scheduled so that **everybody partners everybody once**. Everybody plays for themselves: a win counts for both players of the winning pair, and all players share one table. Whoever wins the most matches in total wins the competition.

- **Schedule:** fixed by the draw, which only draws the order of the players (nobody is seeded). It is split into rounds; nobody plays twice in a round, and the opponents are spread as evenly as possible.
- **Matches per player:** with 4, 5, 8, 9, 12, 13, … players it adds up exactly: everybody partners every other player once, so players − 1 matches (with an odd number everybody sits out once). With the other numbers it does not add up; everybody still plays equally often, each time with another partner, but one or two possible partners are left out (6 players: 4 matches, 10 players: 8). Who sits out a round is listed with the round.
- **Table:** like the sport's group table, but without head-to-head, since two players never play each other alone; whatever is still level is decided by lot (after the last match).
- **Withdrawal:** every match the player is in is annulled, including those already played; they then do not count for their partners and opponents either. The player is ranked last. A match recorded as a walkover, on the other hand, counts as a win or loss for all four players.
- **Match operations:** calling a match keeps all four players off other tables; table cards, phone entry, projector and print show both players of a side ("A / B").
- **Planner:** the format is in the list of formats of every competition and can be compared with all others; the number of entries is then the number of players. As a match has four players, at most players ÷ 4 matches run at the same time.

### Withdrawals

If a player withdraws after the draw, their remaining matches become walkovers for the opponents, including knockout matches that only arise later. As in DTTB Wettspielordnung D 7.9, all their group matches are annulled, including those already played, and they are last in the group. The same applies when a match is entered as a walkover: whoever does not turn up is out of the competition. The dialog shows how many matches are affected. A withdrawal can be taken back as long as no match that builds on one of its walkovers has started.

In a Swiss system DTTB WO D 7.6 applies: whoever withdraws or does not turn up stops playing but stays in the table with their wins, and their played matches keep counting. They are given a loss for every further round. If the current round has not started yet, it is paired again without them.

## 6. Match desk

The match desk is the admin's main screen during play.

- **Tables:** every table with its current match and running time, or "free".
- **Ready to call:** all matches whose players are known, each with its planned start and table from the forecast as a suggestion. A match whose player is currently on another table (in any competition) is marked and cannot be called.
- **Rest:** next to each player is how long ago their last match ended (across all competitions; in doubles the partner who played last counts), or "no match yet". Rests under 10 minutes are marked. The order can switch from **Forecast** to **Longest rest**, which puts the matches whose two sides have been free the longest at the top. This helps when some matches took much longer than planned.
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
- **Explain format and ties** (in the profile, on by default): every competition gets a **Format and ranking** slide with the format, match rules, standings criteria, who advances with the first knockout pairings, and the places. Once a group is finished, a line below its table says for each tie what decided it ("Place 2–3: same number of wins, decided by head-to-head"), and a **Ties** slide shows the calculation step by step. So the players in the hall can follow who advances and why.
- The display is a 16:9 stage that never scrolls. Arrow keys or a presenter remote switch slides, space pauses, F toggles full screen. Changes to the profile show up immediately on every screen.
- If the network drops, the display keeps showing the last state.

## 9. Public views

- `/e/<slug>` shows the tables with their current matches, the forecast per competition and day, and the latest results. Each competition has its own page with entries, groups with standings, the bracket and placements. Everything updates live.
- **Transparent ranking:** every competition page explains under **Format and ranking** the format, the match rules, all standings criteria in order, who advances to the knockout, the pairings of the first knockout round (e.g. A1 – B2) and which places are played out or shared. As soon as two players are level on wins, **How the tie is broken** below the group table walks through every tie step by step with the numbers: which criterion was applied, with which values, and who is ahead afterwards.
- **Access code:** new events start with their public views behind a six-character code. A notice with a QR code is printed and hung up at the venue; whoever scans it is in and stays signed in until the day after the event. The code can be renewed (signs everybody out) or switched off.
- **Privacy:** public pages show name and club only. Ratings only if enabled, short names ("Max M.") on request. Search engines are told not to index the pages.
- **Legal links:** legal notice and privacy policy in the footer of every public page, plus an optional note (for example "names and results of this event are published here"). Each event can set its own links; otherwise the installation's defaults apply.

## 10. Print and export

All print pages are formatted for A4 and can be saved as PDF from the browser's print dialog. Score sheets are also downloaded directly as a PDF in A6, which fits the usual score sheet holders: either four sheets per A4 page with dashed cut lines, or one sheet per A6 page for printers that take A6.

| Print page | Contents |
|---|---|
| Score sheets | one per match, with a row for every game, the result and a box to tick the winner; for called matches, ready matches or all open matches. Also the paper fallback if the network fails. |
| Blank score sheets | PDF only: empty sheets to fill in by hand, with just the event name. The number of game rows follows the chosen competition (two name lines for doubles) or is set by hand. |
| Schedule | expected start times per day and competition, from the forecast |
| Competitions | group sheets with standings and cross tables, brackets |
| Results | placements and all results per competition |
| Certificates | A4 landscape, choice of places (for example 1–3), following the certificate template (see [Appearance](#13-appearance)) |
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

## 13. Appearance

Under **Appearance** an admin sets the look of the whole installation:

- **Name** top left and in the browser tab, for example the club (otherwise “Draw & Play”).
- **Accent colour** from suggestions or picked freely. The app derives readable variants for light and dark (contrast at least 4.5:1) and picks white or dark text on buttons; the preview shows both.
- **Logo** (PNG, JPEG or WebP up to 8 MB) top left, on displays, printouts and as the browser tab icon.
- **Display background:** a 16:9 picture behind projectors and screens, darkened by an adjustable amount so the text stays readable; the cards on top are slightly translucent.

**Certificate template** (also under **Appearance**): text lines with placeholders (`{name}`, `{club}`, `{place}`, `{competition}`, `{event}`, `{date}`, also in German), up to two signature lines, the logo on or off and your own background image (A4 landscape, for example a designed club certificate). The **Text only** mode prints without frame, logo and background onto pre-printed certificates. A preview with sample data shows the result; in multi-day events the date is the competition's day. An event can have a template of its own under **Settings → Certificate template**.

Each event can override single values under **Settings → Appearance**, for example for a district championship with another host; empty fields use the default. Images are kept in the database, so backups include them, and they travel with an event's export.

## A tournament day in practice

1. Sign in at `/login`. Create the event, tables and competitions; choose each format with the planner.
2. Import or enter the players, enter them into the competitions, set attendance on arrival.
3. Draw the doubles pairs and the competitions.
4. Under **Settings**, generate the PIN, print the QR codes for the tables and the access notice. Under **Displays**, open each profile's link on its screen.
5. At the **match desk**, call ready matches to free tables. Players enter the result on their phone; the desk can always enter or correct it.
6. At the end, print result lists and certificates and save the placements as CSV.

The [deployment guide](deploy.md#8-tournament-day-checklist) has a checklist for the week before, the day before and the day itself.
