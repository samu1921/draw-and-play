# Anforderungen

[English](requirements.md) · **Deutsch**

Dieses Dokument hält fest, wofür draw-and-play gebaut wurde: Ausgangslage, Ziele, das Szenario, an dem sich alles orientiert, und die daraus abgeleiteten Anforderungen. Zu jeder Anforderung stehen der aktuelle Stand und ein Verweis auf die [Funktionsbeschreibung](features.de.md), wo sie umgesetzt ist.

Stand: ✅ umgesetzt · 🟡 teilweise umgesetzt · 🔜 als Nächstes auf der [Roadmap](roadmap.de.md) · 💡 Idee für später

## 1. Ausgangslage

Vereinsmeisterschaften und kleine offene Turniere im Tischtennis laufen oft mit Windows-Desktop-Software: ein einzelner PC an der Turnierleitung, eine lokale Datenbank, ausgedruckte Auslosungen, Ergebnisse auf Zetteln zur Turnierleitung getragen und ein Beamer, der ein zweites Programmfenster zeigt. Die Planung des Tages ist Schätzung: Ob ein Modus mit Fünfergruppen oder einer mit Vierergruppen rechtzeitig fertig wird, zeigt sich erst am Turniertag.

draw-and-play ersetzt das durch eine Webanwendung. Die Turnierleitung plant, lost aus und führt das Turnier im Browser, Spieler geben Ergebnisse am Handy ein, und alle sehen den aktuellen Stand live. Das Projekt lernt aus den bewährten Abläufen von Turniersoftware, enthält aber keinen fremden Code.

## 2. Ziele

| # | Ziel | Stand |
|---|---|---|
| G1 | Eine Veranstaltung mit **mehreren Tagen, mehreren Konkurrenzen gleichzeitig und mehreren Tischen** komplett abwickeln. | ✅ |
| G2 | **Turnierplanung mit Simulation** vor dem Turnier und **Live-Prognose** währenddessen: Welcher Modus passt zur Teilnehmerzahl, wie viele Spiele gibt es, wann ist das Finale? Das ist der wichtigste Mehrwert gegenüber klassischer Turniersoftware. | ✅ |
| G3 | **Modus während des Turniers anpassen**, solange es fachlich möglich ist, mit Vorschau der Auswirkungen. | 🟡 Rückzug ✅, Modusänderung 🔜 |
| G4 | **Alles im Browser**: Eingabe (Turnierleitung, Tische) und Ausgabe (Tabellen, KO-Bäume, Tischübersicht, Zeitplan, Beamer, Handys). | ✅ |
| G5 | **Live ohne Neuladen**: Die Logik läuft auf dem Server, jede Änderung wird an alle Clients verteilt. | ✅ |
| G6 | **Sportneutraler Kern**: Tischtennis ist ein *Sport-Profil* mit Voreinstellungen, kein fest verdrahtetes Wissen. | ✅ |
| G7 | **Robust in der Halle**: Ein Funkloch darf kein Ergebnis kosten, und bei Internetausfall kann die Veranstaltung auf einen Laptop umziehen. | ✅ |

## 3. Referenzszenario: Vereinsmeisterschaft

Der erste echte Einsatz ist die Vereinsmeisterschaft eines Tischtennisvereins. An ihr wurde jede Anforderung geprüft.

| Tag | Konkurrenz | Teilnehmer (ca.) | Wertung | Modus (Vorschlag) |
|---|---|---|---|---|
| Freitag | Jugend U19 | ~5 | 3 Gewinnsätze | Jeder gegen jeden, optional Finale Platz 1 gegen Platz 2 |
| Freitag | Jugend U14 | ~5 | 3 Gewinnsätze | wie U19 |
| Freitag | Jugend Anfänger | ~5 | 3 Gewinnsätze (ggf. 2) | wie U19 |
| Samstag vormittags | Doppel (eigene Konkurrenz, auch Teilnehmer außerhalb des Einzels) | offen | 3 Gewinnsätze | 2 Gruppen, die besten 2 jeder Gruppe ins KO, Platzierungsspiele konfigurierbar |
| Samstag nach dem Doppel | Einzel Aktive | 10–16 | 3 Gewinnsätze | Gruppen + KO, Konstellation je nach Meldezahl über den Planer |
| Samstag ab mittags | Hobby | ~5 | **2 Gewinnsätze** | Jeder gegen jeden |

Samstag gibt es 4 Tische, Doppel von 10 bis 12 Uhr, Einzel ab 12 Uhr bzw. sobald das Doppel fertig ist. Mit 4 Tischen wird das Zeitfenster schnell knapp, ein guter Testfall für den Planer.

Daraus folgt für die Planung:

- **Spieler sind über Konkurrenzen hinweg gesperrt.** Doppel- und Einzelspieler sind teilweise dieselben Personen, und Hobby läuft eventuell parallel zum Einzel.
- **Tische werden zwischen Konkurrenzen geteilt.** Eine Konkurrenz kann auf einen Teil der Tische beschränkt werden (z. B. Hobby auf Tisch 3–4).
- **Wertung je Konkurrenz**: Gewinnsätze und geschätzte Spieldauer (Best-of-5 ≈ 30 min, Best-of-3 ≈ 20 min).

## 4. Rollen

| Rolle | Gerät | Darf | Stand |
|---|---|---|---|
| Admin (Turnierleitung) | Laptop | alles: Planung, Spieler, Konkurrenzen, Auslosung, Aufruf, Korrekturen, Einstellungen, Druck und Export, Benutzer | ✅ |
| Meldestelle | Laptop oder Tablet | Spieler suchen und anlegen, melden, Anwesenheit setzen | ✅ |
| Tisch / Schiedsrichter | Handy oder Tablet per **QR-Code am Tisch** und PIN | Ergebnis des Spiels eingeben, das an diesem Tisch aufgerufen ist | ✅ |
| Anzeige | Beamer oder TV im Kiosk-Modus | rotierende Folien: Tische, nächste Spiele, Gruppen, KO-Bäume, Meldelisten, Live-Auslosung | ✅ |
| Öffentlich / Spieler | eigenes Handy, nur lesend | Zeitplan, eigene Spiele, Tabellen, Ergebnisse; auf Wunsch der Veranstaltung nur mit Zugangscode | ✅ |

## 5. Funktionale Anforderungen

### 5.1 Veranstaltung und Spieler

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F1 | Eine Veranstaltung umfasst einen oder mehrere Tage und hat eine feste Liste benannter Tische. | ✅ | [Veranstaltungen](features.de.md#2-veranstaltungen-und-tische) |
| F2 | Hallenplan mit Tischpositionen. | 💡 | |
| F3 | Spieler mit Vorname, Nachname, Verein, Geschlecht, Geburtsjahr, Lizenznummer und Wertungszahl (im Tischtennis QTTR). Ein Vorname allein reicht, für Gäste oder Kinder. | ✅ | [Spieler](features.de.md#3-spieler-und-meldungen) |
| F4 | Spieler aus einer vorbereiteten CSV-Datei importieren, optional gleich in Konkurrenzen melden. | ✅ | [Spieler](features.de.md#3-spieler-und-meldungen) |
| F5 | Import aus und Export in die Verbandssysteme (click-TT/nuLiga-XML) für offizielle Turniere. | 💡 | |

### 5.2 Konkurrenzen und Spielsysteme

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F6 | Einzel- und Doppelkonkurrenzen mit eigener Wertung (Gewinnsätze), geschätzter Spieldauer, Tag, frühestem Start, Start nach einer anderen Konkurrenz und erlaubten Tischen. | ✅ | [Konkurrenzen](features.de.md#4-konkurrenzen-und-spielsysteme) |
| F7 | Spielsysteme bestehen aus wenigen kombinierbaren **Bausteinen** statt fest codierter Sonderformate: Jeder gegen jeden (einfach oder doppelt), Gruppen mit anschließendem KO (Top *k* je Gruppe), reines KO. | ✅ | [Spielsysteme](features.de.md#4-konkurrenzen-und-spielsysteme) |
| F8 | KO mit automatischer Feldgröße, Freilosen für die Besten und wählbaren Platzierungsspielen: keine, Spiel um Platz 3, alle Plätze. | ✅ | [Spielsysteme](features.de.md#4-konkurrenzen-und-spielsysteme) |
| F9 | Übergang von den Gruppen ins KO über Kreuz (A1–B2, B1–A2 …), wobei Spieler derselben Gruppe in den ersten Runden getrennt bleiben. | ✅ | [Spielsysteme](features.de.md#4-konkurrenzen-und-spielsysteme) |
| F10 | Zulassungsregeln je Konkurrenz (Geschlecht, Jahrgang, Wertungsbereich), Mixed als Doppel mit Geschlechtsregel. | 💡 | |
| F11 | Weitere Bausteine: beste Gruppendritte, Trostrunde, Doppel-KO, Schweizer System, Mannschaftskampf, Vorgabe. | 🟡 | beste Gruppendritte, Trostrunde und Schweizer System ✅; Doppel-KO, Mannschaftskampf und Vorgabe 💡 |

### 5.3 Planer und Prognose

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F12 | Eingaben: Teilnehmerzahl je Konkurrenz, Tische, Startzeit, Spieldauer, optionale Mindestpause, Abhängigkeiten zwischen Konkurrenzen, Puffer. | ✅ | [Planer](features.de.md#1-turnierplaner) |
| F13 | Der Planer **erzeugt alle sinnvollen Modi** je Konkurrenz und vergleicht sie nach Spielen gesamt, Spielen je Teilnehmer, Ende der Gruppenphase, Ende, Tischauslastung und längster Wartezeit. Jede Variante wird zusammen mit allen anderen Konkurrenzen des Tages simuliert. | ✅ | [Planer](features.de.md#1-turnierplaner) |
| F14 | Die gewählte Variante ergibt einen Zeitplan: welches Spiel ungefähr wann auf welchem Tisch. | ✅ | [Planer](features.de.md#1-turnierplaner) |
| F15 | Während des Turniers rechnet die Prognose ständig mit dem realen Stand und den tatsächlichen Spieldauern neu und zeigt Verzug sofort an. | ✅ | [Prognose](features.de.md#6-spielbetrieb) |

### 5.4 Auslosung

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F16 | Setzung nach manuellem Setzplatz, sonst nach Wertungszahl; Schlangenverteilung auf die Gruppen; Zufallsauslosung, die sich über einen Startwert (Seed) reproduzieren lässt. | ✅ | [Auslosung](features.de.md#5-auslosung) |
| F17 | Spieler desselben Vereins möglichst auf verschiedene Gruppen verteilen. | ✅ | [Auslosung](features.de.md#5-auslosung) |
| F18 | Doppelpaare: als Paar melden oder vor Ort auslosen (gesetzt oder frei). | ✅ | [Auslosung](features.de.md#5-auslosung) |
| F19 | Auslosung vor dem Start von Hand nachjustieren. | 🟡 zurücknehmen und neu auslosen (mit Seed) ✅, einzelne Meldungen verschieben 💡 | [Auslosung](features.de.md#5-auslosung) |

### 5.5 Spielbetrieb

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F20 | Warteschlange spielbereiter Spiele. Ein Spieler, der gerade an einem Tisch steht, ist gesperrt, auch über Konkurrenzen hinweg. | ✅ | [Spielbetrieb](features.de.md#6-spielbetrieb) |
| F21 | Nächste Aufrufe nach Zeitplan vorschlagen; Spiel auf einen Tisch aufrufen; Aufruf zurücknehmen. | ✅ | [Spielbetrieb](features.de.md#6-spielbetrieb) |
| F22 | Ergebnisse in Kurznotation (`4 -5 9 7`), kampflose Spiele, Korrekturen mit Neuberechnung. Eine Korrektur wird abgelehnt, sobald ein darauf aufbauendes Spiel begonnen hat. | ✅ | [Spielbetrieb](features.de.md#6-spielbetrieb) |
| F23 | Tabellen, Qualifikation, KO-Baum und Platzierungen schreiben sich nach jedem Ergebnis automatisch fort. | ✅ | [Spielbetrieb](features.de.md#6-spielbetrieb) |
| F24 | Zwei Geräte können nie gleichzeitig denselben Tisch oder denselben Spieler aufrufen. | ✅ | [Architektur](architecture.de.md#5-konsistenz-und-live-updates) |
| F25 | Ergebniseingabe per Handy am Tisch (QR-Code + PIN). | ✅ | [Ergebniseingabe](features.de.md#7-ergebniseingabe-am-tisch) |
| F26 | Optionale Bestätigung eines Ergebnisses durch den Gegner. | 💡 | |

### 5.6 Änderungen während des Turniers

Grundsatz: **Was noch nicht begonnen hat, ist änderbar. Was gespielt ist, bleibt erhalten.** Jede Änderung wird protokolliert; Modusänderungen sollen vor der Bestätigung die neue Prognose zeigen.

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F27 | Ein Spieler zieht zurück oder tritt nicht an: Restspiele werden kampflos gewertet, auch spätere KO-Runden, seine Gruppenspiele werden gestrichen (WO D 7.9); der Rückzug lässt sich zurücknehmen, solange nichts darauf aufbaut. | ✅ | [Rückzug](features.de.md#5-auslosung) |
| F28 | Wertung oder Spieldauer für noch nicht aufgerufene Spiele ändern. | ✅ | [Konkurrenzen](features.de.md#4-konkurrenzen-und-spielsysteme) |
| F29 | Konkurrenz auf andere Tische oder eine spätere Startzeit legen. | ✅ | [Konkurrenzen](features.de.md#4-konkurrenzen-und-spielsysteme) |
| F30 | KO-Größe oder Top *k* ändern, solange das KO nicht begonnen hat; Platzierungsspiele ergänzen oder streichen; Gruppen ohne Ergebnisse umbauen; Nachmeldung in Gruppen ohne Ergebnisse. Jeweils mit Vorschau der neuen Prognose. | 🔜 | [Roadmap](roadmap.de.md#als-nächstes-modusänderung-im-laufenden-turnier) |

### 5.7 Ausgaben

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| F31 | Tischübersicht live, Gruppentabellen, KO-Bäume, Zeitplan, Platzierungen. | ✅ | [Öffentliche Ansichten](features.de.md#9-öffentliche-ansichten) |
| F32 | Beamer-Anzeige mit konfigurierbaren, rotierenden Folien. | ✅ | [Anzeigen](features.de.md#8-anzeigen) |
| F33 | Druckseiten / PDF: Schiedsrichterzettel, Zeitplan, Gruppenblätter mit Kreuztabelle, KO-Bäume, Ergebnislisten, Urkunden. | ✅ | [Drucken](features.de.md#10-drucken-und-export) |
| F34 | Ergebnisse als CSV exportieren; ganze Veranstaltung als Datei sichern und wiederherstellen. | ✅ | [Export](features.de.md#10-drucken-und-export) |
| F35 | Startgeld, Kasse und Quittungen. | 💡 | |
| F36 | Push-Benachrichtigungen an Spieler („Du bist dran an Tisch 5“). | 💡 | |

## 6. Nichtfunktionale Anforderungen

| # | Anforderung | Stand | Wo |
|---|---|---|---|
| N1 | **Hosting**: Docker Compose (App, PostgreSQL, Reverse Proxy mit automatischem HTTPS), dasselbe Setup lokal, auf einem kleinen Cloud-Server und auf einem Laptop. | ✅ | [Deployment](deploy.de.md) |
| N2 | **Zugriff**: öffentliche Seiten nur lesend; Ergebniseingabe mit rotierbarer PIN je Veranstaltung; Admins mit Benutzername und Passwort (Argon2-Hashes, sichere Session-Cookies, Rate-Limits). | ✅ | [Architektur](architecture.de.md#6-sicherheit-und-datenschutz) |
| N3 | **Datenschutz**: Öffentliche Ansichten zeigen nur Name und Verein, Wertungszahlen nur wenn freigegeben, auf Wunsch Kurznamen („Max M.“) je Veranstaltung; öffentliche Seiten sind von Suchmaschinen ausgenommen und lassen sich hinter einen Zugangscode legen; Impressum und Datenschutz auf jeder öffentlichen Seite verlinkt. | ✅ | [Architektur](architecture.de.md#6-sicherheit-und-datenschutz) |
| N4 | **Nachvollziehbarkeit**: Jede Änderung wird mit wer (Benutzer oder Gerät), wann und was protokolliert. | ✅ | [Protokoll](features.de.md#12-protokoll) |
| N5 | **Unzuverlässiges Netz**: Ohne Verbindung eingegebene Ergebnisse bleiben auf dem Handy und werden nachgesendet; die App-Hülle lädt offline. Vollständiger Offline-Betrieb der Turnierleitung ist kein Ziel. | ✅ | [Ergebniseingabe](features.de.md#7-ergebniseingabe-am-tisch) |
| N6 | **Backups**: regelmäßige Datenbank-Dumps und JSON-Export einer Veranstaltung auf Knopfdruck. | ✅ | [Deployment](deploy.de.md#6-backups) |
| N7 | **Zweisprachig**: Oberfläche auf Englisch und Deutsch; die Turnierlogik liefert sprachneutrale Codes. | ✅ | [Architektur](architecture.de.md#2-repository-und-stack) |
| N8 | **Getestete Logik**: Die Turnierlogik ist eine reine Bibliothek mit Unit-Tests, unabhängig von Oberfläche und Datenbank. | ✅ | [Architektur](architecture.de.md#3-domänenbibliothek) |
| N9 | Optionale Zwei-Faktor-Anmeldung für Admins. | 💡 | |

## 7. Nicht im Umfang

- Vollständiger Offline-Betrieb der Turnierleitung. Der Aufruf braucht den aktuellen Gesamtstand, deshalb hängt die Turnierleitung am Server (mit mobilem Hotspot als Rückfall).
- Ligabetrieb und Mannschaftsspieltage.
- Zahlungsabwicklung und Online-Anmeldung.
