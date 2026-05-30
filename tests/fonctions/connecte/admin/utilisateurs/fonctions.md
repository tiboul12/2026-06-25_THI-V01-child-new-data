# Admin › Utilisateurs — Fonctions métier

Route : `/admin` onglet "Utilisateurs"  
Composant : `AdminUsersComponent`  
Accès : admin uniquement

---

## `2-1-4-1` — Chargement

- **Liste des utilisateurs** : GET `/api/auth/users` au chargement de l'onglet
- **État chargement** : indicateur spinner pendant la requête
- **État erreur** : message si la requête échoue

---

## `2-1-4-2` — Affichage liste

- **Colonnes affichées** : username, email, rôle (admin/user), date de création, dernière connexion
- **Indicateur "connexion ancienne"** : badge si `lastLogin` > 5 jours
- **Format date** : locale `fr-FR` (JJ/MM/AAAA HH:MM)
- **Compteur** : nombre total d'utilisateurs affiché dans le badge de l'onglet

---

## `2-1-4-3` — Création d'un utilisateur

- **Ouverture modal** : clic bouton "Nouvel utilisateur" → `openNewUserModal()`
- **Champs** : username (requis), email (requis, format email), mot de passe (requis), rôle (user|admin)
- **Validation** : tous les champs requis, email unique
- **Soumission** : POST `/api/auth/register` puis si rôle admin : PUT `/api/auth/users/{id}` `{ role: 'admin' }`
- **Succès** : modal fermée, liste rechargée, action tracée dans WoActionHistory
- **Erreur** : message d'erreur dans la modal

---

## `2-1-4-4` — Édition d'un utilisateur

- **Ouverture** : clic "Modifier" sur une ligne → `openEditUser(user)` → populate le formulaire
- **Champs modifiables** : username, email, rôle, mot de passe (optionnel)
- **Soumission** : PUT `/api/auth/users/{id}`
- **Succès** : modal fermée, liste rechargée, action tracée dans WoActionHistory
- **Erreur** : message dans la modal

---

## `2-1-4-5` — Suppression d'un utilisateur

- **Déclenchement** : clic "Supprimer" → `confirmDeleteUser(id)` → modal de confirmation
- **Confirmation** : message "Êtes-vous sûr ?" avec bouton confirmer
- **Suppression** : DELETE `/api/auth/users/{id}`
- **Succès** : liste rechargée, action tracée dans WoActionHistory
- **Règle** : impossible de supprimer son propre compte

---

## `2-1-4-6` — États

| État | Description |
|------|-------------|
| Chargement | Spinner, liste masquée |
| Erreur chargement | Message d'erreur, bouton réessayer |
| Liste vide | Message "Aucun utilisateur" |
| Modal création ouverte | Formulaire visible |
| Modal édition ouverte | Formulaire pré-rempli |
| Modal suppression | Confirmation requise |
| Sauvegarde en cours | Bouton désactivé |
