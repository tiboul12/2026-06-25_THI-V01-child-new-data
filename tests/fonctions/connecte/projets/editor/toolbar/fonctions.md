# Éditeur › Toolbar — Fonctions métier

<!-- worganic:meta updatedAt="2026-06-21T20:01:59.106Z" updatedBy="Antigravity CLI (agy) / Gemini 3 Pro" -->

---

## `2-5-2-3-1` — Navigation

- Retour : clic sur le bouton de retour de la toolbar appelle goBack() et navigue vers l'historique précédent via Location.back
- Retour Portail : le mini-header supérieur (worg-mini-header) fournit un lien retour direct vers le portail (environment.portailUrl)
- Home : clic sur le logo (icône rocket) redirige vers la route /home du portail
- Projets : clic sur le lien "Projets" dans le fil d'Ariane redirige vers la route /projets
- Breadcrumb : affichage du fil d'Ariane "Projets > {nom projet}" avec le nom du projet non éditable dans la toolbar
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-toolbar/projet-toolbar.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-toolbar/projet-toolbar.component.html`, `apps/projets/src/app/pages/projet-editor/projet-editor.component.html`

---

## `2-5-2-3-2` — Indicateurs de statut de sauvegarde

- Statut "Sauvegardé" (idle/saved) : badge vert avec icône check_circle affiché en bas de l'éditeur
- Statut "Non sauvegardé" (dirty) : badge orange cliquable avec icône save affiché en bas de l'éditeur
- Statut "Sauvegarde…" (saving) : message jaune avec icône animate-spin progress_activity affiché en bas de l'éditeur
- Statut "Erreur" (error) : message rouge avec icône error affiché en bas de l'éditeur
- Clic sur "Non sauvegardé" : déclenche forceSave() qui déplie les sections (unfoldAll()) et effectue une sauvegarde immédiate (saveAll())
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-3` — Badges de backup et état de synchronisation

- Backup FTP - Inactif (idle) : affichage du badge cyan simple "FTP" en bas de l'éditeur
- Backup FTP - En cours (syncing) : affichage du badge bleu animé "Sync FTP X/Y" avec progression en pourcentage et spinner tournant
- Backup FTP - Terminé (done) : affichage du badge cyan "FTP à jour" avec icône dns
- Backup FTP - Erreur (error) : affichage du badge rouge "FTP — erreur sync" avec icône dns
- Backup GitHub : affichage du badge violet "GitHub" avec icône code si configuré
- Backup GitLab : affichage du badge orange "GitLab" avec icône merge si configuré
- Backup Google Drive : affichage du badge vert "Drive" avec icône add_to_drive si configuré
- Aucun backup : pas de badge affiché
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-4` — Onglets de mode d'édition

- Mode Code : clic sur l'onglet "Code" (<> Code) passe au mode 'edit' affichant la zone textarea Markdown
- Mode Structure : clic sur l'onglet "Structure" (arborescence) passe au mode 'structure' affichant la structure hiérarchique
- Mode Edition : clic sur l'onglet "Edition" (mode WYSIWYG) passe au mode 'visu' affichant le contenu HTML éditable en ligne
- Onglet actif : l'onglet correspondant au mode courant est mis en surbrillance avec la classe ed-mode-tab--active
- Toggle de vue (Mode Code) : bouton "Markdown propre / Avec style" à droite de la barre d'onglets permet de basculer la vue et d'activer showCssInCode()
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-5` — [modification] Barre de formatage (mode Code, vue stylisée)

- Affichage conditionnel : la barre de formatage est visible uniquement en mode Code lorsque showCssInCode() est activé
- Style de base : boutons Gras (**texte**), Italique (*texte*), Souligné (<u>texte</u>), Barré (~~texte~~) insèrent les marqueurs correspondants au curseur
- Menu Titres : menu déroulant permet d'insérer un paragraphe ou des titres de niveau H1 à H4 (\n# à \n####)
- Listes et blockquote : boutons insèrent les marqueurs de liste à puces (-), liste ordonnée (1.), cases à cocher (- [ ]), citation (>), ou bloc de code ()
- Lien et Image : boutons insèrent un lien markdown via popup codeLink() et ouvrent le téléversement d'image via triggerImageUpload()
- Mise en forme HTML : boutons insèrent les balises HTML d'alignement style="text-align:...", de taille style="font-size:...", de couleur style="color:..." ou surlignage style="background:..."
- Effacer la mise en forme : bouton codeClearFormat() nettoie les marqueurs Markdown/HTML de la sélection
- Extras Code (droite) : boutons pour insérer un bloc de code vide, un tableau markdown 2x2, ou un séparateur horizontal (---)
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-11` — Ouverture du dossier local de section

- Visibilité : bouton "Dossier" visible dans tous les modes à droite de la barre d'onglets de l'éditeur
- Clic bouton : appelle openSectionFolder() qui identifie la section active (ou ancre courante) et appelle le service ProjectFilesService
- Requête API : envoi d'une requête POST /api/file-projects/:name/open-folder avec le folderId résolu par safeProjectPath
- Ouverture OS : le serveur ouvre le dossier dans l'explorateur natif (explorer.exe / open / xdg-open)
- Gestion d'erreur : retour du code HTTP 404 avec message d'erreur si la section n'est pas clonée localement
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `libs/portail-core/data-access/src/lib/project-files.service.ts`, `server/server-data.js`

---

## `2-5-2-3-6` — Bandeau de modifications en attente (Collaboration)

- Modifications Code (mode Code) : si showCodePublishBar ou showCrossModePendingBar est vrai, affiche une alerte statique signalant les modifications en cours sans bouton d'action
- Modifications Structure (mode Structure) : si structureHasPending() est vrai, affiche une alerte avec les boutons "Annuler" et "Partager mes modifications"
- Clic Annuler Structure : restaure l'état structurel précédent via cancelStructureEdit()
- Clic Partager Structure : publie les changements de structure au serveur via publishStructureEdit() et broadcast SSE
- Mode Preview : aucun bandeau n'est affiché (les actions d'annulation ou de partage de modifications de preview sont déportées sur la sidebar)
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-7` — Indicateurs d'état et surcouches visuelles

- Surbrillance mode actif : onglet correspondant surligné en haut
- Indicateurs de sauvegarde en bas de page : badge vert (Saved), badge orange (Dirty), badge jaune avec spinner (Saving), rouge (Error)
- Indicateurs FTP en bas de page : bleu animé (Syncing), cyan (Done), rouge (Error), cyan simple (Idle)
- Bandeau pending : fond bleu/violet pour modifications locales en attente en bas de l'éditeur
- Overlay de publication : écran de blocage flou avec spinner jaune progress_activity lors de la publication/téléversement d'image
- **Priorité:** mineur
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-8` — Barre Mega-outils

- Onglets de types de Mega-outils : affichage de trois boutons interactifs pour Trello (bleu), Mockup (violet) et Tableau (lime, qui correspond à Array)
- Compteur d'instances : affiche le nombre d'instances actives pour chaque type de Mega-outil à côté de leur nom
- Liste d'instances : cliquer sur un type de Mega-outil affiche horizontalement la liste scrollable des instances de ce type
- Sélection d'instance : clic sur une instance de Mega-outil émet megaOutilSelect et navigue vers la section ou fichier où elle est intégrée (trelloNavigate)
- Clic "Nouveau" : ouvre la popup de création pour le type d'outil sélectionné (Trello, Tableau ou Mockup)
- Clic "Liaison" (Mockup uniquement) : ouvre la popup permettant d'associer un Mockup existant à la section courante
- Interrupteur "Sync auto" (Trello uniquement) : active/désactive la synchronisation automatique des cartes de colonne Trello dans le code markdown
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-9` — [modification] Menus déroulants de la barre de formatage (mode Preview)

- Style de bloc : menu déroulant (icône title) propose Paragraphe (applyVisuFormat avec formatBlock et P) et les titres H1 à H4
- Couleur de texte : menu déroulant Swatch (lettre A soulignée) propose la palette de couleurs pastilles (foreColor)
- Surlignage : menu déroulant Swatch (icône highlighter) propose la palette de couleurs de fond pastilles (hiliteColor)
- Comportement d'ouverture/fermeture : ouverture via mousedown avec preventDefault pour conserver la sélection de texte courante, fermeture au clic extérieur
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-10` — Création de section au point de coupe du curseur

- Déclenchement : en mode Preview (Edition), sélectionner H1 à H4 dans le style de bloc ou via slash command ouvre le dialogue de création de titre
- Calcul du point de coupe : computeVisuCursorInsertLine() identifie le bloc sous le curseur et calcule la ligne d'insertion exacte dans le contenu direct
- Dialogue worg-title-create-dialog : affiche le titre prérempli (texte sélectionné) et le parent de section calculé selon la hiérarchie du niveau
- Insertion : confirmation du dialogue appelle createTitleSection() qui insère un heading markdown avec le niveau (ex: ### Titre) à la ligne d'insertion
- Réorganisation parent : le parent exécute processSectionsChange, crée le dossier physique, réorganise l'ordre et re-parente les sous-sections
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-12` — Création de Mega-outil via popup

- Nouveau Trello : clic sur "Nouveau" en mode Trello ouvre showTrelloPopup, saisie du nom, création et insertion du marqueur [trello:nom]
- Nouveau Tableau (Array) : clic sur "Nouveau" en mode Tableau ouvre showArrayPopup, saisie du nom, création et insertion du marqueur de tableau
- Nouveau Mockup : clic sur "Nouveau" en mode Mockup ouvre showMockupPopup, validation du nom unique, création et insertion du marqueur {{MOCKUP:id}}
- Liaison Mockup : clic sur "Liaison" ouvre la popup de sélection des mockups du projet, clic sur un mockup existant insère sa liaison
- Validation des formulaires : vérification de la non-vacuité du nom et gestion d'erreurs d'unicité (ex: mockupNameError)
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-13` — Import et insertion de fichiers d'images

- Déclenchement : clic sur le bouton image de la barre de formatage appelle triggerImageUpload(), mémorisant le dossier actif et activant l'input file caché
- Validation fichier : vérification du format (jpeg, png, gif, webp, svg, bmp) et de la taille maximale autorisée (1 Mo) avec message imageUploadError si invalide
- Import serveur : envoi du fichier au serveur via le service uploadImage et ajout du nœud d'image à allImages
- Insertion automatique : insère le marqueur {{IMG:nodeId}} à l'emplacement du curseur dans le document unifié
- Historique & sauvegarde : enregistrement de l'action dans l'historique d'annulation (woHistory.track), exécution immédiate de saveAll() et passage en état localDirty = true
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `libs/portail-core/data-access/src/lib/project-files.service.ts`

---

## `2-5-2-3-14` — Sécurité FTP - Avertissement de désynchronisation

- Condition : si isActiveSectionUnsynced est vrai (la section active est en cours de synchronisation avec le serveur FTP distant)
- Affichage : affiche une bannière d'information bleue en haut de la zone d'édition "Synchronisation FTP en cours — lecture seule jusqu'à la mise à jour"
- Blocage de saisie : les zones d'éditions du corps de section et les boutons d'action d'édition/formatage sont verrouillés
- **Priorité:** bloquant
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-15` — Menu contextuel et modification des liens hypertextes (mode Preview)

- Détection : le focus ou le clic sur un lien hypertexte dans une section éditable en mode Preview ouvre le menu flottant visuLinkMenu
- Actions du menu : propose de suivre le lien dans un nouvel onglet, de modifier le lien, ou de le supprimer
- Popup d'édition : modifier le lien ouvre showLinkEditPopup, permet de saisir la nouvelle URL et met à jour l'attribut href du lien sur validation
- Suppression de lien : l'action supprimer retire la balise lien <a> tout en conservant son contenu textuel brut
- **Priorité:** critique
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`

---

## `2-5-2-3-16` — Raccourcis clavier par commande Slash (mode Preview)

- Détection de saisie : en mode Preview, taper le caractère "/" dans un élément de texte éditable déclenche detectVisuSlash()
- Menu de suggestions : affiche à la position du curseur le menu d'insertion flottant worg-slash-command-menu
- Filtrage de commandes : la liste des commandes suggérées est dynamiquement filtrée selon la saisie de l'utilisateur (visuSlash.query)
- Sélection au clavier : flèches Haut/Bas pour naviguer entre les commandes, Échap pour fermer, Entrée pour valider
- Insertion et nettoyage : la validation supprime automatiquement le "/" saisi et insère le bloc ou le formatage correspondant (ex: note info, tableau 2x2, mockup, trello, citation)
- **Priorité:** mineur
- **Composants:** `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.ts`, `apps/projets/src/app/pages/projet-editor/components/projet-editor-zone/projet-editor-zone.component.html`, `apps/projets/src/app/pages/projet-editor/components/slash-command-menu/slash-command-menu.component.ts`
