# Architektur

[English](architecture.md) · **Deutsch**

Wie draw-and-play aufgebaut ist und warum. Die einzelnen Endpunkte stehen in der [HTTP-API](api.md) (Englisch), der Betrieb in der [Deployment-Anleitung](deploy.de.md).

## 1. Überblick

```
 Browser (Vue-SPA)                       Server (Docker Compose)
 ┌──────────────────────────┐            ┌───────────────────────────────────────────┐
 │ Planer, Turnierleitung,  │  HTTPS     │ Caddy ── Reverse Proxy, HTTPS, Header     │
 │ Anzeigen, Handys,        │ ─────────▶ │   │                                       │
 │ öffentliche Ansichten    │  JSON-API  │ Fastify-App ── liefert SPA und /api       │
 │ Domänenbibliothek (Planer│ ◀───────── │   │  Domänenbibliothek (Auslosung,        │
 │ läuft auch im Browser)   │  SSE-Push  │   │  Tabellen, KO, Prognose)              │
 └──────────────────────────┘            │ PostgreSQL ◀── Backup-Dienst (pg_dump)    │
                                         └───────────────────────────────────────────┘
```

- **Ein Container-Image** enthält Server und gebautes Frontend. Dasselbe Compose-Setup läuft auf einem Laptop, auf einem Cloud-Server und in der Entwicklung.
- **Die Turnierlogik gibt es genau einmal**, als reine TypeScript-Bibliothek, die der Server (maßgeblicher Stand) und der Browser (sofort reagierender Planer) nutzen.
- **Kommandos gehen an den Server.** Er prüft sie, schreibt sie in einer Transaktion und meldet die Änderung per Server-Sent Events. Die Clients laden danach nach, was sie sehen dürfen.

## 2. Repository und Stack

| Pfad | Inhalt |
|---|---|
| `packages/domain` | Turnierlogik: Sport-Profile, Ergebnisnotation, Spielpläne jeder gegen jeden, Gruppen- und Paarauslosung, Tabellen, KO, Übergänge, Spielsysteme, Scheduler, Planer, Stand einer Konkurrenz. Ohne Abhängigkeiten zu Oberfläche oder Datenbank; läuft in Node und im Browser. Wird als TypeScript-Quelltext eingebunden, ohne eigenen Build-Schritt. |
| `apps/server` | Fastify-API, Drizzle ORM + PostgreSQL, Sitzungen, Live-Updates, Protokoll, Export/Import, Demodaten. Liefert im Betrieb auch das gebaute Frontend aus. |
| `apps/web` | Vue 3 + Vite + Vue Router + Pinia (SPA), lokalisiert mit vue-i18n (Englisch, Deutsch), ein kleiner Service Worker für die App-Hülle. |
| `docker/` | Caddy-Konfiguration, Backup-Skript, Demo-Einstellungen |
| `e2e/` | Playwright-Durchlauf eines ganzen Turniertags |

Stack: Node 22, TypeScript 6.0, Vitest, npm-Workspaces, PostgreSQL 18, Caddy 2. TypeScript 7 wird noch nicht eingesetzt, weil `vue-tsc` die JavaScript-API des Compilers braucht.

**Sprachneutraler Kern:** Domänenbibliothek und API liefern stabile Codes (`playerBusy`, `alreadyDrawn`, `invalidGame` …), nie Text. Das Frontend übersetzt sie. Jeder sichtbare Text steht in beiden Locale-Dateien unter `apps/web/src/i18n/locales/`.

## 3. Domänenbibliothek

**Gespeichert werden Fakten, der Stand wird abgeleitet.** Die Datenbank enthält nur, was sich nicht berechnen lässt: Spielsystem der Konkurrenz, Auslosung (wer sitzt wo), Ergebnisse, Rückzüge und Aufrufe. Gruppentabellen, Qualifikation, KO-Fortschritt, kampflose Wertungen nach Rückzügen und Platzierungen berechnet `resolveCompetition` jedes Mal neu. Das hält Korrekturen einfach: Ergebnis ändern, alles Weitere zieht nach.

| Modul | Zweck |
|---|---|
| `sport/` | `SportProfile`: Spielregeln (Gewinnsätze, Punkte je Satz, Vorsprung), Ergebnis-Parser, Tabellenkriterien, Name der Wertungszahl, Schätzung der Spieldauer. `tableTennis` mit der Kurznotation. |
| `roundRobin`, `standings` | Spielpläne jeder gegen jeden (Kreisverfahren, einfach oder doppelt), Tabellen mit den Kriterien des Profils (direkter Vergleich unter Punktgleichen). |
| `bracket`, `knockout` | Feldgröße, Setzpositionen, Freilose, Platzierungsspiele (keine / Platz 3 / alle Plätze). |
| `groupDraw`, `pairDraw`, `rng` | Gruppenauslosung mit Setzung in Schlangenreihenfolge oder Töpfen und Vereinstrennung, Doppelpaarauslosung, deterministischer Zufallsgenerator (gleicher Seed, gleiche Auslosung). |
| `transition` | Von den Gruppen ins KO: Reihenfolge der Qualifizierten und Kreuzschema, das Spieler derselben Gruppe trennt. |
| `format` | `CompetitionFormat` als Daten (`{ groups?, knockout? }`), Prüfung, Spielstruktur eines Modus. |
| `scheduler`, `planner` | Listenplanung auf gemeinsam genutzten Tischen, Simulation eines Tages, Erzeugen und Vergleichen von Modus-Varianten. |
| `competition` | Auslosung für eine Struktur, Berechnung des Live-Stands, abhängige Spiele (für Korrekturen und Rückzüge). |

Spielsysteme sind Daten, keine Code-Pfade. Nur deshalb kann der Planer Varianten erzeugen, und nur deshalb lässt sich der Modus künftig im laufenden Turnier ändern.

## 4. Planer und Prognose

**Faustregel:** Dauer ≈ max(Spiele ÷ Tische, längste Kette voneinander abhängiger Runden) × Spieldauer. Ein Spieler kann nicht zwei Spiele gleichzeitig spielen, Gruppen laufen also rundenweise, und **die Gruppengröße begrenzt die Mindestdauer**: Eine Sechsergruppe braucht 5 Runden, egal wie viele Tische frei sind.

**Simulation:** Der Planer verteilt alle Spiele aller Konkurrenzen des Tages auf die Tische (Listenplanung) unter diesen Bedingungen:

- Kein Spieler spielt zwei Spiele gleichzeitig, auch nicht konkurrenzübergreifend (Doppel- und Einzelspieler überschneiden sich).
- KO-Spiele warten auf die Spiele, die ihre Spieler bestimmen.
- Eine Konkurrenz beginnt frühestens zu ihrer Startzeit oder nach der Konkurrenz, von der sie abhängt, und nutzt nur ihre erlaubten Tische.
- Optional gilt eine Mindestpause je Spieler.

Ein Puffer (Prozent oder Minuten) macht aus dem Ende eine Spanne („Finale zwischen 15:30 und 16:00“).

**Varianten:** Für eine Konkurrenz erzeugt der Planer alle sinnvollen Modi (Jeder gegen jeden bis zu einer sinnvollen Größe, 1 bis *n* Gruppen mit Top *k*, reines KO) und simuliert jeden zusammen mit dem Rest des Tages.

**Live-Prognose:** Während des Turniers rechnet der Server dieselbe Simulation mit dem echten Stand. Gespielte Spiele fallen weg, aufgerufene behalten ihren Tisch bis zum erwarteten Ende, der Rest wird ab jetzt geplant. Nach drei gespielten Spielen einer Konkurrenz ersetzt deren gemessene Durchschnittsdauer die Schätzung.

**Beispielrechnung** (6 Tische, 30 min pro Spiel, ohne Puffer; das KO beginnt, wenn alle Gruppen fertig sind; „Top 2“ heißt, die ersten beiden jeder Gruppe kommen weiter):

Einzel, 10 Teilnehmer

| Variante | Spiele | je Spieler | Dauer |
|---|---|---|---|
| 1 Gruppe, jeder gegen jeden | 45 | 9 | ~4:30 h |
| 2 × 5, Top 2 → Halbfinale/Finale | 23 (+1 Platz 3) | 4–6 | ~3:30 h |
| 3 × (4/3/3), Top 2 → KO 8 (2 Freilose) | 17 | 2–6 | ~3:00 h |

Einzel, 12 Teilnehmer

| Variante | Spiele | je Spieler | Dauer |
|---|---|---|---|
| 1 Gruppe, jeder gegen jeden | 66 | 11 | ~5:30 h |
| 2 × 6, Top 2 → Halbfinale/Finale | 33 (+1) | 5–7 | ~3:30 h |
| 2 × 6, Top 4 → Viertelfinale | 37 | 5–8 | ~4:00 h |
| 3 × 4, Top 2 → KO 8 (Freilose für die besten Gruppensieger) | 23 | 3–6 | ~3:00 h |
| 4 × 3, Top 2 → Viertelfinale | 19 | 2–5 | ~3:00 h |

Einzel, 16 Teilnehmer

| Variante | Spiele | je Spieler | 6 Tische | 8 Tische |
|---|---|---|---|---|
| 2 × 8, Top 2 → Halbfinale/Finale | 59 | 7–9 | ~6:00 h | ~4:30 h |
| 3 × (6/5/5), Top 2 → KO 8 (2 Freilose) | 40 | 4–8 | ~4:30 h | ~4:00 h |
| 4 × 4, Top 2 → Viertelfinale | 31 | 3–6 | ~3:30 h | ~3:00 h |

Jugend oder Hobby, 5 Teilnehmer: jeder gegen jeden, 10 Spiele, 4 je Spieler, 5 Runden mit je 2 Spielen, etwa 2:30 h bei Best-of-5; ein Finale kostet 30 min mehr. Drei solche Konkurrenzen passen nebeneinander auf 6 Tische. Mit Best-of-3 (etwa 20 min) dauert es etwa 1:40 h.

Was die Zahlen zeigen:

- Bei 16 Spielern ist 2 × 8 auf 6 Tischen zu lang. 4 × 4 halbiert die Dauer, dafür hat jeder Spieler weniger Spiele.
- Mehr Tische helfen nur, solange die Tische der Engpass sind und nicht die Gruppengröße.
- Alle Plätze auszuspielen kostet kaum Zeit, weil die Platzierungsspiele parallel zur jeweiligen KO-Runde laufen, solange Tische frei sind.

## 5. Konsistenz und Live-Updates

- **Optimistische Sperre:** Konkurrenzen, Spiele und Anzeige-Profile haben eine `version`. Jedes Kommando nennt die Version, die es gesehen hat; ein veraltetes Kommando wird mit `versionConflict` abgelehnt, und der Client lädt neu.
- **Sperre je Veranstaltung:** Spiel-Kommandos laufen in einer Transaktion mit einem PostgreSQL-Advisory-Lock je Veranstaltung, sodass zwei Geräte nie denselben Tisch oder denselben Spieler doppelt aufrufen. Zusätzlich erzwingt die Datenbank über einen partiellen Unique-Index höchstens ein aufgerufenes Spiel pro Tisch.
- **Idempotente Ergebnisse:** Eine wiederholte Ergebnis-Anfrage ist harmlos. Hat das Spiel schon genau dieses Ergebnis, lautet die Antwort `200`; nur so können Handys nach einem Funkloch nachsenden.
- **Server-Sent Events:** `GET /api/events/:ref/stream` meldet, *was* sich geändert hat (`match`, `competition`, `persons`, `draw` …), aber ohne Daten. Öffentliche und Admin-Clients teilen sich den Stream und laden nach, was ihr Zugang erlaubt. Ein Heartbeat alle 25 Sekunden verhindert, dass Proxys die Verbindung schließen; Clients verbinden sich selbst neu.
- **Offline-Toleranz am Handy:** Ein Service Worker cacht die gebaute App-Hülle (nie `/api`). Ergebnisse, die nicht gesendet werden konnten, warten in einem lokalen Postausgang und werden bei neuer Verbindung, nach jedem `ready` des Streams und alle 15 Sekunden erneut gesendet.

## 6. Sicherheit und Datenschutz

| Thema | Umsetzung |
|---|---|
| Konten für Admin und Meldestelle | Benutzername + Passwort (mindestens 12 Zeichen), Argon2-Hashes, Session-Cookie `HttpOnly`, `SameSite=Lax`, `Secure` über HTTPS, standardmäßig 24 Stunden (`SESSION_TTL_HOURS`). Eine Passwortänderung meldet die anderen Sitzungen des Benutzers ab. |
| Rollen | `admin` und `desk`, geprüft auf jeder Route |
| Ergebniseingabe | sechsstellige PIN je Veranstaltung, rotierbar; eine Gerätesitzung (72 Stunden), die nur Ergebnisse aufgerufener Spiele eintragen darf |
| Öffentliche Ansichten | optionaler Zugangscode je Veranstaltung; eine Zuschauer-Sitzung gilt bis zum Tag nach der Veranstaltung |
| CSRF | zustandsändernde Anfragen müssen JSON sein (sonst `415 jsonRequired`), zusätzlich zu `SameSite`-Cookies |
| Brute Force | Rate-Limits: Login 10, PIN 5, Zugangscode 10 Versuche pro 15 Minuten |
| HTTP-Header | Caddy sendet eine strenge Content Security Policy (nur eigene Skripte, kein Einbetten), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Datensparsamkeit | öffentliche Ansichten zeigen nur Name und Verein; Wertungszahlen und Kurznamen je Veranstaltung; `noindex` für Suchmaschinen; Exporte enthalten weder PIN noch Sitzungen, Benutzer oder Protokoll |
| Nachvollziehbarkeit | jede Änderung landet mit Akteur (Benutzer oder Gerät) und Details im Protokoll |

## 7. Datenmodell

```
users ── sessions
events (Slug, Tage, Sportart, Zeitzone, PIN-Hash, Zugangscode,
        settings: öffentliche Wertungszahlen, Kurznamen, Impressum/Datenschutz, Hinweistext)
 ├─ event_tables
 ├─ persons (Vorname, Nachname?, Verein, Geschlecht, Geburtsjahr, Lizenz-Nr., Wertungszahl)
 ├─ display_profiles (settings)
 ├─ device_sessions, viewer_sessions
 ├─ audit_log (Akteur, Aktion, Objekt, Daten)
 └─ competitions (Art, Spielsystem, Spielregeln, Tag, frühester Start, startet nach, Tische, Auslosung)
       ├─ entries (Setzplatz, Status: gemeldet | anwesend | zurückgezogen)
       │     └─ entry_members ──> persons   (1 = Einzel, 2 = Doppel)
       └─ matches (Strukturschlüssel wie GA-1-1 oder KO-r2p1m1, Status, Tisch, Ergebnis,
                   Seiten zum Zeitpunkt des Aufrufs, aufgerufen/beendet um, version)
```

Eine Datenbank enthält beliebig viele Veranstaltungen. Die Migrationen liegen in `apps/server/drizzle/` und laufen beim Start.

## 8. Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Webanwendung mit zentralem Server statt Desktop-Programm | Handys, Beamer und öffentliche Ansichten brauchen den Live-Stand; die Turnierleitung hängt nicht an einem PC. |
| Zuerst Cloud-Server, Laptop als Rückfall | Spieler erreichen Ergebniseingabe und öffentliche Ansichten mit dem eigenen Handy, ohne das Netz der Halle. Dasselbe Image läuft auf einem Laptop; die Veranstaltung zieht per Export/Import um. |
| Reine Domänenbibliothek, Spielsysteme als Daten | ohne Datenbank testbar, Planer läuft im Browser, Modusänderungen im laufenden Turnier werden möglich |
| Server-Sent Events statt WebSockets | Updates fließen nur vom Server zum Client; Kommandos sind normale HTTP-Anfragen. SSE verbindet sich selbst neu und kommt problemlos durch Proxys. |
| Postausgang für Ergebnisse statt vollständigem Offline-Betrieb | Ein Funkloch darf kein Ergebnis kosten, aber der Aufruf braucht den Gesamtstand, also bleibt die Turnierleitung online. |
| Generischer CSV-Import statt Verbandsformat | Spielerlisten kommen aus vielen Quellen (Vereinssoftware, Excel); ein Import über Kopfzeilen deckt alle ab. Verbands-XML bleibt eine Idee für offizielle Turniere. |
| Rückzug wertet Restspiele kampflos | Tabellen und KO-Baum bleiben gültig, ohne Gruppen umzubauen; bereits gespielte Ergebnisse zählen. |
| Zugangscode im Klartext, Anzeige-Links tragen den Code | Er erlaubt nur Lesen; der Aushang muss jederzeit nachdruckbar sein, und Beamer-PCs sollen ohne Eingabe auskommen. |
| AGPL-3.0-or-later | Jeder darf draw-and-play nutzen und betreiben; wer eine veränderte Version über ein Netzwerk anbietet, muss deren Quelltext veröffentlichen. |
