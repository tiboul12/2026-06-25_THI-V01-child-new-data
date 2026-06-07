# Admin › Méga-outils — Fonctions métier

Composants : `AdminMegaOutilsComponent` (portail) + `TrelloAdminComponent` (`@worganic/shared/ui`)
Vue : gestion globale des méga-outils Trello, toutes instances tous projets confondus.

---

## `2-1-7-1` — Liste des instances Trello

- Charge toutes les instances via `getAllTrelloBoards()` (`GET /api/mega-outils/trello/all`)
- Chaque instance affiche : nom, cartes (avec aperçu par colonne), et infos de liaison
- Bouton "Rafraîchir" recharge la liste

---

## `2-1-7-2` — Infos de liaison (badges cliquables)

- **Menu** : libellé fixe `projets` (module où vit le méga-outil) → lien `openInEditor({ projectId })`
- **Projet** : `projectName` résolu côté serveur via `COALESCE(frank_projects.title, file_project_meta.display_name)` (JOIN `COLLATE utf8mb4_unicode_ci`) → lien `openInEditor({ projectId })`
- **Section** : `folderName` (résolu via `findNodeById(config.structure, folder_id)`) → lien `openInEditor({ projectId, folderId })` ; "Sans section" (non cliquable) si `folder_id` null
- `folder_id` est synchronisé en base par l'éditeur (voir `2-1-7-7`) à partir de la position réelle du marqueur `{{TRELLO:id}}`
- Chaque badge est un `<button>` qui ouvre la partie correspondante dans l'éditeur projets (voir `2-1-7-3`)
- Date de création

---

## `2-1-7-3` — Liens directs vers l'éditeur

- `@Output() openInEditor({ projectId, folderId?, outilId? })` (bouton "Éditeur" + badges menu/projet/section)
- Le wrapper portail construit l'URL via `navigateToProjets('projets/{projectId}?section={folderId}&outil={outilId}')` (params ajoutés seulement si présents)
- L'éditeur lit le queryParam `section` → `activeNodeId`/`highlightNodeId` (déplie la sidebar via `expandToNode` jusqu'au dossier) + scroll
- L'éditeur lit le queryParam `outil` → `activeOutilId.set(outil)` pour sélectionner le menu utilisé

---

## `2-1-7-4` — Gestion des cartes

- Bouton "Gérer les cartes" déplie un `<app-trello-board>` embarqué (CRUD complet : ajout, édition, déplacement, suppression de carte)
- Cartes compactes : titre avec césure des mots (`break-words` + `overflow-wrap:anywhere`, `min-w-0`) → aucun ascenseur horizontal
- Clic sur le **corps** de la carte → agrandissement inline (`expandedCardId`) : description tronquée (`line-clamp-4`) + boutons Détail / Modifier / Supprimer
- Clic sur le **titre** → popup modale (`modalCardId`) affichant tout le contenu : titre, statut, priorité, description longue (`whitespace-pre-wrap`, scrollable), créateur/date, avec Modifier (édition dans la popup) et Supprimer
- `openCardEdit` ouvre la popup directement en mode édition depuis l'expand inline
- Synchro temps réel héritée du board (voir `2-5-2-5-16`)
- `deletable=false` sur le board embarqué : la suppression de l'instance se fait via le bouton dédié de la ligne

---

## `2-1-7-5` — Suppression d'une instance

- Bouton "Supprimer" → confirmation inline → `deleteInstance(id)` (`DELETE /api/mega-outils/instances/:id`)
- Supprime l'instance + ses cartes en BDD ; diffuse `trello_update` (action `instance_delete`)

---

## `2-1-7-6` — États

| État | Description |
|------|-------------|
| Chargement | "Chargement…" |
| Aucune instance | "Aucune instance Trello." |
| Instance repliée | En-tête + infos + aperçu colonnes |
| Instance dépliée | Board complet pour gérer les cartes |
| Confirmation suppression | Boutons Confirmer/Annuler inline |

---

## `2-1-7-7` — Synchronisation du folder_id (section)

- L'instance ne stocke pas toujours sa section à la création (`folder_id` peut être null)
- Côté éditeur projets, `recomputeTrelloSections()` résout la section réelle via la position du marqueur `{{TRELLO:id}}` puis appelle `updateInstance(id, { folderId })` si elle diffère du `folder_id` stocké
- Endpoint `PATCH /api/mega-outils/instances/:id` accepte `name` et/ou `folderId` (UPDATE dynamique)
- L'en-tête du `<app-trello-board>` affiche le nom de la section via l'`@Input() sectionName` (badge bleu, icône `tag`)
