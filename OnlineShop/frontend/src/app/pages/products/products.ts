import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Category, Product, ProductSuggestion } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

type FilterKey = 'search' | 'category' | 'min_price' | 'max_price' | 'min_rating' | 'in_stock';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="products-page container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Online Shop catalogue</p>
          <h1>Find the right product</h1>
          <p>Search, compare, and add available products to your cart.</p>
        </div>
      </header>

      <form class="filters" (ngSubmit)="applyFilters()" aria-label="Catalogue filters">
        <label class="search-field">
          <span>Search</span>
          <input name="search" [(ngModel)]="search" (ngModelChange)="onSearchInput($event)" maxlength="120"
                 placeholder="Name, description, SKU or category" list="catalogue-suggestions" autocomplete="off">
          <datalist id="catalogue-suggestions">
            <option *ngFor="let suggestion of suggestions" [value]="suggestion.name">{{ suggestion.category_name }}</option>
          </datalist>
        </label>
        <label>
          <span>Category</span>
          <select name="category" [(ngModel)]="selectedCategory">
            <option value="">All categories</option>
            <option *ngFor="let category of categories" [value]="category.id">{{ category.name }}</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select name="ordering" [(ngModel)]="ordering">
            <option *ngFor="let option of sortOptions" [value]="option.value">{{ option.label }}</option>
          </select>
        </label>
        <div class="price">
          <span>Price, KZT</span>
          <div>
            <input name="min_price" type="number" min="0" step="1" [(ngModel)]="minPrice" placeholder="Min" aria-label="Minimum price">
            <span aria-hidden="true">–</span>
            <input name="max_price" type="number" min="0" step="1" [(ngModel)]="maxPrice" placeholder="Max" aria-label="Maximum price">
          </div>
        </div>
        <label>
          <span>Rating</span>
          <select name="min_rating" [(ngModel)]="minRating">
            <option value="">Any rating</option>
            <option value="4">★ 4 and up</option>
            <option value="3">★ 3 and up</option>
            <option value="2">★ 2 and up</option>
          </select>
        </label>
        <label class="check">
          <input type="checkbox" name="in_stock" [(ngModel)]="inStock">
          <span>In stock only</span>
        </label>
        <div class="filter-actions">
          <button class="btn btn-primary" type="submit">Apply</button>
          <button class="btn btn-secondary" type="button" (click)="clearFilters()">Clear</button>
        </div>
      </form>

      <div class="results-bar" *ngIf="!loading && !error">
        <p><strong>{{ totalCount }}</strong> {{ totalCount === 1 ? 'product' : 'products' }}<ng-container *ngIf="hasActiveFilters"> match your filters</ng-container></p>
        <div class="chips" *ngIf="hasActiveFilters">
          <button *ngFor="let chip of activeChips" type="button" class="chip" (click)="removeChip(chip.key)" [attr.aria-label]="'Remove filter ' + chip.label">
            {{ chip.label }} <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <p *ngIf="cartMessage" class="notice" role="status">{{ cartMessage }}</p>
      <section *ngIf="loading" class="state" aria-live="polite">Loading products…</section>
      <section *ngIf="!loading && error" class="state error" role="alert">
        <p>{{ error }}</p>
        <button class="btn btn-primary" type="button" (click)="loadProducts()">Try again</button>
      </section>

      <section *ngIf="!loading && !error && products.length" class="product-grid" aria-label="Products">
        <article class="product-card" *ngFor="let product of products">
          <a [routerLink]="['/products', product.id]" class="image-link" [attr.aria-label]="'View ' + product.name">
            <img [src]="product.image_url || fallbackImage" [alt]="product.name" (error)="useFallback(product)">
            <span class="stock" [class.out]="product.stock_qty === 0" [class.low]="product.stock_qty > 0 && product.stock_qty <= 10">
              {{ stockLabel(product.stock_qty) }}
            </span>
          </a>
          <div class="card-body">
            <span class="category">{{ product.category_name || categoryName(product.category) }}</span>
            <h2><a [routerLink]="['/products', product.id]">{{ product.name }}</a></h2>
            <p class="rating" [attr.aria-label]="ratingLabel(product)"><span aria-hidden="true">★</span><strong>{{ product.average_rating ?? 0 | number:'1.1-1' }}</strong><span>({{ product.rating_count ?? 0 }})</span></p>
            <p class="description">{{ product.description || 'Product details are available on its page.' }}</p>
            <div class="card-footer">
              <strong>{{ product.price | number:'1.0-2' }} KZT</strong>
              <button class="btn btn-primary add" type="button" (click)="addToCart(product)" [disabled]="product.stock_qty === 0" [attr.aria-label]="'Add ' + product.name + ' to cart'">
                <i class="fas fa-cart-plus" aria-hidden="true"></i><span>Add</span>
              </button>
            </div>
          </div>
        </article>
      </section>

      <nav *ngIf="!loading && !error && totalPages > 1" class="pager" aria-label="Catalogue pages">
        <button type="button" class="btn btn-secondary" (click)="goToPage(page - 1)" [disabled]="page <= 1"><i class="fas fa-chevron-left" aria-hidden="true"></i> Previous</button>
        <span>Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="btn btn-secondary" (click)="goToPage(page + 1)" [disabled]="page >= totalPages">Next <i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </nav>

      <section *ngIf="!loading && !error && !products.length" class="state empty">
        <h2>No products matched those filters</h2>
        <p>Try a different search term or clear your filters.</p>
        <button class="btn btn-primary" type="button" (click)="clearFilters()">Show all products</button>
      </section>
    </main>
  `,
  styles: [`
    .products-page { padding: 44px 20px 72px; }
    .page-header { display: flex; justify-content: space-between; gap: 28px; margin-bottom: 28px; }
    h1 { margin: 3px 0 8px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }
    .eyebrow, .category { color: var(--primary-dark); text-transform: uppercase; letter-spacing: .1em; font-size: .75rem; font-weight: 800; }
    .page-header p:not(.eyebrow) { color: var(--text-light); }
    .filters { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(2, minmax(150px, 1fr)); align-items: end; gap: 13px; padding: 18px; border: 1px solid var(--border); border-radius: 14px; background: #fff; }
    .filters .search-field { grid-column: span 1; }
    .price { display: grid; gap: 5px; color: var(--text-light); font-size: .82rem; font-weight: 700; }
    .price > div { display: flex; align-items: center; gap: 6px; }
    .price input { width: 100%; min-height: 42px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }
    .filters label.check { display: flex; align-items: center; gap: 8px; min-height: 42px; color: var(--secondary); font-size: .9rem; cursor: pointer; }
    .filters label.check input { width: 18px; min-height: 18px; height: 18px; accent-color: var(--primary); }
    .filter-actions { display: flex; gap: 8px; }
    .filter-actions .btn { flex: 1; }
    .results-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 20px; color: var(--text-light); }
    .results-bar strong { color: var(--secondary); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--border); border-radius: 999px; background: #fff; color: var(--secondary); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
    .chip:hover { border-color: #fca5a5; color: #b91c1c; }
    .pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 32px; padding: 0; color: var(--text-light); font-weight: 700; }
    .filters label { display: grid; gap: 5px; color: var(--text-light); font-size: .82rem; font-weight: 700; }
    .filters input, .filters select { width: 100%; min-height: 42px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; }
    .btn-secondary { background: #fff; border: 1px solid var(--border); color: var(--secondary); }
    .notice { margin: 18px 0; color: #166534; font-weight: 600; }
    .state { display: grid; justify-items: center; gap: 12px; padding: 70px 20px; text-align: center; color: var(--text-light); }
    .state.error { color: #b91c1c; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 22px; margin-top: 20px; padding: 0; }
    .product-card { overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: var(--shadow); }
    .product-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); transition: var(--transition); }
    .image-link { height: 205px; position: relative; background: #f5f1eb; }
    .image-link img { width: 100%; height: 100%; object-fit: cover; }
    .stock { position: absolute; right: 10px; top: 10px; padding: 4px 8px; border-radius: 999px; background: #ecfdf5; color: #166534; font-size: .72rem; font-weight: 800; }
    .stock.low { background: #fffbeb; color: #92400e; }.stock.out { background: #fef2f2; color: #b91c1c; }
    .card-body { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 17px; }
    h2 { font-size: 1.05rem; line-height: 1.3; }.card-body h2 a:hover { color: var(--primary-dark); }
    .rating { display: flex; align-items: center; gap: 5px; color: var(--text-light); font-size: .82rem; }.rating > span:first-child { color: #eab308; font-size: 1rem; }.rating strong { color: var(--secondary); }.description { min-height: 43px; color: var(--text-light); font-size: .88rem; line-height: 1.45; }
    .card-footer { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .card-footer strong { color: var(--secondary); }.add { padding: 8px 11px; }.add:disabled { opacity: .55; cursor: not-allowed; }
    @media (max-width: 900px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters .search-field { grid-column: 1 / -1; } }
    @media (max-width: 520px) { .products-page { padding-inline: 14px; }.filters { grid-template-columns: 1fr; }.add span { display: none; } }
  `]
})
export class ProductsComponent implements OnInit, OnDestroy {
  categories: Category[] = [];
  products: Product[] = [];
  suggestions: ProductSuggestion[] = [];
  search = '';
  selectedCategory = '';
  ordering = 'name';
  minPrice: number | null = null;
  maxPrice: number | null = null;
  minRating = '';
  inStock = false;
  page = 1;
  totalCount = 0;
  loading = true;
  error = '';
  cartMessage = '';
  readonly pageSize = 24;
  readonly fallbackImage = 'assets/images/products/headphones.png';
  readonly sortOptions = [
    { value: 'name', label: 'Name A–Z' },
    { value: '-name', label: 'Name Z–A' },
    { value: 'price', label: 'Price: low to high' },
    { value: '-price', label: 'Price: high to low' },
    { value: 'rating', label: 'Best rated' },
    { value: 'popular', label: 'Most popular' },
    { value: 'newest', label: 'Newest' },
  ];
  private readonly searchInput$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly api: ApiService,
    private readonly cart: CartService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  get activeChips(): Array<{ key: FilterKey; label: string }> {
    const chips: Array<{ key: FilterKey; label: string }> = [];
    if (this.search.trim()) chips.push({ key: 'search', label: `“${this.search.trim()}”` });
    if (this.selectedCategory) chips.push({ key: 'category', label: this.categoryName(Number(this.selectedCategory)) });
    if (this.minPrice !== null) chips.push({ key: 'min_price', label: `From ${this.minPrice} KZT` });
    if (this.maxPrice !== null) chips.push({ key: 'max_price', label: `Up to ${this.maxPrice} KZT` });
    if (this.minRating) chips.push({ key: 'min_rating', label: `★ ${this.minRating}+` });
    if (this.inStock) chips.push({ key: 'in_stock', label: 'In stock' });
    return chips;
  }

  get hasActiveFilters(): boolean {
    return this.activeChips.length > 0;
  }

  ngOnInit(): void {
    this.loadCategories();
    this.subscriptions.add(
      this.searchInput$.pipe(
        debounceTime(200),
        map(value => value.trim()),
        distinctUntilChanged(),
        switchMap(value => value.length < 2 ? of([]) : this.api.getProductSuggestions(value).pipe(catchError(() => of([])))),
      ).subscribe(suggestions => this.suggestions = suggestions)
    );
    this.subscriptions.add(this.route.queryParamMap.subscribe(params => {
      this.search = params.get('search') ?? '';
      this.selectedCategory = params.get('category') ?? '';
      this.ordering = params.get('ordering') ?? 'name';
      this.minPrice = this.numberParam(params.get('min_price'));
      this.maxPrice = this.numberParam(params.get('max_price'));
      this.minRating = params.get('min_rating') ?? '';
      this.inStock = params.get('in_stock') === 'true';
      this.page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
      this.loadProducts();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value ?? '');
  }

  loadProducts(): void {
    this.loading = true;
    this.error = '';
    this.api.getProducts({
      search: this.search.trim() || undefined,
      category: this.selectedCategory || undefined,
      ordering: this.ordering || undefined,
      min_price: this.minPrice ?? undefined,
      max_price: this.maxPrice ?? undefined,
      min_rating: this.minRating || undefined,
      in_stock: this.inStock || undefined,
      page: this.page > 1 ? this.page : undefined,
      page_size: this.pageSize,
    }).subscribe({
      next: response => {
        this.products = collectionItems(response);
        this.totalCount = Array.isArray(response) ? response.length : response.count ?? this.products.length;
        this.loading = false;
      },
      error: error => {
        this.products = [];
        this.totalCount = 0;
        this.loading = false;
        // An out-of-range page (e.g. after filters shrink the result) falls back to page 1.
        if (error?.status === 404 && this.page > 1) {
          this.goToPage(1);
          return;
        }
        this.error = apiErrorMessage(error, 'We could not load the catalogue.');
      }
    });
  }

  applyFilters(): void {
    if (this.minPrice !== null && this.maxPrice !== null && this.minPrice > this.maxPrice) {
      [this.minPrice, this.maxPrice] = [this.maxPrice, this.minPrice];
    }
    this.navigate(1);
  }

  clearFilters(): void {
    this.search = '';
    this.selectedCategory = '';
    this.ordering = 'name';
    this.minPrice = null;
    this.maxPrice = null;
    this.minRating = '';
    this.inStock = false;
    this.router.navigate(['/products']);
  }

  removeChip(key: FilterKey): void {
    if (key === 'search') this.search = '';
    if (key === 'category') this.selectedCategory = '';
    if (key === 'min_price') this.minPrice = null;
    if (key === 'max_price') this.maxPrice = null;
    if (key === 'min_rating') this.minRating = '';
    if (key === 'in_stock') this.inStock = false;
    this.navigate(1);
  }

  goToPage(page: number): void {
    if (page < 1) return;
    this.navigate(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  addToCart(product: Product): void {
    this.cartMessage = this.cart.addToCart(product)
      ? `${product.name} was added to your cart.`
      : `No more ${product.name} units are currently available.`;
  }

  useFallback(product: Product): void {
    product.image_url = this.fallbackImage;
  }

  categoryName(id: number): string {
    return this.categories.find(category => category.id === id)?.name ?? 'General';
  }

  stockLabel(stock: number): string {
    if (stock <= 0) return 'Sold out';
    if (stock <= 10) return `${stock} left`;
    return 'In stock';
  }

  ratingLabel(product: Product): string {
    const rating = product.average_rating ?? 0;
    const count = product.rating_count ?? 0;
    return `${rating.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`;
  }

  private navigate(page: number): void {
    const price = (value: number | null) => value === null || Number.isNaN(Number(value)) ? null : Math.max(0, Number(value));
    this.router.navigate(['/products'], {
      queryParams: {
        search: this.search.trim() || null,
        category: this.selectedCategory || null,
        ordering: this.ordering === 'name' ? null : this.ordering,
        min_price: price(this.minPrice),
        max_price: price(this.maxPrice),
        min_rating: this.minRating || null,
        in_stock: this.inStock ? 'true' : null,
        page: page > 1 ? page : null,
      }
    });
  }

  private numberParam(value: string | null): number | null {
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private loadCategories(): void {
    this.api.getCategories().subscribe({
      next: categories => this.categories = categories,
      error: () => this.categories = [],
    });
  }
}
