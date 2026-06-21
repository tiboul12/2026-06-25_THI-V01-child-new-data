# Déploiements — Fonctions métier

<!-- worganic:meta updatedAt="2026-06-21T14:09:42.684Z" updatedBy="Antigravity CLI (agy) / Gemini 3 Pro" -->

---

## `2-3-1` — Chargement

- **Requêtes parallèles** : Lance en parallèle les appels GET `/api/version/check` et GET `/api/admin/deployments` à l'initialisation du composant
- **Statut de version** : Récupère la version locale (`localVersion`), le statut `upToDate`, le dernier déploiement (`latestDeployment`) et la branche courante (`currentBranch`)
- **Échec silencieux du statut** : L'échec du chargement du statut de version (`/api/version/check`) est ignoré silencieusement sans bloquer le reste de l'affichage
- **Liste des déploiements** : Récupère l'historique des 100 derniers déploiements via GET `/api/admin/deployments` avec en-tête `Authorization: Bearer <token>` si le token `frankenstein_token` est présent dans le localStorage
- **Autorisation requise** : Renvoie une erreur 403 si l'utilisateur n'a pas le rôle `admin` sur l'API des déploiements
- **Guard d'accès** : Vérifie que l'accès à la route `/deployments` est protégé par `authGuard` côté client Angular
- **Composants:** `apps/portail/src/app/pages/user/deployments/deployments.component.ts`, `server/server-data.js`, `apps/portail/src/app/base-routes.ts`

---

## `2-3-2` — Affichage

- **Bannière de statut** : Affiche une bannière jaune "Ce poste est à jour — v<localVersion>" avec icône succès si à jour, ou rouge "Mise à jour requise — ce poste est en v<localVersion>, la dernière version est v<latestVersion>" avec icône d'avertissement
- **Détails du dernier déploiement** : Affiche le titre du commit, la date de déploiement (formatée le DD/MM/YYYY à HH:mm) et le nom de l'auteur du dernier déploiement dans la bannière s'il est disponible
- **Tableau des déploiements** : Affiche la liste des déploiements du plus récent au plus ancien (limité aux 100 derniers)
- **Mise en valeur de la version actuelle** : La ligne correspondant à la version actuelle (`localVersion`) a un fond jaune et affiche un badge jaune "actuel"
- **Badge type commit** : Affiche le type court (`FIX` en rouge, `AME` aux couleurs du thème primaire, `MRG` en violet) extrait du titre du commit par `extractCommitType()` et `shortCommitType()`
- **Badges de scope et features** : Affiche les scopes concernés avec des couleurs distinctes (frankenstein : primaire, server : vert, electron : violet, data : orange, autres : gris) et liste les features associées (préfixées par ●) obtenues via `getScopedRows()`
- **Compatibilité des formats de features** : Gère via `getScopedRows()` l'association directe (`scope:feature1|feature2`) ainsi que l'ancien format positionnel (index à index)
- **Titre du commit** : Affiche le titre nettoyé via `extractCommitTitle()` sans les métadonnées de type de commit (remplace ` - [TYPE] - ` par ` - `)
- **Date et auteur** : Affiche la date de déploiement formatée en locale française (DD/MM/YYYY HH:mm) et le nom de l'auteur du déploiement
- **Composants:** `apps/portail/src/app/pages/user/deployments/deployments.component.ts`, `apps/portail/src/app/pages/user/deployments/deployments.component.html`

---

## `2-3-3` — Navigation

- **Retour** : Un clic sur le bouton retour (icône `arrow_back`) redirige vers la page d'administration `/admin` avec le paramètre de requête `tab=deploiement`
- **Composants:** `apps/portail/src/app/pages/user/deployments/deployments.component.html`, `apps/portail/src/app/base-routes.ts`

---

## `2-3-4` — États

- **Chargement** : Affiche un spinner (`progress_activity` animé) lorsque les données sont en cours de récupération (`loading() === true`)
- **Version à jour** : Affiche le statut "Ce poste est à jour" avec un fond jaune/orange très clair
- **Version obsolète** : Affiche le statut "Mise à jour requise" avec un fond rouge très clair
- **Statut absent** : La bannière de statut supérieure n'est pas affichée du tout si la requête `/api/version/check` n'a pas encore abouti ou a échoué
- **Liste vide** : Affiche le message "Aucun déploiement enregistré" si la liste des déploiements est vide
- **Erreur** : Affiche un bloc d'erreur rouge contenant le message d'erreur si la requête d'historique échoue (ex: 403 "Admin requis" ou erreur réseau)
- **Composants:** `apps/portail/src/app/pages/user/deployments/deployments.component.ts`, `apps/portail/src/app/pages/user/deployments/deployments.component.html`

---

## `2-3-5` — Rafraîchissement

- **Bouton de rafraîchissement** : Présence d'un bouton avec l'icône `refresh` à côté du titre du tableau
- **Rechargement manuel** : Un clic sur le bouton relance la fonction `loadDeployments()` pour récupérer à nouveau uniquement la liste des déploiements
- **Non-réévaluation du statut** : Le clic sur rafraîchir n'appelle pas à nouveau `loadVersionStatus()`
- **Réinitialisation des erreurs** : Le clic efface le message d'erreur précédent et repasse l'état en chargement
- **Composants:** `apps/portail/src/app/pages/user/deployments/deployments.component.ts`, `apps/portail/src/app/pages/user/deployments/deployments.component.html`

---

## `2-3-6` — Vérification de version côté serveur

- **Lecture du fichier de version local** : Lit le fichier `version.json` à la racine pour obtenir la version locale. Si le fichier contient un BOM UTF-8 (0xFEFF), il est retiré avant parsing
- **Récupération du dernier déploiement** : Recherche le dernier enregistrement dans la table `app_deployments` où la branche est 'main', vide, ou NULL, ordonné par date décroissante
- **Calcul du statut de mise à jour** : Détermine que le poste est à jour (`upToDate: true`) si aucun déploiement n'est trouvé en base ou si la version du dernier déploiement correspond à la version locale
- **Détermination de la branche Git** : Exécute de façon synchrone `git branch --show-current` à la racine du projet avec un timeout de 2 secondes pour renvoyer la branche courante (repli sur 'main' en cas d'erreur)
- **Composants:** `server/server-data.js`, `version.json`
