# THI-V01 — Child project Worganic Base

Projet child basé sur [worganic-base](https://github.com/worganic/worganic-base).

---

## Versioning dual

| Champ | Format | Rôle |
|-------|--------|------|
| `child` | `THI-X.XX` | Version de ce child project |
| `baseSynced` | `BX.XX` | Dernière version de la base intégrée |

Le fichier `version.json` à la racine contient les trois champs :
```json
{ "childId": "THI-V01", "child": "THI-0.07", "baseSynced": "B0.07" }
```

---

## Synchronisation depuis la base

Quand `worganic-base` publie une nouvelle version :

```
.\sync-from-base.bat
```

Le script :
- Affiche les propagations en attente (fichiers à intégrer manuellement)
- Met à jour `baseSynced` dans `version.json`
- Affiche les commandes git/deploy-log pour finaliser le commit de merge

---

## Personnalisation child-safe

Ces fichiers appartiennent **exclusivement à ce child** et ne sont jamais écrasés par la base.

### Branding & thème
| Fichier | Rôle |
|---------|------|
| `data/child/app.json` | Nom, logo icon (material), copyright |
| `data/child/theme.json` | Variables CSS (couleurs primaires, fond) |

### Contenu des pages
| Fichier | Rôle |
|---------|------|
| `data/child/nav.json` | Items de navigation supplémentaires |
| `data/child/landing.json` | Textes de la page de connexion |
| `data/child/home.json` | Titre, sous-titre, bouton principal de la home |

### Code Angular
| Fichier | Rôle |
|---------|------|
| `frankenstein/src/app/child/child-routes.ts` | Routes exclusives |
| `frankenstein/src/app/child/child-admin-tabs.ts` | Onglets admin exclusifs |
| `frankenstein/src/app/pages/child/**` | Pages Angular exclusives |
| `frankenstein/src/environments/environment.ts` | URLs des serveurs |

---

## Ce qu'il ne faut PAS modifier dans ce child

Les fichiers suivants sont propagés depuis `worganic-base`. Les modifier ici reviendrait à créer des conflits lors de la prochaine synchronisation :

- `frankenstein/src/app/core/**` (services, guards)
- `frankenstein/src/app/shared/**` (header, footer, nav, layout)
- `frankenstein/src/app/pages/admin/**` (sauf onglets child)
- `frankenstein/src/app/pages/user/**` (home, documents, editor…)
- `frankenstein/src/app/base-routes.ts`
- `frankenstein/src/app/app.config.ts` / `app.routes.ts`
- `server/server-data.js` / `server/deploy-log.js`
- `frankenstein/src/styles.scss` / `tailwind.config.js`

Si une modification partagée est nécessaire → la faire dans `worganic-base` et la propager.

---

## Démarrage

```bash
install.bat        # Installation des dépendances
launch-frankenstein.bat  # Démarrage dev (Angular + serveurs)
```

---

## Workflow Claude Code

Ce projet inclut `CLAUDE.md` avec les règles de workflow IA (histoModif, versioning, git).

---

## Architecture child — Personnalisation sans toucher la base

Ce template intègre un système permettant à chaque **child project** de se personnaliser librement sans jamais modifier les fichiers partagés de la base. Lors d'une synchronisation base → child, seuls les fichiers "base" sont propagés. Les fichiers "child" ne sont jamais écrasés.

### Fichiers child-safe (jamais propagés, toujours dans le child)

| Fichier | Rôle | Exemple de valeur |
|---------|------|-------------------|
| `data/child/app.json` | Nom de l'app, logo, copyright | `{ "appName": "Mon Projet", "logoIcon": "bolt" }` |
| `data/child/theme.json` | Variables CSS custom (couleurs) | `{ "cssVars": { "--accent-color": "#22d3ee" } }` |
| `data/child/nav.json` | Items de navigation supplémentaires | `{ "items": [{ "route": "/projets", "label": "Projets", "icon": "folder" }] }` |
| `data/child/landing.json` | Textes de la page de connexion | `{ "heroTitleLine1": "Bienvenue sur", "heroTitleHighlight": "Mon Projet" }` |
| `data/child/home.json` | Home page après connexion | `{ "welcomeTitle": "Mon Projet", "primaryButtonRoute": "/projets" }` |
| `frankenstein/src/app/child/child-routes.ts` | Routes Angular exclusives au child | voir commentaires dans le fichier |
| `frankenstein/src/app/child/child-admin-tabs.ts` | Onglets admin exclusifs au child | voir commentaires dans le fichier |
| `frankenstein/src/app/pages/child/**` | Pages Angular exclusives au child | dossier libre |
| `frankenstein/src/environments/environment.ts` | URLs, appName Angular | `apiDataUrl`, `appName` |

### Créer un nouveau projet child

```
1. Dupliquer le dossier worganic-base → child--MON-PROJET
2. Modifier version.json :
   { "childId": "MON-V01", "child": "MON-0.01", "baseSynced": "B0.XX" }
3. Adapter data/child/app.json avec le branding du projet
4. sync-from-base.bat est déjà présent et fonctionnel (auto-détection depuis version.json)
5. Ajouter les routes child dans frankenstein/src/app/child/child-routes.ts
6. Ajouter les onglets admin child dans frankenstein/src/app/child/child-admin-tabs.ts
```

### Ajouter un item de navigation (child)

Éditer `data/child/nav.json` :
```json
{
  "items": [
    { "route": "/projets", "label": "Projets", "icon": "folder" },
    { "route": "/rapports", "label": "Rapports", "icon": "bar_chart" }
  ]
}
```

### Ajouter un onglet dans l'admin (child)

1. Créer le composant dans `frankenstein/src/app/pages/child/admin-mon-onglet/`
2. L'enregistrer dans `frankenstein/src/app/child/child-admin-tabs.ts` :

```typescript
import { MonOngletComponent } from '../pages/child/admin-mon-onglet/admin-mon-onglet.component';

const CHILD_ADMIN_TABS: AdminTabDef[] = [
  { id: 'mon-onglet', label: 'Mon Onglet', icon: 'folder', component: MonOngletComponent, order: 10 }
];
```

### Ajouter une page complète (child)

1. Créer le composant dans `frankenstein/src/app/pages/child/ma-page/`
2. Ajouter la route dans `frankenstein/src/app/child/child-routes.ts` :

```typescript
import { authGuard } from '../core/guards/auth.guard';
export const CHILD_ROUTES: Routes = [
  { path: 'ma-page', canActivate: [authGuard], loadComponent: () => import('../pages/child/ma-page/ma-page.component').then(m => m.MaPageComponent) }
];
```

### Personnaliser le thème graphique (child)

Éditer `data/child/theme.json` — les variables CSS sont appliquées au démarrage :
```json
{
  "cssVars": {
    "--color-light-primary": "14 116 144",
    "--color-light-secondary": "8 145 178",
    "--accent-color": "#06b6d4",
    "--bg-primary": "#0a0f12",
    "--bg-surface": "#0f1a1f"
  }
}
```

### Synchronisation base → child

Un fichier `sync-from-base.bat` est présent à la racine de chaque child. Il :
- Détecte automatiquement le `childId` depuis `version.json`
- Affiche les propagations en attente depuis `data/base-propagation.json`
- Met à jour le champ `baseSynced` dans `version.json`
- Affiche les commandes git/deploy-log pour finaliser

```
.\sync-from-base.bat
```
