# Backup and restore

OnlineShop ships three ways to protect its data. All of them write to `BACKUP_DIR`
(`configdrf/backups/` by default, or the path in the `DJANGO_BACKUP_DIR` environment
variable). Keep that folder outside any public web directory: backups contain
password hashes, orders, and audit history. It is already in `.gitignore`.

| Method | What it produces | When to use |
| --- | --- | --- |
| `manage.py backup_db` | `onlineshop-YYYYMMDD-HHMMSS-<label>.json.gz` — a compressed, **portable** Django fixture | Daily/scheduled backups; moving data between SQLite and PostgreSQL |
| `manage.py backup_db --native` (SQLite only) | An additional consistent `.sqlite3` snapshot made with SQLite's online-backup API | Fast full-file copy of the local demo database |
| **Backups** page (`/backups`, Database Administrator only) | Same `.json.gz` file, created and downloaded in the browser | Before a demo, a release, or a risky data change |
| `pg_dump` (PostgreSQL) | Native PostgreSQL dump | Production PostgreSQL deployments, point-in-time tooling |

## Create a backup

```powershell
$env:DJANGO_SECRET_KEY = 'your-local-development-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py backup_db --label before_demo
python configdrf/manage.py backup_db --native --keep 14   # also a SQLite snapshot; keep the newest 14 of each kind
```

What is included: every OnlineShop table (users, products, categories, orders,
payments, reviews, wishlist/waitlist, notifications, support tickets, stock history,
audit log) plus Django admin history. Excluded on purpose: content types and
permissions (rebuilt by `migrate`), sessions, and JWT blacklist rows (short-lived
security state — everyone simply signs in again after a restore).

Each backup (CLI or web) is recorded in the security audit log as
`database_backup_created`; downloads are recorded as `database_backup_downloaded`.

### Schedule it

*Linux/macOS (cron, every night at 02:30, keep two weeks):*

```cron
30 2 * * * cd /srv/onlineshop && DJANGO_SECRET_KEY=... /srv/onlineshop/.venv/bin/python configdrf/manage.py backup_db --label nightly --keep 14
```

*Windows Task Scheduler:* create a daily task that runs
`powershell -File C:\onlineshop\scripts\backup.ps1`, where the script sets the
environment variables above and calls `python configdrf/manage.py backup_db --label nightly --keep 14`.

## Restore a backup

Restoring **replaces all current data**, so it is deliberately available only from
the command line and requires an explicit confirmation flag. A safety backup of the
current data (`…-prerestore.json.gz`) is written automatically first.

```powershell
python configdrf/manage.py migrate                      # schema must exist first
python configdrf/manage.py restore_db onlineshop-20261123-020000-nightly.json.gz --yes-i-understand
```

You can pass a file name from `BACKUP_DIR` or a full path to a downloaded file.

### Moving from SQLite to PostgreSQL

1. `DATABASE_URL=sqlite:////full/path/to/configdrf/db.sqlite3 python configdrf/manage.py backup_db --label to_postgres`
2. Open a new terminal (so `DATABASE_URL` is not set) — Django now uses PostgreSQL (see [PostgreSQL deployment](POSTGRESQL_DEPLOYMENT.md)).
3. `python configdrf/manage.py migrate`
4. `python configdrf/manage.py restore_db <file>.json.gz --yes-i-understand`

### PostgreSQL native dump

```bash
pg_dump --format=custom --no-owner --file onlineshop.dump "$DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" onlineshop.dump
```

## Test the backups

A backup that has never been restored is only a hope. The CI pipeline
(`.github/workflows/ci.yml`) restores a fresh backup on every push, and the
automated test `BackupRestoreRoundTripTests` deletes data and proves the restore
brings it back. Before an important demo, also restore the latest backup into a
throw-away database (`DATABASE_URL=sqlite:///tmp/restore-check.sqlite3`).
