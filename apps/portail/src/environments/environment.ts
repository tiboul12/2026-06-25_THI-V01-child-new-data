// Environnement de développement
// server-data.js  → http://localhost:3001  (serveur data)
// server-executor → http://localhost:3002  (serveur exécution IA)
export const environment = {
  production: false,
  apiDataUrl: 'http://localhost:3001',
  apiExecutorUrl: 'http://localhost:3002',
  apiAgentUrl: 'http://localhost:3003',

  // ─── Copyright & Branding ──────────────────────────────
  // Modifiez ces valeurs pour personnaliser le footer
  appName: 'Frankenstein Child',
  appVersion: '1.0.0',
  copyrightYear: 2026,
  copyrightHolder: 'Frankenstein Child',
  copyrightTagline: 'Propulsé par IA',
};
