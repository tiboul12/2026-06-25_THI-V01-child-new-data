# Documentation : ProjetUpdateBannerComponent

## Fonctionnement Général
Bannière de notification affichée en haut de la page projet-editor. Elle
signale à l'utilisateur que d'autres collaborateurs ont partagé une ou
plusieurs sections du projet en cours, et propose un bouton "Mettre à jour"
qui déclenche un git pull côté serveur via `ProjetCollabService.pullProject()`.

La bannière est entièrement réactive : elle apparaît automatiquement quand
`ProjetCollabService.pendingUpdates` n'est pas vide, et disparaît quand le
pull a réussi ou que l'utilisateur clique sur la croix de fermeture.

Si l'application détecte le mode hors ligne (`navigator.onLine === false`),
la bannière change d'apparence et le bouton est désactivé.

## Entrées (Inputs) / Sorties (Outputs)
- `@Input() projectName: string | null` : identifiant du projet à puller (transmis à l'appel HTTP).
- `@Output() pulled: EventEmitter<{ newCommits: number; changedFiles: string[] }>` : émis après un pull réussi, permet au parent de rafraîchir les fichiers affichés.

## Dépendances
- `ProjetCollabService` : source des notifications `pendingUpdates` (signal) et état `isOnline`, point d'appel de `pullProject()`.

## Règles Métier
- N'affiche rien si `pendingUpdates().size === 0`.
- Une seule notification → libellé "X a partagé « section »".
- Plusieurs notifications du même utilisateur → "X a partagé N sections".
- Plusieurs utilisateurs → "N utilisateurs ont partagé M sections" + liste détaillée.
- Le bouton "Mettre à jour" est désactivé si : hors ligne, pull en cours, ou pas de projectName.
- Après pull réussi, la map `pendingUpdates` est vidée par `ProjetCollabService.pullProject()`.
- La croix de fermeture (`onDismiss`) vide les notifications **sans puller** : si une nouvelle modification arrive, la bannière réapparaîtra.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. User B reçoit un événement SSE `section_published` envoyé par User A → la bannière apparaît avec le nom de A et la section.
2. User B clique "Mettre à jour" → POST /api/file-projects/{name}/pull → la bannière disparaît, les fichiers locaux sont rechargés.
3. User B clique la croix → la bannière disparaît mais aucun pull n'est effectué.
4. User B perd la connexion → la bannière passe en style "offline" et le bouton est désactivé.
5. Trois sections différentes sont partagées par User A puis User C → libellé "2 utilisateurs ont partagé 3 sections" + liste détaillée.
6. User A partage une section et User B est le partageur (publishedBy.userId === currentUserId) → la bannière n'apparaît PAS chez A (auto-exclusion côté service).
