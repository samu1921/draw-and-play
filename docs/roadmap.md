# Roadmap

**English** · [Deutsch](roadmap.de.md)

Where draw-and-play stands and what comes next. The numbers (F…, N…) refer to the [requirements](requirements.md).

## Status

Ready for a first club championship. Everything the [reference scenario](requirements.md#3-reference-scenario-a-club-championship) needs is in place.

## Done

| Milestone | Contents |
|---|---|
| Domain library | sport profile table tennis, round robin, group and pair draw, standings, knockout with byes and placement matches, transitions, scheduler, planner (test-driven) |
| Planner | variant comparison, forecast, timeline per table |
| Data model, API, live updates | events, players, competitions, entries, draw, Server-Sent Events, optimistic locking, audit log |
| Match operation | match desk with queue and player lock, result entry by QR code and PIN, live forecast |
| Displays and public views | display profiles on a 16:9 stage, live draw, public overview and competition pages |
| Operations | Docker Compose, backup service, demo stack, JSON export/import of an event |
| Sport profiles | the sport is chosen per event; the rest of the app reads the profile instead of hard-wired table tennis |
| Players | first name alone is enough, CSV import with preview, duplicate detection and entries (F3, F4) |
| Dead spots | result outbox on phones, idempotent result requests, offline app shell (N5) |
| Print and export | score sheets, schedule, group sheets, brackets, results, certificates, CSV (F33, F34) |
| Withdrawals | remaining matches become walkovers, group matches annulled (DTTB WO D 7.9), can be taken back (F27) |
| Access | viewer code for the public views with a printable QR notice (N3) |
| Go-live hardening | security headers, legal links, audit log view, deployment guide with checklist (N2–N4) |
| Users | user management, roles admin and registration desk, own password |
| Look and feel | events as the start page, sidebar with an overview page, icons, light/dark, the name “Draw & Play” with icon and tab titles, appearance (name, accent colour, logo, display background) per installation and event, certificate template, reworked phone layout |
| Tournament day | event days and a schedule per competition in the interface, rest times at the match desk |

## Next: format changes during the event

The remaining part of goal G3 and requirement F30. The API currently refuses format changes after the draw (`alreadyDrawn`).

| Change | Allowed when | Effect |
|---|---|---|
| Change knockout size or top *k* (for example quarterfinals → semifinals) | the knockout has not started | qualification and bracket are rebuilt |
| Add or remove placement matches | the affected round has not been played | matches are added or dropped |
| Rebuild groups (move players, split a group) | the affected groups have no results | the group's matches are rebuilt |
| Late entry | group without results, or knockout not drawn yet | placed in a group or the draw, matches added |

Every change shows the new forecast before it is confirmed ("final moves from 16:30 to 15:45") and is written to the audit log. Because of its size, this step gets its own detailed plan before implementation.

## Ideas for later

- Eligibility rules per competition (gender, year of birth, rating), mixed doubles (F10)
- Further stages: best third-placed entries, consolation round, double elimination, Swiss system, team matches, handicap (F11)
- Moving single entries in a draw by hand (F19)
- Confirmation of a result by the opponent (F26)
- Entry fees, cash desk, receipts (F35)
- Push notifications for players (F36)
- click-TT/nuLiga XML import and export for official tournaments (F5)
- Floor plan of the hall (F2)
- More sport profiles: badminton, tennis, darts, table football, beach volleyball …
- Two-factor authentication for admins (N9)
