# Méga-Outils — Cahier des charges & Guide d'implémentation

## Définition

Un méga-outil est un composant Angular autonome, multi-instance et multi-contexte.

Caractéristiques :
- **Autonome** : propre dossier dans `libs/shared/ui/src/lib/mega-outils/{nom}/`
- **Multi-instance** : plusieurs instances peuvent coexister dans un même projet
- **Multi-contexte** : utilisable dans l'éditeur, l'admin, ou en vue standalone
- **Temps réel** : synchronisation SSE entre utilisateurs
- **Indépendant** : chaque instance possède ses propres données

---

## Arborescence type

```
libs/shared/ui/src/lib/mega-outils/{nom}/
├── {nom}-board.component.ts          ← Composant principal (embed)
└── {nom}-admin.component.ts          ← Vue admin (liste instances)

apps/portail/src/app/pages/
├── {nom}/
│   └── {nom}-page.component.ts       ← Vue standalone (route /{nom})
└── admin/tabs/admin-mega-outils/
    └── admin-mega-outils.component.ts ← Intégration dans l'onglet admin (existant)

libs/portail-core/data-access/src/lib/
├── mega-outils.models.ts             ← Interfaces & enums (partagé, à compléter)
└── mega-outils.service.ts            ← Service HTTP (partagé, à compléter)

server/routes/
└── mega-outils.routes.js             ← Routes Express (partagé, à compléter)

data/mega-outils/
└── {nom}/                            ← Données JSON persistées
```

---

## Composant principal : `{Nom}BoardComponent`

**Sélecteur :** `app-{nom}-board`
**Standalone :** `true`
**Chemin :** `libs/shared/ui/src/lib/mega-outils/{nom}/{nom}-board.component.ts`

### Inputs obligatoires
```typescript
@Input() instanceId = ''          // ID unique de l'instance
@Input() boardName = '{Nom}'      // Nom affiché
@Input() sectionName = ''         // Section parente (optionnel)
@Input() deletable = false        // Afficher le bouton suppression
```

### Outputs obligatoires
```typescript
@Output() deleteBoard = new EventEmitter<string>()  // Émet instanceId
```

### Comportements requis
- Charge ses propres données via `MegaOutilsService`
- S'abonne à `ProjetCollabService.{nom}Update$` pour le temps réel
- Ne dépend d'aucune donnée parent (autonome)

---

## Composant admin : `{Nom}AdminComponent`

**Sélecteur :** `app-{nom}-admin`
**Standalone :** `true`
**Chemin :** `libs/shared/ui/src/lib/mega-outils/{nom}/{nom}-admin.component.ts`

### Outputs obligatoires
```typescript
@Output() openInEditor = new EventEmitter<{ projectId: string, folderId?: string, outilId?: string }>()
```

### Comportements requis
- Liste toutes les instances (tous projets confondus)
- Preview expandable de chaque instance
- Lien vers le projet/section parent
- Suppression d'instance

---

## Vue standalone : `{Nom}PageComponent`

**Route :** `/{nom}` (authentifiée)
**Chemin :** `apps/portail/src/app/pages/{nom}/{nom}-page.component.ts`

### Comportements requis
- Vue globale de toutes les instances de l'utilisateur
- Sections expandables par instance
- Navigation vers le contexte projet

---

## Modèles TypeScript

Ajouter dans `libs/portail-core/data-access/src/lib/mega-outils.models.ts` :

```typescript
// --- {NOM} ---
type {Nom}Status = 'todo' | 'done'  // définir selon l'outil

interface {Nom}Item {
  id: string
  instanceId: string
  // ... champs spécifiques à l'outil
  orderIndex: number
  creatorId?: string
  creatorName?: string
  createdAt: string
  updatedAt: string
}

// Ajouter '{nom}' dans MegaOutilType :
// type MegaOutilType = 'trello' | '{nom}'
```

---

## Service HTTP

Ajouter dans `libs/portail-core/data-access/src/lib/mega-outils.service.ts` :

```typescript
get{Nom}Items(instanceId: string): Observable<{Nom}Item[]>
create{Nom}Item(instanceId: string, data: Partial<{Nom}Item>): Observable<{Nom}Item>
update{Nom}Item(instanceId: string, itemId: string, data: Partial<{Nom}Item>): Observable<{Nom}Item>
delete{Nom}Item(instanceId: string, itemId: string): Observable<void>
getAll{Nom}s(): Observable<{ instance: MegaOutilInstance, items: {Nom}Item[] }[]>
```

---

## Routes Express

Dans `server/routes/mega-outils.routes.js` :

```javascript
router.get('/mega-outils/{nom}/all', ...)
router.get('/mega-outils/{nom}/:instanceId/items', ...)
router.post('/mega-outils/{nom}/:instanceId/items', ...)
router.patch('/mega-outils/{nom}/:instanceId/items/:itemId', ...)
router.delete('/mega-outils/{nom}/:instanceId/items/:itemId', ...)
router.post('/mega-outils/{nom}/:instanceId/items/reorder', ...)
```

**Pattern SSE :** À chaque mutation, émettre via `sseEmit(projectId, '{nom}_update', { instanceId, action })`.

---

## Intégration Admin

L'onglet admin `mega-outils` est **partagé** entre tous les méga-outils.
Ajouter `{Nom}AdminComponent` dans `AdminMegaOutilsComponent` — ne pas créer d'onglet séparé.

---

## Intégration Éditeur (ProjetEditorZoneComponent)

### 3 zones d'intégration

**1. Barre d'accès rapide** (zone haute, sous la toolbar)
```html
<button *ngFor="let inst of {nom}Instances" (click)="select{Nom}(inst)">
  {{ inst.name }}
</button>
<button (click)="showCreate{Nom}Popup = true">+ {Nom}</button>
```

**2. Marqueur dans le contenu**
```
Syntaxe : {{{NOM_MAJUSCULE}:instanceId}}
Exemple : {{{TRELLO}:abc-123}}
```
- Inséré à la position du curseur lors de la création
- Masqué dans l'éditeur (remplacé par des espaces dans le mirror)
- Rendu comme bloc vide dans la preview

**3. Panneau bas** (collapsible)
```html
<div *ngFor="let id of content{Nom}Ids">
  <app-{nom}-board [instanceId]="id" [deletable]="true"
    (deleteBoard)="on{Nom}Delete($event)">
  </app-{nom}-board>
</div>
```

### Inputs/Outputs à ajouter dans ProjetEditorZoneComponent
```typescript
@Input() {nom}Instances: MegaOutilInstance[] = []
@Input() active{Nom}Id: string | null = null
@Output() {nom}Select = new EventEmitter<MegaOutilInstance>()
@Output() {nom}Created = new EventEmitter<MegaOutilInstance>()
@Output() {nom}Deleted = new EventEmitter<string>()
```

---

## Temps réel (SSE)

Dans `libs/portail-core/data-access/src/lib/projet-collab.service.ts` :

```typescript
// 1. Subject Observable
{nom}Update$ = new Subject<{ instanceId: string | null, projectId: string, action: string }>()

// 2. Listener SSE
this.eventSource.addEventListener('{nom}_update', (e: MessageEvent) => {
  const update = JSON.parse(e.data)
  this.zone.run(() => this.{nom}Update$.next(update))
})
```

Dans `{Nom}BoardComponent` :
```typescript
// ngOnInit
this.{nom}Sub = this.collab.{nom}Update$.subscribe(evt => {
  if (evt.instanceId === this.instanceId) this.loadItems()
})
// ngOnDestroy
this.{nom}Sub?.unsubscribe()
```

---

## Checklist de création

### Phase 1 — Modèles & données
- [ ] Définir les statuts/types spécifiques
- [ ] Ajouter les interfaces dans `mega-outils.models.ts`
- [ ] Ajouter le type dans `MegaOutilType`

### Phase 2 — Backend
- [ ] Créer le dossier `data/mega-outils/{nom}/`
- [ ] Ajouter les routes dans `mega-outils.routes.js`
- [ ] Ajouter l'émission SSE `{nom}_update` à chaque mutation

### Phase 3 — Service Angular
- [ ] Ajouter les méthodes dans `mega-outils.service.ts`
- [ ] Ajouter le Subject SSE dans `projet-collab.service.ts`

### Phase 4 — Composants
- [ ] Créer `{nom}-board.component.ts`
- [ ] Créer `{nom}-admin.component.ts`
- [ ] Créer `{nom}-page.component.ts`
- [ ] Exporter depuis `libs/shared/ui/src/index.ts`

### Phase 5 — Intégration
- [ ] Route `/{nom}` dans `apps/portail/src/app/app.routes.ts`
- [ ] Ajouter dans `AdminMegaOutilsComponent`
- [ ] Barre d'accès rapide dans `ProjetEditorZoneComponent`
- [ ] Panneau bas dans `ProjetEditorZoneComponent`
- [ ] Marqueur `{{{NOM}:id}}` : regex + parser + masquage mirror

### Phase 6 — Documentation & tests
- [ ] Ajouter la ligne dans le tableau "Méga-outils existants" (ce fichier)
- [ ] Créer `docs/structure/{nom}-board.component.md`
- [ ] Créer `docs/structure/{nom}-admin.component.md`
- [ ] Mettre à jour `tests/fonctions/` (fonctions testables)
- [ ] Mettre à jour `tests/fonctions/_registry.json`

---

## Méga-outils existants

| Nom | Type | Route standalone | Depuis |
|-----|------|-----------------|--------|
| Trello | `trello` | `/trello` | 2026-06 |

---

## Conventions de nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Dossier | `mega-outils/{nom}/` (kebab-case) | `mega-outils/gantt/` |
| Sélecteur board | `app-{nom}-board` | `app-gantt-board` |
| Sélecteur admin | `app-{nom}-admin` | `app-gantt-admin` |
| Marqueur contenu | `{{{NOM_MAJUSCULE}:id}}` | `{{GANTT:abc-123}}` |
| Type `MegaOutilType` | `'{nom}'` (minuscule) | `'gantt'` |
| Événement SSE | `'{nom}_update'` | `'gantt_update'` |
| Subject service | `{nom}Update$` | `ganttUpdate$` |
