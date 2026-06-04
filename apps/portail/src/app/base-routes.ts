import { Routes } from '@angular/router';
import { authGuard } from '@worganic/portail-core/auth';
import { guestGuard } from '@worganic/portail-core/auth';

export const BASE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/public/landing/landing.component').then(m => m.LandingComponent)
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/user/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'editor',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/user/editor/editor.component').then(m => m.EditorComponent)
  },
  {
    path: 'documents',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/user/documents/documents.component').then(m => m.DocumentsComponent)
  },
  {
    path: 'config',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/user/config/config.component').then(m => m.ConfigComponent)
  },
  {
    path: 'deployments',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/user/deployments/deployments.component').then(m => m.DeploymentsComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent)
  },
  {
    path: 'wo-action-history',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/user/wo-action-history/wo-action-history.component').then(m => m.WoActionHistoryComponent)
  },
  {
    path: 'tchat-ia-doc',
    loadComponent: () => import('./tools/tchat-ia/tchat-ia-doc.component').then(m => m.TchatIaDocComponent)
  },
  {
    path: 'ticket-widget-doc',
    loadComponent: () => import('./tools/ticket-widget/ticket-widget-doc.component').then(m => m.TicketWidgetDocComponent)
  },
  {
    path: 'cahier-recette-doc',
    loadComponent: () => import('./tools/cahier-recette/cahier-recette-doc.component').then(m => m.CahierRecetteDocComponent)
  },
  {
    path: 'trello',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/trello/trello-page.component').then(m => m.TrelloPageComponent)
  },
];
