#!/bin/sh
# Periodic PostgreSQL dumps for the backup service (see docker-compose.yml).
#   sh backup.sh        dump every BACKUP_INTERVAL_MINUTES and delete dumps older than BACKUP_KEEP_DAYS
#   sh backup.sh once   write a single dump and exit (e.g. right before the event starts)
# Connection settings come from the standard libpq variables PGHOST, PGUSER, PGPASSWORD and PGDATABASE.
set -eu

dir=/backups
interval=${BACKUP_INTERVAL_MINUTES:-60}
keep=${BACKUP_KEEP_DAYS:-14}

case "$interval$keep" in
  *[!0-9]*) echo "backup: BACKUP_INTERVAL_MINUTES and BACKUP_KEEP_DAYS must be whole numbers" >&2; exit 1 ;;
esac
if [ "$interval" -lt 1 ]; then
  echo "backup: BACKUP_INTERVAL_MINUTES must be at least 1" >&2
  exit 1
fi

dump() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$dir/drawandplay-$stamp.dump"
  # Write to a temporary name first, so a half-written file never looks like a valid backup.
  partial="$dir/.drawandplay-$stamp.dump.partial"
  if pg_dump --format=custom --file="$partial"; then
    mv "$partial" "$target"
    echo "backup: wrote $(basename "$target") ($(du -h "$target" | cut -f1))"
  else
    rm -f "$partial"
    echo "backup: pg_dump failed" >&2
    return 1
  fi
}

prune() {
  find "$dir" -maxdepth 1 -type f -name 'drawandplay-*.dump' -mmin +$((keep * 24 * 60)) -print -delete |
    while read -r old; do echo "backup: deleted $(basename "$old")"; done
}

mkdir -p "$dir"

if [ "${1:-}" = "once" ]; then
  dump
  exit
fi

# Stop promptly on `docker compose stop` instead of waiting for the kill timeout.
trap 'exit 0' TERM INT

echo "backup: every $interval min, keeping $keep days, into $dir"
while true; do
  dump || true
  prune
  sleep $((interval * 60)) &
  wait $!
done
