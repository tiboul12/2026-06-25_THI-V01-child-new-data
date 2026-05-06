# AdminUsersComponent

## Fonctionnement général
Gère l'administration des utilisateurs de la plateforme (CRUD). Permet de lister les comptes, d'ajouter de nouveaux utilisateurs, de modifier leurs informations/rôles et de supprimer des comptes.

## Règles métier spécifiques
- **Gestion des rôles** : Les utilisateurs peuvent avoir le rôle 'user' ou 'admin'. Si on crée un administrateur, le composant exécute une seconde requête API pour promouvoir immédiatement le nouvel inscrit.
- **Suivi des actions (Historique)** : Toutes les actions d'écriture (création, modification, suppression d'un compte) déclenchent un appel au `WoActionHistoryService`. Cela laisse une trace d'audit.
- **Annulation (Undo)** : Les créations et les modifications d'utilisateurs génèrent un historique *annulable* (`undoable: true`) en fournissant l'état précédent ou la méthode pour annuler l'action. La suppression est tracée mais non annulable.
- **Alerte d'inactivité** : Signale visuellement via `isLoginOld()` si la date de dernière connexion d'un utilisateur remonte à plus de 5 jours.

## Entrées
Aucune.

## Sorties
- `@Output() count = new EventEmitter<number>()` : Notifie le composant parent du nombre total d'utilisateurs récupérés.

## Dépendances
- `AuthService` : Pour les requêtes d'ajout, de mise à jour, et de liste d'utilisateurs.
- `WoActionHistoryService` : Pour l'enregistrement des modifications dans le journal d'actions.
- Appels à l'API `/api/auth/register` (fetch direct).

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Création avec rôle Admin** : Créer un utilisateur et choisir le rôle admin. S'assurer qu'il s'inscrit bien puis qu'il obtient bien le rôle désiré dans la liste rafraîchie, et vérifier qu'une trace historique a été émise.
2. **Édition (Annulable)** : Modifier le nom d'un utilisateur existant. Vérifier que la modification est enregistrée.
3. **Suppression avec historique** : Supprimer un utilisateur, vérifier que la confirmation est demandée, que l'utilisateur disparaît et qu'un événement *non annulable* est envoyé dans l'historique.
4. **Validation des champs** : Essayer de créer un utilisateur sans mot de passe, vérifier que l'action est empêchée.