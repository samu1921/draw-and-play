# draw-and-play – Plan bis zum Produktivbetrieb

Stand: 2026-11-04 (nach Commit `329f8b2`). Fortschritt 2026-11-05: Schritte 1–8 sind umgesetzt; offen sind 9–11. Ziel: Die Vereinsmeisterschaften laufen direkt auf einem Cloud-Server (VPS mit eigener Domain). Der Plan ist so geschrieben, dass ein neuer Chat ihn Schritt für Schritt abarbeiten kann.

## Startprompt für den neuen Chat

> Wir arbeiten an **draw-and-play** (Turniersoftware, zuerst Tischtennis-Vereinsmeisterschaften). Lies `README.md`, `docs/02-konzept-draw-and-play.md` (Konzept) und diesen Plan `docs/03-plan-produktion.md`. Setze die Schritte **in der angegebenen Reihenfolge** um, immer nur einen Schritt auf einmal. Halte dich an die Arbeitsregeln unten. Nach jedem Schritt: Tests, Typecheck und Build grün, Commits nach Conventional Commits erstellen (nicht pushen), kurz berichten, was umgesetzt ist und was offen blieb, dann auf mein OK für den nächsten Schritt warten. Wenn ein Schritt eine Entscheidung braucht, die hier nicht steht, frag nach, statt zu raten. Beginne mit Schritt 1.

## Arbeitsregeln (gelten für jeden Schritt)

- **Zweisprachig:** Jeder sichtbare Text kommt in beide Locale-Dateien `apps/web/src/i18n/locales/en.ts` und `de.ts`. Die Domänenbibliothek (`packages/domain`) gibt Codes zurück, nie UI-Text. API-Fehler sind stabile Codes (`errors.<code>` im Frontend).
- **Code, Kommentare, Tests auf Englisch.** README-Änderungen in `README.md` **und** `README.de.md`, API-Änderungen in `docs/api.md`.
- **Testgetrieben:** Domänenlogik mit Vitest-Unit-Tests in `packages/domain`, API mit Integrationstests in `apps/server/test` (brauchen die Datenbank: `docker compose up -d db`).
- **Migrationen:** Schema in `apps/server/src/db/schema.ts` ändern, dann `npm run db:generate -w @draw-and-play/server`. Die Migration bekommt einen sprechenden Namen (wie `0003_display_profiles.sql`). Migrationen laufen beim Start automatisch.
- **Prüfen vor jedem Commit:** `npm test`, `npm run typecheck`, `npm run build`. Bei UI-Änderungen am Spielbetrieb zusätzlich `npm run e2e` (Stack muss laufen) und `e2e/walkthrough.mjs` erweitern, wenn ein neuer Ablauf dazukommt.
- **Commits:** Conventional Commits, kleine logische Einheiten, Scopes `domain`, `server`, `web`, `docker`, `docs`. Commit-Nachrichten auf Englisch. Nicht pushen.
- **Bestehende Muster wiederverwenden:** Optimistische Sperre über `version`, Live-Updates über `broadcaster.publish(...)`, Audit-Einträge in `audit_log`, druckbare Seiten wie `QrSheetView.vue` (Route mit `meta: { bare: true }`).

---

## Schritt 1 – Backups und Export/Import einer Veranstaltung

**Ziel:** Auf dem Server gehen keine Daten verloren, und eine Veranstaltung lässt sich als Datei sichern und wiederherstellen (auch auf einem Laptop als Notfall).

**1a. Automatischer Datenbank-Dump**
- Neuer Dienst `backup` in `docker-compose.yml` (Image `postgres:18-alpine`, wie `db`), Skript `docker/backup.sh`: alle `BACKUP_INTERVAL_MINUTES` (Standard 60, am Turniertag z. B. 15) ein `pg_dump -Fc` nach `/backups/drawandplay-<Zeitstempel>.dump`. Dumps, die älter als `BACKUP_KEEP_DAYS` sind (Standard 14), werden gelöscht.
- `/backups` als Bind-Mount auf `./backups` auf dem Host, damit die Dateien ohne Umweg erreichbar sind. `backups/` in `.gitignore` und `.dockerignore`.
- Variablen in `.env.example` dokumentieren. Der Demo-Stack braucht keinen Backup-Dienst (in `docker-compose.demo.yml` abschalten, z. B. über ein Profil).
- README (EN/DE): Abschnitt „Backups“ mit Befehl zum Wiederherstellen (`docker compose exec -T db pg_restore --clean --if-exists -U … -d … < backups/<datei>.dump`) und der Empfehlung, die Dumps zusätzlich vom Server wegzukopieren (z. B. per `scp`/`rclone`, nicht automatisieren).

**1b. JSON-Export und -Import einer Veranstaltung**
- `GET /api/events/:eventId/export` (Admin) liefert eine Datei (`Content-Disposition: attachment`) mit `{ format: 'draw-and-play-event', formatVersion: 1, exportedAt, domainVersion, event, tables, persons, competitions, entries, entryMembers, matches, displayProfiles }`. **Nicht** exportiert werden PIN-Hash, Gerätesitzungen, Benutzer und Audit-Log.
- `POST /api/events/import` (Admin) legt eine **neue** Veranstaltung an. Alle IDs werden neu vergeben und überall umgeschrieben, auch innerhalb von JSONB: `competitions.draw` (Entry-IDs in `groups`/`seats`), `competitions.tableIds`, `competitions.startAfterId`, `matches.sideA/sideB/tableId`, `displayProfiles.settings.competitionIds`. Ist der Slug belegt, bekommt die neue Veranstaltung einen freien Slug (Suffix). Alles in einer Transaktion, Validierung mit zod, unbekannte `formatVersion` → Fehler `unsupportedFormat`. Größenlimit des Bodys passend setzen (z. B. 10 MB).
- Logik in eine eigene Datei `apps/server/src/services/eventTransfer.ts` (Export bauen, ID-Mapping, Import).
- UI: Button „Exportieren“ in `EventSetup.vue`, Button „Veranstaltung importieren“ (Datei-Upload) in `EventsView.vue`.
- **Tests:** Export → Import → Export ergibt bis auf IDs, Slug und Zeitstempel dasselbe. Eine importierte Konkurrenz mit Auslosung und Ergebnissen liefert denselben `GET /api/competitions/:id/state` (Tabellen, KO, Platzierungen) wie das Original. Kaputte oder fremde Dateien werden mit Fehlercode abgelehnt.

**Fertig, wenn** der Backup-Container Dumps schreibt und aufräumt, ein Restore dokumentiert und einmal ausprobiert ist und der JSON-Rundlauf getestet ist.

---

## Schritt 2 – Sportart sauber anbinden

**Ausgangslage:** `events.sport` existiert (Default `'table-tennis'`), wird aber nirgends gelesen. Server und Web importieren überall direkt `tableTennis`.

- Domain: `packages/domain/src/sport/index.ts` mit `type SportId = 'table-tennis'`, `SPORT_IDS`, `sportProfiles: Record<SportId, SportProfile>` und `getSportProfile(id: string): SportProfile` (unbekannte ID → Fehler). Export über `index.ts`. Tests.
- Server: Beim Anlegen einer Veranstaltung ist `sport` optional wählbar (`z.enum(SPORT_IDS)`, Default `'table-tennis'`), später nicht mehr änderbar. Alle direkten `tableTennis`-Verwendungen in `routes/competitions.ts`, `services/competitions.ts`, `services/commands.ts` und `demo/seed.ts` lesen das Profil über die Veranstaltung der Konkurrenz.
- Web: `sport` in `EventInfo` (`lib/api.ts`) aufnehmen. `ResultDialog.vue`, `ResultKeypad.vue`, `TableEntryView.vue` und `EventCompetitions.vue` holen das Profil über die Veranstaltung. Der Planer (`stores/planner.ts`, `lib/planDraft.ts`) bleibt bei Tischtennis, bekommt aber das Profil als Parameter statt als festen Import.
- Den Namen der Wertungszahl nicht mehr fest im Text: „QTTR“ in den Locale-Texten durch einen Platzhalter `{rating}` ersetzen und mit `profile.ratingName` füllen.
- Auswahl der Sportart im Formular „Veranstaltung anlegen“ nur anzeigen, wenn es mehr als ein Profil gibt (aktuell also unsichtbar). In der Event-Übersicht die Sportart anzeigen (übersetzt über `sports.<id>`).
- **Tests:** Anlegen mit und ohne `sport`, unbekannte Sportart → 400, die bestehenden Tests bleiben grün.

**Fertig, wenn** `grep -rn "tableTennis" apps` nur noch die zentrale Stelle oder den Planer-Default trifft.

---

## Schritt 3 – Spieler mit Vornamen allein

**Ziel:** Ein Vorname reicht (z. B. Gastspieler, Kinder, Hobby-Konkurrenz). Der Nachname ist optional.

- Schema: `persons.last_name` nullable machen (Migration). zod in `routes/events.ts`: `lastName` optional/nullable, leerer String wird zu `null`.
- Anzeige zentral in `personName()` (`apps/server/src/services/competitions.ts`): `Vorname Nachname`, ohne Nachnamen nur `Vorname`. Kurzform bei `shortNames`: `Max M.`, ohne Nachnamen nur `Max`.
- Sortierung der Personenliste: nach `coalesce(last_name, first_name)`, dann `first_name`.
- Web `EventPersons.vue`: Feld Nachname ohne `required`. Die Spalte „Nachname, Vorname“ zeigt ohne Nachnamen nur den Vornamen (ohne Komma). Typ `lastName?: string | null` in `lib/api.ts`.
- **Namensgleichheit:** Haben zwei Personen derselben Veranstaltung denselben angezeigten Namen (auch in der Kurzform), zeigt die Personenliste einen nicht blockierenden Hinweis, damit die Turnierleitung z. B. einen Nachnamen-Buchstaben oder Verein ergänzt.
- **Tests:** Person ohne Nachnamen anlegen, bearbeiten, melden, auslosen. Öffentliche Ansicht mit und ohne `shortNames`. Doppelpaar aus zwei Personen ohne Nachnamen.

---

## Schritt 4 – Spieler-Import per CSV

**Entscheidung (2026-11-05):** generischer Import mit den Stammdaten des Modells, kein click-TT-Format. Ziel: Spielerliste vorab vorbereiten und am Turniertag per Klick importieren. Zusätzlich optionale Spalte „Konkurrenzen“, die die Spieler gleich meldet.

- Parser im Browser: `apps/web/src/lib/csv.ts` mit Unit-Tests. Trennzeichen `;` oder `,` automatisch erkennen, Anführungszeichen und Zeilenumbrüche in Feldern, UTF-8-BOM. Kodierung: zuerst UTF-8, bei ungültigen Zeichen Windows-1252 (`TextDecoder`), weil click-TT-Exporte oft so kodiert sind.
- Spaltenzuordnung: Bekannte Kopfzeilen automatisch erkennen (Vorname, Nachname, Name, Verein, Geschlecht, Geburtsjahr oder Geburtsdatum → Jahr, Lizenz-Nr., QTTR/TTR), danach in einem Zuordnungsdialog manuell änderbar. Nur der Vorname ist Pflicht (siehe Schritt 3).
- Vorschau-Tabelle mit Prüfung je Zeile (fehlender Vorname, ungültiges Jahr, ungültige Wertung) und Erkennung von Dubletten gegen vorhandene Personen (gleicher Vor- und Nachname plus Geburtsjahr, sonst Lizenz-Nr.). Je Dublette: überspringen oder Wertung/Verein aktualisieren.
- Server: `POST /api/events/:eventId/persons/import` (Admin), höchstens 1000 Zeilen, eine Transaktion, Antwort `{ created, updated, skipped }`. Ein Audit-Eintrag und ein `persons`-Broadcast.
- UI: Button „CSV importieren“ in `EventPersons.vue`.
- **Tests:** Parser (Trennzeichen, Quotes, BOM, Windows-1252, leere Zeilen), Endpunkt (Anlegen, Aktualisieren, Limit, Validierung).

---

## Schritt 5 – Ergebniseingabe bei schlechtem Netz

**Ausgangslage:** Die App ist eine reine Online-SPA. Ohne Verbindung schlägt das Speichern eines Ergebnisses mit dem Fehler `offline` fehl. Die Eingabe bleibt im Formular stehen, wird aber nicht gemerkt und nicht nachgesendet. Ein Neuladen der Seite ohne Netz scheitert, weil es keinen Service Worker gibt. Live-Updates (SSE) verbinden sich von selbst neu und laden dann nach.

**Ziel:** Ein Funkloch am Handy kostet kein Ergebnis. Vollständiger Offline-Betrieb (Aufruf, Turnierleitung) ist **nicht** Ziel, weil der Aufruf den aktuellen Gesamtstand braucht.

- **Postausgang für Ergebnisse:** In `TableEntryView.vue` und `ResultDialog.vue` (Turnierleitung) wird ein Ergebnis, das wegen Netzwerkfehler, Timeout oder 5xx nicht ankommt, als `{ matchId, version, notation | walkoverWinner, savedAt }` je Veranstaltung in `localStorage` abgelegt (lesen und schreiben in `try/catch`). Anzeige: „Wird gesendet, sobald wieder Verbindung besteht“. Erneuter Versuch beim Browser-Ereignis `online`, nach jedem SSE-`ready` und alle 15 Sekunden. Logik als testbares Modul `apps/web/src/lib/outbox.ts` plus Composable.
- **Timeout:** `api()` in `lib/api.ts` bricht Anfragen nach etwa 10 Sekunden über `AbortController` ab und meldet `offline`, damit eine hängende Verbindung im Funkloch nicht ewig wartet.
- **Doppeltes Senden ist harmlos (Server):** Kam die erste Anfrage an, nur die Antwort nicht zurück, liefert der zweite Versuch heute `409`. Neu: Ist das Spiel bereits mit **genau demselben** Ergebnis beendet, antwortet `POST /api/matches/:id/result` mit `200` (idempotent). Bei abweichendem Ergebnis bleibt es bei `409`, und das Handy zeigt „Die Turnierleitung hat bereits ein anderes Ergebnis eingetragen: …“ und verwirft den Eintrag im Postausgang erst nach Bestätigung. Bei `401` (PIN neu erzeugt) bleibt der Eintrag erhalten, bis die PIN erneut eingegeben ist.
- **App-Hülle offline verfügbar:** Service Worker (z. B. `vite-plugin-pwa` mit `generateSW`), der nur die gebauten statischen Dateien cacht, **nie** `/api/*`. Damit lädt die Tischseite auch ohne Netz, zeigt den letzten bekannten Stand und den Status „offline“ (`StreamBadge`). Nach einem Deploy muss die neue Version zuverlässig ankommen (Update-Strategie festlegen und testen).
- Die Anzeige auf Beamer/TV behält bei Netzverlust einfach den letzten Stand (prüfen, dass kein Fehlerbildschirm erscheint).
- **Tests:** Unit-Tests für den Postausgang (Wiederholung, Konflikt, 401). Server-Test für die Idempotenz. Im E2E-Walkthrough: Handy offline schalten (`context.setOffline(true)`), Ergebnis eingeben, wieder online, Ergebnis kommt am Turniertisch an.

---

## Schritt 6 – Druckansichten und Ergebnis-Export

Alle Druckseiten als eigene Routen unter `/admin/events/:eventId/print/...` mit `meta: { admin: true, bare: true }`, CSS `@page` (A4), Aufruf über einen „Drucken“-Bereich im Admin. PDF über den Druckdialog des Browsers.

- **Schiedsrichterzettel:** je Spiel Konkurrenz, Runde/Gruppe, Tisch (falls aufgerufen), beide Namen, Kästchen für `2 × gamesToWin − 1` Sätze, Unterschriftenfeld. Auswahl: alle aufgerufenen, alle spielbereiten oder eine ganze Konkurrenz. Dient auch als Rückfall auf Papier, wenn das Netz in der Halle ausfällt.
- **Zeitplan-Aushang:** aus der Prognose (`/api/events/:ref/forecast`), je Tag und Konkurrenz voraussichtliche Startzeiten.
- **Gruppenblätter und KO-Baum** je Konkurrenz (Tabellen, Kreuztabelle, Baum), wiederverwendbar aus den vorhandenen Komponenten.
- **Ergebnislisten/Platzierungen** je Konkurrenz und gesamt.
- **Urkunden:** einfache Vorlage (A4 quer) mit Veranstaltung, Konkurrenz, Platz, Name, Verein, Datum. Auswahl der Plätze (z. B. 1–3). Gestaltung und Logo kommen später mit den optischen Wünschen.
- **CSV-Export der Ergebnisse** (im Browser erzeugt, UTF-8 mit BOM für Excel): Platzierungen je Konkurrenz und alle Spiele mit Satzergebnissen.
- **Tests:** Unit-Tests für die Aufbereitung (z. B. Zettel-Daten, CSV-Zeilen). Im E2E-Walkthrough je Druckseite ein Screenshot.

---

## Schritt 7 – Rückzug während des Turniers

**Ausgangslage:** Nach der Auslosung lehnt `PATCH /api/entries/:id` den Status `withdrawn` mit `alreadyDrawn` ab. Jedes Restspiel muss einzeln als kampflos eingetragen werden.

- Domain: `resolveCompetition` bekommt die Menge der zurückgezogenen Meldungen. Jedes noch nicht gespielte Spiel einer zurückgezogenen Meldung wird kampflos für den Gegner gewertet, sobald der Gegner feststeht (auch spätere KO-Runden). Sind beide Seiten zurückgezogen, gilt das Spiel als ausgefallen, und der Platz im KO bleibt frei. Wertung in der Gruppe als Option im Sportprofil, Standard: Restspiele kampflos werten. Alternativ: alle Spiele des Spielers aus der Wertung nehmen. **Entscheidung (2026-11-05):** Restspiele werden kampflos gewertet. Ausführliche Unit-Tests.
- Server: `POST /api/entries/:entryId/withdraw` und `POST /api/entries/:entryId/reinstate` (Admin). Ein laufend aufgerufenes Spiel der Meldung muss vorher zurückgenommen werden (`409 matchCalled`). Zurücknehmen geht nur, solange kein Spiel begonnen hat, das auf einer der kampflosen Wertungen aufbaut. Audit-Eintrag und Broadcast.
- UI: In `CompetitionAdmin.vue` und am Turniertisch (`MatchDesk.vue`) „Zurückziehen“ mit Vorschau, welche Spiele kampflos gewertet werden. Kampflose Spiele überall als „kampflos“ (w. o.) kennzeichnen.

---

## Schritt 8 – Zugang zur öffentlichen Ansicht (Zuschauer-Code)

**Ziel:** Die öffentliche Ansicht ist nicht mehr für alle im Internet offen, sondern nur für Personen, die den Code der Veranstaltung kennen (Teilnehmende, Eltern, Verein). Das senkt die Reichweite der veröffentlichten Namen deutlich, vor allem bei Jugendlichen. Ein Datenschutzhinweis bei der Anmeldung und Impressum/Datenschutz-Links (Schritt 9) bleiben trotzdem nötig.

- **Pro Veranstaltung einstellbar:** „Öffentliche Ansicht: offen | nur mit Zugangscode“. Für neue Veranstaltungen ist „nur mit Zugangscode“ der Standard.
- **Eigener Code, getrennt von der Ergebnis-PIN:** Wer zuschaut, darf keine Ergebnisse eingeben. Umgekehrt dürfen Geräte mit Ergebnis-PIN und angemeldete Admins immer zuschauen. Der Code ist rotierbar, ein neuer Code meldet alle Zuschauer-Geräte ab.
- **Bequemer Zugang per QR-Aushang:** Ein Druckblatt (wie `QrSheetView.vue`) mit QR-Code auf `/e/<slug>?code=…`. Wer scannt, ist direkt drin, und das Gerät wird als Zuschauer-Sitzung gemerkt (Cookie, wie die Gerätesitzung bei der Ergebnis-PIN). Manuelle Eingabe des Codes auf einer schlichten Zugangsseite als Alternative.
- **Server:** Alle lesenden Endpunkte der öffentlichen Ansicht (`GET /api/events/:ref`, `/operations`, `/forecast`, `/stream`, `/api/competitions/:id/state` usw.) prüfen bei geschützten Veranstaltungen Admin-Sitzung, Ergebnis-Gerät oder Zuschauer-Sitzung, sonst `401 viewerCodeRequired`. Die Antwort auf `GET /api/events/:ref` ohne Zugang verrät nur den Namen der Veranstaltung und dass ein Code nötig ist. Code-Eingabe mit Rate-Limit wie bei der PIN.
- **Anzeige (Beamer/TV):** Der Link eines Anzeigeprofils bekommt ein geheimes Token, damit der Beamer-PC ohne Code-Eingabe läuft. Token je Profil neu erzeugbar.
- **Entscheidung (2026-11-05):** Code im Klartext (Aushang jederzeit nachdruckbar), Zuschauer-Sitzung gültig bis Ende der Veranstaltung + 1 Tag. Statt eines eigenen Anzeige-Tokens tragen die Beamer-Links den Zugangscode (`?code=`).
- **Tests:** Zugriff je Rolle auf jeden lesenden Endpunkt (offen/geschützt), Code-Rotation meldet Zuschauer ab, Anzeige-Token, Rate-Limit. Im E2E-Walkthrough: geschützte Veranstaltung über den QR-Link öffnen.

---

## Schritt 9 – Go-live-Härtung und Deployment

- **Sicherheits-Header** in `docker/Caddyfile`: `Strict-Transport-Security` (nur bei echter Domain wirksam), `Content-Security-Policy` (Ausgangspunkt: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), `Permissions-Policy`. Danach jede Ansicht durchklicken (QR-Bogen, Anzeige, Druck, Service Worker aus Schritt 5) und die Browser-Konsole auf CSP-Verstöße prüfen. Der E2E-Walkthrough soll bei CSP-Fehlern in der Konsole fehlschlagen.
- **Impressum und Datenschutz:** neue Umgebungsvariablen `IMPRINT_URL` und `PRIVACY_URL` (meist die Vereinswebsite), ausgeliefert über einen öffentlichen Endpunkt `GET /api/config`. Links im Fuß aller öffentlichen Seiten und der Tischseite. Optional pro Veranstaltung ein kurzer Hinweistext zur Veröffentlichung der Namen (Konzept 9.3).
- **Audit-Log einsehbar:** `GET /api/events/:eventId/audit` (Admin, seitenweise) und ein Reiter „Protokoll“ im Admin mit übersetzten Aktionen, Zeitpunkt und Akteur (Benutzer oder Gerät).
- **Deployment-Doku** (README EN/DE oder `docs/deploy.md`): VPS vorbereiten (Docker, Firewall nur 22/80/443), DNS-Eintrag, `.env` (Domain, Ports 80/443, starke Passwörter), Start, Update-Ablauf (`git pull && docker compose up -d --build`), Backups prüfen.
- **Checkliste Turniertag** in der Doku: Generalprobe am Vortag mit dem Demo-Ablauf auf dem echten Server, JSON-Export vor Beginn und nach jedem Tag, mobiler Hotspot für Turnierleitung und Beamer-PC, ausgedruckte Schiedsrichterzettel als Rückfall, PIN pro Tag neu.

---

## Schritt 10 – Benutzerverwaltung

- Admin-Bereich „Benutzer“: Benutzer anlegen, löschen, Passwort zurücksetzen (Mindestlänge wie beim Start-Admin: 12 Zeichen). Der letzte Admin kann nicht gelöscht werden.
- Eigenes Passwort ändern (altes Passwort nötig). Danach werden alle anderen Sitzungen dieses Benutzers beendet.
- Optional, nach Rückfrage beim User: Rolle `desk` (Meldestelle) neben `admin`. Die Meldestelle darf Personen und Meldungen pflegen und die Anwesenheit setzen, aber nicht auslosen, löschen, Ergebnisse korrigieren oder die PIN ändern. Spalte `role` in `users` (Migration), Prüfung in `requireAdmin` bzw. einem neuen `requireRole`.
- **Tests:** Rechte je Rolle, Schutz des letzten Admins, Sitzungen nach Passwortwechsel.

---

## Schritt 11 – Modusänderung im laufenden Turnier (eigener Planungsschritt)

Das Alleinstellungsmerkmal aus Konzept Kapitel 5. Heute lehnt die API Format- oder Art-Änderungen nach der Auslosung mit `alreadyDrawn` ab. Wegen des Umfangs **zuerst im Plan-Modus einen eigenen Plan erstellen und mit dem User abstimmen**, dann umsetzen. Umfang laut Konzept: KO-Größe/Top k ändern, solange das KO nicht begonnen hat; Platzierungsspiele ergänzen oder streichen; Gruppen umbauen, solange dort keine Ergebnisse sind; Nachmeldung in Gruppen ohne Ergebnisse. Jede Änderung mit Vorschau der neuen Prognose („Finale verschiebt sich von 16:30 auf 15:45“) und Audit-Eintrag.

---

## Danach: optische Themen und Anpassungswünsche

Die Liste kommt vom User (Logo, Farben, Urkunden-Gestaltung usw.).
