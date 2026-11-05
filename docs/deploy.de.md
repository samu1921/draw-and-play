# draw-and-play auf einem Server betreiben

[English](deploy.md) · **Deutsch**

Diese Anleitung bringt draw-and-play auf einen kleinen Cloud-Server mit eigener (Sub-)Domain, zum Beispiel `turnier.ttc-musterstadt.de`. Am Ende läuft alles per HTTPS, die Datenbank wird regelmäßig gesichert, und die Checkliste unten führt durch den Turniertag.

## 1. Was du brauchst

- Einen kleinen VPS, zum Beispiel 2 vCPU und 2–4 GB RAM (etwa Hetzner CX22), mit Ubuntu 24.04 LTS.
- Eine Domain oder Subdomain, deren DNS du ändern kannst.
- Einen SSH-Schlüssel auf deinem Rechner.

## 2. DNS

Lege beim Domain-Anbieter einen **A-Eintrag** (und, falls der Server IPv6 hat, einen **AAAA-Eintrag**) an, der die Subdomain auf die IP des Servers zeigt. Erst wenn der Name auf diesen Server aufgelöst wird, kann Caddy das Zertifikat holen. Prüfe auf dem Server, dass beide Adressen übereinstimmen:

```bash
curl -4 -s https://ifconfig.me; echo                        # die eigene IPv4 des Servers
getent ahostsv4 turnier.ttc-musterstadt.de | head -1        # worauf der Name zeigt
```

Vorsicht bei einem Wildcard-Eintrag (`*.ttc-musterstadt.de`), wie ihn viele Vereinsdomains für ihre Website haben: Solange dein eigener Eintrag noch nicht aktiv ist, wird die Subdomain trotzdem aufgelöst, nur auf den falschen Server. Trage die Domain erst in die `.env` ein, wenn die Adressen übereinstimmen, sonst scheitert Caddy immer wieder und läuft in die Rate-Limits von Let's Encrypt. Legst du einen AAAA-Eintrag an, muss der Server auch per IPv6 erreichbar sein (`curl -6 -s https://ifconfig.me` zeigt diese Adresse).

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
# Container-Logs rotieren, damit sie die Platte nicht füllen
printf '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }\n' > /etc/docker/daemon.json
systemctl restart docker
```

**Docker umgeht ufw.** Von einem Container veröffentlichte Ports sind aus dem Internet erreichbar, egal was in ufw steht. Deshalb ist die Datenbank nur auf `127.0.0.1` veröffentlicht, und deshalb müssen `HTTP_PORT`/`HTTPS_PORT` auf einem Server `80`/`443` sein: Der lokale Standard `8080` wäre sonst für alle offen. Hat dein Anbieter zusätzlich eine Firewall im Kundenmenü, dort ebenfalls 22/tcp, 80/tcp, 443/tcp und 443/udp freigeben.

Empfohlen: dich mit einem eigenen Benutzer mit sudo-Rechten statt als root anmelden und die Passwort-Anmeldung per SSH abschalten.

### Ein Benutzer für die App

Die App bekommt einen eigenen Systembenutzer `drawandplay`. Ihm gehört die Installation in `/opt/draw-and-play`, auch die `.env` mit den Passwörtern und die Datenbank-Dumps. Er hat weder Passwort noch SSH-Schlüssel, niemand kann sich also als er anmelden; bei Bedarf wechselst du per `sudo` zu ihm. Die Gruppe `docker` kommt root-Rechten gleich, deshalb ist nur dieser Benutzer darin, nicht dein persönlicher.

```bash
useradd --system --create-home --home-dir /var/lib/drawandplay --shell /bin/bash drawandplay
usermod -aG docker drawandplay
mkdir /opt/draw-and-play
chown drawandplay:drawandplay /opt/draw-and-play
chmod 750 /opt/draw-and-play             # andere Benutzer kommen nicht an .env und Dumps
usermod -aG drawandplay <dein-benutzer>  # erlaubt dir, die Dumps zu lesen (Abschnitt 6), aber nicht die .env
```

## 4. Installieren

Alle `git`- und `docker compose`-Befehle ab hier laufen als `drawandplay` in `/opt/draw-and-play`:

```bash
sudo -iu drawandplay
git clone --branch v0.1.0 https://github.com/samu1921/draw-and-play.git /opt/draw-and-play   # das neueste Release, siehe https://github.com/samu1921/draw-and-play/releases
cd /opt/draw-and-play
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
| `APP_IMAGE` | `ghcr.io/samu1921/draw-and-play:0.1.0`, das veröffentlichte Image zur ausgecheckten Version (weglassen, um das Image auf dem Server zu bauen) |

Starten:

```bash
docker compose pull                        # mit APP_IMAGE; ohne stattdessen `docker compose up -d --build`
docker compose up -d
docker compose ps                          # alle Dienste "running", app "healthy"
curl https://turnier.ttc-musterstadt.de/api/health
```

Dann unter `https://<domain>/login` mit dem Admin aus der `.env` anmelden. `ADMIN_PASSWORD` wird nur zum Anlegen des ersten Admins gebraucht und kann jetzt aus der `.env` raus.

**DNS noch nicht so weit?** `SITE_ADDRESS=:80` lassen und die App über einen SSH-Tunnel von deinem Rechner aus testen: `ssh -L 8080:localhost:<HTTP_PORT> <dein-benutzer>@<server-ip>`, dann `http://localhost:8080` öffnen. Anders als bei `http://<server-ip>` geht das Passwort nicht unverschlüsselt durchs Internet, und Browser behandeln `localhost` wie HTTPS, sodass auch die Offline-Ergebniseingabe funktioniert.

## 5. Aktualisieren

```bash
sudo -iu drawandplay
cd /opt/draw-and-play
docker compose exec backup sh /usr/local/bin/backup.sh once   # vorher sichern
git fetch --tags && git checkout v<version>                   # das neue Release
nano .env                                                     # APP_IMAGE=…:<version>
docker compose pull && docker compose up -d                   # Migrationen laufen beim Start
```

Ohne `APP_IMAGE` statt des Pulls `docker compose up -d --build` ausführen. Was sich geändert hat, steht im [CHANGELOG](../CHANGELOG.md) und auf der [Releases-Seite](https://github.com/samu1921/draw-and-play/releases).

Hat sich `docker/Caddyfile` geändert, den Proxy neu erstellen: `docker compose up -d --force-recreate proxy`.

Die automatischen Sicherheitsupdates betreffen das Betriebssystem, nicht die Images von PostgreSQL und Caddy. Diese etwa einmal im Monat auffrischen, nicht an Turniertagen: `docker compose pull && docker compose up -d && docker image prune -f`.

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

Die Dumps liegen auf demselben Server wie die Datenbank. Kopiere sie regelmäßig auf einen anderen Rechner, zum Beispiel von deinem Laptop aus mit deinem persönlichen Benutzer, der sie über die Gruppe `drawandplay` lesen darf:

```bash
rsync -av <dein-benutzer>@<server>:/opt/draw-and-play/backups/ ./dap-backups/
```

Zusätzlich lässt sich jede Veranstaltung unter **Einstellungen → Datensicherung** als JSON-Datei herunterladen und unter **Veranstaltungen → Neue Veranstaltung → Veranstaltung importieren** auf jeder Installation wieder einspielen, auch auf einem Laptop. So zieht eine Veranstaltung auch vom Server auf einen Laptop und zurück.

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
- [ ] Impressum, Datenschutz und Hinweistext unter **Einstellungen** prüfen.
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
