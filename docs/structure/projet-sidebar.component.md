# Documentation du composant `ProjetSidebarComponent`

## Rôle Général
Le `ProjetSidebarComponent` est la barre de navigation latérale de l'arborescence des fichiers du projet. Elle permet de visualiser la hiérarchie en mode "arbre", d'étendre/réduire des dossiers, et offre des outils d'édition rapides (Créer, Renommer, Supprimer, Déplacer).

## Règles Métier Spécifiques
- **Expansion automatique** : Le système détermine de manière récursive la hiérarchie parente d'un nœud spécifique (ex: quand on clique depuis la zone d'édition) pour auto-déplier (`expand`) l'arborescence jusqu'au fichier cible (`activeFileId`).
- **Drag & Drop** : Permet de déplacer des nœuds (fichiers ou dossiers) entre différents parents. La position cible (avant, après, à l'intérieur) est calculée en fonction de la position `Y` relative de la souris sur l'élément (tiers supérieur, centre, tiers inférieur).
- **Menu Contextuel** : Un clic droit (`onContextMenu`) sur un élément bloque le comportement par défaut et propose des fonctions d'inline editing : création de dossier, fichier et renommage.
- **Surveillance de discussions** : Croisement asynchrone des IDs des fichiers avec l'historique du `ConversationService` pour afficher une indication visuelle (pastille) si une conversation existe sur le nœud.

## Entrées (Inputs)
- `@Input() projectName: string` : Clé identifiante du projet.
- `@Input() projectTitle: string` : Titre lisible du projet affiché en entête de la sidebar.
- `@Input() files: FileNode[]` : L'arbre arborescent complet.
- `@Input() activeFileId: string | null` : L'élément actuellement sélectionné.

## Sorties (Outputs)
- `@Output() fileSelect: EventEmitter<FileNode>` : Lorsqu'un fichier est cliqué pour lecture.
- `@Output() folderCreated: EventEmitter<...>` : Lorsqu'un dossier est formellement validé via inline input.
- `@Output() refresh: EventEmitter<void>` : Action critique nécessitant un rafraîchissement.
- `@Output() dragDrop: EventEmitter<DragDropEvent>` : Evénement structurel pour déplacer un noeud dans l'arborescence globale.

## Dépendances
- `ProjectFilesService` : Fonctions pour agir sur le système de fichiers (rename, create, delete).
- `ConversationService` : Pour obtenir la présence ou non d'un historique de message.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Auto-déploiement :** Fournir une structure arborescente profonde et setter `activeFileId` à un identifiant lointain. Valider que les signaux d'`expanded` contiennent bien les IDs de tous les nœuds parents.
2. **Interaction Contextuelle :** Déclencher un clic droit sur un nœud. Vérifier que la variable `contextMenu` n'est pas nulle, puis simuler la sélection de l'option de renommage et valider que `inlineInput` s'affiche avec l'ancienne valeur sans extension `.md`.
3. **Logique de Drag & Drop :** Simuler un déplacement `onDragOver` sur le dernier quart bas de la boîte englobante d'un dossier cible, puis vérifier que `dragPos` est évalué à `'after'` et non `'inside'`.