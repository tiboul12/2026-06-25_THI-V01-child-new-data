# PROJET THI 2026-04 - Gestion des fichiers et éditeur unifié

## 📋 CONTEXTE

Ce document décrit la fonctionnalité de gestion de fichiers et d'éditeur unifié à intégrer dans la section "projets/" de l'application existante.

---

## 🎯 OBJECTIF

Implémenter un système de gestion de fichiers/dossiers avec :
- Arborescence interactive (Zone 3)
- Éditeur Markdown WYSIWYG unifié (Zone 4)
- Sauvegarde automatique en temps réel
- Création et restructuration automatique de fichiers via les titres Markdown

---

## 🏗️ ARCHITECTURE DES ZONES

```
zone.png
```

### Zones concernées par cette fonctionnalité :
- **Z3** : Arborescence des fichiers du projet (panneau gauche)
- **Z4** : Éditeur Markdown WYSIWYG unifié (panneau principal)

### Zones NON concernées :
- **Z1** : Menu header (existant)
- **Z2** : Menu gauche (non fonctionnel - à ignorer)
- **Z5** : Conversation IA (à implémenter ultérieurement)

---

## 📁 STRUCTURE DES DONNÉES

### Emplacement des projets
```
./data/projets/
└── [NOM_DU_PROJET]/
    ├── config.json          # Configuration et hiérarchie
    ├── [dossier-1]/
    │   └── contenu.md       # Fichier par défaut dans chaque dossier
    ├── [dossier-2]/
    │   ├── contenu.md
    │   └── [fichier-custom].md
    └── [fichier-racine].md
```

### Format du fichier config.json

```json
{
  "projectName": "Mon Projet",
  "createdAt": "2026-04-26T10:30:00Z",
  "updatedAt": "2026-04-26T14:45:00Z",
  "structure": [
    {
      "id": "uuid-1",
      "type": "folder",
      "name": "Chapitre 1 - Introduction",
      "path": "chapitre-1-introduction",
      "order": 1,
      "children": [
        {
          "id": "uuid-2",
          "type": "file",
          "name": "contenu.md",
          "path": "chapitre-1-introduction/contenu.md",
          "order": 1
        },
        {
          "id": "uuid-3",
          "type": "file",
          "name": "notes.md",
          "path": "chapitre-1-introduction/notes.md",
          "order": 2
        }
      ]
    },
    {
      "id": "uuid-4",
      "type": "folder",
      "name": "Chapitre 2 - Développement",
      "path": "chapitre-2-developpement",
      "order": 2,
      "children": [
        {
          "id": "uuid-5",
          "type": "file",
          "name": "contenu.md",
          "path": "chapitre-2-developpement/contenu.md",
          "order": 1
        }
      ]
    },
    {
      "id": "uuid-6",
      "type": "file",
      "name": "conclusion.md",
      "path": "conclusion.md",
      "order": 3
    }
  ]
}
```

---

## 🖥️ ZONE 3 - ARBORESCENCE DES FICHIERS

### Affichage initial
À la création d'un projet, Z3 affiche uniquement :
```
📁 Nom du Projet
```

### Icônes
- 📁 Dossier (fermé)
- 📂 Dossier (ouvert)
- 📄 Fichier .md

### Menu contextuel (clic droit)

Afficher un menu popup au clic droit sur un élément :

#### Sur un dossier ou la racine du projet :
```
┌─────────────────────┐
│ 📁 Nouveau dossier  │
│ 📄 Nouveau fichier  │
├─────────────────────┤
│ ✏️  Renommer        │
│ 🗑️  Supprimer       │
└─────────────────────┘
```

#### Sur un fichier :
```
┌─────────────────────┐
│ ✏️  Renommer        │
│ 🗑️  Supprimer       │
└─────────────────────┘
```

### Actions du menu contextuel

#### 1. Nouveau dossier
- Afficher un input pour saisir le nom du dossier
- Créer le dossier dans `./data/projets/[PROJET]/[nom-dossier]/`
- Créer automatiquement un fichier `contenu.md` vide dans ce dossier
- Mettre à jour `config.json`
- Rafraîchir Z3

#### 2. Nouveau fichier
- Afficher un input pour saisir le nom du fichier (sans extension)
- Créer le fichier `[nom].md` dans le dossier sélectionné (ou racine)
- Mettre à jour `config.json`
- Rafraîchir Z3

#### 3. Renommer
- Afficher un input pré-rempli avec le nom actuel
- Renommer le fichier/dossier sur le disque
- Mettre à jour `config.json`
- Rafraîchir Z3 et Z4

#### 4. Supprimer
- Afficher une confirmation : "Êtes-vous sûr de vouloir supprimer [nom] ?"
- Si dossier : supprimer récursivement tout le contenu
- Mettre à jour `config.json`
- Rafraîchir Z3 et Z4

### Drag & Drop (Glisser-Déposer)

Permettre de réorganiser les fichiers et dossiers par glisser-déposer :
- Déplacer un fichier dans un autre dossier
- Réordonner les éléments (changer l'ordre d'affichage)
- Déplacer un dossier dans un autre dossier
- Indicateur visuel pendant le drag (ligne ou zone de drop)
- Mettre à jour `config.json` après chaque déplacement
- Rafraîchir Z4 pour refléter le nouvel ordre

---

## ✏️ ZONE 4 - ÉDITEUR MARKDOWN WYSIWYG UNIFIÉ

### Principe
La Zone 4 affiche **TOUS les fichiers du projet** comme un **document unique et continu**, dans l'ordre hiérarchique défini dans Z3.

### Gestion des niveaux de titres (décalage automatique)

Les titres Markdown sont automatiquement décalés selon la profondeur du fichier dans l'arborescence.

#### Règle de décalage :
```
Niveau de profondeur 0 (racine)    : # reste #
Niveau de profondeur 1 (dossier)   : # devient ##
Niveau de profondeur 2 (sous-dossier) : # devient ###
etc.
```

#### Exemple :

**Structure Z3 :**
```
📁 Mon Projet
├── 📁 Chapitre 1
│   ├── 📄 contenu.md      (contient "# Introduction")
│   └── 📄 details.md      (contient "# Détails" et "## Sous-section")
├── 📁 Chapitre 2
│   └── 📄 contenu.md      (contient "# Développement")
└── 📄 conclusion.md       (contient "# Conclusion")
```

**Affichage unifié en Z4 :**
```markdown
## Introduction           ← était "#" mais décalé car dans dossier niveau 1

## Détails                ← était "#" mais décalé
### Sous-section          ← était "##" mais décalé

## Développement          ← était "#" mais décalé

# Conclusion              ← reste "#" car à la racine
```

---

## 🔄 CRÉATION ET RESTRUCTURATION AUTOMATIQUE VIA LES TITRES

### Principe fondamental

Quand l'utilisateur tape un titre `#` dans Z4, le système :
1. **Crée automatiquement** un nouveau dossier/fichier correspondant
2. **Restructure dynamiquement** toute la hiérarchie qui suit si nécessaire

### ⚠️ RÈGLE CRITIQUE : Insertion d'un titre de niveau supérieur

L'insertion d'un titre de niveau supérieur (moins de `#`) **COUPE** la hiérarchie existante et **RÉORGANISE** tout ce qui suit.

#### Exemple détaillé :

**Structure initiale Z3 :**
```
📁 Mon Projet
├── 📁 Menu 1
│   └── 📄 contenu.md
├── 📁 Menu 2
│   ├── 📄 Menu 2-1.md
│   └── 📄 Menu 2-2.md
└── 📁 Menu 3
    └── 📄 contenu.md
```

**Affichage Z4 correspondant :**
```markdown
# Menu 1
(contenu...)

# Menu 2
## Menu 2-1
(contenu...)
## Menu 2-2
(contenu...)

# Menu 3
(contenu...)
```

---

**Action utilisateur :** L'utilisateur insère `# Nouveau Menu` entre `## Menu 2-1` et `## Menu 2-2`

**Nouvelle structure Z4 :**
```markdown
# Menu 1
(contenu...)

# Menu 2
## Menu 2-1
(contenu...)

# Nouveau Menu        ← NOUVEAU : coupe la hiérarchie de Menu 2
## Menu 2-2           ← DÉPLACÉ : devient enfant de "Nouveau Menu"
(contenu...)

# Menu 3              ← RENOMMÉ/RÉINDEXÉ : était Menu 3, reste Menu 3 mais position 4
(contenu...)
```

**Nouvelle structure Z3 :**
```
📁 Mon Projet
├── 📁 Menu 1
│   └── 📄 contenu.md
├── 📁 Menu 2
│   └── 📄 Menu 2-1.md          ← Menu 2-2 a été déplacé
├── 📁 Nouveau Menu              ← NOUVEAU DOSSIER CRÉÉ
│   └── 📄 Menu 2-2.md          ← DÉPLACÉ depuis Menu 2
└── 📁 Menu 3
    └── 📄 contenu.md
```

---

### Algorithme de restructuration

```javascript
/**
 * Restructure la hiérarchie quand un nouveau titre est inséré
 * @param {number} insertPosition - Position du curseur dans le document unifié
 * @param {number} titleLevel - Niveau du titre inséré (1 pour #, 2 pour ##, etc.)
 * @param {string} titleText - Texte du titre
 */
function handleTitleInsertion(insertPosition, titleLevel, titleText) {
    
    // 1. Identifier le fichier/dossier courant à cette position
    const currentItem = findItemAtPosition(insertPosition);
    
    // 2. Identifier tous les éléments qui suivent la position d'insertion
    const followingItems = getItemsAfterPosition(insertPosition);
    
    // 3. Créer le nouveau dossier/fichier
    const newFolder = createFolder(titleText);
    
    // 4. Pour chaque élément suivant, déterminer s'il doit être déplacé
    for (const item of followingItems) {
        const itemLevel = getItemLevel(item);
        
        // Si l'élément suivant a un niveau INFÉRIEUR ou ÉGAL au titre inséré
        // → Il reste à sa place (ou devient frère)
        if (itemLevel <= titleLevel) {
            break; // Arrêter la réorganisation
        }
        
        // Si l'élément suivant a un niveau SUPÉRIEUR au titre inséré
        // → Il devient enfant du nouveau dossier
        if (itemLevel > titleLevel) {
            moveItemToFolder(item, newFolder);
        }
    }
    
    // 5. Mettre à jour config.json
    updateConfig();
    
    // 6. Rafraîchir Z3 et Z4
    refreshUI();
}
```

---

### Tableau récapitulatif des comportements

| Situation | Action | Résultat |
|-----------|--------|----------|
| Insérer `#` à la fin du document | Crée un nouveau dossier racine | Nouveau dossier ajouté à la fin |
| Insérer `#` entre deux `#` | Crée un nouveau dossier racine | Nouveau dossier inséré entre les deux |
| Insérer `#` après un `##` | **COUPE** la hiérarchie | Les `##` suivants deviennent enfants du nouveau `#` |
| Insérer `##` après un `#` | Crée un sous-dossier/fichier | Ajouté comme enfant du `#` précédent |
| Insérer `##` entre deux `##` du même parent | Crée un fichier frère | Inséré entre les deux au même niveau |
| Insérer `###` après un `##` | Crée un sous-sous-niveau | Devient enfant du `##` précédent |

---

### Exemple complet pas à pas

#### État initial :
```
Z3:                              Z4:
📁 Projet                        # Menu 1
├── 📁 Menu 1                    Contenu menu 1...
│   └── 📄 contenu.md            
├── 📁 Menu 2                    # Menu 2
│   ├── 📄 Menu 2-1.md           ## Menu 2-1
│   └── 📄 Menu 2-2.md           Contenu 2-1...
└── 📁 Menu 3                    ## Menu 2-2
    └── 📄 contenu.md            Contenu 2-2...
                                 
                                 # Menu 3
                                 Contenu menu 3...
```

#### Action : Utilisateur tape `# Insertion` entre "Contenu 2-1..." et "## Menu 2-2"

#### Processus :
1. **Détection** : Nouveau titre `#` (niveau 1) inséré
2. **Position** : Entre `## Menu 2-1` et `## Menu 2-2`
3. **Analyse** : 
   - `## Menu 2-2` a un niveau > 1 → sera déplacé
   - `# Menu 3` a un niveau = 1 → reste en place
4. **Création** : Dossier "Insertion" créé
5. **Déplacement** : `Menu 2-2.md` déplacé dans "Insertion"
6. **Mise à jour** : config.json mis à jour

#### Résultat final :
```
Z3:                              Z4:
📁 Projet                        # Menu 1
├── 📁 Menu 1                    Contenu menu 1...
│   └── 📄 contenu.md            
├── 📁 Menu 2                    # Menu 2
│   └── 📄 Menu 2-1.md           ## Menu 2-1
├── 📁 Insertion       ← NEW     Contenu 2-1...
│   └── 📄 Menu 2-2.md ← MOVED   
└── 📁 Menu 3                    # Insertion        ← NEW
    └── 📄 contenu.md            ## Menu 2-2        ← MOVED (maintenant sous Insertion)
                                 Contenu 2-2...
                                 
                                 # Menu 3
                                 Contenu menu 3...
```

---

### Gestion des cas limites

#### Cas 1 : Insertion d'un `#` au tout début
```markdown
# Nouveau Premier    ← Inséré ici
# Menu 1
...
```
→ Crée un nouveau dossier qui devient le premier de la liste

#### Cas 2 : Insertion de `###` sans `##` parent
```markdown
# Menu 1
### Sous-sous-menu   ← Problème : pas de ## parent
```
→ Créer automatiquement un `##` intermédiaire OU afficher une erreur/warning

**Recommandation** : Créer un dossier/fichier intermédiaire avec un nom généré :
```
📁 Menu 1
└── 📁 Section (auto-généré)
    └── 📄 Sous-sous-menu.md
```

#### Cas 3 : Suppression d'un titre `#`
Si l'utilisateur supprime un titre `#` qui a des enfants `##` :
- **Option A** : Empêcher la suppression et afficher un warning
- **Option B** : Remonter les enfants au niveau supérieur
- **Option C** : Fusionner avec le dossier précédent

**Recommandation** : Option B avec confirmation utilisateur

---

## 💾 SAUVEGARDE AUTOMATIQUE

### Comportement

- **Déclencheur** : Sauvegarde automatique après chaque modification
- **Délai** : Debounce de 500ms (éviter les sauvegardes trop fréquentes)
- **Scope** : Sauvegarder uniquement le fichier modifié
- **Restructuration** : Si un titre est ajouté/modifié, sauvegarder aussi config.json

### Indicateur visuel

Afficher un indicateur de statut dans Z1 ou Z4 :
- 🟢 "Sauvegardé" (affiché 2 secondes après sauvegarde)
- 🟡 "Sauvegarde en cours..." (pendant la requête)
- 🔴 "Erreur de sauvegarde" (en cas d'échec)
- 🔄 "Restructuration..." (pendant une réorganisation)

### Implémentation

```javascript
// Debounce pour éviter les sauvegardes trop fréquentes
let saveTimeout;
let isRestructuring = false;

function onContentChange(fileId, content, cursorPosition) {
    clearTimeout(saveTimeout);
    
    // Détecter si un titre a été ajouté/modifié
    const titleChange = detectTitleChange(content, cursorPosition);
    
    if (titleChange) {
        isRestructuring = true;
        showStatus('restructuring');
        handleTitleInsertion(titleChange.position, titleChange.level, titleChange.text);
        isRestructuring = false;
    }
    
    showStatus('saving');
    
    saveTimeout = setTimeout(async () => {
        try {
            await saveFile(fileId, content);
            if (titleChange) {
                await saveConfig();
            }
            showStatus('saved');
        } catch (error) {
            showStatus('error');
        }
    }, 500);
}

/**
 * Détecte si un titre Markdown a été ajouté ou modifié
 */
function detectTitleChange(content, cursorPosition) {
    // Récupérer la ligne courante
    const lines = content.split('\n');
    const currentLineIndex = getLineIndexAtPosition(content, cursorPosition);
    const currentLine = lines[currentLineIndex];
    
    // Vérifier si c'est un titre
    const titleMatch = currentLine.match(/^(#{1,6})\s+(.+)$/);
    
    if (titleMatch) {
        const level = titleMatch[1].length;
        const text = titleMatch[2];
        
        // Vérifier si c'est un nouveau titre (pas déjà dans config.json)
        if (isNewTitle(currentLineIndex, level, text)) {
            return {
                position: cursorPosition,
                level: level,
                text: text,
                lineIndex: currentLineIndex
            };
        }
    }
    
    return null;
}
```

---

## 🖊️ ÉDITEUR WYSIWYG

Utiliser un éditeur Markdown WYSIWYG (suggestions de librairies) :
- **Toast UI Editor** : https://ui.toast.com/tui-editor
- **Editor.js** : https://editorjs.io/
- **Milkdown** : https://milkdown.dev/
- **Tiptap** : https://tiptap.dev/

#### Fonctionnalités requises :
- Édition WYSIWYG (pas de code Markdown visible)
- Barre d'outils : Gras, Italique, Titres, Listes, Liens, Images
- Raccourcis clavier (Ctrl+B, Ctrl+I, etc.)
- Support du Markdown natif (taper `**texte**` → texte en gras)
- **Détection des titres** pour déclencher la restructuration

### Séparateurs visuels entre fichiers

Pour distinguer les fichiers dans l'affichage unifié, ajouter un séparateur visuel subtil :

```css
.file-separator {
    border-top: 1px dashed #e0e0e0;
    margin: 30px 0;
    position: relative;
}

.file-separator::before {
    content: attr(data-filename);
    position: absolute;
    top: -10px;
    left: 20px;
    background: #fff;
    padding: 0 10px;
    font-size: 11px;
    color: #999;
}
```

Affichage :
```
─────────── 📄 introduction.md ───────────
```

---

## 🔌 API BACKEND (Node.js/Express)

### Routes requises

```javascript
// Projets
GET    /api/projects                     // Liste tous les projets
POST   /api/projects                     // Crée un nouveau projet
GET    /api/projects/:name               // Récupère config.json d'un projet
DELETE /api/projects/:name               // Supprime un projet

// Fichiers et dossiers
GET    /api/projects/:name/files         // Liste tous les fichiers (contenu inclus)
POST   /api/projects/:name/files         // Crée un fichier
PUT    /api/projects/:name/files/:id     // Met à jour un fichier (contenu)
DELETE /api/projects/:name/files/:id     // Supprime un fichier
PATCH  /api/projects/:name/files/:id     // Renomme un fichier

POST   /api/projects/:name/folders       // Crée un dossier
DELETE /api/projects/:name/folders/:id   // Supprime un dossier
PATCH  /api/projects/:name/folders/:id   // Renomme un dossier

// Structure et restructuration
PUT    /api/projects/:name/structure     // Met à jour l'ordre/hiérarchie (drag & drop)
POST   /api/projects/:name/restructure   // Restructure après insertion de titre
```

### Exemple de réponse GET /api/projects/:name/files

```json
{
  "success": true,
  "project": "Mon Projet",
  "files": [
    {
      "id": "uuid-1",
      "type": "folder",
      "name": "Chapitre 1",
      "path": "chapitre-1",
      "depth": 1,
      "order": 1,
      "children": [
        {
          "id": "uuid-2",
          "type": "file",
          "name": "contenu.md",
          "path": "chapitre-1/contenu.md",
          "depth": 2,
          "order": 1,
          "content": "# Introduction\n\nCeci est le contenu..."
        }
      ]
    }
  ]
}
```

### Route POST /api/projects/:name/restructure

```javascript
/**
 * Restructure la hiérarchie après l'insertion d'un titre
 * Body: {
 *   insertPosition: number,    // Position dans le document unifié
 *   titleLevel: number,        // Niveau du titre (1-6)
 *   titleText: string,         // Texte du titre
 *   affectedItems: string[]    // IDs des éléments à déplacer
 * }
 */
router.post('/:name/restructure', async (req, res) => {
    const { name } = req.params;
    const { insertPosition, titleLevel, titleText, affectedItems } = req.body;
    
    try {
        // 1. Créer le nouveau dossier
        const newFolderId = generateUUID();
        const newFolderPath = slugify(titleText);
        
        await fs.mkdir(path.join(PROJECTS_DIR, name, newFolderPath));
        await fs.writeFile(
            path.join(PROJECTS_DIR, name, newFolderPath, 'contenu.md'),
            ''
        );
        
        // 2. Déplacer les fichiers affectés
        for (const itemId of affectedItems) {
            await moveItem(name, itemId, newFolderId);
        }
        
        // 3. Mettre à jour config.json
        await updateConfig(name);
        
        res.json({ success: true, newFolderId });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

---

## 📝 RÉCAPITULATIF DES FONCTIONNALITÉS

### Zone 3 - Arborescence
- [x] Affichage hiérarchique avec icônes (📁 📂 📄)
- [x] Menu contextuel (clic droit) : Créer dossier, Créer fichier, Renommer, Supprimer
- [x] Drag & Drop pour réorganiser
- [x] Création de dossier avec fichier `contenu.md` automatique
- [x] Synchronisation avec config.json
- [x] Mise à jour automatique lors de restructuration Z4

### Zone 4 - Éditeur
- [x] Éditeur Markdown WYSIWYG
- [x] Affichage unifié de tous les fichiers
- [x] Décalage automatique des niveaux de titre selon la profondeur
- [x] **Création automatique** de fichiers/dossiers via les titres #
- [x] **Restructuration dynamique** : insertion d'un # coupe la hiérarchie
- [x] Séparateurs visuels entre fichiers
- [x] Sauvegarde automatique en temps réel (debounce 500ms)
- [x] Indicateur de statut de sauvegarde

### Backend
- [x] API REST pour CRUD fichiers/dossiers
- [x] Gestion du config.json
- [x] Création/suppression de fichiers sur le disque
- [x] Route de restructuration pour réorganisation automatique

---

## 🚀 INSTRUCTIONS D'IMPLÉMENTATION

1. **Lire** le code existant pour comprendre la structure actuelle
2. **Implémenter** les routes API backend en premier (incluant `/restructure`)
3. **Créer** le composant Z3 (arborescence) avec menu contextuel
4. **Intégrer** un éditeur WYSIWYG pour Z4
5. **Implémenter** la détection des titres Markdown
6. **Implémenter** l'algorithme de restructuration dynamique
7. **Connecter** Z3 et Z4 (synchronisation bidirectionnelle)
8. **Implémenter** le drag & drop
9. **Ajouter** la sauvegarde automatique
10. **Tester** tous les cas de restructuration (voir exemples ci-dessus)

---

## ⚠️ POINTS D'ATTENTION

1. **Performance** : Si beaucoup de fichiers, lazy-load le contenu
2. **Conflits** : Gérer le cas où config.json et le disque sont désynchronisés
3. **Noms de fichiers** : Slugifier les noms (espaces → tirets, caractères spéciaux supprimés)
4. **Encodage** : Tous les fichiers en UTF-8
5. **Sécurité** : Valider les chemins pour éviter les path traversal attacks
6. **Restructuration** : Toujours confirmer avec l'utilisateur avant de déplacer des fichiers
7. **Undo** : Implémenter un historique pour annuler les restructurations

---

## 📎 ANNEXES

### Fonction de slugification

```javascript
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .replace(/[^a-z0-9\s-]/g, '')    // Supprime les caractères spéciaux
        .replace(/\s+/g, '-')            // Espaces → tirets
        .replace(/-+/g, '-')             // Multiples tirets → un seul
        .trim();
}
```

### Génération d'UUID

```javascript
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
```

### Fonction de détection de niveau de titre

```javascript
function getTitleLevel(line) {
    const match = line.match(/^(#{1,6})\s/);
    return match ? match[1].length : 0;
}
```

### Fonction de calcul de profondeur dans l'arborescence

```javascript
function getItemDepth(itemPath) {
    return itemPath.split('/').length;
}
```
