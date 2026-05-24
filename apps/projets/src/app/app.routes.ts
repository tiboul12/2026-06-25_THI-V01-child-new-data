import { Route } from '@angular/router';
import { authGuard } from './auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'projets'
  },
  {
    path: 'projets',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/projets/projets.component').then(m => m.ProjetsComponent)
  },
  {
    path: 'projets/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/projet-editor/projet-editor.component').then(m => m.ProjetEditorComponent)
  },
  { path: '**', redirectTo: 'projets' }
];
