import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Marks a request that was already retried after a token refresh. Using an
 * HttpContext flag (instead of a custom header) keeps the marker inside the
 * browser, so it never breaks CORS preflight checks or header-name validation.
 */
const AUTH_RETRIED = new HttpContextToken<boolean>(() => false);

const isAuthenticationRequest = (url: string): boolean =>
  url.includes('/api/login/') || url.includes('/api/token/refresh/') || url.includes('/api/registration/');

/** Adds a single JWT header for all API traffic and retries once after a 401. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const authorized = token && !isAuthenticationRequest(request.url)
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthenticationRequest(request.url) ||
        request.context.get(AUTH_RETRIED) ||
        !auth.refreshToken
      ) {
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap(nextToken => next(
          request.clone({
            setHeaders: { Authorization: `Bearer ${nextToken}` },
            context: request.context.set(AUTH_RETRIED, true),
          })
        )),
        catchError(refreshError => throwError(() => refreshError))
      );
    })
  );
};
