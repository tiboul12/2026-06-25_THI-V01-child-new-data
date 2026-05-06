# Documentation du composant `CahierRecetteDocComponent`

## Vue d'ensemble
Le composant `CahierRecetteDocComponent` (`wo-cahier-recette-doc`) est une page de documentation statique pour l'outil Cahier de Recette.

## Fonctionnement Général
C'est un composant autonome de présentation permettant aux utilisateurs de comprendre le fonctionnement de l'outil Cahier de Recette. Il fournit notamment un bouton pour retourner à la page précédente dans l'historique du navigateur.

## Entrées / Sorties
Aucune.

## Dépendances
- `CommonModule`
- `RouterModule`

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Bouton de retour** : Vérifier que l'action `goBack()` appelle correctement `window.history.back()` pour renvoyer l'utilisateur à la page d'origine.