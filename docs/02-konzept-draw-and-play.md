# draw-and-play – Konzept (Entwurf)

Webbasierte Turniersoftware, zuerst für die **Tischtennis-Vereinsmeisterschaften**, so gebaut, dass später **andere Sportarten und Events** möglich sind.

## 1. Ziele

1. Eine Veranstaltung mit **mehreren Tagen, mehreren Konkurrenzen gleichzeitig** und **mehreren Tischen** komplett abwickeln.
2. **Turnierplanung mit Simulation** vor dem Turnier und **Live-Prognose** während des Turniers: Welcher Modus passt zur Teilnehmerzahl? Wie viele Spiele gibt es? Wann ist das Finale? *Das ist der wichtigste Mehrwert.*
3. **Modus auch während des Turniers anpassbar**, solange es fachlich möglich ist, und mit Vorschau der Auswirkungen.
4. **Alles im Browser**: Eingabe (Turnierleitung, Tisch/Schiedsrichter) und Ausgabe (Tabellen, KO-Bäume, Tischübersicht, Zeitplan, Beamer-Anzeige, Spieleransicht auf dem Handy).
5. **Live ohne „Neuladen“**: Server-seitige Logik, Änderungen werden per Push an alle Clients verteilt.
6. **Sportneutraler Kern**: Tischtennis ist ein *Sport-Profil* mit Voreinstellungen, kein fest verdrahtetes Wissen.
7. **Robust in der Halle**: Muss im lokalen Netz ohne Internet laufen, z. B. auf einem Laptop als Server.

## 2. Konkretes Setup: Vereinsmeisterschaften

| Tag | Konkurrenz | Teilnehmer (ca.) | Wertung | Modus (Vorschlag) |
|---|---|---|---|---|
| Freitag | Jugend U19 | ~5 | 3 Gewinnsätze | Jeder gegen jeden, optional Finale Platz 1 gegen Platz 2 |
| Freitag | Jugend U14 | ~5 | 3 Gewinnsätze | wie U19 |
| Freitag | Jugend Anfänger | ~5 | 3 Gewinnsätze (ggf. 2) | wie U19 |
| Samstag vormittags | Doppel (eigene Konkurrenz, auch Teilnehmer außerhalb des Einzels) | offen | 3 Gewinnsätze | 2 Gruppen, die besten 2 jeder Gruppe kommen ins KO, Platzierungsspiele konfigurierbar |
| Samstag nach dem Doppel | Einzel Aktive | 10–16 | 3 Gewinnsätze | Gruppen + KO, Konstellation je nach Meldezahl über den Planer wählen |
| Samstag ab mittags | Hobby | ~5 | **2 Gewinnsätze** | Jeder gegen jeden |

**Rahmen Samstag:** 4 Tische, Doppel 10–12 Uhr, Einzel ab 12 Uhr (bzw. sobald das Doppel fertig ist). Das ist ein guter erster Testfall für den Planer: Mit 4 Tischen wird das Zeitfenster schnell knapp.

Daraus folgt für die Planung:
- **Spieler sind über Konkurrenzen hinweg gesperrt.** Doppel- und Einzelspieler sind teilweise dieselben Personen. Der Planer muss das berücksichtigen, auch wenn Hobby parallel zum Einzel läuft.
- **Tische werden zwischen Konkurrenzen geteilt.** Die Tischanzahl ist pro Halle fest hinterlegt. Optional kann man einer Konkurrenz eine Teilmenge zuordnen (z. B. Hobby auf Tisch 7–8).
- **Wertung je Konkurrenz**: Gewinnsätze und geschätzte Spieldauer (z. B. Best-of-5 ≈ 30 min, Best-of-3 ≈ 20 min).

## 3. Turnierplaner und Simulation (Kernfeature)

### 3.1 Was der Planer leistet
Eingaben: Teilnehmerzahl (geschätzt oder tatsächlich), Tische, Startzeit, Spieldauer je Konkurrenz, Pausenregel (optional Mindestpause je Spieler) sowie Abhängigkeiten zwischen Konkurrenzen („Einzel startet nach dem Doppel“, „Hobby ab 13:00“).

Der Planer **erzeugt automatisch alle sinnvollen Modus-Varianten** und vergleicht sie in einer Tabelle:

| Kennzahl | Bedeutung |
|---|---|
| Spiele gesamt | Gruppenphase + KO + Platzierungsspiele |
| Spiele je Teilnehmer min/max | Ausscheider nach der Gruppe vs. Finalist |
| Gruppenphase fertig | Uhrzeit |
| Finale / Ende | Uhrzeit |
| Tischauslastung | Anteil belegter Tisch-Zeitslots (Leerlauf zeigt Engpässe) |
| Wartezeit je Spieler | längste Pause zwischen zwei Spielen |
| Hinweise | z. B. „3 Gruppen → KO mit 6 Spielern, 2 Freilose“ |

Die gewählte Variante liefert einen **Zeitplan**: welches Spiel ungefähr wann auf welchem Tisch. Daraus werden Aushang und Beamer-Ansicht.

### 3.2 Wie gerechnet wird
- Rechenregel: **Dauer ≈ max(Spiele ÷ Tische, längste Kette voneinander abhängiger Runden) × Spieldauer**. Gruppen spielen rundenweise, und ein Spieler kann nicht zwei Spiele gleichzeitig spielen. Deshalb begrenzt **die Gruppengröße die Mindestdauer**: Eine Sechsergruppe braucht 5 Runden, egal wie viele Tische frei sind.
- Die Simulation verteilt die Spiele auf die Tische (Listenplanung) unter folgenden Bedingungen: Kein Spieler spielt doppelt, auch nicht konkurrenzübergreifend. KO-Spiele warten auf ihre Vorgänger. Optional gilt eine Mindestpause.
- Optional rechnet der Planer einen **Puffer** ein (z. B. +10 % oder +30 min) und zeigt dann eine Spanne: „Finale zwischen 15:30 und 16:00“.
- **Während des Turniers** rechnet die Prognose ständig mit dem realen Stand neu (gespielte Spiele, tatsächliche Spieldauern) und zeigt Verzug sofort an.

### 3.3 Beispielrechnung (Prototyp-Simulation, 6 Tische, 30 min/Spiel, ohne Puffer)
KO startet erst, wenn alle Gruppen fertig sind. „Top 2“ heißt, die ersten beiden jeder Gruppe kommen weiter.

**Einzel, 10 Teilnehmer**

| Variante | Spiele | je Spieler | Dauer |
|---|---|---|---|
| 1 Gruppe, jeder gegen jeden | 45 | 9 | ~4:30 h |
| 2 × 5, Top 2 → Halbfinale/Finale | 23 (+1 Platz 3) | 4–6 | ~3:30 h |
| 3 × (4/3/3), Top 2 → KO 8 (2 Freilose) | 17 | 2–5 | ~3:00 h |

**Einzel, 12 Teilnehmer**

| Variante | Spiele | je Spieler | Dauer |
|---|---|---|---|
| 1 Gruppe, jeder gegen jeden | 66 | 11 | ~5:30 h |
| 2 × 6, Top 2 → Halbfinale/Finale | 33 (+1) | 5–7 | ~3:30 h |
| 2 × 6, Top 4 → Viertelfinale | 37 | 5–8 | ~4:00 h |
| 3 × 4, Top 2 → KO 8 (2 Freilose für die besten Gruppensieger) | 23 | 3–6 | ~3:00 h |
| 4 × 3, Top 2 → Viertelfinale | 19 | 2–5 | ~3:00 h |

**Einzel, 16 Teilnehmer**

| Variante | Spiele | je Spieler | Dauer (6 Tische) | Dauer (8 Tische) |
|---|---|---|---|---|
| 2 × 8, Top 2 → Halbfinale/Finale | 59 | 7–9 | ~6:00 h | ~4:30 h |
| 3 × (6/5/5), Top 2 → KO 8 (2 Freilose) | 40 | 4–8 | ~4:30 h | ~4:00 h |
| 4 × 4, Top 2 → Viertelfinale | 31 | 3–6 | ~3:30 h | ~3:00 h |

**Jugend/Hobby, 5 Teilnehmer**: Jeder gegen jeden, 10 Spiele, 4 je Spieler. Es gibt 5 Runden mit je 2 Spielen, also ~2:30 h bei Best-of-5. Ein Finale kostet +30 min. Die drei Jugendkonkurrenzen passen parallel auf 6 Tische (3 × 2 Spiele pro Runde). Hobby mit Best-of-3 (~20 min) dauert ~1:40 h.

**Ablesbar:**
- Bei 16 Spielern sind 2 × 8 auf 6 Tischen zu lang. 4 × 4 halbiert die Dauer, dafür hat jeder Spieler weniger Spiele.
- Zusätzliche Tische helfen nur, solange die Tische der Engpass sind, nicht die Gruppengröße.
- Alle Plätze auszuspielen kostet kaum Zeit, weil die Platzierungsspiele parallel zur jeweiligen KO-Runde laufen. Das gilt, solange genug Tische frei sind.

Die Zahlen sind Planungswerte. Pausen, Einspielzeit und Verzögerungen kommen über den Puffer dazu.

## 4. Spielsysteme

Ansatz: Wenige **Bausteine (Stages)**, die sich kombinieren lassen, statt vieler fest codierter Sonderformate.

| Baustein | Konfiguration | MVP |
|---|---|---|
| **Gruppe (jeder gegen jeden)** | Anzahl Gruppen bzw. Gruppengrößen, einfache oder doppelte Runde, Tabellenregel (Sport-Profil) | ✅ |
| **KO** | Feldgröße (automatisch nächste Zweierpotenz, Freilose für die Besten), Setzung, **Platzierungsspiele: keine / Platz 3 / Plätze 1–4 / alle Plätze**, Trostrunde (später) | ✅ |
| **Übergang** zwischen Stages | „Top *k* je Gruppe“, optional „beste *m* Gruppendritte“, Kreuzschema (A1–B2, B1–A2 …), Vermeidung von Duellen aus derselben Gruppe in Runde 1 | ✅ |
| Doppel-KO, Schweizer System, Endrunde als Gruppe, Mannschaftskampf | – | später |

Daraus ergeben sich die Vorlagen für die Vereinsmeisterschaft:
- **Jeder gegen jeden** (+ optional „Finale Top 2“ oder „Halbfinale Top 4“)
- **Gruppen + KO** (n Gruppen, Top k, Platzierungsspiele wählbar)
- **Reines KO** (mit Setzung und Freilosen)

## 5. Änderungen während des Turniers

Grundsatz: **Was noch nicht begonnen hat, ist änderbar. Was gespielt ist, bleibt erhalten.** Vor jeder Änderung zeigt der Planer die neue Prognose („Finale verschiebt sich von 16:30 auf 15:45“), erst dann wird bestätigt. Jede Änderung wird protokolliert.

| Änderung | Erlaubt wenn | Wirkung |
|---|---|---|
| KO-Größe oder Top k ändern (z. B. Viertelfinale → Halbfinale) | KO hat noch nicht begonnen | Qualifikation und KO-Baum werden neu erzeugt |
| Platzierungsspiele hinzufügen/entfernen | betroffene Runde noch nicht gespielt | Spiele werden ergänzt bzw. gestrichen |
| Gewinnsätze/Spieldauer ändern | gilt für noch nicht aufgerufene Spiele | Prognose wird neu berechnet |
| Gruppen umbauen (Spieler verschieben, Gruppe teilen) | in den betroffenen Gruppen sind noch keine Ergebnisse | Spiele der Gruppe werden neu erzeugt |
| Spieler zieht zurück / kampflos | jederzeit | Restspiele werden kampflos gewertet oder gestrichen (Regel im Sport-Profil) |
| Nachmeldung | Gruppe ohne Ergebnisse oder KO noch nicht ausgelost | Einteilung, Spiele werden ergänzt |
| Konkurrenz auf andere Tische oder spätere Startzeit legen | jederzeit | Prognose wird neu berechnet |

## 6. Rollen und Oberflächen

| Rolle | Gerät | Kann |
|---|---|---|
| Turnierleitung (Admin) | Laptop | Alles: Planung, Stammdaten, Konkurrenzen, Auslosung, Aufruf, Korrekturen, Modusänderung, Druck/Export |
| Meldestelle | Laptop/Tablet | Spieler suchen/anlegen, melden, Anwesenheit |
| Tisch / Schiedsrichter | Handy/Tablet per **QR-Code am Tisch** | Nur Spiele dieses Tisches: Ergebnis eingeben (Kurznotation) |
| Anzeige | Beamer/TV im Kiosk-Modus | Rotierende Ansichten: Tischbelegung, nächste Aufrufe, Gruppen, KO-Bäume, Zeitplan |
| Öffentlich / Spieler | eigenes Handy (nur lesend) | Eigene Spiele inkl. voraussichtlicher Uhrzeit, „Du bist dran an Tisch 5“, Tabellen, Ergebnisse |

## 7. Funktionsumfang

### MVP (für die Vereinsmeisterschaft)
- **Veranstaltung** mit mehreren Tagen, Halle(n) mit fester Tischanzahl und einfachem Hallenplan.
- **Spieler**: Import per CSV (click-TT-Export mit **QTTR**) sowie manuelle Anlage. Felder: Name, Geschlecht, Geburtsjahr, Lizenz-Nr., TTR/QTTR. Gastspieler sind möglich (z. B. Doppelpartner).
- **Konkurrenzen**: Einzel und Doppel (Mixed ist nur Doppel mit Geschlechtsregel). Zulassungsregeln (Geschlecht, Jahrgang, TTR), **Wertung je Konkurrenz** (Gewinnsätze, Punkte je Satz) und geschätzte Spieldauer, Tag und Startzeit.
- **Turnierplaner** mit Variantenvergleich, Zeitplan und Live-Prognose (Kapitel 3).
- **Spielsysteme**: Bausteine Gruppe, KO und Übergang (Kapitel 4).
- **Meldung und Anwesenheit**, Doppelpaarbildung.
- **Auslosung**: Setzung (manuell oder nach QTTR), Schlangenverteilung, Zufall mit reproduzierbarem Seed. Optional werden Spieler getrennt, die nicht früh aufeinandertreffen sollen. Manuelles Nachjustieren vor dem Start.
- **Spielbetrieb**: Warteschlange spielbereiter Spiele (Sperre, wenn ein Spieler schon spielt, auch über Konkurrenzen hinweg), Vorschlag für den nächsten Aufruf nach Zeitplan, Aufruf auf einen Tisch, Laufzeit, Pausenzeit, Ergebniseingabe (Kurznotation `4`, `-5`, `-13`, kampflos), automatische Tabellen- und KO-Fortschreibung, Korrektur mit Neuberechnung.
- **Modusänderung im laufenden Turnier** (Kapitel 5).
- **Ausgaben**: Tischübersicht live, Gruppentabellen, KO-Baum, Zeitplan, Platzierungen, Beamer-Anzeige, Spieleransicht. Druck/PDF für Zeitplan-Aushang, Schiedsrichterzettel, Ergebnislisten und Urkunden.
- **Export**: CSV/PDF der Ergebnisse, JSON-Backup und -Restore der ganzen Veranstaltung.

### Später
- Startgeld/Kasse, Quittungen
- Schweizer System, Doppel-KO, Trostrunde, Vorgabe/Handicap, Mannschaftswettbewerbe
- click-TT-XML-Import und -Export (nuTurnier) für offizielle Turniere
- Weitere Sport-Profile (Badminton, Tennis, Darts, Kicker, Beachvolleyball …)
- Benachrichtigungen (Web-Push), Mehrsprachigkeit

## 8. Fachliches Datenmodell (sportneutral)

Leitlinien: echte Teilnehmer-Entität, strukturierte Satzergebnisse statt Text, Fremdschlüssel, mehrere Veranstaltungen pro Datenbank, Planung als eigene Ebene.

```
Event (Veranstaltung, mehrere Tage)
 ├─ Venue ── Table (Name, Position im Hallenplan, verfügbar von/bis)
 ├─ Person (Stammdaten, Verein, externe IDs, Ratings[] z. B. QTTR mit Stichtag)
 └─ Competition (Konkurrenz; Tag, frühester Start, erlaubte Tische)
       ├─ SportProfile-Referenz + MatchRules (bestOf, Punkte je Satz, Vorsprung, Dauer-Schätzung)
       ├─ EligibilityRules (Geschlecht, Jahrgang, Rating von/bis)
       ├─ Entry (Meldung) ── EntryMember ──> Person   (1 = Einzel, 2 = Doppel, n = Team)
       │     seed, status (gemeldet/anwesend/zurückgezogen)
       ├─ Stage[] (Reihenfolge; type = roundRobin | knockout | …; Konfiguration als Daten)
       │     ├─ Group ── GroupEntry (Position, Setzplatz)
       │     ├─ Bracket ── Slot (Quelle: Entry | Sieger/Verlierer von Match X | Platz n aus Gruppe Y)
       │     └─ Match ── Game (Satz: Punkte A/B)
       │           state: planned → ready → called(table) → finished | walkover | cancelled
       │           plannedStart, plannedTable (aus dem Planer), actualStart/End
       └─ Advancement (Übergangsregel Stage n → n+1: Top k, beste Dritte, Kreuzschema)

Plan (Szenario)   – gespeicherte Planer-Variante mit Annahmen und berechnetem Zeitplan
AuditLog          – jede Änderung (wer, wann, was, Prognose vorher/nachher)
```

- **SportProfile** legt fest: Begriffe (Satz/Game/Leg), Gewinnregel eines Satzes (TT: 11 Punkte, 2 Vorsprung), Kurznotation-Parser, Tabellen-Rangfolge (TT: Siege → Sätze → direkter Vergleich → Bälle), Rating-Typ (QTTR), Standard-Spieldauer je bestOf. Andere Sportarten bringen eigene Profile mit.
- **Stage-Konfiguration** und **Übergänge** sind Daten, keine Spezialcodes. Dadurch kann der Planer Varianten erzeugen, und der Modus lässt sich im laufenden Turnier ändern.
- **Planer und Spielbetrieb nutzen dieselbe Engine**: Eine Simulation ist ein Turnierlauf mit geschätzten statt echten Ergebnissen und Dauern.

## 9. Technik, Hosting und Sicherheit

### 9.1 Stack
- **TypeScript Full-Stack** in einem Repo: Server mit Node.js (z. B. Fastify), Frontend als SPA (z. B. SvelteKit oder Vue), gemeinsame Typen.
- **Turnierlogik als reine, getestete Domänenbibliothek**: Spielplan-Generator, Auslosung, Tabellen, KO mit Freilosen und Platzierungsspielen, Übergänge, Scheduler/Simulator, Kurznotation-Parser. Keine Abhängigkeit von UI oder Datenbank, mit Unit-Tests. Der Simulator läuft auch im Browser, damit der Planer sofort reagiert.
- **Datenbank: PostgreSQL** (läuft in Docker ohnehin mit) mit Migrationen über ein ORM (z. B. Drizzle).
- **Echtzeit** über WebSockets oder Server-Sent Events. Änderungen sind Server-Kommandos mit Validierung und optimistischer Sperre, damit nicht zwei Geräte dasselbe Spiel aufrufen.
- **Druck** über druckoptimierte HTML-Seiten mit CSS `@page`, PDF über den Browser.

### 9.2 Hosting (Entscheidung)
- **Docker Compose von Anfang an**: App-Container, PostgreSQL und ein Reverse Proxy (z. B. Caddy, holt automatisch HTTPS-Zertifikate). Konfiguration über Umgebungsvariablen, Daten in Volumes.
- **Entwicklung lokal** mit demselben Compose-Setup.
- **Für die Vereinsmeisterschaft in der Cloud** auf einem kleinen VPS (z. B. Hetzner, wenige Euro im Monat) mit eigener (Sub-)Domain. Nur so kommen Spieler ohne Umwege per Handy an die öffentlichen Ansichten und die Ergebniseingabe.
- **Notfallplan bei schlechtem Internet in der Halle**: Mobiler Hotspot für Turnierleitung und Beamer-PC. Dasselbe Image läuft notfalls lokal auf einem Laptop im WLAN, inklusive Backup-Export und -Import, um zwischen Cloud und Laptop umzuziehen. Die Turnierleitung kann jederzeit alle Ergebnisse selbst eintragen.
- **Backups**: automatischer Datenbank-Dump (z. B. stündlich während des Turniers) sowie JSON-Export der Veranstaltung auf Knopfdruck.

### 9.3 Zugriff und Rollen (Entscheidung)

| Zugang | Absicherung | Darf |
|---|---|---|
| **Öffentlich** | ohne Login | Nur lesen: Zeitplan, Tischbelegung, Tabellen, KO-Bäume, Ergebnisse, Beamer-Ansicht |
| **Ergebniseingabe** | **PIN** pro Veranstaltung/Tag oder pro Tisch (QR-Code am Tisch öffnet das Formular, PIN wird einmal eingegeben und als Gerätesitzung gemerkt) | Ergebnisse von Spielen eintragen, die aufgerufen sind bzw. laufen. Keine Korrektur bereits bestätigter Ergebnisse. |
| **Turnierleitung/Admin** | **Benutzername + Passwort** (gehashte Passwörter z. B. mit Argon2, sichere Session-Cookies, Login-Rate-Limit), später optional 2FA | Alles inkl. Korrekturen, Modusänderung, PIN neu erzeugen |

Weitere Regeln:
- **PIN ist rotierbar**, z. B. neue PIN für jeden Tag. Fehlversuche werden begrenzt.
- Jede Eingabe wird mit Gerät und Zeitpunkt protokolliert. Optional muss der Gegner die Eingabe bestätigen.
- **Datenschutz der öffentlichen Ansicht**: Es erscheinen nur Name und Verein bzw. Mannschaft, keine Geburtsdaten oder QTTR (QTTR öffentlich abschaltbar). Für Jugendliche ist eine Kurzform wählbar (z. B. „Max M.“). Die öffentlichen Seiten sind per `noindex` von Suchmaschinen ausgenommen. Teilnehmer werden bei der Anmeldung auf die Veröffentlichung hingewiesen.

## 10. Offene Fragen

Geklärt: 4 Tische, Doppel ab 10 Uhr, danach Einzel; Docker, Cloud-Hosting, Admin-Login, PIN-Eingabe, öffentliche Leseansicht.

Offen (klärbar während der Umsetzung):
1. Wann sind die Vereinsmeisterschaften? Davon hängt ab, wie viel aus dem MVP rechtzeitig fertig sein muss.
2. Doppel: Werden die Paare vorab gemeldet oder vor Ort zugelost?
3. Wie stabil ist das Internet in der Halle (Mobilfunk/WLAN)?
4. Gibt es einen Beamer oder TV für die Anzeige?
5. Woher kommen die QTTR-Werte: click-TT-CSV des Vereins oder manuelle Pflege?
6. Domain/Server: Gibt es schon eine Vereins-Domain oder einen Server?

## 11. Startprompt für den neuen Chat

> Wir entwickeln **draw-and-play**, eine webbasierte Turniersoftware (zuerst Tischtennis-Vereinsmeisterschaften, später sportneutral). Lies zuerst `docs/02-konzept-draw-and-play.md` (Konzept: Setup der Vereinsmeisterschaft, Turnierplaner/Simulation, Spielsystem-Bausteine, Änderungen im laufenden Turnier, Datenmodell, Technikvorschlag). Die Entscheidungen zu Hosting und Zugriff stehen in Kapitel 9 (Docker Compose, PostgreSQL, später Cloud-VPS, Admin-Login, PIN-Ergebniseingabe, öffentliche Leseansicht).
> Schritt 1: Stack-Details bestätigen und Projektgerüst mit Docker Compose anlegen (App, PostgreSQL, Reverse Proxy), lokal lauffähig. Schritt 2: Domänenbibliothek testgetrieben umsetzen: Sport-Profil Tischtennis, Gruppen-Spielplan, Auslosung mit Setzung, Tabellenberechnung, KO mit Freilosen und Platzierungsspielen, Übergänge, **Scheduler/Simulator mit Variantenvergleich**. Schritt 3: Turnierplaner-Oberfläche als erstes sichtbares Ergebnis. Schritt 4: Datenmodell, API, Echtzeit. Schritt 5: Spielbetrieb (Tischübersicht, Ergebniseingabe per Handy, Beamer-Anzeige).
