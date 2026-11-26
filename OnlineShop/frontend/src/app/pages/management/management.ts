import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../utils/http';
import { activeFilters, countActiveFilters } from '../../utils/filters';

@Component({
  selector: 'app-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="management-page container">
      <h1>Store operations</h1>
      <p *ngIf="message" class="message">{{message}}</p>

      <ng-container *ngIf="canUseOperations; else noAccess">
        <section *ngIf="canSeeReport">
          <h2>Top-selling products · last 30 days</h2>
          <p *ngIf="report.length === 0">No paid, shipped, or delivered orders in the last 30 days.</p>
          <div class="table-wrap" *ngIf="report.length">
            <table>
              <thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th><th>Stock left</th><th>Suggested action</th></tr></thead>
              <tbody>
                <tr *ngFor="let row of report">
                  <td>{{row.product_name}}</td>
                  <td>{{row.units_sold}}</td>
                  <td>{{row.revenue | number:'1.2-2'}} KZT</td>
                  <td>{{row.stock_qty}}</td>
                  <td>{{recommendation(row)}}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Orders</h2>
          <form class="ws-toolbar order-filters" (ngSubmit)="applyOrderFilters()" aria-label="Filter orders">
            <label class="grow">Search<input name="order-search" [(ngModel)]="orderFilters.search" maxlength="120" [placeholder]="canSeeCustomerData ? 'Order #, product, or address' : 'Order # or product'"></label>
            <label>Status
              <select name="order-status" [(ngModel)]="orderFilters.status" (ngModelChange)="applyOrderFilters()">
                <option value="">All statuses</option>
                <option *ngFor="let status of orderStatuses" [value]="status">{{ status }}</option>
              </select>
            </label>
            <label *ngIf="canSeeCustomerData">Payment
              <select name="order-payment-status" [(ngModel)]="orderFilters.payment_status" (ngModelChange)="applyOrderFilters()">
                <option value="">Any payment</option>
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
                <option value="Refunded">Refunded</option>
                <option value="Failed">Failed</option>
              </select>
            </label>
            <label *ngIf="canSeeCustomerData">Customer ID<input name="order-customer" type="number" min="1" [(ngModel)]="orderFilters.customer" class="narrow"></label>
            <label>From<input type="date" name="order-from" [(ngModel)]="orderFilters.date_from" (ngModelChange)="applyOrderFilters()"></label>
            <label>To<input type="date" name="order-to" [(ngModel)]="orderFilters.date_to" (ngModelChange)="applyOrderFilters()"></label>
            <label>Sort
              <select name="order-ordering" [(ngModel)]="orderFilters.ordering" (ngModelChange)="applyOrderFilters()">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="-total">Total: high to low</option>
                <option value="total">Total: low to high</option>
              </select>
            </label>
            <button class="btn btn-primary btn-sm" type="submit">Search</button>
            <button class="btn btn-secondary btn-sm" type="button" (click)="clearOrderFilters()" [disabled]="!orderFilterCount">Clear</button>
          </form>
          <p *ngIf="orderFilterCount" class="filter-summary">{{ orders.length }} {{ orders.length === 1 ? 'order matches' : 'orders match' }} your filters.</p>
          <p *ngIf="orders.length === 0">{{ orderFilterCount ? 'No orders match these filters.' : 'No orders found.' }}</p>
          <div class="table-wrap" *ngIf="orders.length">
            <table>
              <thead><tr><th>Order</th><th *ngIf="canSeeCustomerData">Customer ID</th><th>Date</th><th>Delivery address</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>
                <tr *ngFor="let order of orders">
                  <td>#{{order.id}}</td>
                  <td *ngIf="canSeeCustomerData">{{order.customer_id}}</td>
                  <td>{{order.order_date | date:'short'}}</td>
                  <td>{{order.delivery_address}}</td>
                  <td>{{order.total_amount | number:'1.2-2'}} KZT</td>
                  <td>{{paymentLabel(order.payment?.method)}} · {{order.payment?.status || 'restricted'}}</td>
                  <td>
                    <select *ngIf="canUpdateOrderStatus; else readOnlyStatus"
                            [ngModel]="order.status" (ngModelChange)="changeOrderStatus(order, $event)">
                      <option [value]="order.status">{{order.status}}</option>
                      <option *ngFor="let next of nextStatuses(order)" [value]="next">{{next}}</option>
                    </select>
                    <ng-template #readOnlyStatus>
                      <span>{{order.status}}</span>
                      <button *ngIf="canPrepare(order)" type="button" class="btn btn-primary prepare" (click)="prepareOrder(order)">Prepare</button>
                    </ng-template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section *ngIf="canChangeStock">
          <h2>Warehouse stock</h2>
          <div class="table-wrap" *ngIf="products.length">
            <table>
              <thead><tr><th>Product</th><th>SKU</th><th>In stock</th><th>Reason for change</th><th>Update</th></tr></thead>
              <tbody>
                <tr *ngFor="let product of products">
                  <td>{{product.name}}</td>
                  <td>{{product.sku}}</td>
                  <td><input type="number" min="0" step="1" [(ngModel)]="product.stock_qty"></td>
                  <td><input type="text" maxlength="250" [name]="'stock-reason-' + product.id" [(ngModel)]="stockReasons[product.id]" placeholder="Count, delivery, correction…"></td>
                  <td><button class="btn btn-primary" (click)="saveStock(product)" [disabled]="!stockReason(product).trim()">Save</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </ng-container>
      <ng-template #noAccess>
        <p>Sign in with an authorized operations account to access store operations.</p>
      </ng-template>
    </main>
  `,
  styles: [`
    .order-filters { margin: 10px 0 8px; }
    .order-filters .grow { flex: 1 1 220px; }
    .order-filters .narrow { width: 110px; }
    .filter-summary { color: var(--text-light); font-size: .9rem; margin-bottom: 8px; }
    .management-page { padding: 48px 0; }
    h1 { margin-bottom: 30px; }
    section { margin: 32px 0; background: white; padding: 24px; border-radius: 14px; box-shadow: var(--shadow); }
    h2 { margin: 0 0 18px; font-size: 1.25rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; border-bottom: 1px solid var(--border); text-align: left; }
    th { color: var(--text-light); font-size: .85rem; }
    td input, td select { padding: 8px; border: 1px solid var(--border); border-radius: 6px; }
    .message { color: var(--primary); }
    .prepare { margin-left: 10px; padding: 6px 10px; font-size: .78rem; }
  `]
})
export class ManagementComponent implements OnInit {
  role = '';
  report: any[] = [];
  orders: any[] = [];
  products: any[] = [];
  stockReasons: Record<number, string> = {};
  readonly orderStatuses = ['New', 'Paid', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];
  orderFilters = this.emptyOrderFilters();
  message = '';

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.auth.restoreSession().subscribe({
      next: user => {
        if (!user) {
          this.message = 'Please sign in with a store operations account.';
          return;
        }
        this.role = user.role;
        if (this.canSeeReport) this.loadReport();
        if (this.canUseOperations) this.loadOrders();
        if (this.canChangeStock) this.loadProducts();
        this.cdr.detectChanges();
      },
      error: () => {
        this.message = 'Please sign in with a store operations account.';
        this.cdr.detectChanges();
      }
    });
  }

  nextStatuses(order: any): string[] {
    const transitions: Record<string, string[]> = {
      New: order.payment?.method === 'cash_on_delivery' ? ['Paid', 'Preparing', 'Shipped', 'Cancelled'] : ['Paid', 'Cancelled'],
      Paid: ['Preparing', 'Shipped', 'Cancelled'],
      Preparing: ['Shipped', 'Cancelled'],
      Shipped: ['Delivered'],
      Delivered: [],
      Cancelled: []
    };
    return transitions[order.status] || [];
  }

  paymentLabel(method?: string): string {
    const labels: Record<string, string> = {
      card: 'Card',
      bank_transfer: 'Bank transfer',
      cash_on_delivery: 'Cash on delivery'
    };
    return method ? labels[method] || method : 'Payment';
  }

  recommendation(row: any): string {
    if (row.stock_qty <= 2) return 'Reorder stock';
    if (row.units_sold <= 2 && Number(row.revenue) >= 20000) return 'Consider promotion';
    return 'Monitor';
  }

  changeOrderStatus(order: any, newStatus: string) {
    this.api.updateOrderStatus(order.id, newStatus).subscribe({
      next: () => {
        this.message = `Order #${order.id} updated.`;
        this.loadOrders();
        this.loadReport();
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not update order status.');
        this.loadOrders();
        this.cdr.detectChanges();
      }
    });
  }

  saveStock(product: any) {
    const reason = this.stockReason(product).trim();
    if (reason.length < 3) {
      this.message = 'Explain the stock change using at least 3 characters.';
      return;
    }
    this.api.updateStock(product.id, Number(product.stock_qty), reason).subscribe({
      next: updated => {
        product.stock_qty = updated.stock_qty;
        this.stockReasons[product.id] = '';
        this.message = `Stock updated for ${product.name}.`;
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not update stock.');
        this.loadProducts();
        this.cdr.detectChanges();
      }
    });
  }

  stockReason(product: any): string {
    return this.stockReasons[product.id] ?? '';
  }

  canPrepare(order: any): boolean {
    return this.canChangeStock && ['New', 'Paid'].includes(order.status);
  }

  get canUseOperations(): boolean {
    return ['manager', 'warehouse', 'head_manager', 'admin'].includes(this.role);
  }

  get canSeeReport(): boolean {
    return ['manager', 'head_manager', 'admin'].includes(this.role);
  }

  get canSeeCustomerData(): boolean {
    return ['manager', 'head_manager', 'admin'].includes(this.role);
  }

  get canUpdateOrderStatus(): boolean {
    return ['manager', 'head_manager', 'admin'].includes(this.role);
  }

  get canChangeStock(): boolean {
    return ['warehouse', 'admin'].includes(this.role);
  }

  prepareOrder(order: any) {
    this.api.prepareOrder(order.id).subscribe({
      next: () => {
        this.message = `Order #${order.id} was marked as prepared.`;
        this.loadOrders();
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not prepare this order.');
        this.cdr.detectChanges();
      }
    });
  }

  private loadReport() {
    this.api.getSalesReport().subscribe({
      next: rows => {
        this.report = rows;
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not load sales report.');
        this.cdr.detectChanges();
      }
    });
  }

  get orderFilterCount(): number {
    return countActiveFilters(activeFilters(this.orderFilters));
  }

  applyOrderFilters(): void {
    const filters = this.orderFilters;
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      this.message = 'The start date must be on or before the end date.';
      return;
    }
    this.loadOrders();
  }

  clearOrderFilters(): void {
    this.orderFilters = this.emptyOrderFilters();
    this.loadOrders();
  }

  private emptyOrderFilters(): { search: string; status: string; payment_status: string; customer: number | null; date_from: string; date_to: string; ordering: string } {
    return { search: '', status: '', payment_status: '', customer: null, date_from: '', date_to: '', ordering: 'newest' };
  }

  private loadOrders() {
    const filters = activeFilters(this.orderFilters);
    if (!this.canSeeCustomerData) {
      // Warehouse staff cannot see payment or customer data, so those filters are never sent.
      delete filters['payment_status'];
      delete filters['customer'];
    }
    this.api.getUserOrders(filters).subscribe({
      next: rows => {
        this.orders = Array.isArray(rows) ? rows : rows.results || [];
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not load orders.');
        this.cdr.detectChanges();
      }
    });
  }

  private loadProducts() {
    // Warehouse staff need every product, not only the first catalogue page.
    this.api.getAllProducts().subscribe({
      next: rows => {
        this.products = rows;
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = apiErrorMessage(err, 'Could not load stock.');
        this.cdr.detectChanges();
      }
    });
  }
}
