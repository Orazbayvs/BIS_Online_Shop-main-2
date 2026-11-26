import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../utils/http';
import { activeFilters, countActiveFilters } from '../../utils/filters';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="orders-page container">
      <h1>My Orders</h1>
      <form class="ws-toolbar order-filters" (ngSubmit)="applyFilters()" aria-label="Filter orders">
        <label class="grow">Search<input name="search" [(ngModel)]="filters.search" maxlength="120" placeholder="Order number or product"></label>
        <label>Status
          <select name="status" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()">
            <option value="">All statuses</option>
            <option *ngFor="let status of statuses" [value]="status">{{ status }}</option>
          </select>
        </label>
        <label>Payment
          <select name="payment_method" [(ngModel)]="filters.payment_method" (ngModelChange)="applyFilters()">
            <option value="">All methods</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash_on_delivery">Cash on delivery</option>
          </select>
        </label>
        <label>From<input type="date" name="date_from" [(ngModel)]="filters.date_from" (ngModelChange)="applyFilters()"></label>
        <label>To<input type="date" name="date_to" [(ngModel)]="filters.date_to" (ngModelChange)="applyFilters()"></label>
        <label>Sort
          <select name="ordering" [(ngModel)]="filters.ordering" (ngModelChange)="applyFilters()">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="-total">Total: high to low</option>
            <option value="total">Total: low to high</option>
          </select>
        </label>
        <button class="btn btn-primary btn-sm" type="submit">Search</button>
        <button class="btn btn-secondary btn-sm" type="button" (click)="clearFilters()" [disabled]="!filterCount">Clear</button>
      </form>
      <p *ngIf="!loading && filterCount" class="filter-summary">{{ orders.length }} {{ orders.length === 1 ? 'order matches' : 'orders match' }} your filters.</p>
      <p *ngIf="message" class="status-feedback" [class.success]="messageType === 'success'" [class.error]="messageType === 'error'" role="status">{{message}}</p>
      <p *ngIf="loading" class="loading"><span class="loading-indicator" aria-hidden="true"></span>Loading orders…</p>
      <p class="demo-note">Payments are simulated for this demo. Full card details stay in the browser and are never stored or sent. If you cancel a new order, its products are kept in your wishlist so you can easily buy them later.</p>
      <article class="order-card" *ngFor="let order of orders">
        <div class="order-heading">
          <h2>Order #{{order.id}}</h2>
          <span>{{order.status}}</span>
        </div>
        <p>{{order.order_date | date:'medium'}} · {{order.delivery_address}}</p>
        <div class="order-line" *ngFor="let item of order.items">
          <span>{{item.product_name}} × {{item.quantity}}</span>
          <span>{{item.unit_price * item.quantity | number:'1.2-2'}} KZT</span>
        </div>
        <div class="order-footer">
          <span>{{paymentLabel(order.payment?.method)}}<ng-container *ngIf="order.payment?.card_brand && order.payment?.card_last4"> · {{cardBrandLabel(order.payment.card_brand)}} ending {{order.payment.card_last4}}</ng-container> · {{order.payment?.status}}</span>
          <strong>{{order.total_amount | number:'1.2-2'}} KZT</strong>
        </div>
        <button *ngIf="order.status === 'New'" class="btn btn-outline" (click)="cancel(order)">
          Cancel order and save items
        </button>
      </article>
      <p *ngIf="!loading && orders.length === 0">{{ filterCount ? 'No orders match these filters.' : 'You have not placed any orders yet.' }}</p>
    </main>
  `,
  styles: [`
    .order-filters { margin: 18px 0 6px; }
    .order-filters .grow { flex: 1 1 220px; }
    .filter-summary { color: var(--text-light); font-size: .9rem; margin-bottom: 10px; }
    .orders-page { padding: 48px 0; }
    .demo-note { color: var(--text-light); margin-bottom: 24px; }
    .order-card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 22px; margin: 18px 0; }
    .order-heading, .order-line, .order-footer { display: flex; justify-content: space-between; gap: 16px; }
    .order-heading { align-items: center; }
    .order-heading h2 { font-size: 1.2rem; }
    .order-line { padding: 10px 0; border-top: 1px solid var(--border); }
    .order-footer { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 14px; }
    .order-card button { margin-top: 16px; }
    .loading { color: var(--text-light); margin: 16px 0; }
  `]
})
export class OrdersComponent implements OnInit {
  orders: any[] = [];
  loading = true;
  message = '';
  messageType: 'success' | 'error' = 'success';
  readonly statuses = ['New', 'Paid', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];
  filters = this.emptyFilters();

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('placed') === '1') {
      this.message = 'Your order was placed successfully.';
      this.messageType = 'success';
    }
    if (!this.auth.isLoggedIn()) {
      this.loading = false;
      this.message = 'Please sign in to view your orders.';
      this.messageType = 'error';
      return;
    }
    this.loadOrders();
  }

  cancel(order: any) {
    if (!window.confirm(`Cancel order #${order.id}? Its items will be returned to stock and saved to your wishlist.`)) return;
    this.api.cancelOrder(order.id).subscribe({
      next: () => {
        this.message = `Order #${order.id} cancelled, stock returned, and its products were saved to your wishlist.`;
        this.messageType = 'success';
        this.loadOrders();
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not cancel this order.');
        this.messageType = 'error';
        this.cdr.detectChanges();
      }
    });
  }

  paymentLabel(method?: string): string {
    const labels: Record<string, string> = {
      card: 'Card',
      bank_transfer: 'Bank transfer',
      cash_on_delivery: 'Cash on delivery'
    };
    return method ? labels[method] || method : 'Payment';
  }

  cardBrandLabel(brand?: string | null): string {
    const labels: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      other: 'Card',
    };
    return labels[brand ?? ''] ?? 'Card';
  }

  get filterCount(): number {
    return countActiveFilters(activeFilters(this.filters));
  }

  applyFilters(): void {
    if (this.filters.date_from && this.filters.date_to && this.filters.date_from > this.filters.date_to) {
      this.message = 'The start date must be on or before the end date.';
      this.messageType = 'error';
      return;
    }
    this.message = '';
    this.loading = true;
    this.loadOrders();
  }

  clearFilters(): void {
    this.filters = this.emptyFilters();
    this.applyFilters();
  }

  private emptyFilters() {
    return { search: '', status: '', payment_method: '', date_from: '', date_to: '', ordering: 'newest' };
  }

  private loadOrders() {
    this.api.getUserOrders(activeFilters(this.filters)).subscribe({
      next: rows => {
        this.orders = Array.isArray(rows) ? rows : rows.results || [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not load your orders.');
        this.messageType = 'error';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
