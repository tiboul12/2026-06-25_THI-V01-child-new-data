import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '@worganic/portail-core/data-access';
import { environment } from '../environments/environment';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);

  // Attend que la vérification initiale du token (depuis localStorage) soit terminée
  await auth.initDone;

  if (!auth.isAuthenticated()) {
    window.location.href = environment.portailUrl;
    return false;
  }

  return true;
};
