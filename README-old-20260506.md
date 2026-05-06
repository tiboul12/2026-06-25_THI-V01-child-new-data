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

Ce projet inclut `CLAUDE.md` avec les règles de workflow IA (histoModif, versioning, git, règles de fichiers child-safe).
