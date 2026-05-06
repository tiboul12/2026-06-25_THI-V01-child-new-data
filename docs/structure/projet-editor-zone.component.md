# Documentation du composant `ProjetEditorZoneComponent`

## Rôle Général
Le `ProjetEditorZoneComponent` est l'un des composants les plus denses du projet. C'est le bloc d'édition de texte central (Markdown) des documents d'un projet. Il assemble différents fichiers et sous-fichiers dans une représentation unifiée ("Unified Content"), gère la prévisualisation (HTML) et permet la réorganisation structurelle de l'arbre via un glisser-déposer intégré (style Notion).

## Règles Métier Spécifiques
- **Document Unifié (Unified Content)** : Le texte d'édition présenté à l'utilisateur est généré en fusionnant les nœuds de dossiers et de fichiers de l'arbre de fichier (`docSections`). 
- **Mode Focus** : Permet à l'utilisateur de "zoomer" sur un seul bloc de texte spécifique sans s'occuper de tout le fichier. Lors de la sortie du mode focus, le texte partiel est ré-injecté au bon endroit dans le contenu complet.
- **Surlignage et marqueurs** : Synchronisation entre le curseur du `textarea` et les nœuds ciblés ; identification et remplacement asynchrone des balises d'images locales par exemple `{{IMG:xxx}}`.
- **Drag & Drop** : Autorise le réordonnancement des sections (titres `#`) et des fichiers, ou le déplacement des images à travers des "poignées" de drag affichées dynamiquement dans la marge.
- **Sauvegarde retardée (Debounce)** : Les modifications utilisateur via le clavier sont interceptées avec un léger délai pour regrouper les appels de sauvegarde et recalculer les blocs.

## Entrées (Inputs)
- `@Input() files: FileNode[]` : Structure complète de l'arbre des fichiers du projet.
- `@Input() scrollToNodeId: string | null` : Demande explicite de faire défiler la vue vers un bloc particulier.
- `@Input() saveStatus: string` : État global de sauvegarde de l'application ('idle', 'saving', etc.).
- `@Input() projectName: string` : Nom du projet (pour la résolution des médias).
- `@Input() activeNodeId: string | null` : ID du nœud actuellement en cours de survol/travail dans d'autres fenêtres.

## Sorties (Outputs)
- `@Output() fileSave: EventEmitter<FileSaveEvent>` : Demande de sauvegarde manuelle.
- `@Output() sectionsChange: EventEmitter<SectionInfo[]>` : Remonte un changement profond dans l'arborescence ou le découpage du texte unifié.
- `@Output() nodeActive: EventEmitter<string>` : Signale qu'un utilisateur a posé son curseur sur la portion de texte liée à ce nœud.
- `@Output() refresh: EventEmitter<void>` : Signal global de rafraîchissement.
- `@Output() dragDrop: EventEmitter<DragDropEvent>` : Signale le réordonnancement via drag and drop visuel.

## Dépendances
- `ProjectFilesService` : Pour obtenir les URLs d'images, uploader de nouveaux médias et gérer des fichiers physiques.
- Librairie `marked` et `DomSanitizer`.
- Gestion Angular asynchrone (`NgZone` et `ChangeDetectorRef`) pour les événements rapides (souris, Drag).

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Assemblage Markdown :** Alimenter le composant avec 3 `FileNode` (dont des dossiers emboîtés). Vérifier que le texte unifié utilise les niveaux de titre Markdown corrects (`#`, `##`).
2. **Mode Focus :** Lancer `enterFocusMode` sur une poignée. Vérifier que seul le texte de la section apparait dans le textarea, puis appliquer des modifications et valider leur bonne réintégration lors de `exitFocusMode`.
3. **Upload & Parse d'image :** Simuler un événement d'upload d'image, vérifier que l'appel `svc.uploadImage` réussit et qu'un marqueur `{{IMG:...}}` est injecté au niveau du curseur.
4. **Debounce de la Sauvegarde :** Saisir du texte continuellement et vérifier que l'Output `sectionsChange` ne se déclenche que X ms après l'arrêt de la frappe.