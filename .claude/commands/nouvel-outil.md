# Commande : /nouvel-outil

## Instructions pour Claude

Tu vas créer un nouvel outil projet. Avant toute chose :

1. **Lire `docs/outils.md`** — c'est la source de vérité. Ne pas improviser en dehors du pattern défini.
2. **Lire `apps/projets/src/app/pages/projet-editor/outils/edition/edition-outil.component.ts`** — c'est la référence à reproduire (Inputs/Outputs, structure).
3. **Lire `apps/projets/src/app/pages/projet-editor/projet-editor.component.html`** et `projet-editor.component.ts` pour voir comment edition est intégré.
4. **Lire `apps/projets/src/app/pages/projet-editor/components/projet-sidebar/projet-sidebar.component.html`** pour voir les boutons existants.

---

## Étape 1 — Recueillir les informations

Poser ces questions via `AskUserQuestion` (en une seule fois) :

```
Question 1 : "Nom de l'outil ?"
             → Texte libre (ex: Tests, Code, Preview)

Question 2 : "Quel est le rôle de cet outil dans l'éditeur ?"
             → Description courte (ex: "exécuter et visualiser des tests", "éditer du code avec coloration syntaxique")

Question 3 : "L'outil gère-t-il ses propres fichiers ou hérite de ceux du projet ?"
             → Hérite des fichiers projet (rootFolderIds) | Gère ses propres données

Question 4 : "Quelle icône Material Symbols ? (ex: science, code, preview)"
             → Texte libre
```

---

## Étape 2 — Planifier

Afficher la liste des fichiers qui vont être créés et modifiés avec une ligne de description pour chacun. Attendre validation.

---

## Étape 3 — Implémenter (suivre la checklist dans l'ordre)

Suivre **exactement** la checklist de `docs/outils.md`, phase par phase :

### Phase 1 — Modèle
- Ajouter `'{nom}'` dans l'union `Outil.type` dans `project-files.service.ts`

### Phase 2 — Composant
- Créer `outils/{nom}/{nom}-outil.component.ts`
- Tous les Inputs/Outputs obligatoires définis dans le cahier des charges
- Laisser la logique interne fonctionnelle mais minimaliste (peut afficher les fichiers reçus)
- Calquer la structure sur `edition-outil.component.ts`

### Phase 3 — Intégration éditeur
- Importer dans `projet-editor.component.ts`
- Ajouter le bloc `@if (activeOutil()?.type === '{nom}')` dans le template
- Câbler tous les Inputs et Outputs

### Phase 4 — Sidebar
- Activer le bouton dans `projet-sidebar.component.html`
- Retirer `disabled` + le label "bientôt" si présent

### Phase 5 — Documentation & tests
- Ajouter la ligne dans le tableau "Outils existants" de `docs/outils.md`
- Créer `docs/structure/{nom}-outil.component.md`
- Mettre à jour `tests/fonctions/` et `tests/fonctions/_registry.json`

---

## Étape 4 — Vérification

```bash
npx nx run-many --target=build --projects=portail,projets --no-progress 2>&1 | grep -E "(ERROR|error TS|✘|Failed)"
```
Aucune ligne = OK. Corriger si nécessaire.

---

## Étape 5 — Fin de prompt

Suivre le workflow standard : `histoModif.json` → `AskUserQuestion` validation → commit si OK.
