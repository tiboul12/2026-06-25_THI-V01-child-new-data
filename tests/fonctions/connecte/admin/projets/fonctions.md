# Admin — Projets

## `2-1-6-1` — Liste et gestion des projets

- Affichage de tous les projets en tableau (titre, auteur, statut, date)
- Bouton rafraîchir la liste
- Ouverture d'un projet dans l'app Projets
- Modification du titre et du statut d'un projet
- Suppression d'un projet (confirmation inline)

## `2-1-6-2` — Instructions IA par projet (édition libre)

- Ouverture du panneau IA depuis le bouton `psychology` dans le tableau
- Saisie libre d'instructions système dans la textarea
- Indicateur de longueur et état actif/inactif
- Sauvegarde des instructions dans le champ `iaInstructions` du projet
- Effacement des instructions (champ vide = pas d'override)

## `2-1-6-3` — Bibliothèque d'instructions IA (depuis Documents)

- Accès via l'onglet "Instructions IA" dans Admin Projets
- Création automatique de la catégorie "Instructions IA" dans Documents si absente
- Affichage de tous les documents de la catégorie "Instructions IA"
- Prévisualisation tronquée du contenu (120 premiers caractères)
- Bouton "Gérer dans Documents" : navigation vers la page Documents
- Rafraîchissement de la liste
- État vide avec call-to-action vers la page Documents

## `2-1-6-4` — Application d'une instruction à un projet

- Bouton "Appliquer à un projet" par instruction dans la liste
- Modal de sélection du projet cible (dropdown)
- Confirmation → copie du `text` du document dans `iaInstructions` du projet
- Remplacement des instructions existantes du projet
- Fermeture automatique de la modal après succès

## `2-1-6-5` — Chargement d'une instruction dans la modale IA

- Bouton "Charger depuis la bibliothèque" dans la modale IA du projet
- Picker inline collapsible affichant les docs "Instructions IA"
- Chargement lazy (uniquement si aucun doc en cache)
- Sélection d'un doc → son contenu est chargé dans la textarea
- L'utilisateur peut modifier le contenu avant de sauvegarder
- Fermeture du picker après sélection
