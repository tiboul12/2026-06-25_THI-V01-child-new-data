# Éditeur › Toolbar — Fonctions métier

Composant : `ProjetToolbarComponent` (barre supérieure)  
Visible en permanence dans l'éditeur de projet

---

## `2-5-2-3-1` — Navigation

- **Retour** : clic bouton "← Portail" → navigate vers l'URL portail (cross-origin via paramètre)
- **Titre du projet** : affiché au centre, non éditable depuis la toolbar
- **Breadcrumb** : Projets > {nom projet}

---

## `2-5-2-3-2` — Indicateurs de statut

- **Statut sauvegarde** (`saveStatus`) :
  - `idle` : "Sauvegardé" (badge vert + icône check)
  - `dirty` : "Non sauvegardé" (badge orange + bouton cliquable pour forcer save)
  - `saving` : "Sauvegarde…" (spinner jaune)
  - `error` : "Erreur" (rouge)
- **Clic "Non sauvegardé"** : `forceSave()` → déclenchement sauvegarde immédiate

---

## `2-5-2-3-3` — Badge backup

- **FTP** (cyan) :
  - `idle` : "FTP" — badge simple
  - `syncing` : "Sync FTP X/Y" + barre de progression + icône spin
  - `done` : "FTP à jour"
  - `error` : "FTP — erreur sync" (rouge)
- **GitHub** (violet) : badge "GitHub"
- **GitLab** (orange) : badge "GitLab"
- **Google Drive** (vert) : badge "Drive"
- **Aucun backup** : pas de badge

---

## `2-5-2-3-4` — Onglets de mode

- **Code** `<> Code` : clic → `setMode('edit')` — vue textarea Markdown
- **Structure** `Structure` : clic → `setMode('structure')` — vue arborescence éditable
- **Preview** `Preview` : clic → `setMode('visu')` — rendu HTML éditable inline
- **Indicateur actif** : onglet actif mis en surbrillance

---

## `2-5-2-3-5` — Barre de formatage (mode Code uniquement)

Outils d'insertion Markdown dans le textarea :

| Bouton | Action | Insère |
|--------|--------|--------|
| **B** | Gras | `**texte**` |
| *I* | Italique | `*texte*` |
| ~~S~~ | Barré | `~~texte~~` |
| H1 | Titre 1 | `\n# ` |
| H2 | Titre 2 | `\n## ` |
| H3 | Titre 3 | `\n### ` |
| H4 | Titre 4 | `\n#### ` |
| • Liste | Liste | `- ` |
| " | Citation | `\n> ` |
| — | Séparateur | `\n---\n` |
| `</> ` | Code inline | `` `code` `` |
| ` ``` ` | Bloc code | `insertCodeBlock()` |
| ⊞ | Tableau | `insertTable()` |
| 🖼 | Image | `triggerImageUpload()` |

---

## `2-5-2-3-6` — Barres Annuler/Partager (projets avec backup externe uniquement)

- **Mode Code (section en focus)** : visible si `showCodePublishBar` → `focusedHandle` + pending
- **Mode Code (vue document, pas de focus)** : visible si `activeEntityLocks.size > 0`
- **Cross-mode (Structure/Preview)** : visible si `showCrossModePendingBar` → pending Code non publié
- **Mode Structure** : visible si `structureHasPending()`
- **Mode Preview** : visible si `editingVisuSectionId()` non null

Actions des barres :
- **Annuler** : restaure le contenu original (snapshot pré-édition)
- **Partager mes modifications** : publie vers le serveur distant (FTP/Git) + broadcast SSE

---

## `2-5-2-3-7` — États

| État | Description |
|------|-------------|
| Mode Code actif | Onglet Code surligné, barre formatage visible |
| Mode Structure actif | Onglet Structure surligné |
| Mode Preview actif | Onglet Preview surligné |
| Dirty | Badge orange "Non sauvegardé" cliquable |
| Saving | Spinner jaune |
| Saved | Badge vert |
| FTP syncing | Badge bleu animé avec compteur |
| FTP done | Badge cyan "FTP à jour" |
| FTP error | Badge rouge |
| Barre pending visible | Fond bleu/violet avec Annuler/Partager |
| Publication en cours | Overlay + spinner sur toute la zone |

---

## `2-5-2-3-8` — Barre Mega-outils

- Liste les instances de méga-outils (Trello) du projet + bouton "+ Trello" (création au curseur)
- Clic sur un onglet (`selectMegaOutil`) : sélectionne l'instance (`megaOutilSelect`) **et** navigue vers la section où le trello est incrusté (`trelloNavigate`, résolu via `resolveTrelloFolderId` : marqueur dans `docSections`, fallback `inst.folderId`)
- Le board s'affiche en zone basse (voir `2-5-2-5-16`)

## `2-5-2-3-9` — Menus déroulants de la barre Édition (mode Edition/visu)

- Pour gagner de la place, trois groupes de boutons de la barre de formatage du mode Edition sont regroupés en menus déroulants (`visuDropdown`, `toggleVisuDropdown`) :
  - **Style de bloc** (icône `title`) : Paragraphe + Titres H1→H4 (`applyVisuFormat('formatBlock', …)`), niveaux ≤ section active grisés
  - **Couleur du texte** (lettre `A` soulignée) : pastilles `visuTextColors` (`applyVisuFormat('foreColor', …)`)
  - **Couleur de fond / surlignage** (icône `format_ink_highlighter`) : pastilles `visuHighlightColors` (`applyVisuFormat('hiliteColor', …)`)
- Ouverture/fermeture via `mousedown` + `preventDefault` (conserve la sélection de texte) ; fermeture au clic extérieur (`HostListener('document:mousedown')`) ou après choix d'une option

## `2-5-2-3-10` — Création de titre au curseur (coupe de section)

- Dans le menu **Style de bloc** (`2-5-2-3-9`), choisir un titre H1→H4 crée la section **à la position du curseur** : le texte situé sous le curseur (fin de sélection) bascule dans la nouvelle section, le texte au-dessus reste dans la section courante
- `computeVisuCursorInsertLine()` commit d'abord la section (sérialiseur éprouvé), compte les blocs feuilles (`li/p/h1..h4/blockquote/pre`) entièrement avant le point de coupe, puis mappe ce compte sur la ligne markdown correspondante du contenu DIRECT
- L'insertion délègue à `createTitleSection(level, title, insertLine)` qui **insère seulement une ligne `### Titre`** (aucune réécriture du contenu existant → pas de corruption possible) ; `saveAll()` fait créer le dossier et déplacer le contenu suivant par le parent
- Repli sur le comportement standard (titre ajouté en fin de section courante) si aucun curseur n'est présent dans une section éditable
