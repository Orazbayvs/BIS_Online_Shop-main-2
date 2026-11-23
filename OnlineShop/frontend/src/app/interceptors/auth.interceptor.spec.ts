import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../services/auth.service';
import { apiErrorMessage } from '../utils/http';
import { authInterceptor } from './auth.interceptor';

/** Builds an unsigned JWT-shaped token that expires `secondsFromNow` from now. */
function token(secondsFromNow: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('refreshes an expired access token once and retries with only valid header names', () => {
    localStorage.setItem('Online Shop_access_token', token(-60));
    localStorage.setItem('Online Shop_refresh_token', token(3600));
    let body: unknown;
    http.get('/api/orders/').subscribe(result => body = result);

    backend.expectOne('/api/orders/').flush({ detail: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/token/refresh/').flush({ access: 'fresh-token' });
    const retry = backend.expectOne('/api/orders/');

    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    // Every header name must be a valid HTTP token (the old retry marker contained a space).
    for (const name of retry.request.headers.keys()) {
      expect(name).toMatch(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);
    }
    retry.flush([]);
    expect(body).toEqual([]);
  });

  it('does not loop when the retried request is still unauthorized', () => {
    localStorage.setItem('Online Shop_access_token', token(-60));
    localStorage.setItem('Online Shop_refresh_token', token(3600));
    let failure: HttpErrorResponse | undefined;
    http.get('/api/me/').subscribe({ error: error => failure = error });

    backend.expectOne('/api/me/').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/token/refresh/').flush({ access: 'fresh-token' });
    backend.expectOne('/api/me/').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(failure?.status).toBe(401);
  });

  it('keeps a session signed in while only the refresh token is still valid', () => {
    localStorage.setItem('Online Shop_access_token', token(-60));
    localStorage.setItem('Online Shop_refresh_token', token(3600));
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);

    localStorage.setItem('Online Shop_refresh_token', token(-60));
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
  });
});

describe('apiErrorMessage', () => {
  it('returns the full DRF message for field errors sent as a plain string', () => {
    const error = new HttpErrorResponse({ status: 400, error: { status: 'Cannot change Delivered to Paid.' } });
    expect(apiErrorMessage(error, 'fallback')).toBe('Cannot change Delivered to Paid.');
  });

  it('joins list errors and falls back when there is no message', () => {
    const listError = new HttpErrorResponse({ status: 400, error: ['Only new orders can be cancelled by the customer.'] });
    expect(apiErrorMessage(listError, 'fallback')).toBe('Only new orders can be cancelled by the customer.');
    expect(apiErrorMessage(new HttpErrorResponse({ status: 500, error: null }), 'fallback')).toBe('fallback');
  });
});
