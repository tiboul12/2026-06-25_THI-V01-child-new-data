# Éditeur › Commentaires (F6) — Fonctions métier

Composant : `CommentsDrawerComponent`  
Raccourci : F6 (ou clic bouton bulle sur une section en mode Preview)  
Contexte : lié à une section spécifique (`folderId`)

---

## `2-5-2-1-1` — Ouverture du drawer

- **Via F6** : raccourci clavier → ouvre le drawer pour la section active
- **Via bouton bulle** (mode Preview) : clic sur l'icône commentaires d'une section → `commentRequest.emit({ folderId, folderName })`
- **Parent** : `ProjetEditorComponent` → `commentsDrawer.set({ visible: true, folderId, folderName })`
- **Fermeture** : clic bouton × ou F6 à nouveau → `commentsDrawer.update(d => ({ ...d, visible: false }))`

---

## `2-5-2-1-2` — Chargement des commentaires

- **Requête** : GET `/api/file-projects/{name}/comments/{folderId}` au montage ou changement de folderId
- **Tri** : chronologique (plus ancien en premier)
- **Compteurs** : `commentCounts[folderId]` → affiché comme badge sur le bouton bulle dans la section

---

## `2-5-2-1-3` — Affichage

- **En-tête** : nom de la section (`folderName`)
- **Commentaires** : liste avec auteur, texte, date (format `JJ/MM/AAAA HH:MM`)
- **Propres commentaires** : bouton de suppression visible
- **Commentaires d'autres utilisateurs** : pas de bouton suppression (sauf admin)

---

## `2-5-2-1-4` — Ajout d'un commentaire

- **Saisie** : textarea en bas du drawer
- **Envoi** : Enter (Shift+Enter = nouvelle ligne) ou bouton envoyer
- **Requête** : POST `/api/file-projects/{name}/comments { folderId, text }`
- **Résultat** : commentaire ajouté en bas de la liste, compteur incrémenté
- **Validation** : texte non vide requis

---

## `2-5-2-1-5` — Suppression d'un commentaire

- **Déclenchement** : clic bouton × sur son commentaire
- **Confirmation** : inline (pas de modal)
- **Requête** : DELETE `/api/file-projects/{name}/comments/{commentId}`
- **Résultat** : commentaire retiré de la liste, compteur décrémenté

---

## `2-5-2-1-6` — Synchronisation temps réel

- **WebSocket** : nouvelles entrées de commentaires reçues via `ProjetCollabService`
- **Mise à jour live** : drawer rechargé si ouvert sur la même section

---

## `2-5-2-1-7` — États

| État | Description |
|------|-------------|
| Drawer fermé | Boutons bulles visibles au hover des sections |
| Drawer ouvert | Panneau droit visible |
| Chargement | Spinner |
| Aucun commentaire | Message "Aucun commentaire" |
| Commentaires chargés | Liste visible |
| Envoi en cours | Input désactivé, spinner |
| Badge sur section | Nombre de commentaires si > 0 |
