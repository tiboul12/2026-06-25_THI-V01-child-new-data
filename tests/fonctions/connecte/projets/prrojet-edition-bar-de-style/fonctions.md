# Prrojet/Edition/bar de style

<!-- worganic:meta updatedAt="2026-06-21T20:09:06.166Z" updatedBy="Antigravity CLI (agy) / Gemini 3 Pro" -->

---

## `2-5-3-1` — [modification] Mise en forme du texte en mode Visu (Édition Visuelle)

- Sélectionner du texte en mode Visu (contenteditable) et cliquer sur les boutons de style de caractère : Gras (B), Italique (I), Souligné (U) ou Barré (S)
- Vérifier l'application correcte du format (balises HTML <b>, <i>, <u>, <s> ou styles sémantiques équivalents)
- Vérifier que l'état d'activation des boutons de la barre de style reflète la mise en forme du texte sous le curseur
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-2` — [modification] Mise en forme du texte en mode Code (Édition Markdown/HTML)

- Cliquer sur un bouton de style ("Gras", "Italique", "Souligné", "Barré") sans sélection textuelle : vérifier l'insertion des marqueurs Markdown/HTML correspondants et l'activation du mode collant (bouton allumé)
- Sélectionner du texte dans le textarea et appliquer un style : vérifier que la sélection est entourée des marqueurs appropriés (`**`, `*`, `<u>`, `~~`)
- Tester le nettoyage de formatage via le bouton d'effacement de la mise en forme sur la sélection
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-3` — [modification] Insertion de titres et création de sections

- Ouvrir le menu déroulant des titres de bloc dans les deux modes (Visu et Code)
- En mode Visu, sélectionner un niveau de titre (H1 à H4) : valider l'ouverture du dialogue de création de titre/section avec le texte pré-rempli
- Valider la création effective du titre en vérifiant que la section parente est correctement scindée à l'emplacement du curseur et qu'un nouveau dossier physique est créé
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-4` — [modification] Insertion de listes, checklists et citations

- Cliquer sur les boutons d'insertion de liste à puces ou numérotée : valider la structure générée dans les deux modes
- Tester l'insertion de case à cocher (Checklist) : vérifier la création de la liste de tâches (`- [ ] Tâche` en markdown / HTML interactif)
- Tester l'insertion de citations (Blockquote) et vérifier le rendu
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-5` — [modification] Insertion et actions sur les liens hypertexte

- Insérer un lien hypertexte sur le texte sélectionné en saisissant une URL dans l'invite
- En mode Visu, cliquer sur un lien existant pour faire apparaître le menu d'actions contextuel : vérifier l'ouverture du lien dans un nouvel onglet, l'édition de l'URL via le popup d'édition stylisé, et la suppression du lien avec conservation du texte
- En mode Code, vérifier l'insertion de la syntaxe markdown du lien
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-6` — [modification] Importation et insertion d'images

- Cliquer sur le bouton d'insertion d'image pour ouvrir le sélecteur de fichiers de l'OS
- Tester les restrictions d'upload d'images : valider que les formats autorisés sont acceptés (Jpeg, Png, Gif, Webp, Svg, Bmp) et rejeter les fichiers > 1 Mo avec un message d'erreur
- Vérifier l'insertion de l'image (génération du marqueur `{{IMG:id}}` et de la figure DOM) et la persistance immédiate de la section
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-7` — [modification] Alignement, taille, couleurs et surlignage

- Tester l'application des alignements (gauche, centré, droite) sur la sélection
- Tester la modification de la taille du texte (Petit/Grand) via la barre de style
- Ouvrir les menus déroulants de couleur de texte et de surlignage : sélectionner une pastille et valider l'application immédiate du style CSS inline
- Tester le bouton d'effacement de mise en forme globale sur la sélection
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-8` — [modification] Historique d'édition (Undo / Redo)

- Tester les boutons Annuler et Refaire de la barre de style dans les deux modes (Visu et Code)
- Valider la préservation de la position du curseur et de la sélection après un undo/redo
- S'assurer de la synchronisation de l'état actif des styles de la barre de style avec l'état restauré
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-9` — [modification] Insertion d'extras en mode Code

- Tester l'insertion d'un bloc de code ()
- Tester l'insertion d'un tableau markdown structuré
- Tester l'insertion d'un séparateur horizontal (---)
- **Priorité:** mineur
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`

---

## `2-5-3-10` — Slash commands et menu d'insertion rapide

- Taper `/` dans une section contenteditable en mode Visu : vérifier le déclenchement du menu Slash
- S'assurer que le menu Slash filtre les niveaux de titre pour ne proposer que des sous-sections de niveau inférieur à la section courante
- Utiliser le bouton de menu d'insertion rapide pour insérer directement un Nouveau titre, Nouveau document ou Bloc de code
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/slash-command-menu/slash-command-menu.component.ts`
