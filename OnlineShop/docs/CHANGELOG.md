# Changelog — stage 3

## New features (one per team member, stage 3 column)

| Student ID | Work item | What was added |
| --- | --- | --- |
| 24B031758 | Site design / accounting (бухгалтерия) | New **Accountant** role; `/accounting` workspace with period presets, KPI cards (net revenue, booked sales, receivables, refunds, VAT 12 %, average order), income statement, breakdowns by payment method, month and category, payment ledger, CSV export (Excel-ready, formula-injection safe), and print view. Redesigned header: compact main navigation, account menu grouping each role's workspace links, notifications bell, search suggestions, mobile menu. Cleaner leadership dashboard with formatted money and status breakdowns. |
| 24B031779 | Review checking (модерация отзывов) | Reviews posted or edited through the API start as **pending** and are hidden from the public and from ratings/Top products until a Sales or Head Manager approves them. Rejection requires a reason that only the author sees. Authors get an in-app notification for every decision; every decision is audited. `/reviews/moderation` queue with Waiting / Approved / Rejected / All tabs. |
| 24B031670 | Backup | `backup_db` (portable gzip JSON, optional SQLite snapshot, `--keep` rotation) and `restore_db` (confirmation flag + automatic safety backup) commands; Database Administrator `/backups` page and API to create, list, and download backups; audit events; [backup guide](BACKUP_AND_RESTORE.md). |
| 24B032151 | CI | GitHub Actions pipeline: Django tests on **PostgreSQL 16** (primary job: engine check, migration check, `check --deploy`, migrate/seed/backup/restore smoke test) and on SQLite for compatibility, plus Angular production build and unit tests. 23 new backend tests and 5 new frontend tests. |
| 24B032020 | Filter / search | Catalogue filters for price range, minimum rating, and in-stock; new sorts (best rated, most popular, newest); search also matches exact SKU and category names; real pagination with result count and removable filter chips; type-ahead suggestions in the header and catalogue (`/api/products/suggest/`); `page_size` API parameter. |

## Database: PostgreSQL by default

PostgreSQL is now the default database (previously SQLite unless `DATABASE_URL` was set). Django connects to a local PostgreSQL server with `POSTGRES_*` settings whose defaults match Homebrew/Postgres.app, and loads them from the git-ignored `configdrf/.env` automatically. To move existing SQLite data: run `backup_db` with `DATABASE_URL=sqlite:///…/db.sqlite3`, then `migrate` and `restore_db` against PostgreSQL (see [backup guide](BACKUP_AND_RESTORE.md)).

## Bugs fixed (existing behaviour kept the same)

1. **Session broke after 15 minutes.** The token-refresh retry sent a header named `X-Online Shop-Retry`. Browsers reject header names with a space, so every request after the access token expired failed. The retry marker is now an Angular `HttpContext` flag that is never sent over the network, so it cannot break CORS either.
2. **"Please sign in" while signed in.** Orders, Store operations, and Checkout treated an expired 15-minute access token as signed-out even though the refresh token was valid. They now count the session as active while it can be refreshed.
3. **Crashes on PostgreSQL.** Changing an order status, customer cancellation, warehouse "Prepare", and replying to a support ticket all returned HTTP 500 on PostgreSQL (`FOR UPDATE cannot be applied to the nullable side of an outer join`). Row locks now apply only to the main table (`select_for_update(of=('self',))`).
4. **Error messages showed one letter.** Store operations displayed `err.error.status[0]`, i.e. the first *character* of messages like "Cannot change Delivered to Paid." Order, stock, prepare, cancel, and product-publishing errors now show the server's full message.
5. **Only 50 products visible.** The API paginates at 50, but the catalogue, warehouse stock list, and seller listings read only the first page. The catalogue now pages properly; staff screens load every page.
6. **Login was case-sensitive.** `Buyer.Demo@…` failed although accounts are stored in lower case. The server and the browser now normalise the e-mail.
7. **Could not clear a review comment.** Editing a review with an empty comment kept the old text.
8. **Wishlist button forgot its state.** After a reload the product page offered "Add to wishlist" for items already saved; it now shows "Saved" / "Restock alert enabled".
9. **"Deleted" listings stayed in My listings with no explanation.** Removal is a soft delete; listings now show a "Removed from catalogue" status and no longer offer edit/delete.
10. **Sales figures ignored "Preparing" orders.** The sales report and dashboard revenue skipped paid orders that were being prepared, while Top products counted them. All reports now use the same confirmed-order statuses.
11. **Production build failed without access to Google Fonts.** The font was imported twice (in `styles.css` and `index.html`); the duplicate CSS import is removed.
12. Small fixes: confirmation before a customer cancels an order, readable role names on the profile page, header/footer logo letter, review notification icon.

## Upgrade steps

```powershell
python -m pip install -r requirements.txt
python configdrf/manage.py migrate          # adds migration 0018 (accountant role + review moderation)
python configdrf/manage.py bootstrap_demo_accounts --password 'QuickMartDemo2026!'   # creates accountant@quickmart.test; existing accounts untouched
```

Existing reviews are migrated as **approved**, so current ratings do not change. New and edited reviews go through moderation.
