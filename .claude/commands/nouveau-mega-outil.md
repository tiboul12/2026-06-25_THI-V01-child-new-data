# Commande : /nouveau-mega-outil

## Instructions pour Claude

Tu vas créer un nouveau méga-outil. Avant toute chose :

1. **Lire `docs/mega-outils.md`** — c'est la source de vérité. Ne pas improviser en dehors du pattern défini.
2. **Lire les fichiers existants** à modifier (`mega-outils.models.ts`, `mega-outils.service.ts`, `mega-outils.routes.js`, `AdminMegaOutilsComponent`, `ProjetEditorZoneComponent`) pour comprendre l'état actuel avant d'ajouter quoi que ce soit.
3. **Référence d'implémentation : le MO Trello** (`projet-editor-zone.component`, `trello-board.component`). Reproduire son comportement général (ci-dessous), sans copier ses données métier (cartes, statuts, priorités, colonnes).

---

## Spécifications générales d'un méga-outil (comportement obligatoire)

Tout MO intégré à l'éditeur projet doit respecter ces règles (issues du MO Trello de référence). Elles concernent l'affichage et le cycle de vie, **pas** les données métier propres au MO.

### A. Représentation dans le code (source de vérité)
- Le MO est identifié dans le markdown par un **bloc fencé** ` ```TYPE: NOM … ``` ` (TYPE en majuscules, ex. ` ```TRELLO: NOM `). **Le code est la source de vérité.**
- Reconnaissance **stricte** du marqueur d'ouverture : toute altération (ex. ` ```TYPE → ```TYP: `) le rend non reconnu.
- Les `###`/headings internes de **tout** bloc ` ``` … ``` ` doivent être exclus de la détection de sections (pré-scan dans `parseContent`, `recomputeRanges`, `parseStructureNodes`) — sinon le corps du bloc est mal découpé/perdu.

### B. Fichier physique + élément de menu
- À la création, créer un **fichier physique** `{type}-NOM.md` dans le dossier de la section, dont le **contenu est le bloc complet** ` ```TYPE: NOM … ``` ` (jamais vide).
- L'afficher dans la sidebar sous la forme `XX: NOM` (transformation d'affichage), le nom de fichier réel restant `{type}-NOM`.
- `buildDocSections` injecte le contenu du fichier (le bloc) dans la section ; `parseContent` extrait le bloc → fichier. Round-trip stable.

### C. Affichage selon le mode
- **Code** : afficher le **code brut** du bloc (pas de badge) ; **aucun** panneau/board en bas.
- **Structure** : remplacer le code par un **tag graphique** « TYPE : NOM » ; afficher le board en bas **uniquement pour la section/élément actif** (scope `folderId` de la section sélectionnée).
- **Preview** : rendre le board **inline** (vrai composant board) dans la zone d'édition, **identique** que l'on sélectionne la section ou l'élément ; **pas** de panneau bas.

### D. Barre méga-outils (visible dans TOUS les modes)
- Un bouton par type avec compteur d'instances ; sous-barre d'onglets `[type:NOM]`.
- Clic sur le **bouton du type** → ouvre la **vue Liste** des instances (sortie `open{Type}List` forwardée jusqu'au parent). Pas de bouton « Liste » dédié dans la sidebar.
- Clic sur un **onglet d'instance** (ou le nœud sidebar) → **focus** sur la seule section de l'élément (mode Code).

### E. Cycle de vie piloté par le code
- **Créer** (bouton Nouveau **ou** coller le bloc) → crée fichier + instance DB + élément menu, **sans modifier le code collé**.
- **Supprimer le bloc** → supprime l'instance + le fichier + la vue.
- **Corrompre le marqueur** → texte conservé **tel quel** dans `contenu.md` (devient du texte simple), instance + fichier supprimés, vue masquée. **Ne jamais effacer le code, juste le transférer** (pas de `refresh.emit()` qui re-sérialiserait et écraserait).
- **Instances orphelines** (sans bloc ni fichier dans le projet) supprimées au chargement.

### F. Synchronisation bidirectionnelle données ↔ vue
- **vue → code** : une action dans le board met à jour le code du bloc (toggle **Sync auto**, activé par défaut).
- **code → données** : éditer le code réconcilie les données en base (correspondance par identifiant/titre, **mise à jour optimiste du cache local** pour éviter les doublons à la sauvegarde suivante).
- **À l'ouverture de la section** : bloc présent sans fichier → créer le fichier ; fichier présent sans bloc → injecter le texte.

### G. Verrou de section (collaboration)
- Section verrouillée par un autre utilisateur (cadenas **rouge** = `isLockedByOther`) → board en **lecture seule** (`@Input() readonly` gate toutes les mutations + masque les boutons d'action) ; édition code/structure bloquée.
- Cadenas **jaune** = modifications locales non partagées (`isLocalPending`) → fond jaune sur la section en mode Code. Ne pas confondre les deux couleurs.

### H. Popups
- Ne **jamais** fermer un popup au clic sur le backdrop ; fermeture via boutons ✕ / Annuler / validation uniquement (pas de `(click)` de fermeture sur l'overlay ni de `$event.stopPropagation()` sur le contenu).

---

## Étape 1 — Recueillir les informations

Poser ces questions via `AskUserQuestion` (en une seule fois) :

```
Question 1 : "Nom du méga-outil ?"
             → Texte libre (ex: Gantt, Mindmap, Checklist)

Question 2 : "Quelles données gère-t-il ?"
             → Description courte (ex: "des tâches avec dates de début/fin", "des nœuds reliés entre eux")

Question 3 : "Quels statuts/états possibles pour ses items ?"
             → Texte libre (ex: "todo / in-progress / done", "actif / archivé")

Question 4 : "Intégrer dans l'éditeur projet (barre rapide + panneau bas) ?"
             → Oui | Non
```

---

## Étape 2 — Planifier

Avant de coder, afficher la liste des fichiers qui vont être créés et modifiés, avec une ligne de description pour chacun. Attendre validation.

---

## Étape 3 — Implémenter (suivre la checklist dans l'ordre)

Suivre **exactement** la checklist de `docs/mega-outils.md`, phase par phase :

### Phase 1 — Modèles & données
- Ajouter les interfaces et le type dans `mega-outils.models.ts`

### Phase 2 — Backend
- Créer `data/mega-outils/{nom}/`
- Ajouter les routes dans `mega-outils.routes.js`
- Ajouter l'émission SSE `{nom}_update`

### Phase 3 — Service Angular
- Ajouter les méthodes dans `mega-outils.service.ts`
- Ajouter le Subject et le listener SSE dans `projet-collab.service.ts`

### Phase 4 — Composants
- Créer `{nom}-board.component.ts` (Inputs/Outputs obligatoires définis dans le cahier des charges)
- Créer `{nom}-admin.component.ts`
- Créer `{nom}-page.component.ts`
- Exporter depuis `libs/shared/ui/src/index.ts`

### Phase 5 — Intégration
- Ajouter la route `/{nom}` dans `app.routes.ts`
- Ajouter dans `AdminMegaOutilsComponent`
- Si intégré à l'éditeur : implémenter **toutes les spécifications générales A→H** ci-dessus dans `ProjetEditorZoneComponent` (+ wrapper `edition-outil` + `projet-editor` pour les outputs comme `open{Type}List`) :
  - marqueur ` ```TYPE: NOM ` + exclusion des headings internes des fences (A)
  - fichier physique `{type}-NOM` au contenu = bloc complet + affichage `XX: NOM` (B)
  - affichage selon mode Code/Structure/Preview (C)
  - barre MO tous modes + vue Liste + focus (D)
  - cycle de vie create/delete/corruption/orphelins (E)
  - sync bidirectionnelle + sync à l'ouverture (F)
  - verrou section `readonly` + cadenas jaune/rouge (G)
- `{type}-board.component` : prévoir `@Input() readonly` (bloque mutations + masque boutons) et `@Output() cardsChanged`/équivalent
- Popups du MO : pas de fermeture au backdrop (H)

### Phase 6 — Documentation & tests
- Ajouter la ligne dans le tableau "Méga-outils existants" de `docs/mega-outils.md`
- Créer `docs/structure/{nom}-board.component.md`
- Créer `docs/structure/{nom}-admin.component.md`
- Mettre à jour `tests/fonctions/` et `tests/fonctions/_registry.json`

---

## Étape 4 — Vérification

Après implémentation :
```bash
npx nx run-many --target=build --projects=portail,projets --no-progress 2>&1 | grep -E "(ERROR|error TS|✘|Failed)"
```
Aucune ligne = OK. Corriger si nécessaire.

---

## Étape 5 — Fin de prompt

Suivre le workflow standard : `histoModif.json` → `AskUserQuestion` validation → commit si OK.
