# Admin › Déploiements — Fonctions métier

Route : `/admin` onglet "Déploiement"  
Composant : `AdminDeploymentsComponent`  
Accès : admin uniquement

---

## `2-1-2-1` — Chargement des données

- **Liste déploiements** : GET `/api/admin/deployments`
- **Statut version** : GET `/api/version/check` → `{ upToDate, localVersion, latestDeployment }`
- **État Git local** : GET `/api/admin/git-local` → infos branche, derniers commits
- **Statut Git** : GET `/api/admin/git-status` → fichiers modifiés, staged, untracked
- **Commits de branche** : GET `/api/admin/branch-commits` → liste des commits sur la branche courante

---

## `2-1-2-2` — Affichage liste des déploiements

- **Colonnes** : version, date, type commit (FIX/AMELIORATION/MERGE), titre, branche, IA utilisée, scope, fichiers modifiés
- **Badges colorés** :
  - Type commit : FIX (rouge), AMELIORATION (vert), MERGE (bleu)
  - Scope : portail, server, electron, data (couleurs distinctes)
- **Ligne highlight** : déploiement correspondant à la version main actuelle
- **Expand/collapse** : clic sur une ligne → affiche description complète, liste fichiers, mods
- **Format version** : extrait depuis `commitName` (regex `[FIX|AMELIORATION|MERGE]`)

---

## `2-1-2-3` — Filtres

- **Par type de commit** : FIX | AMELIORATION | MERGE
- **Par IA** : provider utilisé (claude, gemini, etc.)
- **Par branche** : branche Git source
- **Liste déroulante** : valeurs uniques extraites de la liste des déploiements
- **Combinaison** : les 3 filtres s'appliquent simultanément (`computed: filteredDeployments`)

---

## `2-1-2-4` — Création d'un déploiement

- **Ouverture modal** : clic "Nouveau déploiement" → `openDeployForm()`
- **Champs** :
  - version (ex: `B-0.231`)
  - commitName (titre complet du commit)
  - description (Markdown)
  - filesModified (multiline → converti en tableau)
  - scope, features, ai, model
- **Soumission** : POST `/api/admin/deployments`
- **Succès** : modal fermée, liste rechargée

---

## `2-1-2-5` — Migration versions legacy

- **Déclenchement** : clic "Migrer versions" → `migrateVersions()`
- **Action** : POST `/api/admin/migrate-versions`
- **Après migration** : rechargement versions + déploiements
- **État** : indicateur `migrating` pendant l'opération, résultat affiché (`migrateResult`)

---

## `2-1-2-6` — Indicateur version main

- **Affichage** : badge "À jour" si `versionStatus.upToDate === true`
- **Alerte** : badge rouge si version locale ≠ dernière version en BDD
- **Versions affichées** : version locale (depuis `version.json`) et version BDD (depuis déploiements)

---

## `2-1-2-7` — Informations Git

- **Branche courante** : affichée dans l'en-tête de la section Git
- **Commits récents** : liste des derniers commits avec hash, message, date
- **Fichiers modifiés** : liste des fichiers en staged/unstaged/untracked
- **Statut propre/dirty** : indicateur visuel si working tree propre

---

## `2-1-2-8` — États

| État | Description |
|------|-------------|
| Chargement | Spinners sur chaque section |
| Erreur | Messages d'erreur par section |
| Filtres actifs | Badge indicateur sur les dropdowns |
| Version à jour | Badge vert |
| Version outdated | Badge rouge/alerte |
| Migration en cours | Spinner + bouton désactivé |
| Modal ouverte | Formulaire création déploiement |
