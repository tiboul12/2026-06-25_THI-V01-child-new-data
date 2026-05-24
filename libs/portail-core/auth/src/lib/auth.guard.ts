import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, DbStatusService } from '@worganic/portail-core/data-access';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const db = inject(DbStatusService);

  if (db.status() === 'error') {
    router.navigate(['/']);
    return false;
  }

  if (auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};
