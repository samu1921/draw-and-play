# Funktionen

[English](features.md) · **Deutsch**

Was draw-and-play heute kann, Bereich für Bereich, in der Reihenfolge, in der ein Turnier sie durchläuft. Die [Anforderungen](requirements.de.md) erklären, wozu es jeden Teil gibt; die [Roadmap](roadmap.de.md) zeigt, was noch fehlt.

## Überblick

| Bereich | Wer | Wo in der App |
|---|---|---|
| [Turnierplaner](#1-turnierplaner) | Admin, Meldestelle | **Planer** (`/admin/planner`) |
| [Veranstaltungen und Tische](#2-veranstaltungen-und-tische) | Admin | **Veranstaltungen** (`/admin`, Startseite), **Übersicht**, **Einstellungen** |
| [Spieler und Meldungen](#3-spieler-und-meldungen) | Admin, Meldestelle | **Spieler**, **Konkurrenzen** |
| [Konkurrenzen und Spielsysteme](#4-konkurrenzen-und-spielsysteme) | Admin | **Konkurrenzen** |
| [Auslosung](#5-auslosung) | Admin | **Konkurrenzen → Konkurrenz** |
| [Spielbetrieb](#6-spielbetrieb) | Admin | **Spielbetrieb** |
| [Ergebniseingabe am Tisch](#7-ergebniseingabe-am-tisch) | Spieler, Schiedsrichter | `/e/<slug>/table/<tisch>` per QR-Code |
| [Anzeigen](#8-anzeigen) | Admin richtet ein, Bildschirm zeigt | **Anzeigen**, `/e/<slug>/display/<profil>` |
| [Öffentliche Ansichten](#9-öffentliche-ansichten) | alle (ggf. mit Zugangscode) | `/e/<slug>` |
| [Drucken und Export](#10-drucken-und-export) | Admin, Meldestelle | **Drucken**, **Einstellungen → Datensicherung** |
| [Benutzer und Rollen](#11-benutzer-und-rollen) | Admin | **Benutzer**, **Mein Konto** |
| [Protokoll](#12-protokoll) | Admin | **Protokoll** |
| [Erscheinungsbild](#13-erscheinungsbild) | Admin | **Erscheinungsbild** (`/admin/branding`), **Einstellungen → Erscheinungsbild** |

Die Oberfläche gibt es auf Englisch und Deutsch. Sie richtet sich nach der Browsersprache oder der Sprachauswahl. Hell oder dunkel folgt der Systemeinstellung und lässt sich im Benutzermenü oben rechts umschalten (wie System, hell, dunkel); dort liegen auch Sprache, Mein Konto und Abmelden. Die Wahl merkt sich der Browser.

**Aufbau:** Nach der Anmeldung öffnen sich die Veranstaltungen, laufende zuerst, mit direktem Sprung in den Spielbetrieb. Innerhalb einer Veranstaltung führt eine Seitenleiste (auf dem Handy eine Reiterleiste) durch Übersicht, Spielbetrieb, Spieler, Konkurrenzen, Anzeigen, Drucken, Einstellungen und Protokoll. Die **Übersicht** zeigt eine Checkliste zur Vorbereitung (Tische, Spieler, Konkurrenzen, Auslosung, PIN, erstes Spiel), den Stand der Konkurrenzen und während des Turniers belegte Tische, spielbereite Spiele und das voraussichtliche Tagesende.

## 1. Turnierplaner

Der Planer beantwortet die Frage „Welcher Modus passt?“, bevor irgendetwas angelegt ist. Er funktioniert ohne Veranstaltung; der Entwurf bleibt im Browser.

- **Tag:** Anzahl Tische, Startzeit, optionale Mindestpause zwischen zwei Spielen eines Spielers, Puffer in Prozent oder Minuten.
- **Konkurrenzen** (bis zu 8 pro Tag): Name, Teilnehmerzahl, Wertung (Best-of-1, -3, -5 oder -7), Minuten pro Spiel, Modus, Platzierungsspiele, „nicht vor“, „startet nach“ einer anderen Konkurrenz und ein Tischbereich.
- **Modi vergleichen:** Für jede Konkurrenz erzeugt der Planer alle sinnvollen Modi (Jeder gegen jeden, Gruppen unterschiedlicher Größe mit Top *k* ins KO, reines KO) und simuliert jeden *zusammen mit allen anderen Konkurrenzen des Tages*. Der Vergleich zeigt Spiele gesamt, Spiele je Teilnehmer (min–max), Ende der Gruppenphase, Ende mit Puffer, längste Wartezeit und die schnellste Variante. Ein Klick übernimmt eine Variante.
- **Prognose:** Start, Ende der Gruppenphase und Ende je Konkurrenz, Ende des Tages und Tischauslastung; ein Hinweis, wenn sich Spiele nicht einplanen lassen (z. B. weil der Tischbereich zu klein ist).
- **Zeitplan je Tisch:** eine Zeitleiste (oder Liste), welches Spiel wann auf welchem Tisch läuft.

Wie die Simulation rechnet, steht mit Beispielrechnung in der [Architektur](architecture.de.md#4-planer-und-prognose).

## 2. Veranstaltungen und Tische

- Ein Admin legt eine **Veranstaltung** an: Name, Adresse im Link (Slug), erster und letzter Tag, Anzahl Tische. Name und Tage lassen sich unter **Einstellungen → Veranstaltung** ändern. Bei mehreren Tagen wählt man den Tag jeder Konkurrenz beim Anlegen oder später unter **Zeitplan**; Prognose, Spielbetrieb und Druck arbeiten dann je Tag. Die Tische heißen „1“ … „n“ und lassen sich unter **Einstellungen** umbenennen oder erweitern (ein Name pro Zeile).
- Die Sportart wird beim Anlegen gewählt und bestimmt Wertung, Ergebnisnotation und Tabellenreihenfolge. Bisher gibt es nur das Profil Tischtennis, deshalb ist die Auswahl noch ausgeblendet.
- Unter **Einstellungen** liegen außerdem Ergebnis-PIN, Zugang zu den öffentlichen Ansichten, Impressum und Datenschutz, die Optionen für die öffentliche Anzeige, die Datensicherung und das Löschen der ganzen Veranstaltung (siehe die folgenden Abschnitte).
- Eine Veranstaltung lässt sich mit allen Daten löschen.

## 3. Spieler und Meldungen

- **Spieler:** Vorname (Pflicht), Nachname, Verein, Geschlecht, Geburtsjahr, Lizenznummer und Wertungszahl (im Tischtennis QTTR). Spieler ohne Nachnamen sind möglich, z. B. Gäste oder Kinder. Würden zwei Spieler öffentlich gleich heißen, weist die Liste darauf hin. Tippfehler lassen sich jederzeit korrigieren, auch nach der Auslosung: Der Stift in der Liste öffnet die Zeile zum Bearbeiten (Enter speichert, Esc bricht ab), und alle Ansichten zeigen sofort den neuen Namen.
- **CSV-Import:** eine Zeile pro Spieler. Spalten werden an der Kopfzeile erkannt (Vorname, Nachname, Verein, Geschlecht, Jahrgang, Lizenz-Nr., Wertung, Konkurrenzen) und lassen sich von Hand zuordnen. Trennzeichen (`;` oder `,`) und Kodierung (UTF-8 oder Windows-1252, wie Excel speichert) werden automatisch erkannt. Eine Vorschau prüft jede Zeile und findet Spieler, die es schon gibt; sie lassen sich überspringen oder aktualisieren. Die optionale Spalte „Konkurrenzen“ meldet die Spieler gleich. Eine Vorlage steht zum Herunterladen bereit.
- **Meldungen:** Spieler werden als *gemeldet* in Konkurrenzen eingetragen und bei Ankunft auf *anwesend* gesetzt. Doppel werden als Paar gemeldet, oder einzelne Spieler warten auf die Paarauslosung.
- Die Rolle **Meldestelle** darf all das, aber nichts anderes (siehe [Benutzer und Rollen](#11-benutzer-und-rollen)).

## 4. Konkurrenzen und Spielsysteme

Eine Konkurrenz hat einen Namen, eine Art (Einzel oder Doppel), eine Farbe, eine Wertung (Gewinnsätze), geschätzte Minuten pro Spiel, einen Tag, einen frühesten Start, optional „startet nach“ einer anderen Konkurrenz und die Tische, die sie nutzen darf.

**Spielsysteme** setzen sich aus Bausteinen zusammen:

| Modus | Optionen |
|---|---|
| Jeder gegen jeden | einfache oder doppelte Runde |
| Gruppen + KO | Anzahl Gruppen, Top *k* jeder Gruppe kommen weiter; optional rücken die besten Nächstplatzierten nach, und die Ausgeschiedenen spielen eine Trostrunde |
| Schweizer System | Anzahl Runden; allein (die Tabelle ist die Platzierung) oder als Vorrunde, nach der die besten *k* der Tabelle ins KO gehen |
| KO | Feldgröße ist die nächste Zweierpotenz, Freilose gehen an die Besten der Setzliste |
| Wechselnde Partner | eigene Art von Konkurrenz für 4–32 Spieler: Doppel, in denen jeder mit jedem einmal zusammenspielt; jeder Spieler hat eine eigene Zeile in der Tabelle |

Platzierungsspiele im KO: **keine**, **Spiel um Platz 3** oder **alle Plätze**. Die Gruppentabelle folgt dem Sport-Profil, im Tischtennis der Wettspielordnung des DTTB (WO D 7.5): mehr Pluspunkte, dann weniger Minuspunkte, dann Satz- und Balldifferenz aus allen Spielen, dann die Spiele der noch Gleichen untereinander (Spiel-, Satz- und Balldifferenz), zuletzt das Los. Das Los wird erst gezogen, wenn die Gruppe beendet ist, automatisch mit dem Zufallsschlüssel der Auslosung; bis dahin gilt vorläufig die Reihenfolge der Auslosung. Der Übergang von den Gruppen ins KO hält Spieler derselben Gruppe so lange wie möglich auseinander.

### Freilose vermeiden: die besten Nächstplatzierten rücken nach

Ergeben die Qualifizierten kein volles KO-Feld (zum Beispiel 3 Gruppen × 2 = 6 im 8er-Feld), bekämen sonst die bestgesetzten Gruppensieger ein Freilos. Mit **Freilose vermeiden** rücken stattdessen die Besten des nächsten Gruppenplatzes nach, hier die zwei besten Gruppendritten. Angeboten wird die Option nur, wenn es dafür genug Gruppen gibt.

Die Dritten aller Gruppen werden miteinander verglichen: zuerst nach dem Anteil gewonnener Spiele, dann nach der Satzdifferenz pro Spiel, dann nach der Balldifferenz pro Spiel, zuletzt entscheidet das Los. Bei gleich großen Gruppen ist das dieselbe Reihenfolge wie Siege, Satz- und Balldifferenz in der Gruppentabelle. Sind die Gruppen unterschiedlich groß (4er und 5er), zählen in den größeren die Spiele gegen die Gruppenletzten nicht mit: Jeder wird nur an den Spielen gegen die ersten vier seiner Gruppe gemessen, damit der zusätzliche Sieg gegen einen Fünften keinen Vorteil bringt. Die Werte pro Spiel gleichen aus, was danach noch abweicht, etwa nach einem Rückzug. Die Konkurrenz zeigt diesen Vergleich als eigene Tabelle, vorläufig, solange noch Gruppenspiele offen sind. Im KO-Feld werden die Nachrücker so gesetzt, dass sie möglichst spät auf Spieler ihrer eigenen Gruppe treffen. Die KO-Spiele mit Nachrückern beginnen erst, wenn alle Gruppen beendet sind.

### Trostrunde: Ausgeschiedene spielen ihre Plätze aus

Ohne weitere Einstellung teilen sich die in der Gruppe Ausgeschiedenen die Plätze nach Gruppenplatz (alle Dritten zum Beispiel Platz 9–12). Unter **Trostrunde** gibt es zwei Alternativen:

- **Ein gemeinsames Feld:** Alle Ausgeschiedenen spielen ein eigenes KO-Feld um die Plätze hinter dem Hauptfeld. Die besseren Gruppenplätze sind gesetzt.
- **Je Gruppenplatz ein Feld:** Alle Dritten spielen untereinander, alle Vierten untereinander und so weiter. So landet niemand hinter einem schlechteren Gruppenplatz. Ein Gruppenplatz, den nur ein Spieler belegt, bekommt seinen Platz ohne Spiel.

Ein Feld mit genau **drei Spielern** (etwa die Dritten von drei Gruppen) spielt **jeder gegen jeden** statt KO: Es gäbe sonst ein Freilos, und ein Spieler wäre nach einem Spiel fertig. Die Tabelle des Felds wird wie eine Gruppe gewertet und ergibt die Plätze; jeder hat zwei Spiele. Wer zu einem dieser Spiele nicht antritt, wird wie in einer Gruppe ans Ende gesetzt.

Bleiben in einem KO-Feld der Trostrunde **Freilose**, bekommen sie die Besten: zuerst die besseren Gruppenplätze, und unter Spielern mit gleichem Gruppenplatz entscheidet derselbe Vergleich über alle Gruppen wie bei den besten Dritten (Anteil gewonnener Spiele, Satz- und Balldifferenz pro Spiel, Los), nicht der Buchstabe der Gruppe. Die Konkurrenz zeigt diesen Vergleich als Tabelle. In der ersten Runde trifft dabei möglichst niemand auf einen Spieler der eigenen Gruppe.

Welche Plätze in den KO-Feldern der Trostrunde ausgespielt werden, richtet sich nach den **Platzierungsspielen**: Mit **alle Plätze** wird im Hauptfeld und in der Trostrunde jeder Platz ausgespielt, sodass jeder Teilnehmer eine eigene Platzierung hat.

### Schweizer System

Im Schweizer System scheidet niemand aus: Jeder spielt in jeder Runde gegen einen anderen Gegner. Es folgt der Wettspielordnung des DTTB (WO D 7.6).

- **Runden:** frei einstellbar. Vorgeschlagen werden zwei Runden mehr, als ein KO-Feld derselben Größe bräuchte (bei 16 Teilnehmern 6).
- **Paarungen:** Runde 1 nach der Setzliste, obere Hälfte gegen untere. Danach treffen möglichst Spieler mit gleich vielen Siegen aufeinander, dabei die obere Tabellenhälfte gegen die untere; wer übrig bleibt, spielt gegen den Besten mit weniger Siegen. Niemand trifft zweimal auf denselben Gegner.
- **Nächste Runde:** wird automatisch gepaart, sobald das letzte Spiel der Runde davor eingetragen ist. Solange kein Spiel der neuen Runde aufgerufen oder gespielt ist, wird sie nach einer Korrektur oder einem Rückzug neu gepaart; danach stehen ihre Paarungen fest.
- **Freilos:** Bei ungerader Teilnehmerzahl setzt in jeder Runde ein anderer Spieler aus, das zählt als Sieg. Es geht an den am weitesten hinten Platzierten, der noch keines hatte.
- **Tabelle:** Siege, dann Buchholzzahl (Summe der Siege aller bisherigen Gegner; ein Freilos zählt mit den Siegen des Tabellenletzten), dann der direkte Vergleich, zuletzt das Los.
- **Danach:** Ohne KO ist der Tabellenplatz die Platzierung. Mit KO gehen die besten *k* ins Feld, die Tabelle ist die Setzliste; alle anderen behalten ihren Tabellenplatz.

### Doppel mit wechselnden Partnern

Eine eigene Art von Konkurrenz neben Einzel und Doppel. Gemeldet werden einzelne Spieler, gespielt wird aber jedes Spiel als Doppel, und zwar so, dass **jeder mit jedem einmal zusammenspielt**. Jeder kämpft für sich: Ein Sieg zählt für beide Spieler des siegreichen Doppels, und alle stehen in einer gemeinsamen Tabelle. Wer in Summe die meisten Spiele gewinnt, gewinnt die Konkurrenz.

- **Spielplan:** steht mit der Auslosung fest, gelost wird nur die Reihenfolge der Spieler (niemand ist gesetzt). Er ist in Runden eingeteilt; niemand spielt zweimal in einer Runde, und die Gegner sind möglichst gleichmäßig verteilt.
- **Spiele pro Spieler:** Bei 4, 5, 8, 9, 12, 13, … Spielern geht es genau auf: Jeder spielt mit jedem anderen einmal zusammen, also Spielerzahl − 1 Spiele (bei ungerader Zahl setzt jeder einmal aus). Bei den übrigen Zahlen geht es nicht ganz auf; dann spielt jeder gleich oft, jedes Mal mit einem anderen Partner, aber ein bis zwei mögliche Partner fehlen (bei 6 Spielern 4 Spiele, bei 10 Spielern 8). Wer in einer Runde aussetzt, steht bei der Runde dabei.
- **Tabelle:** wie die Gruppentabelle des Sports, aber ohne direkten Vergleich, weil nie zwei Spieler allein gegeneinander spielen; was dann noch gleich ist, entscheidet das Los (nach dem letzten Spiel).
- **Rückzug:** Alle Spiele, in denen der Spieler steht, werden gestrichen, auch die schon gespielten; sie zählen dann auch für seine Partner und Gegner nicht. Er wird Tabellenletzter. Ein kampflos eingetragenes Spiel zählt dagegen für alle vier Spieler als Sieg bzw. Niederlage.
- **Spielbetrieb:** Beim Aufruf werden alle vier Spieler für andere Tische gesperrt; Tischkarten, Handy-Eingabe, Beamer und Druck zeigen beide Spieler einer Seite („A / B“).
- **Planer:** Der Modus steht in der Liste der Modi jeder Konkurrenz und lässt sich mit allen anderen vergleichen; die Teilnehmerzahl sind dann die Spieler. Weil in einem Spiel vier Spieler stehen, laufen höchstens Spielerzahl ÷ 4 Spiele gleichzeitig.

Modus und Art lassen sich bis zur Auslosung ändern. Wertung, Spieldauer, Startzeit, Abhängigkeit und Tische lassen sich jederzeit ändern (Tag, Startzeit, Abhängigkeit, Minuten pro Spiel und Tische auf der Seite der Konkurrenz unter **Zeitplan**); sie gelten für noch nicht aufgerufene Spiele, und die Prognose zieht sofort nach.

## 5. Auslosung

- **Setzliste:** zuerst der manuelle Setzplatz, dann die Wertungszahl (im Doppel der Mittelwert beider Spieler). Die Zahl der Gesetzten ist einstellbar; Standard sind die Gruppenköpfe bzw. ein Viertel des KO-Feldes, im Schweizer System die obere Hälfte.
- **Schweizer System:** Die Gesetzten stehen in der Startreihenfolge oben, die anderen werden darunter gelost. So trifft in Runde 1 jeder Gesetzte auf einen zugelosten Gegner aus der unteren Hälfte.
- **Platzierung der Gesetzten:** *fest* (nach Setzplatz, Gruppen in Schlangenreihenfolge) oder *gelost* (Topf für Topf in die Gruppen, bzw. im KO die Plätze 3/4, 5–8 … innerhalb ihrer Stufe gelost).
- **Ungesetzte** werden frei gelost, Spieler desselben Vereins möglichst in verschiedene Gruppen.
- **Reproduzierbar:** Jede Auslosung hat einen Startwert (Seed). Gleicher Seed und gleiche Optionen ergeben dieselbe Auslosung, sie lässt sich also prüfen oder wiederholen.
- **Doppelpaare auslosen:** *gesetzt* (jeder Spieler der oberen Hälfte der Setzliste bekommt einen Partner aus der unteren Hälfte zugelost) oder *frei*. Paare lassen sich vor der Auslosung wieder trennen.
- **Zurücknehmen:** Eine Auslosung lässt sich zurücknehmen, solange kein Spiel aufgerufen ist; danach sind Meldungen und Modus wieder änderbar.

### Rückzug

Zieht ein Spieler nach der Auslosung zurück, werden seine restlichen Spiele kampflos für die Gegner gewertet, auch KO-Spiele, die erst später entstehen. Wie in der WO D 7.9 werden in der Gruppe alle seine Spiele gestrichen, auch die schon gespielten, und er wird Gruppenletzter. Dasselbe gilt, wenn ein Spiel kampflos eingetragen wird: Wer nicht antritt, scheidet aus der Konkurrenz aus. Der Dialog zeigt, wie viele Spiele betroffen sind. Ein Rückzug lässt sich zurücknehmen, solange kein Spiel begonnen hat, das auf einer der kampflosen Wertungen aufbaut.

Im Schweizer System gilt die WO D 7.6: Wer zurückzieht oder nicht antritt, spielt nicht weiter, bleibt aber mit seinen Siegen in der Tabelle, und seine gespielten Spiele zählen weiter. Für jede weitere Runde bekommt er eine Niederlage. Hat die laufende Runde noch nicht begonnen, wird sie ohne ihn neu gepaart.

## 6. Spielbetrieb

Der Spielbetrieb ist der Hauptbildschirm der Turnierleitung während des Turniers.

- **Tische:** jeder Tisch mit dem laufenden Spiel und dessen Laufzeit, oder „frei“.
- **Spielbereit:** alle Spiele, deren Spieler feststehen, jeweils mit geplanter Startzeit und Tisch aus der Prognose als Vorschlag. Ein Spiel, dessen Spieler gerade an einem anderen Tisch steht (egal in welcher Konkurrenz), ist markiert und kann nicht aufgerufen werden.
- **Pausen:** Neben jedem Spieler steht, wie lange sein letztes Spiel her ist (über alle Konkurrenzen; im Doppel zählt der Partner, der zuletzt gespielt hat), oder „noch kein Spiel“. Pausen unter 10 Minuten sind markiert. Die Reihenfolge lässt sich von **Prognose** auf **Längste Pause** umstellen; dann stehen die Spiele oben, deren beide Seiten am längsten frei sind. So lässt sich die Reihenfolge anpassen, wenn manche Spiele deutlich länger gedauert haben als geplant.
- Spiel auf einen freien Tisch **aufrufen** (nur Tische, die für die Konkurrenz erlaubt sind), Aufruf **zurücknehmen**, **Ergebnis** oder **kampflos** eintragen, Ergebnis **korrigieren**. Eine Korrektur wird abgelehnt, sobald ein darauf aufbauendes Spiel aufgerufen oder gespielt ist.
- **Letzte Ergebnisse** auf einen Blick.
- **Prognose:** Für den aktuellen Tag läuft der Planer erneut auf dem echten Stand. Gespielte Spiele fallen weg, laufende behalten ihren Tisch bis zum erwarteten Ende, der Rest wird ab jetzt geplant. Nach drei gespielten Spielen einer Konkurrenz ersetzt deren echte Durchschnittsdauer die Schätzung. Angezeigt wird das erwartete Ende je Konkurrenz und des Tages (mit 10 % Puffer).

Ergebnisse werden in der aus dem Tischtennis bekannten Kurznotation eingegeben: je Satz die Punkte des Verlierers, negativ, wenn der zweite Spieler den Satz gewonnen hat. `4 -5 9 7` heißt 11:4, 5:11, 11:9, 11:7. Verlängerte Sätze schreibt man als `-13` (13:15); volle Ergebnisse wie `11:4` gehen auch.

## 7. Ergebniseingabe am Tisch

- Unter **Einstellungen** erzeugt der Admin eine sechsstellige **PIN** (wird nur einmal angezeigt) und druckt einen Bogen mit einem **QR-Code pro Tisch**.
- Ein Spieler oder Schiedsrichter scannt den Code, gibt einmal die PIN ein, und das Handy bleibt 72 Stunden angemeldet. Die Seite zeigt das Spiel, das an diesem Tisch aufgerufen ist, und eine Tastatur für die Kurznotation.
- Handys dürfen nur Ergebnisse aufgerufener Spiele eintragen: nicht kampflos, keine Korrekturen, keine Aufrufe. Eine neue PIN meldet alle Handys ab, z. B. eine PIN pro Tag.
- **Funklöcher:** Lässt sich ein Ergebnis nicht senden, wartet es auf dem Handy („Wird gesendet, sobald wieder Verbindung besteht“) und wird automatisch nachgesendet. Doppeltes Senden ist harmlos. Hat die Turnierleitung inzwischen ein anderes Ergebnis eingetragen, zeigt das Handy es an. Die Seite selbst lädt auch ohne Verbindung.

## 8. Anzeigen

- Unter **Anzeigen** legt jeder Admin **Anzeige-Profile** an, eines pro Bildschirm (Beamer in der Halle, TV am Eingang), jedes mit eigenem Link.
- Ein Profil wählt die Folien: Tische, nächste Spiele, Gruppen, KO-Bäume, Meldelisten noch nicht ausgeloster Konkurrenzen und eine **Live-Auslosung**, die Auslosungen und Doppelpaare Schritt für Schritt aufdeckt. Außerdem lassen sich die Konkurrenzen eingrenzen, nur der heutige Tag zeigen und die Sekunden pro Folie einstellen.
- **Spielmodus und Gleichstände erklären** (im Profil, standardmäßig an): Jede Konkurrenz bekommt eine Folie **Spielmodus und Wertung** mit Ablauf, Spielregeln, Tabellenkriterien, Weiterkommen mit den Paarungen der ersten KO-Runde und den Platzierungen. Sobald eine Gruppe fertig ist, steht unter ihrer Tabelle je Gleichstand eine Zeile wie „Platz 2–3: gleich viele Siege, entschieden durch Direkter Vergleich“, und eine Folie **Gleichstände** zeigt die Rechnung Schritt für Schritt. So können die Spieler in der Halle nachvollziehen, wer warum weiterkommt.
- Die Anzeige ist eine 16:9-Bühne, die nie scrollt. Pfeiltasten oder ein Presenter wechseln die Folie, Leertaste pausiert, F schaltet Vollbild um. Änderungen am Profil erscheinen sofort auf jedem Bildschirm.
- Fällt das Netz aus, zeigt die Anzeige weiter den letzten Stand.

## 9. Öffentliche Ansichten

- `/e/<slug>` zeigt die Tische mit den laufenden Spielen, die Prognose je Konkurrenz und Tag und die letzten Ergebnisse. Jede Konkurrenz hat eine eigene Seite mit Meldungen, Gruppen mit Tabellen, KO-Baum und Platzierungen. Alles aktualisiert sich live.
- **Nachvollziehbare Wertung:** Jede Konkurrenzseite erklärt unter **Spielmodus und Wertung** den Ablauf, die Spielregeln, alle Kriterien der Tabelle in ihrer Reihenfolge, wer ins KO kommt, die Paarungen der ersten KO-Runde (z. B. A1 – B2) und welche Plätze ausgespielt oder geteilt werden. Sobald zwei Spieler gleich viele Siege haben, zeigt **So wird der Gleichstand aufgelöst** unter der Gruppentabelle jeden Gleichstand Schritt für Schritt mit den Zahlen: welches Kriterium angewendet wurde, mit welchen Werten, und wer danach vorn liegt.
- **Zugangscode:** Neue Veranstaltungen starten mit öffentlichen Ansichten hinter einem sechsstelligen Code aus Buchstaben und Ziffern. Ein Aushang mit QR-Code wird gedruckt und in der Halle aufgehängt; wer ihn scannt, ist drin und bleibt bis zum Tag nach der Veranstaltung angemeldet. Der Code lässt sich erneuern (meldet alle ab) oder abschalten.
- **Datenschutz:** Öffentliche Seiten zeigen nur Name und Verein. Wertungszahlen nur, wenn freigegeben, auf Wunsch Kurznamen („Max M.“). Suchmaschinen werden angewiesen, die Seiten nicht aufzunehmen.
- **Impressum und Datenschutz:** im Fuß jeder öffentlichen Seite verlinkt, dazu ein optionaler Hinweis (z. B. „Namen und Ergebnisse dieser Veranstaltung werden hier veröffentlicht“). Jede Veranstaltung kann eigene Links setzen, sonst gelten die Vorgaben der Installation.

## 10. Drucken und Export

Alle Druckseiten sind für A4 gesetzt und lassen sich über den Druckdialog des Browsers als PDF speichern. Schiedsrichterzettel gibt es außerdem direkt als PDF in A6, passend für die üblichen Zettelhalter: entweder vier Zettel pro A4-Seite mit gestrichelten Schnittlinien oder ein Zettel pro A6-Seite für Drucker, die A6 können.

| Druckseite | Inhalt |
|---|---|
| Schiedsrichterzettel | einer pro Spiel, mit einer Zeile pro Satz, dem Ergebnis und Kästchen zum Ankreuzen des Siegers; für aufgerufene, spielbereite oder alle offenen Spiele. Auch der Rückfall auf Papier, wenn das Netz ausfällt. |
| Blanko-Schiedsrichterzettel | nur als PDF: leere Zettel zum Ausfüllen von Hand, nur mit dem Namen der Veranstaltung. Die Zahl der Satzzeilen folgt der gewählten Konkurrenz (bei Doppeln zwei Namenszeilen) oder wird von Hand eingestellt. |
| Zeitplan | voraussichtliche Startzeiten je Tag und Konkurrenz aus der Prognose |
| Gruppen und KO-Baum | Gruppenblätter mit Tabellen und Kreuztabelle, KO-Bäume |
| Ergebnisse | Platzierungen und alle Ergebnisse je Konkurrenz |
| Urkunden | A4 quer, Auswahl der Plätze (z. B. 1–3), nach der Urkundenvorlage (siehe [Erscheinungsbild](#13-erscheinungsbild)) |
| QR-Codes | ein Code pro Tisch für die Ergebniseingabe |
| Zugangsaushang | der Zugangscode mit QR-Code |

**CSV** (UTF-8, öffnet in Excel): Platzierungen und alle Spiele mit Satzergebnissen.

**Export der Veranstaltung:** Unter **Einstellungen → Datensicherung** lässt sich die ganze Veranstaltung (Tische, Spieler, Konkurrenzen, Auslosungen, Ergebnisse, Anzeige-Profile) als JSON-Datei herunterladen. Unter **Veranstaltungen → Neue Veranstaltung → Veranstaltung importieren** wird daraus eine neue Veranstaltung, auf derselben oder einer anderen Installation, z. B. um vom Server auf einen Laptop und zurück umzuziehen. PIN, Sitzungen, Benutzer und Protokoll werden nicht exportiert.

## 11. Benutzer und Rollen

| Rolle | Darf |
|---|---|
| Admin | alles, auch Benutzer verwalten |
| Meldestelle | Veranstaltungen auflisten, Spieler suchen, anlegen, bearbeiten und importieren, Spieler melden, Anwesenheit setzen, lesen, was die öffentlichen Ansichten zeigen |

- Der erste Admin kommt aus der Konfiguration (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). Unter **Benutzer** legen Admins weitere Konten an, ändern Rollen, setzen Passwörter zurück und löschen Konten. Der letzte Admin lässt sich nicht entfernen.
- Jeder ändert sein eigenes Passwort unter **Mein Konto**; das meldet das Konto auf allen anderen Geräten ab. Passwörter brauchen mindestens 12 Zeichen.

## 12. Protokoll

Jede Änderung (Auslosung, Aufruf, Ergebnis, Korrektur, Rückzug, Einstellungen, Spieler …) landet mit Zeitpunkt, Akteur (Benutzer oder Tisch-Gerät) und Details im Protokoll. Der Reiter **Protokoll** zeigt es, neueste zuerst, in der Sprache der Oberfläche.

## 13. Erscheinungsbild

Unter **Erscheinungsbild** legt ein Admin das Aussehen der ganzen Installation fest:

- **Name** oben links und im Browser-Tab, z. B. der Verein (sonst „Draw & Play“).
- **Akzentfarbe** aus Vorschlägen oder frei gewählt. Die App leitet daraus lesbare Varianten für hell und dunkel ab (Kontrast mindestens 4,5:1) und wählt weiße oder dunkle Schrift auf Buttons; die Vorschau zeigt beide.
- **Logo** (PNG, JPEG oder WebP bis 8 MB) oben links, auf Anzeigen, Ausdrucken und als Symbol im Browser-Tab.
- **Hintergrund der Anzeigen:** ein Bild im Format 16:9 hinter Beamer und Bildschirmen, einstellbar abgedunkelt, damit die Schrift lesbar bleibt; die Karten darüber sind leicht durchscheinend.

**Urkundenvorlage** (ebenfalls unter **Erscheinungsbild**): Textzeilen mit Platzhaltern (`{name}`, `{verein}`, `{platz}`, `{konkurrenz}`, `{veranstaltung}`, `{datum}`, auch auf Englisch), bis zu zwei Unterschriftszeilen, Logo ein oder aus und ein eigenes Hintergrundbild (A4 quer, z. B. eine gestaltete Vereinsurkunde). Der Modus **Nur Text** druckt ohne Rahmen, Logo und Hintergrund auf vorgedruckte Urkunden. Eine Vorschau mit Beispieldaten zeigt das Ergebnis; als Datum steht bei mehrtägigen Veranstaltungen der Tag der Konkurrenz. Eine Veranstaltung kann unter **Einstellungen → Urkundenvorlage** eine eigene Vorlage haben.

Jede Veranstaltung kann unter **Einstellungen → Erscheinungsbild** einzelne Werte überschreiben, z. B. für eine Kreismeisterschaft mit anderem Ausrichter; leere Felder nutzen die Vorgabe. Bilder liegen in der Datenbank, sind also in Backups enthalten, und wandern beim Export einer Veranstaltung mit.

## Ein Turniertag in der Praxis

1. Unter `/login` anmelden. Veranstaltung, Tische und Konkurrenzen anlegen; den Modus jeweils mit dem Planer wählen.
2. Spieler importieren oder eintragen, in die Konkurrenzen melden, bei Ankunft auf anwesend setzen.
3. Doppelpaare und Konkurrenzen auslosen.
4. Unter **Einstellungen** die PIN erzeugen, QR-Codes für die Tische und den Zugangsaushang drucken. Unter **Anzeigen** den Link jedes Profils auf seinem Bildschirm öffnen.
5. Im **Spielbetrieb** spielbereite Spiele auf freie Tische aufrufen. Die Spieler tragen das Ergebnis am Handy ein; die Turnierleitung kann es jederzeit selbst eintragen oder korrigieren.
6. Am Ende Ergebnislisten und Urkunden drucken und die Platzierungen als CSV sichern.

Die [Deployment-Anleitung](deploy.de.md#8-checkliste-turniertag) enthält eine Checkliste für die Woche davor, den Vortag und den Turniertag selbst.
