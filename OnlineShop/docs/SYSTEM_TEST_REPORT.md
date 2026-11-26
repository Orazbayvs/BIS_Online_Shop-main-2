# OnlineShop system test report

## Scope and verified result

This report maps the automated Django system suites in `configdrf/core/tests.py` and `configdrf/core/tests_features.py` to the project acceptance criteria. Tests run against an isolated database, so they do not change demonstration stock, orders, or customer data.

**Latest verification result (23 November 2026): 91/91 backend tests passed on both SQLite and PostgreSQL 16, and 6/6 Angular unit tests passed** with:

```powershell
$env:DJANGO_SECRET_KEY = 'a-long-development-only-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py test core --verbosity 1
```
## Automated system coverage

| ID | Scenario | Acceptance evidence |
| --- | --- | --- |
| ST-01 | Create a card order | Order, items, safe payment snapshot, total, and reduced stock are created together. |
| ST-02 | Insufficient stock | Checkout returns a validation error and rolls back order, payment, and stock. |
| ST-03 | Customer cancellation | A new order can be cancelled once and reserved inventory is restored. |
| ST-04 | Sales payment/reporting | A manager marks a valid order paid and sales data reports units, revenue, and stock. |
| ST-05 | Cash on delivery | COD becomes paid only when the order reaches delivery. |
| ST-06 | Warehouse stock access | Only warehouse staff update stock and a change creates an adjustment record. |
| ST-07 | Staff checkout restriction | A manager cannot create a customer order. |
| ST-08 | Seller customer journey | A seller can also place a normal customer order. |
| ST-09 | Warehouse data minimisation | Warehouse order output excludes payment and customer-account fields. |
| ST-10 | Public registration safety | Registration cannot create a staff role. |
| ST-11 | Customer order privacy | A customer cannot read another customer’s order. |
| ST-12 | Profile access scope | A customer edits own profile data but cannot change own role. |
| ST-13 | Head-manager access | A head manager creates/reassigns only ordinary operational roles. |
| ST-14 | Security-manager status control | A security manager locks an ordinary account with a reason and reviews audit events. |
| ST-15 | Seller ownership | A seller edits/deactivates only owned products and cannot alter stock directly. |
| ST-16 | Stock reconciliation | A warehouse adjustment needs a reason and cannot make stock negative. |
| ST-17 | Fulfilment workflow | Warehouse staff prepare eligible orders but not unpaid card orders. |
| ST-18 | Dashboard/password/availability | Head dashboard is protected, password changes work, and inactive products cannot be ordered. |
| ST-19 | Administrator bootstrap | A Django superuser receives the database-administrator role. |
| ST-20 | Session revocation | A user revokes only a refresh session belonging to that user. |
| ST-21 | Security role reassignment | Security Manager changes an ordinary role with a reason and an audit event. |
| ST-22 | Security role reason | Security Manager cannot change a role without a reason. |
| ST-23 | Security self protection | Security Manager cannot reassign their own account. |
| ST-24 | Protected account guard | Security Manager cannot reassign a Head Manager account. |
| ST-25 | Django administrator guard | Security Manager cannot change an `is_staff`/`is_superuser` account. |
| ST-26 | Privilege-escalation guard | Security Manager cannot grant a protected role. |
| ST-27 | Security reactivation | Security Manager reactivates an ordinary account with audit evidence. |
| ST-28 | Review creation/aggregate | Customer creates feedback and product returns rating average/count. |
| ST-29 | Rating range | Ratings outside 1–5 are rejected. |
| ST-30 | One review per product | A second review by the same customer/product is rejected. |
| ST-31 | Review ownership update | Review author can edit their own feedback. |
| ST-32 | Review ownership delete/edit | Another customer cannot edit or delete a review. |
| ST-33 | Staff feedback guard | Staff account cannot submit a customer review. |
| ST-34 | Public review minimisation | Review output excludes email and address. |
| ST-35 | Rating recalculation | Removing a review updates aggregate count/average. |
| ST-36 | Top-products rating rank | Higher rating ranks first. |
| ST-37 | Top-products review-volume tie-break | More reviews ranks first at equal rating. |
| ST-38 | Top-products demand tie-break | More completed-order units ranks first when rating/reviews tie. |
| ST-39 | Wishlist save | Customer saves a product privately. |
| ST-40 | Automatic zero-stock waitlist | Saving a zero-stock product also activates waiting-list enrollment. |
| ST-41 | Wishlist privacy | Customer cannot see another customer’s wishlist. |
| ST-42 | Inactive wishlist guard | Inactive product cannot be saved. |
| ST-43 | In-stock waitlist guard | In-stock product cannot be added to waiting list. |
| ST-44 | Idempotent waitlist | Duplicate waitlist request leaves one entry. |
| ST-45 | Waitlist removal | Customer can stop an active stock alert. |
| ST-46 | Restock notifications | A zero-to-positive restock notifies every waiting customer exactly once. |
| ST-47 | No false restock alert | Positive-to-positive stock update does not notify. |
| ST-48 | Notification privacy/read state | Notifications are private and an owner can mark one read. |
| ST-49 | Re-enrolment | Customer can request a later alert after an earlier restock notice. |
| ST-50 | Cancellation preservation | Customer cancellation saves cancelled products to wishlist. |
| ST-51 | Managed cancellation alert | Management cancellation restock notifies waiting customer. |
| ST-52 | Support creation/ownership | Customer creates and lists own support ticket. |
| ST-53 | Support privacy | Customer cannot see another customer’s ticket. |
| ST-54 | Support update guard | Customer cannot update a support ticket as staff. |
| ST-55 | Support triage/reply | Manager reply/status change records audit and notifies customer. |
| ST-56 | Security support workflow | Security Manager can securely resolve a ticket. |
| ST-57 | Support status transition | Invalid ticket lifecycle transition is rejected. |
| ST-58 | Support input validation | Meaningful subject/message are required. |
| ST-59 | Support analytics | Head dashboard returns open and per-status support KPIs. |

### Stage 3 additions (`core/tests_features.py`)

| ID | Scenario | Acceptance evidence |
| --- | --- | --- |
| ST-60 | Review enters moderation | A new review is `pending`, visible to its author only, and excluded from product rating aggregates. |
| ST-61 | Review approval | Sales Manager approves; review becomes public, rating counts it, customer is notified, audit is written. |
| ST-62 | Review rejection | Rejection requires a reason; only the author sees the reason and status. |
| ST-63 | Edited review re-check | Editing an approved review returns it to `pending`; a cleared comment is saved. |
| ST-64 | Moderation access | Buyer, Warehouse, Accountant, and Security Manager cannot moderate; Head Manager can. |
| ST-65 | Moderation KPI | Head dashboard reports the pending-review count. |
| ST-66 | Accounting summary | Booked sales, collected, refunded, gross receipts, receivables, 12% VAT, average order, method/category/month breakdowns reconcile. |
| ST-67 | Accounting ledger | Transactions filter by status and expose no customer contact data. |
| ST-68 | Ledger export | CSV export has a header plus one row per payment and is audited. |
| ST-69 | Accounting period | Empty and invalid periods are handled; malformed dates return 400. |
| ST-70 | Accounting access | Buyer, Sales Manager, Warehouse, and Security Manager are denied. |
| ST-71 | Accountant role | Head Manager can create an Accountant account and assign the role. |
| ST-72 | Backup command | `backup_db` writes a portable gzip fixture and `--keep` rotates old files. |
| ST-73 | Restore guard | `restore_db` refuses to run without `--yes-i-understand`. |
| ST-74 | Backup API | Database administrator creates, lists, and downloads a backup; audit recorded. |
| ST-75 | Backup security | Other roles are denied; path traversal and unsafe labels are rejected. |
| ST-76 | Restore round trip | Deleted data returns after restore; a safety backup is written first. |
| ST-77 | Catalogue filters | Price range, in-stock, minimum rating (approved reviews only), and best-rated sort. |
| ST-78 | Extended search | Search matches an exact SKU and category names. |
| ST-79 | Sorting and paging | Popular/newest/price sorts and `page_size` pagination. |
| ST-80 | Filter validation | Invalid, negative, reversed price ranges and out-of-range ratings return 400. |
| ST-81 | Search suggestions | Prefix matches first; inactive products and one-letter queries are excluded. |
| ST-82 | Login normalisation | Sign-in works with mixed-case e-mail and surrounding spaces. |
| ST-83 | Moderation regression | The original review/aggregate test now passes through moderation. |
| ST-84 | Customer order filters | Status (incl. comma list), payment method, product search, `#id` search, sorting; another customer's order never matches. |
| ST-85 | Staff order filters | Total range, customer ID, payment status, empty period, delivery-address search. |
| ST-86 | Order filter validation | Unknown status/sort, negative or reversed totals, bad or reversed dates, non-numeric customer return 400. |
| ST-87 | Warehouse filter boundary | Warehouse can filter by status but not by payment details or customer (403). |
| ST-88 | Support ticket filters | Status, category, text search within own tickets; staff "handled by me" and "unassigned"; combined lists. |
| ST-89 | Support filter validation | Customers cannot filter by assignment; invalid status/assignment return 400. |
| ST-90 | Wishlist filters | Availability, category, text search, price sort; invalid availability returns 400. |
| ST-91 | Waiting-list status | Default shows waiting + notified and hides alerts the customer removed; `active` / `notified` filters. |

Angular unit tests (`npm test -- --watch=false`) additionally verify that an expired access token is refreshed once and the request is retried with valid header names only, that a still-unauthorised retry does not loop, that a session stays signed in while its refresh token is valid, and that API error messages are shown in full.

## Complementary verification

- `npm run build` checks the Angular production build.
- `npm test -- --watch=false` runs the Angular unit suite.
- `python configdrf/manage.py check --deploy` validates Django production-security settings.
- GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every push and pull request: the PostgreSQL 16 job (engine check, migration check, tests, `check --deploy`, migrate/seed/backup/restore smoke test), a SQLite compatibility job, and the Angular build and unit tests.
- Browser smoke testing covers search/filtering, product feedback, saved lists, notification read state, client support, account controls, cart, checkout, and protected routes.
- On a Docker-capable deployment machine, PostgreSQL verification additionally checks `connection.vendor`, migrations, `pg_trgm`, and an `EXPLAIN (ANALYZE, BUFFERS)` search query. See [PostgreSQL deployment](POSTGRESQL_DEPLOYMENT.md).

## User-acceptance-test demonstration checklist

| UAT ID | User action | Expected acceptance result |
| --- | --- | --- |
| UAT-01 | Open a category or submit a catalogue search. | Results update on the first click; selected search/filter is visible in the URL and catalogue. |
| UAT-02 | Rate/review a product as a customer. | One 1–5 review is saved, average/count update, and no customer contact data is exposed. |
| UAT-03 | Save an out-of-stock product. | It enters wishlist and waiting list; a later zero-to-positive restock creates one in-app notification. |
| UAT-04 | Cancel a new customer order. | Inventory is restored and its products remain in wishlist. |
| UAT-05 | Sign in as Security Manager. | Ordinary-account role/status changes require a reason; protected accounts and roles cannot be changed. |
| UAT-06 | Submit a support request as customer, then sign in as Manager. | Customer sees only own ticket; manager can reply/update status; customer receives an update notification. |
| UAT-07 | Submit checkout without delivery address or valid safe card metadata. | Clear validation appears and no order is created. |
| UAT-08 | Sign in as Warehouse Staff. | Stock changes require a reason and eligible orders can be marked Preparing. |
| UAT-09 | Post a review as a customer, then sign in as Sales Manager → Review moderation. | Review shows "Awaiting moderation" to its author only; after approval it is public and the customer gets a notification. |
| UAT-10 | Sign in as Accountant → Accounting. | Period presets, KPI cards, income statement, breakdowns, ledger, CSV export, and print view work. |
| UAT-11 | Sign in as Database Administrator → Backups. | A backup can be created and downloaded; other roles cannot open the page or API. |
| UAT-12 | Use catalogue price/rating/stock filters, sorting, paging, and header suggestions. | Results, counts, chips, and URL update; removing a chip refreshes results. |
| UAT-13 | Filter My Orders, Support, and Wishlist & waitlist as a customer; filter Store operations orders and the Support desk as Sales Manager. | Lists narrow immediately, show "N … match your filters", Clear restores the full list, and no other customer's records appear. |

## Known boundaries

- The card flow is a safe demo. It does not charge a card or transmit/store PAN, CVC, expiry, or cardholder data; production needs a PCI-compliant provider and tokenisation.
- Restock and support updates are currently in-app notifications. Email/SMS/push delivery is a future integration.
- The full backend suite now runs against a real PostgreSQL 16 server (locally and in GitHub Actions CI), including the `pg_trgm` migrations. Query-plan (`EXPLAIN`) evidence for very large catalogues should still be collected on the deployment machine.
- Accounting is management bookkeeping based on order payments; it is not a replacement for certified tax software. VAT rate is configurable with `ACCOUNTING_VAT_RATE`.
