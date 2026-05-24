import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Récupère le token et le user passés par le portail (localhost:4202) via paramètres URL
// pour contourner l'isolation localStorage cross-origin entre les deux apps.
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const user = params.get('user');
if (token) {
  localStorage.setItem('frankenstein_token', token);
  if (user) localStorage.setItem('frankenstein_user', user);
  const clean = new URL(window.location.href);
  clean.searchParams.delete('token');
  clean.searchParams.delete('user');
  window.history.replaceState({}, '', clean.toString());
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
