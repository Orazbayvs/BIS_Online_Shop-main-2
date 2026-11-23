import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AccountingSummary, AccountingTransaction, PaymentMethod, PaymentStatus } from '../../models/api.models';
import { ApiService, QueryParams } from '../../services/api.service';
import { saveBlob } from '../../utils/download';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="ws-page container">
      <header class="ws-header">
        <div>
          <p class="ws-eyebrow">Accounting</p>
          <h1>Bookkeeping and finance</h1>
          <p>Sales, collected payments, refunds, receivables, and VAT for the selected period. Figures come from order payment records.</p>
        </div>
        <div class="ws-actions">
          <button type="button" class="btn btn-secondary" (click)="print()"><i class="fas fa-print" aria-hidden="true"></i> Print</button>
          <button type="button" class="btn btn-primary" (click)="exportCsv()" [disabled]="exporting">
            <i class="fas fa-file-csv" aria-hidden="true"></i> {{ exporting ? 'Preparing…' : 'Export ledger (CSV)' }}
          </button>
        </div>
      </header>

      <form class="ws-toolbar no-print" (ngSubmit)="load()" aria-label="Report period">
        <label>From<input type="date" name="date_from" [(ngModel)]="dateFrom" required></label>
        <label>To<input type="date" name="date_to" [(ngModel)]="dateTo" required></label>
        <label>Payment status
          <select name="status" [(ngModel)]="status">
            <option value="">All statuses</option>
            <option *ngFor="let option of statuses" [value]="option">{{ option }}</option>
          </select>
        </label>
        <label>Method
          <select name="method" [(ngModel)]="method">
            <option value="">All methods</option>
            <option *ngFor="let option of methods" [value]="option.value">{{ option.label }}</option>
          </select>
        </label>
        <button class="btn btn-primary btn-sm" type="submit" [disabled]="loading">Apply</button>
        <span class="presets">
          <button type="button" class="link" (click)="preset('month')">This month</button>
          <button type="button" class="link" (click)="preset('30')">Last 30 days</button>
          <button type="button" class="link" (click)="preset('quarter')">This quarter</button>
          <button type="button" class="link" (click)="preset('year')">This year</button>
        </span>
      </form>

      <p *ngIf="error" class="ws-message error" role="alert">{{ error }}</p>
      <section *ngIf="loading" class="ws-empty" aria-live="polite">Calculating…</section>

      <ng-container *ngIf="!loading && summary">
        <p class="period">Period: <strong>{{ summary.period.date_from | date:'mediumDate' }} – {{ summary.period.date_to | date:'mediumDate' }}</strong></p>
        <section class="kpi-grid" aria-label="Key figures">
          <article class="kpi accent"><span>Net revenue (collected)</span><strong>{{ money(summary.collected) }}</strong><small>{{ summary.paid_payment_count }} paid payments</small></article>
          <article class="kpi"><span>Booked sales</span><strong>{{ money(summary.booked_sales) }}</strong><small>{{ summary.order_count }} active orders</small></article>
          <article class="kpi"><span>Receivables</span><strong>{{ money(summary.receivables) }}</strong><small>{{ summary.pending_payment_count }} awaiting payment</small></article>
          <article class="kpi"><span>Refunded</span><strong>{{ money(summary.refunded) }}</strong><small>{{ summary.refunded_payment_count }} refunds</small></article>
          <article class="kpi"><span>VAT included ({{ summary.vat_rate }}%)</span><strong>{{ money(summary.vat_included) }}</strong><small>Net of VAT: {{ money(summary.net_revenue_excluding_vat) }}</small></article>
          <article class="kpi"><span>Average order</span><strong>{{ money(summary.average_order_value) }}</strong><small>{{ summary.cancelled_order_count }} cancelled ({{ money(summary.cancelled_value) }})</small></article>
        </section>

        <div class="ws-grid">
          <section class="ws-card" aria-labelledby="pl-title">
            <h2 id="pl-title">Income statement</h2>
            <table class="ws-table">
              <tbody>
                <tr><td>Gross receipts</td><td class="num">{{ money(summary.gross_receipts) }}</td></tr>
                <tr><td>− Refunds to customers</td><td class="num">{{ money(summary.refunded) }}</td></tr>
                <tr><td>= Net revenue (incl. VAT)</td><td class="num">{{ money(summary.net_revenue) }}</td></tr>
                <tr><td>− VAT payable ({{ summary.vat_rate }}%)</td><td class="num">{{ money(summary.vat_included) }}</td></tr>
              </tbody>
              <tfoot><tr><td>Net revenue excluding VAT</td><td class="num">{{ money(summary.net_revenue_excluding_vat) }}</td></tr></tfoot>
            </table>
            <p class="hint">Failed or declined payments ({{ money(summary.failed_payments) }}) are not income and are excluded.</p>
          </section>

          <section class="ws-card" aria-labelledby="method-title">
            <h2 id="method-title">By payment method</h2>
            <table class="ws-table">
              <thead><tr><th>Method</th><th class="num">Payments</th><th class="num">Collected</th><th class="num">Pending</th><th class="num">Refunded</th></tr></thead>
              <tbody>
                <tr *ngFor="let row of summary.by_payment_method">
                  <td>{{ row.label }}</td><td class="num">{{ row.count }}</td><td class="num">{{ money(row.collected) }}</td>
                  <td class="num">{{ money(row.receivable) }}</td><td class="num">{{ money(row.refunded) }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <div class="ws-grid">
          <section class="ws-card" aria-labelledby="month-title">
            <h2 id="month-title">Monthly breakdown</h2>
            <p *ngIf="!summary.by_month.length" class="hint">No orders in this period.</p>
            <table *ngIf="summary.by_month.length" class="ws-table">
              <thead><tr><th>Month</th><th class="num">Orders</th><th class="num">Booked</th><th class="num">Collected</th><th>Share</th></tr></thead>
              <tbody>
                <tr *ngFor="let row of summary.by_month">
                  <td>{{ row.month | date:'MMMM y' }}</td><td class="num">{{ row.orders }}</td>
                  <td class="num">{{ money(row.booked_sales) }}</td><td class="num">{{ money(row.collected) }}</td>
                  <td><div class="bar-track" [attr.aria-label]="percent(row.collected, maxMonth) + '% of the best month'"><div class="bar-fill" [style.width.%]="percent(row.collected, maxMonth)"></div></div></td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="ws-card" aria-labelledby="category-title">
            <h2 id="category-title">Collected revenue by category</h2>
            <p *ngIf="!summary.by_category.length" class="hint">No paid sales in this period.</p>
            <table *ngIf="summary.by_category.length" class="ws-table">
              <thead><tr><th>Category</th><th class="num">Units</th><th class="num">Collected</th><th>Share</th></tr></thead>
              <tbody>
                <tr *ngFor="let row of summary.by_category">
                  <td>{{ row.category }}</td><td class="num">{{ row.units }}</td><td class="num">{{ money(row.collected) }}</td>
                  <td><div class="bar-track" [attr.aria-label]="percent(row.collected, summary.collected) + '% of revenue'"><div class="bar-fill" [style.width.%]="percent(row.collected, summary.collected)"></div></div></td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <section class="ws-card" aria-labelledby="ledger-title">
          <h2 id="ledger-title">Payment ledger <small>({{ transactionCount }} {{ transactionCount === 1 ? 'entry' : 'entries' }}<ng-container *ngIf="transactionCount > transactions.length">, newest {{ transactions.length }} shown — export CSV for all</ng-container>)</small></h2>
          <p *ngIf="!transactions.length" class="hint">No payments match these filters.</p>
          <div class="ws-table-wrap" *ngIf="transactions.length">
            <table class="ws-table">
              <thead><tr><th>Order</th><th>Date</th><th>Customer ID</th><th>Method</th><th>Order status</th><th>Payment</th><th class="num">Amount</th></tr></thead>
              <tbody>
                <tr *ngFor="let row of transactions">
                  <td>#{{ row.order_id }}</td>
                  <td>{{ row.order_date | date:'short' }}</td>
                  <td>{{ row.customer_id }}</td>
                  <td>{{ methodLabel(row.method) }}<ng-container *ngIf="row.card_brand"> · {{ row.card_brand | titlecase }}</ng-container></td>
                  <td>{{ row.order_status }}</td>
                  <td><span class="pill" [class.ok]="row.payment_status === 'Paid'" [class.warn]="row.payment_status === 'Pending'" [class.bad]="row.payment_status === 'Failed'" [class.info]="row.payment_status === 'Refunded'">{{ row.payment_status }}</span></td>
                  <td class="num">{{ money(row.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </ng-container>
    </main>
  `,
  styles: [`
    .presets { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-left: auto; }
    .link { border: 0; background: none; color: var(--primary-dark); font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; padding: 6px 0; }
    .link:hover { text-decoration: underline; }
    .period { margin-bottom: 12px; color: var(--text-light); }
    .hint { color: var(--text-light); font-size: .85rem; margin-top: 10px; }
    h2 small { color: var(--text-light); font-size: .8rem; font-weight: 600; }
    @media print {
      .no-print, .ws-actions { display: none !important; }
      .ws-card, .kpi { box-shadow: none; break-inside: avoid; }
    }
  `],
})
export class AccountingComponent implements OnInit {
  summary: AccountingSummary | null = null;
  transactions: AccountingTransaction[] = [];
  transactionCount = 0;
  dateFrom = '';
  dateTo = '';
  status: PaymentStatus | '' = '';
  method: PaymentMethod | '' = '';
  loading = true;
  exporting = false;
  error = '';
  readonly statuses: PaymentStatus[] = ['Paid', 'Pending', 'Refunded', 'Failed'];
  readonly methods: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'card', label: 'Card' },
    { value: 'bank_transfer', label: 'Bank transfer' },
    { value: 'cash_on_delivery', label: 'Cash on delivery' },
  ];
  private readonly moneyFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  constructor(private readonly api: ApiService) {}

  get maxMonth(): number {
    return Math.max(0, ...(this.summary?.by_month ?? []).map(row => Number(row.collected)));
  }

  ngOnInit(): void {
    this.preset('30');
  }

  preset(kind: 'month' | '30' | 'quarter' | 'year'): void {
    const today = new Date();
    let start = new Date(today);
    if (kind === '30') start.setDate(today.getDate() - 29);
    if (kind === 'month') start = new Date(today.getFullYear(), today.getMonth(), 1);
    if (kind === 'quarter') start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    if (kind === 'year') start = new Date(today.getFullYear(), 0, 1);
    this.dateFrom = this.isoDate(start);
    this.dateTo = this.isoDate(today);
    this.load();
  }

  load(): void {
    if (!this.dateFrom || !this.dateTo) {
      this.error = 'Choose both a start and an end date.';
      return;
    }
    if (this.dateFrom > this.dateTo) {
      this.error = 'The start date must be on or before the end date.';
      return;
    }
    this.loading = true;
    this.error = '';
    const period = { date_from: this.dateFrom, date_to: this.dateTo };
    forkJoin({
      summary: this.api.getAccountingSummary(period),
      transactions: this.api.getAccountingTransactions({ ...this.filters(), limit: 300 }),
    }).subscribe({
      next: ({ summary, transactions }) => {
        this.summary = summary;
        this.transactions = transactions.results;
        this.transactionCount = transactions.count;
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.error = apiErrorMessage(error, 'We could not load the accounting report.');
      },
    });
  }

  exportCsv(): void {
    this.exporting = true;
    this.api.exportAccountingCsv(this.filters()).subscribe({
      next: blob => {
        this.exporting = false;
        saveBlob(blob, `onlineshop-ledger-${this.dateFrom}-${this.dateTo}.csv`);
      },
      error: error => {
        this.exporting = false;
        this.error = apiErrorMessage(error, 'We could not export the ledger.');
      },
    });
  }

  print(): void {
    window.print();
  }

  money(value: string | number | null | undefined): string {
    return `${this.moneyFormat.format(Number(value ?? 0))} ₸`;
  }

  percent(value: string | number, total: string | number): number {
    const denominator = Number(total);
    return denominator > 0 ? Math.round((Number(value) / denominator) * 100) : 0;
  }

  methodLabel(method: PaymentMethod): string {
    return this.methods.find(option => option.value === method)?.label ?? method;
  }

  private filters(): QueryParams {
    return { date_from: this.dateFrom, date_to: this.dateTo, status: this.status || undefined, method: this.method || undefined };
  }

  private isoDate(value: Date): string {
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
}
