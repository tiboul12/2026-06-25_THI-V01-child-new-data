import { Routes } from '@angular/router';
import { BASE_ROUTES } from './base-routes';
import { CHILD_ROUTES } from './child/child-routes';

export const routes: Routes = [
  ...BASE_ROUTES,
  ...CHILD_ROUTES,
  { path: '**', redirectTo: '' }
];
