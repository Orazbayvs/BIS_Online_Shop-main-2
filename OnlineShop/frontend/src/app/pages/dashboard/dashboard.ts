import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardOverview } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="page container">
      <header><div><p class="eyebrow">Leadership workspace</p><h1>Business overview</h1><p>Review current Online Shop activity and move to the appropriate operational workspace.</p></div><button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading">Refresh</button></header>
      <p *ngIf="error" class="error" role="alert">{{ error }}</p>
      <section *ngIf="loading" class="state">Loading dashboard…</section>
      <section *ngIf="!loading && !error" class="metrics" aria-label="Dashboard metrics"><article *ngFor="let metric of metrics" class="metric" [class.accent]="metric.accent"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small *ngIf="metric.hint">{{ metric.hint }}</small></article></section>
      <section *ngIf="!loading && !error && (statusRows('orders_by_status').length || statusRows('support_tickets_by_status').length)" class="breakdowns">
        <article class="metric" *ngIf="statusRows('orders_by_status').length"><span>Orders by status (all time)</span><ul><li *ngFor="let row of statusRows('orders_by_status')"><span>{{ row.label }}</span><strong>{{ row.value }}</strong></li></ul></article>
        <article class="metric" *ngIf="statusRows('support_tickets_by_status').length"><span>Support tickets by status</span><ul><li *ngFor="let row of statusRows('support_tickets_by_status')"><span>{{ row.label }}</span><strong>{{ row.value }}</strong></li></ul></article>
      </section>
      <section class="quick-links"><a routerLink="/management"><i class="fas fa-boxes" aria-hidden="true"></i><span><strong>Store operations</strong><small>Orders, stock, and sales performance.</small></span></a><a routerLink="/accounting"><i class="fas fa-calculator" aria-hidden="true"></i><span><strong>Accounting</strong><small>Revenue, refunds, receivables, VAT, and CSV ledger.</small></span></a><a routerLink="/reviews/moderation"><i class="fas fa-comments" aria-hidden="true"></i><span><strong>Review moderation</strong><small>{{ pendingReviews }} {{ pendingReviews === 1 ? 'review is' : 'reviews are' }} waiting for approval.</small></span></a><a routerLink="/users"><i class="fas fa-users" aria-hidden="true"></i><span><strong>People and roles</strong><small>Review account access and activity.</small></span></a><a *ngIf="canAccessSecurity" routerLink="/security"><i class="fas fa-shield-alt" aria-hidden="true"></i><span><strong>Security center</strong><small>Review the access audit trail.</small></span></a><a *ngIf="canAccessBackups" routerLink="/backups"><i class="fas fa-database" aria-hidden="true"></i><span><strong>Backups</strong><small>Create and download database backups.</small></span></a></section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page > header { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); }.page header p:not(.eyebrow) { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.error { margin-top: 22px; color: #b91c1c; }.state { padding: 72px 0; color: var(--text-light); text-align: center; }.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin: 30px 0; }.metric { display: grid; gap: 8px; padding: 22px; border: 1px solid var(--border); border-radius: 13px; background: #fff; box-shadow: var(--shadow); }.metric span { color: var(--text-light); font-size: .86rem; }.metric strong { color: var(--secondary); font-size: 1.6rem; }.metric small { color: var(--text-light); font-size: .8rem; }.metric.accent { background: var(--secondary); border-color: var(--secondary); }.metric.accent span, .metric.accent small { color: #d1d5db; }.metric.accent strong { color: #fff; }.breakdowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; padding: 0; margin-bottom: 30px; }.breakdowns ul { display: grid; gap: 6px; }.breakdowns li { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding-bottom: 4px; }.breakdowns li strong { font-size: 1rem; }.metrics, .quick-links { padding: 0; }.quick-links { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }.quick-links a { display: flex; gap: 14px; align-items: start; padding: 20px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.quick-links a:hover { box-shadow: var(--shadow-hover); }.quick-links i { color: var(--primary-dark); font-size: 1.25rem; }.quick-links span { display: grid; gap: 5px; }.quick-links small { color: var(--text-light); line-height: 1.4; }@media (max-width: 720px) { .page > header { align-items: start; flex-direction: column; }.quick-links { grid-template-columns: 1fr; } }
  `]
})
export class DashboardComponent implements OnInit {
  overview: DashboardOverview = {};
  loading = true;
  error = '';

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  get canAccessSecurity(): boolean {
    return this.auth.hasAnyRole('security_manager', 'admin');
  }

  get canAccessBackups(): boolean {
    return this.auth.hasAnyRole('admin');
  }

  get pendingReviews(): number {
    return Number(this.overview['pending_reviews'] ?? 0);
  }

  get metrics(): Array<{ label: string; value: string; hint?: string; accent?: boolean }> {
    const o = this.overview;
    if (!Object.keys(o).length) return [{ label: 'Status', value: 'No overview metrics available yet' }];
    const number = (key: string) => Number(o[key] ?? 0);
    return [
      { label: 'Revenue · last 30 days', value: this.money(o['revenue_last_30_days']), hint: `${number('completed_orders_last_30_days')} confirmed orders`, accent: true },
      { label: 'Active products', value: `${number('active_products')}`, hint: `${number('total_products')} in total` },
      { label: 'Low stock (≤ 5)', value: `${number('low_stock_products')}`, hint: 'Active products to reorder' },
      { label: 'Active customers', value: `${number('active_customers')}`, hint: 'Buyer and seller accounts' },
      { label: 'Open support tickets', value: `${number('open_support_tickets')}`, hint: 'Open or in progress' },
      { label: 'Reviews to moderate', value: `${number('pending_reviews')}`, hint: 'Waiting for approval' },
    ];
  }

  statusRows(key: string): Array<{ label: string; value: number }> {
    const value = this.overview[key];
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value as Record<string, number>).map(([label, count]) => ({ label, value: Number(count) }));
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.getDashboardOverview().subscribe({
      next: overview => {
        this.overview = overview;
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.error = error?.status === 404
          ? 'The dashboard endpoint is not available on this server yet.'
          : apiErrorMessage(error, 'We could not load the dashboard.');
      }
    });
  }

  private money(value: unknown): string {
    const amount = Number(value ?? 0);
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)} ₸`;
  }
}
