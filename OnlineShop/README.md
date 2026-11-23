# OnlineShop | Full-stack e-commerce platform

OnlineShop is a Django REST + Angular e-commerce project with role-based operations, secure account control, customer feedback, saved-product workflows, client support, and PostgreSQL-ready deployment.

## Project team and work areas

| Team member | Student ID | Work area | Stage 2 feature | Stage 3 feature |
| --- | --- | --- | --- | --- |
| Ainur Yessenbek | 24B031758 | Architecture & Security | Role change, activate/disable | Site design, accounting |
| Zhaparov Arystanbek | 24B031779 | Systems Analysis & Requirements | Feedback, rating, top products | Review moderation |
| Dastan Baigaliyev | 24B031670 | Data & Database | PostgreSQL, indexed search | Backup and restore |
| Orazbay Koibagar | 24B032151 | Testing, Analytics & Integration | System testing, support | CI pipeline |
| Serikova Nazira | 24B032020 | Application & Development | Waiting list, wishlist | Filters and search |

Stage 3 changes and the list of fixed bugs are in [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Delivered features

- Role-aware customer, seller, management, warehouse, Head Manager, Security Manager, and administrator workflows.
- Security Manager account control: reasoned/audited activation and disable actions plus safe reassignment of ordinary operational roles; protected/self/Django administrator accounts cannot be changed.
- Catalogue search, filtering/sorting, owner-controlled listings, stock history, cart, atomic checkout, safe demo payment metadata, and order fulfilment.
- Customer feedback: one 1–5 review per customer/product, aggregate ratings, review ownership controls, and a public top-products ranking.
- Wishlist, waiting list, and private in-app restock notifications. A zero-stock wishlist save automatically starts a waiting-list alert; a zero-to-positive restock notifies each active waiter once.
- Customer cancellation restores stock and preserves cancelled products in the customer’s wishlist.
- Client Support tickets: customers create/view their own requests; authorised support staff triage, reply, resolve, audit, and notify customers.
- PostgreSQL configuration, `pg_trgm` GIN search indexes, operational indexes, and a local Compose service for reproducible deployment setup.
- **Accounting** workspace for the new Accountant role: revenue, refunds, receivables, VAT, breakdowns, payment ledger, CSV export, print view.
- **Review moderation**: new and edited reviews are published only after a Sales/Head Manager approves them; rejections carry a reason for the author.
- **Backups**: `backup_db` / `restore_db` commands and an administrator Backups page (portable gzip JSON, SQLite snapshot, rotation).
- **Catalogue filters and search**: price range, rating, in-stock, best-rated/popular/newest sorts, SKU and category search, pagination, type-ahead suggestions.
- **Continuous integration** on GitHub Actions: PostgreSQL 16 test run (plus SQLite compatibility), migration and deployment checks, backup/restore smoke test, Angular build and unit tests.
- An 83-case Django system test suite (passing on PostgreSQL 16, also on SQLite), Angular build/unit checks, and documented UAT/test evidence.

## Technology

- Backend: Django 6, Django REST Framework, SimpleJWT, **PostgreSQL 16** via `psycopg` (`pg_trgm` search indexes).
- Frontend: Angular standalone components, TypeScript, Leaflet/OpenStreetMap, Font Awesome.

## Run locally (PostgreSQL)

PostgreSQL is the project database. **1. Install and start PostgreSQL once.**

macOS (Homebrew) — or install [Postgres.app](https://postgresapp.com) instead:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb onlineshop
```

Windows: install PostgreSQL 16 from postgresql.org, then create a database named `onlineshop` (pgAdmin or `createdb -U postgres onlineshop`). Docker users can run `compose.postgres.yml` (see [PostgreSQL deployment](docs/POSTGRESQL_DEPLOYMENT.md)).

**2. Create `configdrf/.env`** (git-ignored, loaded automatically — no `export` needed):

```bash
cp configdrf/.env.example configdrf/.env
# Edit DJANGO_SECRET_KEY. On Windows also set POSTGRES_USER=postgres and POSTGRES_PASSWORD=<your password>.
```

With Homebrew/Postgres.app the defaults already work: database `onlineshop`, your macOS user, no password, `localhost:5432`.

**3. Install, migrate, seed, run:**

```bash
python -m pip install -r requirements.txt
python configdrf/manage.py migrate
python configdrf/seed_data.py
python configdrf/manage.py bootstrap_demo_accounts --password 'QuickMartDemo2026!'
python configdrf/manage.py runserver
python configdrf/manage.py shell -c "from django.db import connection; print(connection.vendor)"   # prints: postgresql
```

SQLite is still possible for a quick experiment by setting `DATABASE_URL=sqlite:////absolute/path/db.sqlite3`, but PostgreSQL is what the project, its search indexes, and CI use.

Start Angular in a second terminal:

```powershell
Set-Location frontend
npm install
npm start
```

Open `http://localhost:4200`. The Angular development proxy sends `/api` requests to Django at `http://127.0.0.1:8000`.

## Restore local demo access

The seven role-demo accounts below are active in the supplied local database and use the shared **local-demo-only** password `QuickMartDemo2026!`. Do not use this password outside a classroom/demo environment.

| Role | Email |
| --- | --- |
| Buyer | `buyer.demo@quickmart.test` |
| Seller | `seller.demo@quickmart.test` |
| Sales Manager | `sales.manager@quickmart.test` |
| Warehouse Staff | `warehouse.staff@quickmart.test` |
| Head Manager | `head.manager@quickmart.test` |
| Security Manager | `security.manager@quickmart.test` |
| Accountant | `accountant@quickmart.test` |

If these accounts are changed later (or to create the Accountant account after upgrading), restore only these demo accounts without deleting any users, orders, listings, tickets, or other data:

```powershell
$env:DJANGO_SECRET_KEY = 'your-local-development-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py bootstrap_demo_accounts --password 'QuickMartDemo2026!' --reset-existing
```

The recovery command intentionally leaves every other pre-existing account untouched. Passwords for older arbitrary accounts cannot be recovered from Django password hashes; reset only the specific account you own if access is required.

## Run with PostgreSQL

The local PostgreSQL service, environment-file template, migrations, validation commands, indexed-search notes, and production precautions are in [docs/POSTGRESQL_DEPLOYMENT.md](docs/POSTGRESQL_DEPLOYMENT.md). Use the supplied Compose configuration rather than exposing a database port publicly. The project was configured where Docker was unavailable, so perform the documented live migration, extension, vendor, and query-plan checks on the deployment machine.

## Roles and protection boundaries

| Role | Main capabilities | Deliberate boundary |
| --- | --- | --- |
| Buyer / Seller | Browse, order, save products, wait for restock, rate/review, open support tickets. Seller also owns listings. | Cannot operate stock, other accounts, or other customers’ private data. |
| Sales Manager | Process orders, sales report, customer support triage. | Cannot reconcile stock or administer protected accounts. |
| Warehouse Staff | Reasoned stock adjustments/history; prepare eligible orders. | Cannot change catalogue stock through normal listing edits or view payment data. |
| Head Manager | Create ordinary accounts, assign ordinary roles, dashboard KPIs, operational workflow. | Cannot bypass protected administrator security controls. |
| Security Manager | Audit log, ordinary account activation/disable and ordinary role reassignment with a required reason, secure support handling. | Cannot edit self, Head Manager, Security Manager, administrator, `is_staff`, or superuser accounts; cannot grant protected roles. |
| Accountant | Accounting reports, payment ledger, CSV export. | Sees customer IDs only — no names, e-mail, addresses, or card numbers; cannot change orders or stock. |
| Database Administrator | Break-glass full operational access, database backups. | Protected from Security Manager account changes. Restore is command-line only. |

Passwords are Django hashes and never returned by the API. JWT access tokens are short lived; refresh tokens rotate and can be revoked. The demo card flow validates in the browser and sends/stores only card brand and last four digits—never a full card number, expiry, CVC, or cardholder name.

## Tests and verification

```powershell
$env:DJANGO_SECRET_KEY = 'a-long-development-only-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py test core --verbosity 1
python configdrf/manage.py check --deploy
```

```powershell
Set-Location frontend
npm run build
npm test -- --watch=false
```

The latest backend run passed **83/83** tests on PostgreSQL 16 (and on SQLite), including **23 new tests** for moderation, accounting, backups, catalogue search, and login. The Angular suite has 6 tests. GitHub Actions runs everything on each push (`.github/workflows/ci.yml` in the repository root). Full coverage and UAT steps: [docs/SYSTEM_TEST_REPORT.md](docs/SYSTEM_TEST_REPORT.md).

## Backups

```powershell
python configdrf/manage.py backup_db --label before_demo --keep 14
python configdrf/manage.py restore_db <file>.json.gz --yes-i-understand
```

Details, scheduling, and SQLite → PostgreSQL migration: [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md).

## Main API endpoints

- `GET /api/products/?search=&category=&min_price=&max_price=&min_rating=&in_stock=true&ordering=&page=&page_size=` — catalogue search and filters (`ordering`: `name`, `-name`, `price`, `-price`, `rating`, `popular`, `newest`).
- `GET /api/products/suggest/?q=` — public type-ahead suggestions.
- `GET /api/products/top/?limit=10` — public top-products ranking.
- `GET/POST /api/products/<id>/reviews/` and `PATCH/DELETE /api/products/<id>/reviews/<review_id>/` — public feedback; owner writes only.
- `GET/POST /api/wishlist/`, `DELETE /api/wishlist/<product_id>/` — customer wishlist.
- `GET/POST /api/waitlist/`, `DELETE /api/waitlist/<product_id>/` — zero-stock restock alerts.
- `GET /api/notifications/`, `PATCH /api/notifications/<id>/read/` — owner’s in-app notifications.
- `GET/POST /api/support-tickets/`, `PATCH /api/support-tickets/<id>/` — customer-owned tickets and authorised staff triage.
- `PATCH /api/users/<id>/role/` — Head Manager/administrator, or bounded Security Manager role control. Security changes need `reason`.
- `PATCH /api/users/<id>/status/` — Security Manager/administrator with a required reason.
- `PATCH /api/products/<id>/stock/` — Warehouse/administrator with `stock_qty` or `adjustment` plus reason.
- `GET /api/reviews/moderation/?status=pending|approved|rejected|all`, `PATCH /api/reviews/<id>/moderate/` with `status` and `note` — Sales/Head Manager review moderation.
- `GET /api/accounting/summary/`, `GET /api/accounting/transactions/`, `GET /api/accounting/export/` with `date_from`, `date_to`, `status`, `method` — Accountant/Head Manager/administrator.
- `GET/POST /api/backups/`, `GET /api/backups/<name>/download/` — Database Administrator only.

For requirements, database design, architecture, and future work, see [docs/PROJECT_REQUIREMENTS_AND_DESIGN.md](docs/PROJECT_REQUIREMENTS_AND_DESIGN.md).
