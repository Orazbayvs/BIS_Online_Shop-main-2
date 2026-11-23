import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
import { ProductSuggestion, User, UserRole } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

interface MenuLink {
  path: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

/** Customer-facing links, then role workspaces. Each link is shown only to the roles that can use it. */
const ACCOUNT_LINKS: MenuLink[] = [
  { path: '/profile', label: 'My profile', icon: 'fa-user', roles: [] },
  { path: '/orders', label: 'Orders', icon: 'fa-receipt', roles: [] },
  { path: '/saved', label: 'Wishlist & waitlist', icon: 'fa-heart', roles: ['buyer', 'seller'] },
  { path: '/support', label: 'Support', icon: 'fa-headset', roles: [] },
  { path: '/sell', label: 'Sell a product', icon: 'fa-plus', roles: ['seller'] },
  { path: '/seller/listings', label: 'My listings', icon: 'fa-store', roles: ['seller'] },
];

const WORKSPACE_LINKS: MenuLink[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'fa-chart-pie', roles: ['head_manager', 'admin'] },
  { path: '/management', label: 'Store operations', icon: 'fa-boxes-stacked', roles: ['manager', 'warehouse', 'head_manager', 'admin'] },
  { path: '/reviews/moderation', label: 'Review moderation', icon: 'fa-comments', roles: ['manager', 'head_manager', 'admin'] },
  { path: '/accounting', label: 'Accounting', icon: 'fa-calculator', roles: ['accountant', 'head_manager', 'admin'] },
  { path: '/users', label: 'People & roles', icon: 'fa-users', roles: ['head_manager', 'security_manager', 'admin'] },
  { path: '/security', label: 'Security center', icon: 'fa-shield-halved', roles: ['security_manager', 'admin'] },
  { path: '/backups', label: 'Backups', icon: 'fa-database', roles: ['admin'] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  manager: 'Sales manager',
  warehouse: 'Warehouse',
  head_manager: 'Head manager',
  security_manager: 'Security manager',
  accountant: 'Accountant',
  admin: 'Administrator',
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [AsyncPipe, FormsModule, NgFor, NgIf, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="container header-wrap">
        <button type="button" class="icon-button menu-toggle" (click)="mobileOpen = !mobileOpen" [attr.aria-expanded]="mobileOpen" aria-controls="main-nav" aria-label="Toggle navigation">
          <i class="fas" [class.fa-bars]="!mobileOpen" [class.fa-xmark]="mobileOpen" aria-hidden="true"></i>
        </button>

        <a routerLink="/" class="brand" aria-label="Online Shop home">
          <span class="brand-mark" aria-hidden="true">O</span>
          <span>Online Shop</span>
        </a>

        <nav id="main-nav" aria-label="Main navigation" class="nav-bar" [class.open]="mobileOpen">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
          <a routerLink="/products" routerLinkActive="active">Catalog</a>
          <a routerLink="/categories" routerLinkActive="active">Categories</a>
          <a routerLink="/top-products" routerLinkActive="active">Top products</a>
          <form class="search mobile-search" (ngSubmit)="search()" role="search">
            <label class="visually-hidden" for="mobile-site-search">Search the catalog</label>
            <input id="mobile-site-search" name="mobile-site-search" [(ngModel)]="searchQuery" maxlength="120" placeholder="Search products">
            <button type="submit" aria-label="Search products"><i class="fas fa-search" aria-hidden="true"></i></button>
          </form>
        </nav>

        <div class="actions">
          <form class="search desktop-search" (ngSubmit)="search()" role="search">
            <label class="visually-hidden" for="site-search">Search the catalog</label>
            <input id="site-search" name="site-search" [(ngModel)]="searchQuery" (ngModelChange)="suggest($event)"
                   (focus)="showSuggestions = true" (keydown.escape)="showSuggestions = false"
                   maxlength="120" placeholder="Search products" autocomplete="off"
                   role="combobox" aria-autocomplete="list" [attr.aria-expanded]="showSuggestions && suggestions.length > 0" aria-controls="search-suggestions">
            <button type="submit" aria-label="Search products"><i class="fas fa-search" aria-hidden="true"></i></button>
            <ul *ngIf="showSuggestions && suggestions.length" id="search-suggestions" class="suggestions" role="listbox">
              <li *ngFor="let item of suggestions" role="option">
                <a [routerLink]="['/products', item.id]" (click)="pickSuggestion()">
                  <span>{{ item.name }}</span><small>{{ item.category_name }}</small>
                </a>
              </li>
            </ul>
          </form>

          <a routerLink="/cart" class="icon-button" aria-label="Open shopping cart">
            <i class="fas fa-shopping-bag" aria-hidden="true"></i>
            <span class="count" *ngIf="(cartCount$ | async) as count">{{ count }}</span>
          </a>

          <ng-container *ngIf="user$ | async as user; else signedOut">
            <a routerLink="/notifications" class="icon-button" aria-label="Notifications"><i class="fas fa-bell" aria-hidden="true"></i></a>
            <div class="account-menu">
              <button type="button" class="account-button" (click)="toggleMenu($event)" [attr.aria-expanded]="menuOpen" aria-haspopup="true" aria-controls="account-dropdown">
                <span class="avatar" aria-hidden="true">{{ initials(user) }}</span>
                <span class="who"><strong>{{ displayName(user) }}</strong><small>{{ roleLabel(user.role) }}</small></span>
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
              </button>
              <div *ngIf="menuOpen" id="account-dropdown" class="dropdown" role="menu">
                <p class="dropdown-email">{{ user.email }}</p>
                <a *ngFor="let link of accountLinks(user)" role="menuitem" [routerLink]="link.path" routerLinkActive="active">
                  <i class="fas {{ link.icon }}" aria-hidden="true"></i>{{ link.label }}
                </a>
                <ng-container *ngIf="workspaceLinks(user) as links">
                  <ng-container *ngIf="links.length">
                    <p class="dropdown-title">Workspace</p>
                    <a *ngFor="let link of links" role="menuitem" [routerLink]="link.path" routerLinkActive="active">
                      <i class="fas {{ link.icon }}" aria-hidden="true"></i>{{ link.label }}
                    </a>
                  </ng-container>
                </ng-container>
                <button type="button" role="menuitem" class="signout" (click)="logout()"><i class="fas fa-right-from-bracket" aria-hidden="true"></i>Sign out</button>
              </div>
            </div>
          </ng-container>
          <ng-template #signedOut>
            <a routerLink="/login" class="login">Sign in</a>
            <a routerLink="/register" class="join">Join</a>
          </ng-template>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .header { position: sticky; top: 0; z-index: 50; background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
    .header-wrap { min-height: 72px; display: flex; align-items: center; gap: 22px; }
    .brand { display: inline-flex; align-items: center; gap: 9px; color: var(--secondary); font-size: 1.15rem; font-weight: 800; white-space: nowrap; }
    .brand-mark { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, var(--secondary), #374151); color: #fff; }
    .nav-bar { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
    .nav-bar > a { padding: 8px 12px; border-radius: 9px; color: var(--text-light); font-size: .9rem; font-weight: 700; white-space: nowrap; }
    .nav-bar > a:hover { color: var(--secondary); background: var(--bg-offset); }
    .nav-bar > a.active { color: var(--primary-dark); background: #fbf5ec; }
    .actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .search { position: relative; display: flex; align-items: center; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
    .desktop-search { width: min(240px, 22vw); margin-right: 4px; }
    .search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(179, 139, 91, .15); }
    .search input { border: 0; width: 100%; min-width: 0; padding: 8px 10px; font: inherit; outline: none; background: transparent; border-radius: 10px; }
    .search button { border: 0; background: transparent; padding: 8px 10px; color: var(--secondary); cursor: pointer; }
    .mobile-search { display: none; }
    .suggestions { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 60; padding: 6px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: var(--shadow-hover); }
    .suggestions a { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--secondary); font-size: .88rem; }
    .suggestions a:hover { background: var(--bg-offset); }
    .suggestions small { color: var(--text-light); white-space: nowrap; }
    .icon-button { position: relative; display: inline-grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 10px; background: transparent; color: var(--secondary); font-size: 1.05rem; cursor: pointer; }
    .icon-button:hover { background: var(--bg-offset); }
    .menu-toggle { display: none; }
    .count { position: absolute; top: 3px; right: 2px; min-width: 17px; height: 17px; padding: 0 4px; display: grid; place-items: center; border-radius: 10px; background: var(--primary); color: #fff; font-size: .65rem; font-weight: 800; }
    .account-menu { position: relative; }
    .account-button { display: flex; align-items: center; gap: 8px; padding: 4px 8px 4px 4px; border: 1px solid var(--border); border-radius: 12px; background: #fff; font: inherit; cursor: pointer; color: var(--secondary); }
    .account-button:hover { border-color: var(--primary); }
    .avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--primary); color: #fff; font-size: .8rem; font-weight: 800; }
    .who { display: grid; text-align: left; line-height: 1.15; max-width: 130px; }
    .who strong, .who small { overflow: hidden; text-overflow: ellipsis; }
    .who strong { font-size: .82rem; }
    .who small { color: var(--text-light); font-size: .7rem; }
    .account-button .fa-chevron-down { font-size: .65rem; color: var(--text-light); }
    .dropdown { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; width: 250px; padding: 8px; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: var(--shadow-hover); animation: statusReveal .16s ease-out both; }
    .dropdown a, .dropdown .signout { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 9px; background: none; color: var(--secondary); font: inherit; font-size: .88rem; font-weight: 600; text-align: left; cursor: pointer; }
    .dropdown a i, .dropdown .signout i { width: 16px; color: var(--text-light); text-align: center; }
    .dropdown a:hover, .dropdown .signout:hover { background: var(--bg-offset); }
    .dropdown a.active { color: var(--primary-dark); background: #fbf5ec; }
    .dropdown-email { padding: 6px 10px 8px; color: var(--text-light); font-size: .78rem; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
    .dropdown-title { padding: 10px 10px 4px; margin-top: 4px; border-top: 1px solid var(--border); color: var(--primary-dark); font-size: .7rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .signout { margin-top: 4px; border-top: 1px solid var(--border) !important; border-radius: 0 0 9px 9px !important; color: #b91c1c !important; }
    .login { padding: 8px 10px; color: var(--secondary); font-weight: 700; }
    .join { padding: 8px 14px; border-radius: 10px; background: var(--secondary); color: #fff; font-size: .88rem; font-weight: 700; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 1100px) { .who { display: none; } .desktop-search { width: 180px; } }
    @media (max-width: 860px) {
      .menu-toggle { display: inline-grid; }
      .desktop-search { display: none; }
      .header-wrap { gap: 10px; }
      .actions { margin-left: auto; }
      .nav-bar { display: none; position: absolute; top: 100%; left: 0; right: 0; flex-direction: column; align-items: stretch; gap: 2px; padding: 10px 16px 16px; background: #fff; border-bottom: 1px solid var(--border); box-shadow: var(--shadow); }
      .nav-bar.open { display: flex; }
      .nav-bar > a { padding: 11px 12px; }
      .mobile-search { display: flex; margin-top: 8px; }
    }
    @media (max-width: 420px) { .brand span:last-child { display: none; } .join { display: none; } }
  `]
})
export class HeaderComponent implements OnInit, OnDestroy {
  searchQuery = '';
  suggestions: ProductSuggestion[] = [];
  showSuggestions = false;
  menuOpen = false;
  mobileOpen = false;
  private readonly query$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly auth: AuthService,
    private readonly cart: CartService,
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  get user$() {
    return this.auth.user$;
  }

  get cartCount$() {
    return this.cart.cartCount$;
  }

  ngOnInit(): void {
    this.subscriptions.add(this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.menuOpen = false;
      this.mobileOpen = false;
      this.showSuggestions = false;
    }));
    this.subscriptions.add(this.query$.pipe(
      debounceTime(200),
      map(value => value.trim()),
      distinctUntilChanged(),
      switchMap(value => value.length < 2 ? of([]) : this.api.getProductSuggestions(value).pipe(catchError(() => of([])))),
    ).subscribe(suggestions => {
      this.suggestions = suggestions;
      this.showSuggestions = true;
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen = false;
      this.showSuggestions = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.menuOpen = false;
    this.showSuggestions = false;
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  accountLinks(user: User): MenuLink[] {
    return ACCOUNT_LINKS.filter(link => !link.roles.length || link.roles.includes(user.role));
  }

  workspaceLinks(user: User): MenuLink[] {
    return WORKSPACE_LINKS.filter(link => link.roles.includes(user.role));
  }

  roleLabel(role: UserRole): string {
    return ROLE_LABELS[role] ?? role;
  }

  displayName(user: User): string {
    const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    return name || user.email;
  }

  initials(user: User): string {
    const letters = [user.first_name, user.last_name].filter(Boolean).map(part => part!.trim()[0]).join('');
    return (letters || user.email[0] || '?').toUpperCase().slice(0, 2);
  }

  suggest(value: string): void {
    this.query$.next(value ?? '');
  }

  pickSuggestion(): void {
    this.showSuggestions = false;
    this.searchQuery = '';
  }

  search(): void {
    const search = this.searchQuery.trim();
    this.showSuggestions = false;
    this.router.navigate(['/products'], { queryParams: { search: search || null } });
  }

  logout(): void {
    this.menuOpen = false;
    this.auth.logout().subscribe(() => this.router.navigate(['/']));
  }
}
