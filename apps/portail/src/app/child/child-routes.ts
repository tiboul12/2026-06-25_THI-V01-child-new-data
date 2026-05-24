import { Routes } from '@angular/router';
import { authGuard } from '@worganic/portail-core/auth';

export const CHILD_ROUTES: Routes = [
  {
    path: 'projets',
    canActivate: [authGuard],
    loadComponent: () => import('../pages/user/projets/projets.component').then(m => m.ProjetsComponent)
  },
  {
    path: 'projets/:id',
    canActivate: [authGuard],
    loadComponent: () => import('../pages/user/projet-editor/projet-editor.component').then(m => m.ProjetEditorComponent)
  },
];
