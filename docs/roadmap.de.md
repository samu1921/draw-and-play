# Roadmap

[English](roadmap.md) · **Deutsch**

Wo draw-and-play steht und was als Nächstes kommt. Die Nummern (F…, N…) beziehen sich auf die [Anforderungen](requirements.de.md).

## Stand

Bereit für eine erste Vereinsmeisterschaft. Alles, was das [Referenzszenario](requirements.de.md#3-referenzszenario-vereinsmeisterschaft) braucht, ist umgesetzt.

## Erledigt

| Meilenstein | Inhalt |
|---|---|
| Domänenbibliothek | Sport-Profil Tischtennis, Jeder gegen jeden, Gruppen- und Paarauslosung, Tabellen, KO mit Freilosen und Platzierungsspielen, Übergänge, Scheduler, Planer (testgetrieben) |
| Planer | Variantenvergleich, Prognose, Zeitleiste je Tisch |
| Datenmodell, API, Live-Updates | Veranstaltungen, Spieler, Konkurrenzen, Meldungen, Auslosung, Server-Sent Events, optimistische Sperre, Protokoll |
| Spielbetrieb | Ansicht Spielbetrieb mit Warteschlange und Spielersperre, Ergebniseingabe per QR-Code und PIN, Live-Prognose |
| Anzeigen und öffentliche Ansichten | Anzeige-Profile auf einer 16:9-Bühne, Live-Auslosung, öffentliche Übersicht und Konkurrenzseiten |
| Betrieb | Docker Compose, Backup-Dienst, Demo-Stack, JSON-Export/-Import einer Veranstaltung |
| Sport-Profile | Sportart je Veranstaltung; der Rest der App liest das Profil statt fest verdrahtetem Tischtennis |
| Spieler | Vorname allein reicht, CSV-Import mit Vorschau, Dublettenerkennung und Meldungen (F3, F4) |
| Funklöcher | Postausgang für Ergebnisse am Handy, idempotente Ergebnis-Anfragen, App-Hülle offline (N5) |
| Drucken und Export | Schiedsrichterzettel, Zeitplan, Gruppenblätter, KO-Bäume, Ergebnisse, Urkunden, CSV (F33, F34) |
| Rückzug | Restspiele werden kampflos gewertet, rücknehmbar (F27) |
| Zugang | Zugangscode für die öffentlichen Ansichten mit druckbarem QR-Aushang (N3) |
| Go-live-Härtung | Sicherheits-Header, Impressum/Datenschutz, Protokoll-Ansicht, Deployment-Anleitung mit Checkliste (N2–N4) |
| Benutzer | Benutzerverwaltung, Rollen Admin und Meldestelle, eigenes Passwort |

## In Arbeit: Gestaltung

Erledigt: Veranstaltungen als Startseite, Seitenleiste in der Veranstaltung mit Übersichtsseite (Checkliste zur Vorbereitung, aktueller Stand), Icons durchgehend, Hell/Dunkel-Schalter, der der Systemeinstellung folgt. Ebenfalls erledigt: Tage der Veranstaltung und Zeitplan je Konkurrenz in der Oberfläche, Pausenzeiten beider Spieler im Spielbetrieb. Ebenfalls erledigt: Name „Draw & Play“ mit neuem Icon und sprechenden Tab-Titeln, Erscheinungsbild (Name, Akzentfarbe, Logo, Hintergrund der Anzeigen) je Installation und je Veranstaltung. Noch offen: Urkundenvorlage mit Platzhaltern und Hintergrundbild.

## Danach: Modusänderung im laufenden Turnier

Der fehlende Teil von Ziel G3 und Anforderung F30. Heute lehnt die API Modusänderungen nach der Auslosung ab (`alreadyDrawn`).

| Änderung | Erlaubt wenn | Wirkung |
|---|---|---|
| KO-Größe oder Top *k* ändern (z. B. Viertelfinale → Halbfinale) | KO hat noch nicht begonnen | Qualifikation und KO-Baum werden neu erzeugt |
| Platzierungsspiele hinzufügen oder entfernen | betroffene Runde noch nicht gespielt | Spiele werden ergänzt bzw. gestrichen |
| Gruppen umbauen (Spieler verschieben, Gruppe teilen) | in den betroffenen Gruppen gibt es noch keine Ergebnisse | Spiele der Gruppe werden neu erzeugt |
| Nachmeldung | Gruppe ohne Ergebnisse oder KO noch nicht ausgelost | Einteilung in eine Gruppe bzw. die Auslosung, Spiele werden ergänzt |

Jede Änderung zeigt vor der Bestätigung die neue Prognose („Finale verschiebt sich von 16:30 auf 15:45“) und wird protokolliert. Wegen des Umfangs bekommt dieser Schritt vor der Umsetzung einen eigenen, ausführlichen Plan.

## Ideen für später

- Zulassungsregeln je Konkurrenz (Geschlecht, Jahrgang, Wertung), Mixed (F10)
- Weitere Bausteine: beste Gruppendritte, Trostrunde, Doppel-KO, Schweizer System, Mannschaftskampf, Vorgabe (F11)
- Einzelne Meldungen in einer Auslosung von Hand verschieben (F19)
- Bestätigung eines Ergebnisses durch den Gegner (F26)
- Startgeld, Kasse, Quittungen (F35)
- Push-Benachrichtigungen für Spieler (F36)
- click-TT/nuLiga-XML-Import und -Export für offizielle Turniere (F5)
- Hallenplan (F2)
- Weitere Sport-Profile: Badminton, Tennis, Darts, Kicker, Beachvolleyball …
- Zwei-Faktor-Anmeldung für Admins (N9)
