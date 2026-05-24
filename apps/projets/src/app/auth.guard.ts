import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '@worganic/portail-core/data-access';
import { environment } from '../environments/environment';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);

  if (auth.isAuthenticated()) {
    return true;
  }

  window.location.href = environment.portailUrl;
  return false;
};
