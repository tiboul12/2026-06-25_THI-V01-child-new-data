# Documentation du composant `TchatIaDocComponent`

## Vue d'ensemble
Le composant `TchatIaDocComponent` (`wo-tchat-ia-doc`) est une page de documentation exhaustive décrivant les capacités et la configuration du composant de Tchat IA.

## Fonctionnement Général
Le composant affiche de manière interactive (via un système d'onglets `activeSection`) la liste des paramètres d'entrée (`@Input`), de sortie (`@Output`), les marqueurs spéciaux reconnus par l'IA et l'ensemble des fonctionnalités du widget de discussion.

## Dépendances
- `CommonModule`

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Navigation interne** : S'assurer que cliquer sur les différents éléments de menu (`sections`) modifie bien `activeSection` et affiche le contenu associé.