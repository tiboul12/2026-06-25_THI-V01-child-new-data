# Commande : /nouveau-mega-outil

## Instructions pour Claude

Tu vas créer un nouveau méga-outil. Avant toute chose :

1. **Lire `docs/mega-outils.md`** — c'est la source de vérité. Ne pas improviser en dehors du pattern défini.
2. **Lire les fichiers existants** à modifier (`mega-outils.models.ts`, `mega-outils.service.ts`, `mega-outils.routes.js`, `AdminMegaOutilsComponent`, `ProjetEditorZoneComponent`) pour comprendre l'état actuel avant d'ajouter quoi que ce soit.

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
- Si demandé : barre d'accès rapide + panneau bas dans `ProjetEditorZoneComponent`
- Si demandé : regex marqueur + masquage mirror

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
