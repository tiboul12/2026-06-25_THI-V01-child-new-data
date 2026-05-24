import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'frankenstein_token';
const USER_KEY = 'frankenstein_user';

export function navigateToProjets(path = ''): void {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  const base = environment.projetsAppUrl;
  const url = new URL(path ? `${base}/${path}` : base);
  if (token) url.searchParams.set('token', token);
  if (user) url.searchParams.set('user', user);
  window.location.href = url.toString();
}
