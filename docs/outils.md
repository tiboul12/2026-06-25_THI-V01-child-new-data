# Outils — Cahier des charges & Guide d'implémentation

## Définition

Un outil est un **mode d'édition de projet** — il détermine comment le contenu d'un projet est affiché et modifié. Chaque projet peut avoir plusieurs instances du même type d'outil.

Caractéristiques :
- **Contextuel** : lié à un projet spécifique, géré dans `config.outils[]`
- **Multi-instance** : plusieurs outils du même type peuvent coexister dans un projet
- **Scope fichiers** : chaque instance gère un sous-ensemble de fichiers via `rootFolderIds`
- **Vue autonome** : propre composant dans `apps/projets/.../outils/{nom}/`
- **Indépendant** : chaque outil est une "vue" différente sur les fichiers du projet

## Différence outil vs méga-outil

| | Outil | Méga-outil |
|--|-------|-----------|
| Scope | Vue principale du projet | Widget embarqué dans l'éditeur |
| Instances | 1-N par projet | 1-N par projet ou section |
| Fichiers | Gère des `rootFolderIds` | Gère ses propres données (cartes, etc.) |
| Rendu | Occupe toute la zone centrale | Panneau bas ou popup |
| Exemples | Edition, Tests, Code | Trello |

---

## Arborescence type

```
apps/projets/src/app/pages/projet-editor/outils/
├── edition/
│   └── edition-outil.component.ts    ← outil existant (référence)
└── {nom}/
    └── {nom}-outil.component.ts      ← nouveau composant à créer

apps/projets/src/app/pages/projet-editor/
├── projet-editor.component.ts        ← orchestrateur (charger le composant au switch)
├── projet-editor.component.html      ← template (ajouter le @if activeOutil().type)
└── components/projet-sidebar/
    └── projet-sidebar.component.html ← bouton dans "AJOUTER UN OUTIL"

libs/portail-core/data-access/src/lib/
└── project-files.service.ts          ← interface Outil (ajouter le type)
```

---

## Interface Outil

Dans `libs/portail-core/data-access/src/lib/project-files.service.ts` :

```typescript
export interface Outil {
  id: string;
  type: 'edition' | '{nom}';  // ajouter le nouveau type ici
  name: string;
  rootFolderIds: string[];     // dossiers racines gérés par cet outil
  createdAt: string;
}
```

---

## Composant : `{Nom}OutilComponent`

**Sélecteur :** `app-{nom}-outil`
**Standalone :** `true`
**Chemin :** `apps/projets/src/app/pages/projet-editor/outils/{nom}/{nom}-outil.component.ts`

### Inputs obligatoires (hérités d'EditionOutilComponent)
```typescript
@Input() files: FileNode[] = []            // Fichiers filtrés par rootFolderIds
@Input() restoreToken = 0                  // Force rebuild de l'éditeur
@Input() saveStatus: SaveStatus | null = null
@Input() projectName = ''
@Input() activeNodeId: string | null = null
@Input() scrollToNodeId: string | null = null
@Input() highlightNodeId: string | null = null
@Input() commentCounts: Record<string, number> = {}
@Input() megaOutilInstances: MegaOutilInstance[] = []
@Input() activeMegaOutilId: string | null = null
@Input() activeOutilId: string | null = null
```

### Outputs obligatoires (hérités d'EditionOutilComponent)
```typescript
@Output() fileSave = new EventEmitter<{ nodeId: string; content: string }>()
@Output() sectionsChange = new EventEmitter<FileNode[]>()
@Output() nodeActive = new EventEmitter<string>()
@Output() dirtyChange = new EventEmitter<boolean>()
@Output() saveStarting = new EventEmitter<void>()
@Output() refresh = new EventEmitter<void>()
@Output() commentRequest = new EventEmitter<string>()
```

### Comportements requis
- Recevoir les `files` filtrés par le parent (ProjetEditorComponent)
- Implémenter sa propre logique d'affichage/édition
- Émettre `fileSave` à chaque modification de contenu
- Émettre `sectionsChange` quand la structure des sections change
- Exposer `flushContentModifications()` si l'outil gère un éditeur avec buffer

---

## Intégration dans le Sidebar

Dans `apps/projets/src/app/pages/projet-editor/components/projet-sidebar/projet-sidebar.component.html` :

```html
<!-- Dans le popup "AJOUTER UN OUTIL" -->
<button (click)="onAddOutil('{nom}')">
  <span class="material-symbols-outlined text-xs">{icone}</span>
  {Nom}
  <!-- Retirer le label "bientôt" et l'attribut disabled une fois implémenté -->
</button>
```

Dans `projet-sidebar.component.ts`, la méthode `onAddOutil(type: string)` est déjà générique — aucun changement requis.

**Icônes suggérées par type :**
| Type | Icône Material |
|------|---------------|
| edition | `edit_note` |
| tests | `science` |
| code | `code` |

---

## Intégration dans l'Éditeur

Dans `apps/projets/src/app/pages/projet-editor/projet-editor.component.html` :

```html
<!-- Ajouter après le bloc @if edition -->
@if (activeOutil()?.type === '{nom}') {
  <app-{nom}-outil
    [files]="activeOutilFiles()"
    [restoreToken]="restoreToken()"
    [saveStatus]="saveStatus()"
    [projectName]="projectName()"
    [activeNodeId]="activeNodeId()"
    [megaOutilInstances]="megaOutilInstances()"
    [activeMegaOutilId]="activeMegaOutilId()"
    [activeOutilId]="activeOutil()?.id ?? null"
    (fileSave)="onFileSave($event)"
    (sectionsChange)="onSectionsChange($event)"
    (nodeActive)="onNodeActive($event)"
    (dirtyChange)="onDirtyChange($event)"
    (saveStarting)="onSaveStarting()"
    (refresh)="onRefresh()"
    (commentRequest)="onCommentRequest($event)" />
}
```

Dans `projet-editor.component.ts`, ajouter l'import du nouveau composant.

---

## Backend (aucun changement requis)

Le serveur accepte déjà n'importe quelle valeur pour `type` — il n'y a pas de validation :

```javascript
// server/server-data.js — endpoints existants (génériques)
GET    /api/file-projects/:name/outils
POST   /api/file-projects/:name/outils        // { type, name, rootFolderIds }
PATCH  /api/file-projects/:name/outils/:id    // { name?, rootFolderIds? }
DELETE /api/file-projects/:name/outils/:id
```

**Auto-migration :** Si un projet n'a pas d'outil défini, le serveur crée automatiquement un outil `edition` au premier chargement (`migrateOutils()` dans `server-data.js`).

---

## Stockage

- **Filesystem :** `data/projets/{projectName}/config.json` → `config.outils[]`
- **Base de données :** colonne JSON `file_project_meta.outils`
- **Synchronisation :** automatique à chaque opération CRUD via `saveProjectConfig()`

---

## Checklist de création

### Phase 1 — Modèle
- [ ] Ajouter `'{nom}'` dans l'union de types `Outil.type` dans `project-files.service.ts`

### Phase 2 — Composant
- [ ] Créer `apps/projets/src/app/pages/projet-editor/outils/{nom}/{nom}-outil.component.ts`
- [ ] Implémenter les Inputs/Outputs obligatoires (voir section ci-dessus)
- [ ] Implémenter la logique d'affichage/édition spécifique

### Phase 3 — Intégration éditeur
- [ ] Importer le composant dans `projet-editor.component.ts`
- [ ] Ajouter le bloc `@if (activeOutil()?.type === '{nom}')` dans `projet-editor.component.html`
- [ ] Passer tous les Inputs, câbler tous les Outputs

### Phase 4 — Sidebar
- [ ] Activer le bouton dans `projet-sidebar.component.html` (retirer `disabled` + label "bientôt")
- [ ] Vérifier que `onAddOutil('{nom}')` fonctionne (générique, pas de modif normalement)

### Phase 5 — Documentation & tests
- [ ] Ajouter la ligne dans le tableau "Outils existants" (ce fichier)
- [ ] Créer `docs/structure/{nom}-outil.component.md`
- [ ] Mettre à jour `tests/fonctions/` et `tests/fonctions/_registry.json`

---

## Outils existants

| Nom | Type | Statut | Depuis |
|-----|------|--------|--------|
| Edition | `edition` | Actif | Origine |
| Tests | `tests` | Bientôt | — |
| Code | `code` | Bientôt | — |

---

## Conventions de nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Dossier | `outils/{nom}/` (kebab-case) | `outils/tests/` |
| Sélecteur | `app-{nom}-outil` | `app-tests-outil` |
| Type string | `'{nom}'` (minuscule) | `'tests'` |
| Icône Material | choisir selon contexte | `science` |
