# 📜 RÈGLES DE GESTION - SYSTÈME PROJETS (Z3 & Z4)

Ce document définit les règles de fonctionnement de l'arborescence physique (Zone 3) et de l'éditeur unifié (Zone 4). Ces règles priment sur toute autre interprétation technique.

> Pour vérifier que toutes les fonctions ci-dessous restent opérationnelles après chaque modification, voir **[`tests/TESTS_PROJET.md`](./tests/TESTS_PROJET.md)** (checklist + script automatisé `tests/test-zone-projet.js`).

---

## 📁 ZONE 3 : ARBORESCENCE PHYSIQUE (TREE VIEW)

### 1. Mapping et Structure Physique
- **Localisation :** L'arborescence reflète strictement la structure physique des dossiers sur le disque : `./data/projets/[ID_PROJET]/...`
- **Source de Vérité :** Le fichier `config.json` à la racine de chaque projet pilote l'ordre (`order`), les IDs uniques et la hiérarchie. Toute modification physique doit être répercutée dans ce fichier.
- **Slugification :** Les noms de dossiers physiques sont "slugifiés" (minuscules, sans accents, espaces remplacés par des tirets) pour garantir la compatibilité des chemins.
- **Initialisation :** Chaque nouveau dossier créé contient automatiquement un fichier `contenu.md` vide, qui sert de fichier de contenu principal pour cette section.

### 2. Actions et Menu Contextuel
- **Nouveau dossier :** Crée un répertoire physique, ajoute l'entrée dans `config.json` et génère un `contenu.md`.
- **Nouveau fichier :** Crée un fichier `.md` dans le répertoire sélectionné.
- **Renommer :** Inline editing depuis le menu contextuel (clic droit → Renommer). Met à jour le nom physique sur disque + l'entrée `config.json`.
- **Suppression :** Suppression récursive du dossier/fichier sur le disque et nettoyage de l'entrée correspondante dans `config.json`.

### 3. Glisser-Déposer (Drag & Drop) — Zone 3
Toutes les opérations de DnD sont disponibles dans la sidebar :

| Élément déplacé | Cible            | Position | Action                                                      |
|-----------------|------------------|----------|-------------------------------------------------------------|
| Dossier         | Dossier (autre)  | inside   | Le dossier devient enfant (déplacement physique récursif)   |
| Dossier         | Dossier frère    | before/after | Réordonnancement parmi les frères (`updateStructure`)   |
| Fichier (.md)   | Dossier          | inside   | Le fichier est déplacé dans ce dossier (`moveFile`)         |
| Fichier (.md)   | Fichier frère    | before/after | Réordonnancement dans le même dossier (`updateStructure`) |
| Fichier (.md)   | Fichier d'un autre dossier | before/after | `moveFile` puis réordonnancement dans la cible    |
| Image           | Dossier          | inside   | L'image est déplacée dans ce dossier (`moveFile`)           |
| Image           | Fichier/image frère | before/after | Réordonnancement (idem fichier)                       |

**Règles communes :**
- Un dossier ne peut pas être déposé sur un fichier.
- Un dossier ne peut pas être déplacé dans un de ses propres descendants (renvoie 400).
- Un fichier ne peut **jamais** retomber à la racine du projet (garde-fou : il reste dans son dossier d'origine).
- Le serveur refuse les doublons de nom (case-insensitive) dans un même dossier cible.

### 4. Indicateurs visuels
- **Avant / Après :** Une fine barre de couleur primaire apparaît au-dessus / en-dessous de la cible.
- **Inside :** La cible reçoit un outline coloré (`outline outline-1`).
- **Élément en cours de drag :** Opacité réduite à 40 %.

---

## ✏️ ZONE 4 : ÉDITEUR UNIFIÉ (CONTINUOUS MARKDOWN)

### 1. Principe d'Affichage Continu
- **Document Unique :** L'éditeur agrège TOUS les fichiers Markdown du projet en un seul flux de texte éditable.
- **Structure Visuelle :**
    - Chaque dossier est représenté par un titre Markdown (`#`).
    - Le contenu du fichier `contenu.md` suit immédiatement le titre du dossier.
    - Les blocs `'nom\n…\n'` représentent les documents additionnels.
    - Les marqueurs `{{IMG:id}}` représentent les images.

### 2. Décalage des Titres (Shifting Dynamique)
Les titres sont visuellement décalés dans l'éditeur selon la profondeur réelle du dossier dans l'arborescence :
- **Niveau 1 (Racine) :** `# Titre`
- **Niveau 2 :** `## Titre`
- **Niveau 3 :** `### Titre`
- **Niveau 4+ :** `#### Titre` (limité à 4 niveaux pour la lisibilité).

### 3. Gestion des Fichiers Additionnels (Syntaxe Bloc)
Les fichiers `.md` autres que `contenu.md` présents dans un dossier sont affichés sous forme de blocs délimités à la fin de la section correspondante :
- **Syntaxe :** `'nom-du-fichier\n[CONTENU]\n'`
- **Délimiteurs supportés :** `'` (standard), `` ` `` ou `^`.
- **Ligne de titre :** La première ligne située immédiatement après le premier délimiteur définit le nom du fichier sur le disque.
- **Cycle de vie :** Créer un bloc dans l'éditeur crée le fichier physique. Supprimer le bloc supprime le fichier.
- **Ordre d'affichage :** Les blocs respectent l'ordre `order` défini dans `config.json` (modifiable par drag & drop, voir §6).

### 4. Système d'Insertion d'Images
- **Upload :** L'insertion d'une image (bouton toolbar ou drag&drop fichier OS) téléverse le fichier dans le dossier de la section active (max 1 Mo).
- **Marqueurs :** Une image est représentée dans le texte par le marqueur `{{IMG:ID_UNIQUE}}`.
- **Positionnement :** Le marqueur est inséré à la position exacte du curseur.
- **Rendu :** L'éditeur affiche l'image réelle (vignette) entre deux blocs de texte. Si une image est présente dans le dossier mais n'a pas de marqueur, elle est affichée par défaut à la fin de la section (rétro-compatibilité).
- **Actions :** Les images peuvent être renommées (✎), supprimées (🗑) ou déplacées vers un autre dossier directement depuis l'interface de la Zone 4. Survol = aperçu agrandi.

### 5. Restructuration Dynamique (RÈGLE CRITIQUE)
Toute modification des titres (`#`) ou des blocs (`'`) déclenche une analyse de structure lors de la sauvegarde :
- **Renommage :** Modifier le texte d'un titre `#` renomme le dossier physique correspondant.
- **Déplacement :** Changer le niveau d'un titre (ex: passer de `##` à `#`) déplace le dossier et ses enfants dans la hiérarchie physique.
- **Suppression :** Effacer un titre et son contenu entraîne la suppression physique du dossier et de ses fichiers sur le disque.

### 6. Glisser-Déposer (Drag & Drop) — Zone 4
La zone 4 affiche dans la gouttière gauche, sur la ligne survolée, **une seule poignée de drag** (style Notion) selon une priorité : **image > document > dossier** le plus profond.

| Poignée déplacée | Cible            | Position           | Action                                                        |
|------------------|------------------|--------------------|---------------------------------------------------------------|
| Dossier (`#`/`##`/...) | Dossier de **même niveau** | before / after | Réordonnancement parmi les sections sœurs (`updateStructure`) |
| Dossier          | Sous-dossier (autre niveau) | (filtré côté UI) | Cas désactivé pour éviter le nesting accidentel               |
| Document (`'…'`) | Document frère   | before / after     | Réordonnancement dans le dossier (`updateStructure`)          |
| Document         | Document d'une autre section | before / after | `moveFile` + réordonnancement dans le dossier cible       |
| Document         | Section (`#`)    | before / after / inside | Le document est déposé dans la section (`moveFile`)      |
| Image (`{{IMG:id}}`) | n'importe quelle ligne | before / after | Déplacement du marqueur `{{IMG:id}}` dans le texte uniquement (le fichier physique reste à sa place) |

**Règles communes Z4 :**
- Pendant un drag, la poignée affichée est figée sur l'élément déplacé (le ghost suit le curseur).
- Les dossiers sont restreints aux frères de même niveau pour éviter le nesting accidentel.
- L'image n'est qu'un déplacement de marqueur — le fichier physique reste dans son dossier d'origine. Pour déplacer le fichier image entre deux dossiers, utiliser la zone 3.
- Auto-scroll vertical pendant le drag quand le curseur s'approche du bord (40 px).

---

## 🔄 SAUVEGARDE ET SYNCHRONISATION

### 1. Protocoles
- **Déclencheurs de sauvegarde :**
    - **Debounce 800 ms** sur la frappe dans le textarea.
    - **Blur :** Dès que l'utilisateur quitte le textarea ou change de section.
    - **Toggle Edit/Visu :** Sauvegarde forcée avant le passage en mode visu.
    - **Drag & drop :** Le `setTimeout` de sauvegarde différée est annulé au début de chaque drag (sinon un `parseContent` parallèle peut effacer un document additionnel via le cleanup d'orphelins).
- **États de sauvegarde :**
    - 🟡 `Sauvegarde…` (pendant l'envoi au serveur).
    - 🟢 `Sauvegardé` (confirmation de persistance).
    - 🔴 `Erreur` (échec de l'écriture disque).

### 2. Intégrité des Données
- **Slugification systématique :** Le système assure que les liens entre le texte de l'éditeur et les chemins physiques restent cohérents via une normalisation (slug) des noms de dossiers.
- **Liaison par ID :** Pour les images et les fichiers complexes, le système privilégie l'utilisation d'IDs uniques stockés dans `config.json` pour éviter les pertes de références lors des renommages.
- **Pas de doublons :** Le serveur refuse de créer ou de déplacer un fichier/dossier vers un dossier qui contient déjà le même nom (case-insensitive).

---

## 📡 ENDPOINTS SERVEUR (RÉFÉRENCE)

| Méthode | Route                                              | Rôle                                      |
|---------|----------------------------------------------------|-------------------------------------------|
| GET     | `/api/file-projects/:name/files`                   | Récupère l'arbre complet                   |
| POST    | `/api/file-projects/:name/folders`                 | Crée un dossier (+ `contenu.md` vide)      |
| POST    | `/api/file-projects/:name/files`                   | Crée un fichier `.md`                      |
| PATCH   | `/api/file-projects/:name/folders/:id`             | Renomme un dossier                         |
| PATCH   | `/api/file-projects/:name/files/:id`               | Renomme un fichier                         |
| PUT     | `/api/file-projects/:name/files/:id`               | Met à jour le contenu d'un fichier         |
| DELETE  | `/api/file-projects/:name/folders/:id`             | Supprime un dossier (récursif)             |
| DELETE  | `/api/file-projects/:name/files/:id`               | Supprime un fichier                        |
| POST    | `/api/file-projects/:name/move-folder`             | Déplace un dossier vers un autre parent    |
| POST    | `/api/file-projects/:name/move-file`               | Déplace un fichier vers un autre dossier   |
| PUT     | `/api/file-projects/:name/structure`               | Remplace l'arbre (utilisé pour le tri)     |
| POST    | `/api/file-projects/:name/upload-image`            | Upload base64 d'une image                  |
