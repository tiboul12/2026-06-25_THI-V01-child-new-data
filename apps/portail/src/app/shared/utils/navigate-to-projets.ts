import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'frankenstein_token';
const USER_KEY = 'frankenstein_user';
const THEME_KEY = 'theme';

export function navigateToProjets(path = ''): void {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  const theme = localStorage.getItem(THEME_KEY);
  const base = environment.projetsAppUrl;
  const url = new URL(path ? `${base}/${path}` : base);
  if (token) url.searchParams.set('token', token);
  if (user) url.searchParams.set('user', user);
  if (theme) url.searchParams.set('theme', theme);
  window.location.href = url.toString();
}
