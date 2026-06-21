# Projet/edition/titre

<!-- worganic:meta updatedAt="2026-06-21T17:40:05.966Z" updatedBy="Antigravity CLI (agy) / Gemini 3 Pro" -->

---

## `2-5-2-12-1` — Création standard de titre et de section en fin de zone active

- Ouvrir la boîte de dialogue de création de titre (H1-H4) depuis la barre d'édition sans curseur positionné dans le texte.
- Saisir un titre valide dans la boîte de dialogue et valider.
- Vérifier qu'un dossier de section avec un folderId unique est créé en BDD.
- Vérifier qu'une ligne de heading markdown avec l'identifiant stable {{SID:folderId}} est insérée à la fin de la section active.
- Vérifier que le nouveau titre s'affiche correctement dans l'arborescence de structure et la zone d'édition.
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `libs/shared/ui/src/lib/editor/title-create-dialog.component.ts`

---

## `2-5-2-12-2` — Création de titre au curseur avec scission de section

- Positionner le curseur au milieu du texte d'une section existante.
- Ouvrir le dialogue de création de titre et saisir un nouveau titre.
- Valider la création : vérifier que la section est scindée au point exact du curseur.
- Vérifier que la partie supérieure du texte reste dans la section donneuse et que la partie inférieure bascule dans la nouvelle section.
- Vérifier que la section donneuse perd son statut dirty pour empêcher le doublement de texte au re-render.
- Vérifier le déclenchement d'une sauvegarde automatique immédiate.
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-12-3` — Création de sous-section à partir de l'arborescence structurelle

- Faire un clic droit ou cliquer sur le bouton d'ajout '+' d'un nœud structure existant.
- Vérifier que le niveau calculé est bridé à un maximum de H4 (niveau_parent + 1).
- Vérifier que le dialogue affiche le parent d'accueil correct.
- Confirmer la création d'un titre de sous-section.
- Vérifier que la ligne de heading est correctement insérée positionnellement après la section d'ancrage et que le re-parentage s'exécute de manière cohérente.
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-12-4` — Promotion et rétrogradation de niveau d'une section

- Sélectionner une section dans l'éditeur ou la structure et modifier son niveau (monter ou descendre).
- Vérifier que le préfixe de heading markdown est modifié (ajout ou retrait de '#' ) tout en préservant le marqueur {{SID}} de la section.
- Vérifier que monter d'un niveau (-1) rattache automatiquement les sections suivantes de niveau plus profond comme sous-sections (normalisation en cascade).
- Vérifier que descendre d'un niveau (+1) niche la section sous son frère précédent direct.
- Vérifier que l'action est bloquée si les limites de niveau (H1 à H4) ou l'absence de frère précédent l'empêchent.
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-12-5` — Suppression d'un titre avec fusion et conservation du contenu

- Déclencher la suppression du titre d'une section pour fusionner avec le dessus.
- Vérifier que la ligne de heading markdown est retirée.
- Vérifier que tout le texte de la section fusionnée remonte et s'intègre sans perte dans la section précédente.
- Vérifier que le dossier physique associé au titre supprimé est détruit en BDD.
- En mode focus, vérifier que la fusion applique le changement au document complet, sort du focus et retourne à la vue globale.
- Vérifier que la fusion est désactivée et impossible pour la toute première section du document.
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-2-12-6` — Renommage direct d'un titre de section

- Modifier le texte d'un titre directement en mode Édition via le champ contenteditable.
- Vérifier que le nouveau texte remplace l'ancien dans le heading markdown en préservant le marqueur {{SID:folderId}}.
- Vérifier qu'au blur ou à la sauvegarde, le nom du dossier physique correspondant est mis à jour en BDD pour correspondre au nouveau libellé.
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-12-7` — Filtrage contextuel des commandes de titre du Slash Menu

- Ouvrir le menu slash en tapant '/' dans une section de niveau H2.
- Vérifier que le menu ne propose pas H1 et H2, n'affichant que des niveaux de sous-sections autorisées (H3, H4).
- Vérifier dans une section H1 que seuls H2, H3 et H4 sont proposés.
- Valider qu'un clic sur une commande de titre filtrée ouvre correctement le popup pré-rempli au bon niveau.
- **Priorité:** mineur
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-2-12-8` — Contrôles et validation du dialogue TitleCreateDialog

- Cliquer sur le backdrop (fond noir transparent) et vérifier que le dialogue ne se ferme pas.
- Taper un titre vide ou composé uniquement d'espaces et cliquer sur Créer : vérifier le blocage de la soumission et l'affichage d'un message d'erreur.
- Vérifier que l'input a automatiquement le focus à l'ouverture.
- Vérifier que la touche Échap, le bouton Annuler ou la croix (✕) ferment le dialogue sans altérer le document.
- **Priorité:** mineur
- **Composants:** `libs/shared/ui/src/lib/editor/title-create-dialog.component.ts`
