# Landing — Fonctions métier

Route : `/` (public, redirige vers `/home` si déjà connecté)

---

## `1-1-1` — Accès et navigation

- **Affichage page publique** : la landing est accessible sans authentification
- **Redirection automatique** : si l'utilisateur est déjà connecté (token valide en localStorage), redirection vers `/home`
- **Lien vers connexion** : accès au formulaire de login

---

## `1-1-2` — Formulaire de connexion

- **Saisie email** : champ texte, validation format email
- **Saisie mot de passe** : champ masqué
- **Soumission** : POST `/api/auth/login` avec `{ email, password }`
- **Succès** : token JWT stocké dans `localStorage` (clé `frankenstein_token`), redirection vers `/home`
- **Erreur identifiants** : affichage message d'erreur inline
- **État chargement** : bouton désactivé pendant la requête

---

## `1-1-3` — États de la page

| État | Description |
|------|-------------|
| Non connecté | Affichage normal de la landing |
| Déjà connecté | Redirection immédiate vers `/home` |
| Erreur connexion | Message d'erreur visible sous le formulaire |
| Chargement | Spinner / bouton désactivé |
