# Éditeur › Outil Tests — Fonctions métier

Route : `/projets/:id` (connecté, outil de type `tests` actif)
Composant : `TestsOutilComponent`
Accès : utilisateur connecté, projet ouvert

---

## `2-5-2-9-1` — Onglet Cahier de recette

- **Affichage des catégories** : sections en colonne unique (sans sidebar), chaque section affiche ses tests dans un tableau
- **Tableau des tests** : colonnes N° | Action/Titre | URL | Criticité (badge) | Étapes | Actions (edit/delete au hover)
- **Filtre par criticité** : chips (Tous / Bloquant / Majeur / Mineur) au-dessus du tableau, avec compteur de résultats filtrés
- **Champ URL par test** : stocké dans `TestCase.url`, visible dans le tableau et cliquable, affiché dans l'exécution manuelle
- **Création de catégorie inline** : bouton "+ Catégorie" → champ input inline → validation Enter ou bouton OK
- **Renommage de catégorie** : icône crayon (hover header) → input inline dans le header, validation Enter/blur
- **Suppression de catégorie** : icône poubelle (hover header) → tests de la catégorie archivés
- **Drag & drop catégories** : poignée drag_indicator sur header → réordonne les catégories (indicateur visuel avant/après)
- **Ajout de test par catégorie** : bouton "+" dans le header de catégorie, ou clic sur "Ajouter un test" si catégorie vide → formulaire inline dans la catégorie
- **Ajout de test global** : formulaire inline avec radio catégorie
- **Formulaire test** : titre, description, URL, criticité (boutons radio), catégorie (boutons radio), étapes
- **Édition inline** : icône crayon → formulaire inline pré-rempli avec tous les champs
- **Archivage** : icône poubelle → test passe à `status: 'archived'` (non visible)
- **Drag & drop tests** : poignée drag_indicator → réordonne au sein d'une catégorie OU déplace vers une autre catégorie (drop sur header de catégorie)
- **Section "Sans catégorie"** : affiche les tests sans `categoryId` ou dont la catégorie a été supprimée
- **Génération depuis Édition** : bouton → ouvre un picker de sections (dossiers hiérarchiques du projet, indentés par profondeur)
- **Section sélectionnée** : titre affiché à droite du bouton + bouton ✕ pour réinitialiser
- **Génération IA** : activé quand une section est sélectionnée → envoie le contenu des .md de la section à Claude Haiku → retourne une liste de tests proposés
- **Panel propositions IA** : liste de tests avec cases à cocher (tous sélectionnés par défaut), badge criticité coloré, description + nombre d'étapes
- **Sélection des tests** : "Tout sélectionner / désélectionner" + bouton "Ajouter (N)" → crée ou réutilise une catégorie au nom de la section
- **Génération depuis Mockup** : bouton (désactivé si aucun mockup) → génère 1 test par board

## `2-5-2-9-2` — Onglet Exécution

- **Toggle Auto/Manuel** : bascule entre les deux modes d'exécution
- **Mode auto — champ URL** : saisie optionnelle d'une URL de preview pour test browser
- **Mode auto — lancement** : bouton "Lancer l'analyse IA" → stream SSE de résultats
- **Mode auto — progression** : barre de progression + compteur en temps réel
- **Mode auto — feed live** : résultats au fil de l'eau (pass/fail/pending) avec icônes colorées
- **Mode manuel — nom testeur** : champ obligatoire avant de démarrer
- **Mode manuel — démarrage** : bouton "Démarrer la campagne" → création du run côté serveur
- **Mode manuel — liste complète** : tous les tests du run affichés verticalement — complétés au-dessus (grisés, badge résultat), test actif au centre (carte active avec bordure primary), à venir en dessous (grisés à 30%)
- **Mode manuel — carte test** : affichage titre + description + URL cliquable + étapes + textarea notes + badge criticité coloré (bloquant=rouge vif, majeur=orange, mineur=jaune)
- **Mode manuel — validation** : boutons Passé / Échoué / Passer alignés à droite → passage au test suivant
- **Mode manuel — fin** : dernier test validé → message de fin

## `2-5-2-9-3` — Onglet Résultats (vue matrice)

- **Matrice tests × exécutions** : lignes = tests groupés par catégorie, colonnes = runs triés chronologiquement (plus ancien à gauche → plus récent à droite)
- **Colonne nom tests** : sticky à gauche, affiche le titre tronqué avec un point de criticité coloré (rouge bloquant, orange majeur, jaune mineur)
- **En-tête de colonne (run)** : date dd/MM HH:mm, mode (IA ou nom testeur), score global % coloré (vert ≥80%, orange ≥50%, rouge <50%)
- **Bouton supprimer run** : icône poubelle visible au hover de l'en-tête de colonne → suppression définitive
- **Ligne catégorie** : fond légèrement différencié, affiche le nom de la catégorie + score % par run (coloré selon seuils)
- **Cellule test × run** : OK (vert, pass), KO (rouge, fail), PASSE (orange, skip), · (grisé, pending), — (grisé, non inclus dans ce run)
- **Section "Sans catégorie"** : affiche les tests sans catégorie, avec les mêmes cellules
- **État vide** : message "Aucune campagne exécutée" si aucun run
