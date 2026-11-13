# Changelog

All notable changes, generated from the commit messages ([Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)).

## [0.5.0] – 2026-11-13

### Features

- **web:** Score sheets and blank score sheets as A6 PDF
- **web:** Correct players afterwards

### Bug fixes

- **web:** Name downloaded PDFs and CSVs after contents and event

### Documentation

- Describe A6 score sheet PDFs and correcting players

### Tests

- **e2e:** Cover A6 PDFs and correcting a player

## [0.4.0] – 2026-11-12

### Features

- **domain:** Doubles with rotating partners
- **server:** Store and serve doubles with rotating partners
- **web:** Set up and show doubles with rotating partners

### Documentation

- Describe doubles with rotating partners

## [0.3.0] – 2026-11-12

### Features

- **domain:** Swiss system, best next-ranked entries and consolation rounds
- **server:** Store and serve Swiss rounds, best thirds and consolation fields
- **web:** Set up and show Swiss system, best thirds and consolation rounds

### Documentation

- Describe Swiss system, best thirds and consolation rounds

## [0.2.1] – 2026-11-11

### Bug fixes

- **deps:** Update glob and minimatch through @fastify/static, and the esbuild of drizzle-kit

## [0.2.0] – 2026-11-11

### Features

- **domain:** Explain step by step how ties in a group table were broken
- **server:** Send the tie-breaks of each group with the competition state
- **web:** Explain the format and every tie-break on the public competition page
- **web:** Delete an event from its settings
- **server:** A display profile setting for the format and tie slides
- **web:** Explain the format and every tie on the projector
- **server:** Draw the lots of finished groups from the seed of the draw
- **web:** Explain the WO ranking, lots and withdrawals, and warn before a walkover

### Bug fixes

- **domain:** Decide head-to-head by the duel's winner, not by its points alone
- **domain:** Rank groups and withdrawals as in the DTTB Wettspielordnung D 7.5 and D 7.9

## [0.1.1] – 2026-11-05

### Bug fixes

- **docker:** Let the app frame itself for the display preview
- **web:** Keep checkboxes full size when their label wraps

### Documentation

- Run the server install as a dedicated drawandplay user

### Build and CI

- Release through a pull request, since main only accepts merged pull requests
- Leave node major upgrades out of dependabot
- Leave typescript major upgrades out of dependabot

## [0.1.0] – 2026-11-05

### Features

- **domain:** Add seeded rng and table tennis sport profile
- **domain:** Add round robin schedule and group standings
- **domain:** Add knockout bracket with byes and placement matches
- **domain:** Add group draw and group-to-knockout transition
- **server:** Add fastify app with health check and spa fallback
- **web:** Add vue app shell with english and german locales
- **domain:** Add competition formats and match structure
- **domain:** Add table scheduler with critical path priority
- **domain:** Add tournament day planner and variant comparison
- **domain:** Include structure match in planned matches
- **web:** Add planner helpers for drafts, labels and times
- **web:** Add tournament planner with forecast, timeline and variant comparison
- **domain:** Resolve live competition state from draw and results
- **server:** Add database schema and initial migration
- **server:** Add admin api for setup, draw and match operation
- **server:** Add pin-based result entry and operations view
- **server:** Expose match side sources and report signed-out state as null
- **web:** Add tournament desk, phone result entry and projector display
- **server:** Add demo data set for the club championship
- **domain:** Plan around the live tournament state
- **server:** Add live forecast of a tournament day
- **web:** Show the live forecast and suggest the next calls
- **domain:** Draw doubles pairs and choose how seeds are placed
- **server:** Add pair draw for doubles and seeding options for the draw
- **web:** Draw doubles pairs and set the seeding for the draw
- **server:** Add display profiles and announce draws live
- **web:** Rebuild the projector display as a 16:9 stage with profiles
- **docker:** Add a backup service with periodic database dumps
- **server:** Export and import a whole event as JSON
- **web:** Download an event export and import it as a new event
- **domain:** Add a registry of sport profiles
- **server:** Take scoring and standings from the event's sport
- **web:** Use the event's sport for result entry and labels
- **server:** Accept persons with a first name only
- **web:** Add players with a first name only and flag equal names
- **server:** Accept a repeated result without a conflict
- **web:** Count hanging requests as offline after a timeout
- **web:** Open the app without a connection
- **web:** Keep results on the device until the connection is back
- **web:** Print score sheets, schedule, groups, results and certificates
- **server:** Import many persons at once and enter them right away
- **web:** Import players from a CSV file
- **domain:** Count the remaining matches of a withdrawn entry as walkovers
- **server:** Withdraw an entry after the draw and take it back
- **web:** Withdraw players after the draw
- **server:** Put the public views behind a viewer code
- **server:** Show admins the viewer code in the event overview
- **web:** Ask for the viewer code on public pages and manage it in setup
- **server:** Legal links per event and the audit log for admins
- **docker:** Send a content security policy and other security headers
- **web:** Legal links in the footer, per event, and the audit log tab
- **server:** User accounts with an admin and a registration desk role
- **web:** Manage users and roles, change the own password
- **web:** Put the events first, with a sidebar, an overview page, icons and a light/dark switch
- **web:** Set the days of an event and the schedule of each competition
- Show at the match desk how long both players have rested
- **web:** Name the app Draw & Play, with a new icon and telling tab titles
- **server:** Store the look of the installation and of events, with uploaded images
- **web:** Set name, accent colour, logo and display background, for the installation and per event
- Print certificates from a template with placeholders, signatures and a background
- **docker:** Run a released image from the registry via APP_IMAGE

### Bug fixes

- **domain:** Fill larger groups first in group draw
- **server:** Allow deleting an event that has entries
- **web:** Keep form input when live updates arrive
- **web:** Tidy the layout on phones

### Refactoring

- **web:** Start the planner empty instead of with example days
- **server:** Move shared validation schemas into one module
- **web:** Make the competition texts usable outside components

### Documentation

- Add product concept
- Correct matches per entry in planner example
- Add http api reference
- Describe the tournament day workflow
- Add production readiness plan
- Record the decisions for the CSV import and withdrawals
- Record the decisions for the viewer code
- Add a deployment guide with a tournament day checklist
- Restructure documentation into requirements, features, architecture and roadmap

### Tests

- Add end-to-end walkthrough of a tournament day

### Build and CI

- **docker:** Add compose stack with postgres and caddy
- **docker:** Pass first admin credentials to the app
- **docker:** Add separate demo stack
- **docker:** Build amd64 and arm64 images without emulation
- Run checks, tests and the end-to-end walkthrough on every push
- Publish releases with Docker image, changelog and release notes

### Other

- Scaffold npm workspaces monorepo
- License under AGPL-3.0-or-later

