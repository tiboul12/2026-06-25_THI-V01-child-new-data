# Éditeur › Méga-Outil Array (Tableur) — Fonctions métier

Composant : `ArrayBoardComponent` — panneau bas dans tous les modes

---

## `2-5-2-11-1` — Création d'une instance Array

- **Déclenchement** : bouton "Array" dans la barre Mega-Outils → popup
- **Nom** : champ texte modifiable (défaut "Mon Tableau")
- **Validation** : `confirmArrayPopup()` → `createInstance({ type: 'array', name, folderId })`
- **Résultat** : instance créée en BDD, `megaOutilCreated` émis vers le parent

---

## `2-5-2-11-2` — Affichage du panneau tableur

- **Visibilité** : panneau bas affiché dans les 3 modes (Code, Structure, Preview) dès qu'une instance Array est associée à la section active
- **Résolution** : `contentArrayIds` = instances dont `folderId` correspond au `activeNodeId` courant
- **Réduction** : bouton toggle `arrayPanelCollapsed`

---

## `2-5-2-11-3` — Édition des cellules

- **Sélection** : clic simple → cellule sélectionnée (outline ring vert)
- **Edition inline** : double-clic ou F2 → `<input>` inséré dans la cellule
- **Validation** : Enter (ligne suivante), Tab (colonne suivante), Shift+Tab (colonne précédente)
- **Annuler** : Escape → annule sans sauvegarder
- **Persistance** : `PATCH /api/mega-outils/array/:id/cell` → SSE `array_update` broadcasted

---

## `2-5-2-11-11` — Affichage stylisé en mode Preview

- **Déclenchement** : passage en mode Preview (visu)
- **Chargement** : `loadAllVisuArrayGrids()` charge toutes les grilles manquantes via API, puis reconstruit les sections visu
- **Rendu** : le bloc `'array` est remplacé par `<div class="visu-array-wrap">` contenant un `<table class="visu-array-table">` HTML
- **Styles inline** : `background-color`, `color`, `font-weight`, `font-style`, `text-align` appliqués depuis `cell.style` de chaque cellule
- **Formules** : `cell.computed` affiché si disponible, sinon `cell.value`
- **Réactivité** : `onArrayGridChanged` met à jour le cache et reclenche `buildVisuSections()`
- **Dark mode** : bordures adaptées via `.dark .visu-array-wrap`

---

## `2-5-2-11-4` — Formules

- **Syntaxe** : `=FUNC(range)` ou `=A1+B2`
- **Fonctions** : `SUM`, `AVG`, `COUNT`, `MAX`, `MIN`
- **Références** : `A1` → row=0, col=0 ; range `A1:C3`
- **Affichage** : valeur `computed` affichée ; formule brute visible en mode édition
- **Mode Preview** : lecture seule, résultats évalués uniquement
- **Mode construction** : taper `=` active le mode formule ; cliquer une autre cellule insère sa référence (ex: `B2`) dans l'input à la position curseur sans fermer l'édition ; les cellules référencées sont surlignées en bleu ; Enter valide et calcule le résultat
- **Ré-édition** : double-clic sur une cellule avec formule affiche la formule brute dans l'input pour modification

---

## `2-5-2-11-5` — Ajout / suppression lignes et colonnes

- **Ajouter ligne** : bouton "+ Ligne" en bas du tableau → `POST .../addRow`
- **Ajouter colonne** : bouton "+" dans l'en-tête des colonnes → `POST .../addCol`
- **Supprimer ligne** : icône ✕ à droite de chaque ligne, ou menu contextuel
- **Supprimer colonne** : menu contextuel → `DELETE .../col/:col`
- **Minimum** : 1 ligne et 1 colonne obligatoires

---

## `2-5-2-11-6` — Redimensionnement colonnes / lignes

- **Colonne** : drag handle sur le bord droit de l'en-tête → `PUT .../grid` (colWidths)
- **Ligne** : drag handle sur le bord bas du numéro de ligne → `PUT .../grid` (rowHeights)
- **Minimum** : 40px

---

## `2-5-2-11-7` — Styles de cellules, lignes et colonnes (menu contextuel)

- **Déclenchement** : clic droit sur une cellule
- **Style cellule** : Gras, Italique, Aligner gauche/centre/droite, Couleur fond, Couleur texte
- **Style ligne** : Fond ligne, Texte ligne → applique à toutes les cellules de la ligne via `PUT /grid`
- **Style colonne** : Fond colonne, Texte colonne → applique à toutes les cellules de la colonne
- **Fix** : `stopPropagation` sur le menu empêche la fermeture au clic du color picker
- **Persistance** : `style` stocké dans `cells[row][col].style` en JSON MySQL

## `2-5-2-11-10` — Copier / Couper / Coller

- **Déclenchement** : menu contextuel (clic droit) ou raccourcis clavier Ctrl+C / Ctrl+X / Ctrl+V
- **Copier** : stocke la cellule (valeur + style) dans le signal `clipboard`
- **Couper** : stocke la cellule + efface la source après collage
- **Coller** : applique la valeur et le style de la cellule copiée/coupée à la cellule sélectionnée
- **Raccourcis** : Ctrl+C/X/V uniquement quand une cellule est sélectionnée et non en édition

---

## `2-5-2-11-12` — Format code complet + sync bidirectionnelle

- **Format du bloc `'array`** : une ligne par cellule non-vide + entêtes de config
  - `cols:w1,w2,...` → largeurs de colonnes (px)
  - `rows:h1,h2,...` → hauteurs de lignes (px)
  - `A1:valeur` → cellule simple
  - `A1:=SUM(B1:B3)|bold|center|bg=#ff0000|color=#ffffff` → formule + styles
- **Propriétés style** : `bold`, `italic`, `center`, `right`, `left`, `bg=#hex`, `color=#hex`
- **Sync grille → code** : `serializeArrayGrid()` produit ce format dans `saveArrayCsvFile()`
- **Sync code → grille** : `saveAll()` appelle `syncArrayCodeToGrid()` qui détecte les changements dans le bloc `'array` et pousse via `updateArrayGrid()`
- **Dedup** : `lastArrayCodeFromGrid` empêche la boucle grille→code→grille

---

## `2-5-2-11-8` — Synchronisation avec le fichier 'array' (mode Code)

- **Déclenchement** : après chaque modification de grille (`gridChanged`)
- **Format** : Markdown table dans le bloc `'array\n...\n'` du contenu unifié
- **Fichier persisté** : `array` (sans extension) dans le dossier de la section
- **Mise à jour en mémoire** : `existingFile.content` → `docSections` → `unifiedContent` → textarea + miroir rafraîchis

---

## `2-5-2-11-9` — SSE temps réel multi-utilisateurs

- **Event** : `array_update` reçu via SSE → `arrayUpdate$` Subject → rechargement de la grille
- **Scope** : tous les collaborateurs du projet voient les modifications en live
