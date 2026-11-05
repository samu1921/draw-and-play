# Running draw-and-play on a server

**English** · [Deutsch](deploy.de.md)

This guide puts draw-and-play on a small cloud server with its own (sub)domain, for example `tournament.example-club.org`. In the end everything runs over HTTPS, the database is backed up regularly, and the checklist below walks you through the tournament day.

## 1. What you need

- A small VPS, for example 2 vCPU and 2–4 GB RAM (such as a Hetzner CX22), with Ubuntu 24.04 LTS.
- A domain or subdomain whose DNS you can change.
- An SSH key on your computer.

## 2. DNS

At your domain provider, create an **A record** (and, if the server has IPv6, an **AAAA record**) that points the subdomain to the server's IP. Caddy can only fetch the certificate once the record resolves (`ping tournament.example-club.org`).

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
```

Recommended: create your own user, add it to the `docker` group and switch off password logins over SSH.

## 4. Install

```bash
git clone <repository-url> draw-and-play   # or copy the folder with scp/rsync
cd draw-and-play
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

Start:

```bash
docker compose up -d --build
docker compose ps                          # every service running, app healthy
curl https://tournament.example-club.org/api/health
```

Then sign in at `https://<domain>/login` with the admin from `.env`.

## 5. Update

```bash
cd draw-and-play
docker compose exec backup sh /usr/local/bin/backup.sh once   # back up first
git pull
docker compose up -d --build                                  # migrations run on startup
```

If `docker/Caddyfile` changed, recreate the proxy: `docker compose up -d --force-recreate proxy`.

**Do not update during a running tournament.** Phones keep results they could not send, but a restart interrupts every live connection for a few seconds.

## 6. Backups

- The `backup` service writes database dumps to `./backups` (see the [README](../README.md#backups) for restoring).
- The dumps lie on the same server. Copy them to another computer regularly, for example from your laptop:

  ```bash
  rsync -av <user>@<server>:draw-and-play/backups/ ./dap-backups/
  ```
- In addition, every event can be downloaded as a JSON file under **Setup → Backup** and imported on any installation, a laptop included.

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
- [ ] Check the legal notice, privacy link and note under **Setup**.
- [ ] Dress rehearsal on the real server: create a test event, enter the PIN on two phones, enter results, open the projector link, then delete the test event.

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
