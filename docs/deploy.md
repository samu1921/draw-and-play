# Running draw-and-play on a server

**English** · [Deutsch](deploy.de.md)

This guide puts draw-and-play on a small cloud server with its own (sub)domain, for example `tournament.example-club.org`. In the end everything runs over HTTPS, the database is backed up regularly, and the checklist below walks you through the tournament day.

## 1. What you need

- A small VPS, for example 2 vCPU and 2–4 GB RAM (such as a Hetzner CX22), with Ubuntu 24.04 LTS.
- A domain or subdomain whose DNS you can change.
- An SSH key on your computer.

## 2. DNS

At your domain provider, create an **A record** (and, if the server has IPv6, an **AAAA record**) that points the subdomain to the server's IP. Caddy can only fetch the certificate once the record resolves to this server. Check on the server that both addresses match:

```bash
curl -4 -s https://ifconfig.me; echo                        # the server's own IPv4
getent ahostsv4 tournament.example-club.org | head -1       # what the name resolves to
```

Watch out for a wildcard record (`*.example-club.org`), which many club domains have for their website: until your own record is active, the subdomain still resolves, just to the wrong server. Set the domain in `.env` only once the addresses match, otherwise Caddy keeps failing and runs into the Let's Encrypt rate limits. If you add an AAAA record, the server must be reachable over IPv6 as well (`curl -6 -s https://ifconfig.me` shows that address).

## 3. Prepare the server

```bash
ssh root@<server-ip>
apt update && apt upgrade -y
apt install -y ufw unattended-upgrades git
# Only SSH, HTTP and HTTPS (HTTP/3 uses UDP 443)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
# Install security updates automatically
dpkg-reconfigure -plow unattended-upgrades
# Install Docker (official script)
curl -fsSL https://get.docker.com | sh
# Rotate container logs so they cannot fill the disk
printf '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }\n' > /etc/docker/daemon.json
systemctl restart docker
```

**Docker bypasses ufw.** Ports published by a container are reachable from the internet whatever ufw says. That is why the database is only published on `127.0.0.1`, and why `HTTP_PORT`/`HTTPS_PORT` must be `80`/`443` on a server: the local default `8080` would otherwise be open to everyone. If your provider also has a firewall in its control panel, open 22/tcp, 80/tcp, 443/tcp and 443/udp there as well.

Recommended: log in with your own user with sudo rights instead of root, and switch off password logins over SSH.

### A user for the app

The app gets its own system user `drawandplay`, which owns the installation in `/opt/draw-and-play`, including `.env` with the passwords and the database dumps. It has no password and no SSH key, so nobody can log in as it; you switch to it with `sudo` when needed. Membership of the `docker` group amounts to root access, so only this user joins it, not your personal one.

```bash
useradd --system --create-home --home-dir /var/lib/drawandplay --shell /bin/bash drawandplay
usermod -aG docker drawandplay
mkdir /opt/draw-and-play
chown drawandplay:drawandplay /opt/draw-and-play
chmod 750 /opt/draw-and-play             # other users cannot reach .env and the dumps
usermod -aG drawandplay <your-user>      # lets you read the dumps (section 6), but not .env
```

## 4. Install

Every `git` and `docker compose` command from here on runs as `drawandplay` in `/opt/draw-and-play`:

```bash
sudo -iu drawandplay
git clone --branch v0.1.0 https://github.com/samu1921/draw-and-play.git /opt/draw-and-play   # the latest release, see https://github.com/samu1921/draw-and-play/releases
cd /opt/draw-and-play
cp .env.example .env
chmod 600 .env
openssl rand -base64 24                    # gives a strong database password
nano .env
```

Set at least these in `.env`:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | strong random password |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | first admin (password at least 12 characters) |
| `SITE_ADDRESS` | your domain, e.g. `tournament.example-club.org` |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` |
| `IMPRINT_URL`, `PRIVACY_URL` | legal notice and privacy policy, e.g. on the club website (every event can set its own links) |
| `BACKUP_INTERVAL_MINUTES` | `60`, on the tournament day `15` |
| `APP_IMAGE` | `ghcr.io/samu1921/draw-and-play:0.1.0`, the released image matching the checked-out version (leave it out to build the image on the server) |

Start:

```bash
docker compose pull                        # with APP_IMAGE; without it use `docker compose up -d --build`
docker compose up -d
docker compose ps                          # every service running, app healthy
curl https://tournament.example-club.org/api/health
```

Then sign in at `https://<domain>/login` with the admin from `.env`. `ADMIN_PASSWORD` is only used to create the first admin, so you can remove it from `.env` now.

**DNS not ready yet?** Keep `SITE_ADDRESS=:80` and try the app through an SSH tunnel from your computer: `ssh -L 8080:localhost:<HTTP_PORT> <your-user>@<server-ip>`, then open `http://localhost:8080`. Unlike `http://<server-ip>`, the password does not cross the internet unencrypted, and browsers treat `localhost` like HTTPS, so offline result entry works too.

## 5. Update

```bash
sudo -iu drawandplay
cd /opt/draw-and-play
docker compose exec backup sh /usr/local/bin/backup.sh once   # back up first
git fetch --tags && git checkout v<version>                   # the new release
nano .env                                                     # APP_IMAGE=…:<version>
docker compose pull && docker compose up -d                   # migrations run on startup
```

Without `APP_IMAGE`, run `docker compose up -d --build` instead of pulling. What changed is listed in the [CHANGELOG](../CHANGELOG.md) and on the [releases page](https://github.com/samu1921/draw-and-play/releases).

If `docker/Caddyfile` changed, recreate the proxy: `docker compose up -d --force-recreate proxy`.

Automatic security updates cover the operating system, not the PostgreSQL and Caddy images. Refresh them about once a month, outside tournament days: `docker compose pull && docker compose up -d && docker image prune -f`.

**Do not update during a running tournament.** Phones keep results they could not send, but a restart interrupts every live connection for a few seconds.

## 6. Backups

The `backup` service writes a database dump into `./backups` every hour and deletes old ones (`BACKUP_INTERVAL_MINUTES`, `BACKUP_KEEP_DAYS` and `BACKUP_DIR` in `.env`). On the tournament day a shorter interval such as 15 minutes is sensible. A dump right now, for example before the event starts:

```bash
docker compose exec backup sh /usr/local/bin/backup.sh once
```

Restore a dump (replaces the whole database):

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U drawandplay -d drawandplay < backups/drawandplay-<timestamp>.dump
docker compose start app
```

The dumps lie on the same server as the database. Copy them to another computer regularly, for example from your laptop with your personal user, which can read them through the group `drawandplay`:

```bash
rsync -av <your-user>@<server>:/opt/draw-and-play/backups/ ./dap-backups/
```

In addition, every event can be downloaded as a JSON file under **Settings → Backup** and imported under **Events → New event → Import event** on any installation, a laptop included. This is also how an event moves from the server to a laptop and back.

## 7. Logs and troubleshooting

```bash
docker compose logs -f app       # application
docker compose logs -f proxy     # certificates, HTTPS
docker compose logs backup       # backups
```

- **No certificate:** does the DNS record point to the server, and are ports 80 and 443 open? Caddy retries by itself.
- **Does not start:** usually a value is missing in `.env`; the message is in `docker compose logs app`.

## 8. Tournament day checklist

**A week before**
- [ ] Create the event, tables and competitions (use the planner to choose the format).
- [ ] Prepare the player list as CSV (template under **Players → Download template**) and try the import once.
- [ ] Check the legal notice, privacy link and note under **Settings**.
- [ ] Dress rehearsal on the real server: create a test event, enter the PIN on two phones, enter results, open the projector link, then delete the test event (**Settings → Delete event**).

**The day before**
- [ ] Set `BACKUP_INTERVAL_MINUTES=15` in `.env` and run `docker compose up -d backup`.
- [ ] Generate a new result PIN (ideally a new one every day).
- [ ] Print: QR codes for the tables, the notice with the access code, score sheets for all open matches (paper fallback).
- [ ] Download the JSON export.
- [ ] Charge the mobile hotspot for the desk and the projector PC.

**On the day**
- [ ] Before the start: check `/api/health`, take a backup (`backup.sh once`), open the projector link (the link under **Displays** carries the access code).
- [ ] QR codes on the tables, the notice on the wall.
- [ ] After each day: download the JSON export and copy the backups off the server.
- [ ] At the end: print result lists and certificates, save the placements as CSV.

**If the network fails**
- Phones keep entered results and send them once the connection is back; keep the table page open for that.
- The desk carries on through the mobile hotspot.
- If need be, play on paper (score sheets) and enter the results at the desk later.
