# draw-and-play auf einem Server betreiben

[English](deploy.md) · **Deutsch**

Diese Anleitung bringt draw-and-play auf einen kleinen Cloud-Server mit eigener (Sub-)Domain, zum Beispiel `turnier.ttc-musterstadt.de`. Am Ende läuft alles per HTTPS, die Datenbank wird regelmäßig gesichert, und die Checkliste unten führt durch den Turniertag.

## 1. Was du brauchst

- Einen kleinen VPS, zum Beispiel 2 vCPU und 2–4 GB RAM (etwa Hetzner CX22), mit Ubuntu 24.04 LTS.
- Eine Domain oder Subdomain, deren DNS du ändern kannst.
- Einen SSH-Schlüssel auf deinem Rechner.

## 2. DNS

Lege beim Domain-Anbieter einen **A-Eintrag** (und, falls der Server IPv6 hat, einen **AAAA-Eintrag**) an, der die Subdomain auf die IP des Servers zeigt. Erst wenn der Eintrag aufgelöst wird (`ping turnier.ttc-musterstadt.de`), kann Caddy das Zertifikat holen.

## 3. Server vorbereiten

```bash
ssh root@<server-ip>
apt update && apt upgrade -y
apt install -y ufw unattended-upgrades git
# Nur SSH, HTTP und HTTPS (HTTP/3 nutzt UDP 443)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
# Sicherheitsupdates automatisch einspielen
dpkg-reconfigure -plow unattended-upgrades
# Docker installieren (offizielles Skript)
curl -fsSL https://get.docker.com | sh
```

Empfohlen: einen eigenen Benutzer anlegen, ihn der Gruppe `docker` hinzufügen und die Passwort-Anmeldung per SSH abschalten.

## 4. Installieren

```bash
git clone <repository-url> draw-and-play   # oder den Ordner per scp/rsync kopieren
cd draw-and-play
cp .env.example .env
chmod 600 .env
openssl rand -base64 24                    # ergibt ein starkes Datenbank-Passwort
nano .env
```

In der `.env` mindestens setzen:

| Variable | Wert |
|---|---|
| `POSTGRES_PASSWORD` | starkes, zufälliges Passwort |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | erster Admin (Passwort mindestens 12 Zeichen) |
| `SITE_ADDRESS` | deine Domain, z. B. `turnier.ttc-musterstadt.de` |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` |
| `IMPRINT_URL`, `PRIVACY_URL` | Impressum und Datenschutz, z. B. auf der Vereinswebsite (jede Veranstaltung kann eigene Links setzen) |
| `BACKUP_INTERVAL_MINUTES` | `60`, am Turniertag `15` |

Starten:

```bash
docker compose up -d --build
docker compose ps                          # alle Dienste "running", app "healthy"
curl https://turnier.ttc-musterstadt.de/api/health
```

Dann unter `https://<domain>/login` mit dem Admin aus der `.env` anmelden.

## 5. Aktualisieren

```bash
cd draw-and-play
docker compose exec backup sh /usr/local/bin/backup.sh once   # vorher sichern
git pull
docker compose up -d --build                                  # Migrationen laufen beim Start
```

Hat sich `docker/Caddyfile` geändert, den Proxy neu erstellen: `docker compose up -d --force-recreate proxy`.

**Nicht während eines laufenden Turniers aktualisieren.** Handys behalten zwar nicht gesendete Ergebnisse, aber ein Neustart unterbricht alle Live-Verbindungen für einige Sekunden.

## 6. Backups

Der Dienst `backup` schreibt stündlich einen Datenbank-Dump nach `./backups` und löscht alte (`BACKUP_INTERVAL_MINUTES`, `BACKUP_KEEP_DAYS` und `BACKUP_DIR` in der `.env`). Am Turniertag ist ein kürzerer Abstand wie 15 Minuten sinnvoll. Einen Dump sofort anlegen, zum Beispiel vor Turnierbeginn:

```bash
docker compose exec backup sh /usr/local/bin/backup.sh once
```

Einen Dump wiederherstellen (ersetzt die ganze Datenbank):

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U drawandplay -d drawandplay < backups/drawandplay-<zeitstempel>.dump
docker compose start app
```

Die Dumps liegen auf demselben Server wie die Datenbank. Kopiere sie regelmäßig auf einen anderen Rechner, zum Beispiel von deinem Laptop aus:

```bash
rsync -av <benutzer>@<server>:draw-and-play/backups/ ./dap-backups/
```

Zusätzlich lässt sich jede Veranstaltung unter **Einrichtung → Datensicherung** als JSON-Datei herunterladen und unter **Turnierleitung → Veranstaltung importieren** auf jeder Installation wieder einspielen, auch auf einem Laptop. So zieht eine Veranstaltung auch vom Server auf einen Laptop und zurück.

## 7. Logs und Fehlersuche

```bash
docker compose logs -f app       # Anwendung
docker compose logs -f proxy     # Zertifikate, HTTPS
docker compose logs backup       # Backups
```

- **Kein Zertifikat:** Zeigt der DNS-Eintrag auf den Server, und sind die Ports 80 und 443 offen? Caddy versucht es selbst erneut.
- **Startet nicht:** Meist fehlt ein Wert in der `.env`; die Meldung steht in `docker compose logs app`.

## 8. Checkliste Turniertag

**Eine Woche vorher**
- [ ] Veranstaltung, Tische und Konkurrenzen anlegen (Planer nutzen, um den Modus zu wählen).
- [ ] Spielerliste als CSV vorbereiten (Vorlage unter **Spieler → Vorlage herunterladen**) und einmal probeweise importieren.
- [ ] Impressum, Datenschutz und Hinweistext unter **Einrichtung** prüfen.
- [ ] Generalprobe auf dem echten Server: Testveranstaltung anlegen, mit zwei Handys PIN eingeben, Ergebnisse eintragen, Beamer-Link öffnen, danach die Testveranstaltung löschen.

**Am Vortag**
- [ ] `BACKUP_INTERVAL_MINUTES=15` in der `.env` setzen und `docker compose up -d backup` ausführen.
- [ ] Neue Ergebnis-PIN erzeugen (am besten jeden Tag neu).
- [ ] Drucken: QR-Codes für die Tische, Aushang mit Zugangscode, Schiedsrichterzettel für alle offenen Spiele (Rückfall auf Papier).
- [ ] JSON-Export herunterladen.
- [ ] Mobilen Hotspot für Turnierleitung und Beamer-PC laden.

**Am Turniertag**
- [ ] Vor Beginn: `/api/health` prüfen, Sofort-Backup (`backup.sh once`), Beamer-Link öffnen (der Link aus **Anzeigen** enthält den Zugangscode).
- [ ] QR-Codes an die Tische, Aushang an die Wand.
- [ ] Nach jedem Tag: JSON-Export herunterladen und die Backups vom Server kopieren.
- [ ] Zum Schluss: Ergebnislisten und Urkunden drucken, Platzierungen als CSV sichern.

**Wenn das Netz ausfällt**
- Handys behalten eingegebene Ergebnisse und senden sie, sobald die Verbindung zurück ist; die Tischseite dafür offen lassen.
- Die Turnierleitung arbeitet über den mobilen Hotspot weiter.
- Notfalls auf Papier spielen (Schiedsrichterzettel) und die Ergebnisse später an der Turnierleitung eintragen.
