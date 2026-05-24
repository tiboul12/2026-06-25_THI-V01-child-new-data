import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '@worganic/portail-core/data-access';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const skipRedirect = req.url.includes('/api/auth/login')
    || req.url.includes('/api/auth/register')
    || req.url.includes('/api/auth/verify');

  // Ajouter le token Authorization à toutes les requêtes vers l'API data
  const token = authService.getToken();
  const authReq = (token && req.url.includes('/api/'))
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !skipRedirect) {
        authService.clearSessionPublic();
        router.navigate(['/']);
      }
      return throwError(() => error);
    })
  );
};
