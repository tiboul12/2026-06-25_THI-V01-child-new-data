# Éditeur › Sidebar (Zone 3) — Fonctions métier

Composant : `ProjetSidebarComponent`  
Position : panneau gauche de l'éditeur  
Zone rétractable via bouton dédié (vB-0.230+)

---

## `2-5-2-2-1` — Arborescence des fichiers

- **Affichage** : arbre hiérarchique dossiers/fichiers/images
- **Icônes** : dossier (ouvert/fermé), fichier Markdown, image
- **Expand/Collapse dossier** : clic sur le dossier → `toggle(id)`
- **Auto-expand** : lors de la sélection d'un fichier, les dossiers parents s'ouvrent
- **Sélection** : clic sur un nœud → `selectFile(node)` → emit `fileSelect`
- **Nœud actif** : surligné par `activeFileId`
- **Nœud highlight** : surligné par `highlightNodeId` (différent de actif)

---

## `2-5-2-2-2` — Indicateurs de collaboration

- **Cadenas rouge** (verrouillé par l'utilisateur courant) : section en cours d'édition
- **Cadenas jaune** (verrouillé par un autre utilisateur) : tooltip avec le nom
- **Badge "Modifications en attente"** (projets backup) : section avec pending non publié
- **Indicateur bulle** (F6) : section ayant des commentaires

---

## `2-5-2-2-3` — Indicateurs FTP (projets avec backup FTP)

- **Fond ambré** sur les dossiers dont le statut FTP est `unknown` pendant la sync
- **Statut par nœud** : `nodeSyncStatus: Map<id, 'unknown'|'in-sync'|'downloaded'|'error'>`

---

## `2-5-2-2-4` — Création de dossier

- **Via menu contextuel** : clic droit → "Nouveau dossier"
- **Via bouton** : bouton "+" dans la sidebar
- **Affichage input** : input inline dans l'arborescence, sous le parent cible
- **Validation** : Enter → `createFolder(name, parentId, outilSlug)` → emit `folderCreated`
  - Dossier racine (pas de parent) : chemin `data/projets/{id}/{outilSlug}/{slug}/`
  - Dossier enfant : chemin `data/projets/{id}/{parent.path}/{slug}/`
  - Création du fichier `contenu.md` dans le dossier
- **outilSlug** : type de l'outil actif (`edition`, `tests`, `code`) passé automatiquement pour les dossiers racine
- **Annulation** : Escape → `cancelInput()`
- **Règle** : nom unique dans le dossier parent

---

## `2-5-2-2-5` — Création de fichier

- **Via menu contextuel** : clic droit → "Nouveau fichier"
- **Affichage input** : input inline avec extension `.md` automatique
- **Validation** : Enter → POST `/api/file-projects/{name}/files` avec `outilSlug` pour les fichiers racine
- **Résultat** : fichier Markdown créé physiquement dans `{outilSlug}/{fileName}`, affiché dans l'arborescence

---

## `2-5-2-2-6` — Renommage

- **Via menu contextuel** : clic droit → "Renommer"
- **Input inline** : pré-rempli avec le nom actuel
- **Validation** : Enter → PUT `/api/file-projects/{name}/files/{id}` ou dossier
- **Annulation** : Escape

---

## `2-5-2-2-7` — Suppression

- **Via menu contextuel** : clic droit → "Supprimer"
- **Confirmation** : `deleteConfirm` → affiche bouton "Confirmer suppression" inline
  - Clic "Confirmer" → DELETE `/api/file-projects/{name}/files/{id}`
  - Clic "Annuler" → `cancelDelete()`
- **Règle** : suppression récursive (dossier + tout son contenu)
- **Fichiers physiques** : supprimés de `data/projets/{id}/`

---

## `2-5-2-2-8` — Drag & Drop

- **Déplacement de nœuds** : glisser-déposer dans l'arborescence
- **Positions** : `before` | `after` | `inside` (indiqué visuellement)
- **Validation drop** : emit `dragDrop { draggedId, targetId, position }`
- **Réorganisation** : mise à jour de `config.json` (order des nœuds)
- **Déplacement physique** : si dossier change de parent → déplacement répertoire

---

## `2-5-2-2-9` — Menu contextuel (clic droit)

Options selon le type de nœud :

| Type | Options disponibles |
|------|-------------------|
| Dossier | Nouveau dossier, Nouveau fichier, Renommer, Supprimer |
| Fichier `.md` | Renommer, Supprimer |
| Image | Renommer, Supprimer |
| Nœud verrouillé par moi **et modifié** | Partager mes modifications, Annuler les modifications |
| Nœud verrouillé par moi **sans modification** | Déverrouiller |
| Nœud verrouillé par autre | Afficher info verrou |

- **Fermeture** (vB-0.277) : clic en dehors du menu (n'importe où, y compris ailleurs dans la sidebar) → `document:click` teste `contextMenuRef` → `closeContextMenu()`
- **Partager / Annuler une section** (vB-0.279) : le menu propose **« Partager mes modifications »** et **« Annuler les modifications »** (priorité sur « Déverrouiller ») uniquement si la section est **verrouillée par moi ET modifiée** (`isLockedByMe(node.id) && isLocalPending(node.id)`). Bien que la condition d'affichage porte sur la section elle-même, l'**action** traite la section **et ses sous-sections modifiées**. Déléguée à la zone d'édition via le bus du service collab (`requestPublishSection` / `requestCancelSection` → `publishSectionRequest$` / `cancelSectionRequest$`). Remplace les boutons Annuler/Partager qui étaient en bas de la zone Code (voir `2-5-2-4-9`).

---

## `2-5-2-2-10` — Verrous de collaboration (projets avec backup)

- **Lock** : `collab.lockNode(projectName, nodeId)` → POST `/api/collab/lock`
- **Unlock** : `collab.unlockNode(projectName, nodeId)` → POST `/api/collab/unlock`
- **isLockedByMe(nodeId)** : booléen — affiché comme cadenas rouge
- **isLockedByOther(nodeId)** : booléen — affiché comme cadenas jaune + tooltip nom
- **Auto-lock** : lors de la mise en focus d'édition d'une section

---

## `2-5-2-2-13` — Système d'outils (vB-0.249+)

- **Titre projet cliquable** : clic → popup flottant "Ajouter un outil"
- **Popup** : options Edition (actif), Tests et Code (grisés/bientôt)
- **Fermeture du popup** (vB-0.277) : clic en dehors du popup (n'importe où, y compris ailleurs dans la sidebar) → fermeture via `document:click` qui teste `addOutilPopupRef`
- **Liste outils** : chaque outil apparaît sous le titre projet avec icône + nom
- **Expand/Collapse outil** : chevron → `toggleOutil(id)`
- **Sélection outil** : clic sur le nom → `outilSelect.emit(id)` → Zone 4 bascule vers cet outil
- **Sous-items** : root folders de l'outil affichés en arborescence standard quand déplié
- **Outil actif** : surligné (`bg-primary/10`)
- **Création d'outil** : popup → type → `outilCreate.emit({ type, name })` → outil vide créé
- **Migration auto** : projets sans outils → outil Edition créé automatiquement avec tous les root folders existants
- **Stockage par sous-dossier** (vB-0.251+) : les dossiers racines de chaque outil sont physiquement stockés dans `data/projets/{id}/{outilType}/` (ex: `edition/mon-dossier/`). Les chemins dans `config.json` reflètent ce préfixe.

---

## `2-5-2-2-11` — Bouton réduire/rouvrir

- **Bouton toggle** : clic → `zone5Collapsed` basculé (vB-0.230)
- **Sidebar réduite** : largeur minimale, seules icônes visibles
- **Sidebar étendue** : arborescence complète

---

## `2-5-2-2-12` — États

| État | Description |
|------|-------------|
| Arbre vide | Message "Aucun fichier" + bouton créer dossier |
| Nœud actif | Surligné (fond coloré) |
| Nœud en édition inline | Input visible, autres nœuds grisés |
| Nœud verrouillé (moi) | Cadenas rouge |
| Nœud verrouillé (autre) | Cadenas jaune |
| Drag en cours | Indicateur de position (ligne before/after, fond inside) |
| Menu contextuel ouvert | Menu flottant visible |
| Confirmation suppression | Boutons confirmer/annuler inline |
| Sidebar réduite | Icônes seules |
| FTP sync unknown | Fond ambré sur le dossier |

---

## `2-5-2-2-14` — Bouton "Liste des trellos"

- Affiché au pied de la sidebar dès qu'au moins un trello existe dans l'outil (`trelloCount > 0`)
- Badge avec le nombre de trellos
- Clic → émet `trelloListClick` → ouvre la vue "Liste des trellos" dans la zone centrale (voir `2-5-2-5-17`)
