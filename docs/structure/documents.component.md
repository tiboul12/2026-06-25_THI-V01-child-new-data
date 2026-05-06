# Documentation du composant `DocumentsComponent`

## Rôle Général
Le `DocumentsComponent` est le gestionnaire de la base documentaire de l'application. Il permet de lister, de créer, de modifier et de supprimer des "Catégories" ainsi que des "Documents" liés à ces catégories, en utilisant un éditeur Markdown.

## Règles Métier Spécifiques
- **Structure tabulaire** : L'interface est divisée en deux onglets principaux (Catégories et Documents) gérés par les paramètres d'URL (query params).
- **Règles d'autorisation** : Pour éditer ou supprimer une catégorie ou un document, l'utilisateur doit en être le créateur (via `currentUser?.id`) ou avoir le rôle `'admin'` (`canEditCategory` / `canEditDocument`).
- **Historisation (WoActionHistory)** : Toutes les actions de mutation (création, mise à jour, suppression) sont tracées et historisées pour permettre un éventuel `Undo`.
- **Routage persistant** : Changer d'onglet met à jour l'URL sans recharger la page pour préserver l'état de l'utilisateur.

## Entrées (Inputs)
Aucun.

## Sorties (Outputs)
Aucun.

## Dépendances
- `AuthService` : Pour obtenir le profil de l'utilisateur connecté et générer les headers d'authentification (`Bearer`).
- `Router` & `ActivatedRoute` : Pour gérer l'onglet actif dans l'URL.
- `WoActionHistoryService` : Pour sauvegarder l'historique d'actions.
- `MarkdownEditorComponent` : Pour la saisie riche de texte dans les documents.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Création d'une catégorie :** Ouvrir le formulaire, entrer un nom, sauvegarder. Vérifier qu'une requête POST est émise, puis qu'un appel pour recharger les catégories est effectué.
2. **Droits de suppression :** Vérifier que le bouton de suppression d'un document n'apparaît pas ou est désactivé si l'utilisateur courant n'est ni admin ni créateur du document en question.
3. **Mise à jour d'un document :** Modifier le titre d'un document, valider, puis vérifier que `WoActionHistoryService.track()` a bien été appelé avec l'ancien et le nouveau titre en `beforeState` / `afterState`.