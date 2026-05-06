# AdminHelpComponent

## Fonctionnement général
Onglet de l'administration consacré à la gestion (CRUD complet) de la base de connaissances et de l'aide interactive de l'application. 

## Règles métier spécifiques
- **Validation** : Les rubriques d'aide doivent posséder au minimum un Titre et un Texte avant de pouvoir être créées ou modifiées.
- **Ouverture conditionnelle** : Si le composant reçoit un `editId` (soit à l'initialisation, soit via `ngOnChanges`), il tentera d'ouvrir automatiquement la modale d'édition pour la rubrique correspondante.
- **Sécurité des suppressions** : La suppression nécessite un processus en deux temps (affichage d'une confirmation visuelle `confirmDeleteHelp` avant l'appel API effectif).
- Les appels à l'API utilisent le header `Authorization: Bearer <token>` provenant du `AuthService`.

## Entrées
- `@Input() editId: number | null` : Permet d'ouvrir directement l'édition d'un item d'aide spécifique via son ID.

## Sorties
- `@Output() count = new EventEmitter<number>()` : Émet le nombre total de rubriques d'aide pour actualiser les badges de l'onglet parent.

## Dépendances
- `AuthService` : Utilisation pour le token JWT.
- Appels HTTP natifs (`fetch`) vers `/api/admin/help`.
- `WorgHelpTriggerComponent` : Intégration potentielle des triggers d'aide.

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Création** : Tenter de créer une aide avec des champs vides, vérifier que l'action s'interrompt. Remplir correctement, sauvegarder, puis vérifier son apparition dans la liste.
2. **Édition automatique** : Charger le composant avec `editId` renseigné, vérifier que la modale ou le panneau d'édition s'affiche pour ce dernier. Vérifier que la réaction au changement (ngOnChanges) fonctionne si l'`editId` est modifié à la volée.
3. **Modification** : Éditer un élément, modifier son titre, sauvegarder, et s'assurer que la liste reflète les modifications immédiatement.
4. **Suppression** : Cliquer sur supprimer (doit ouvrir une confirmation). Annuler (doit refermer sans supprimer). Cliquer puis confirmer (doit supprimer et mettre à jour la liste).