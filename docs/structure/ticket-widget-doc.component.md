# Documentation du composant `TicketWidgetDocComponent`

## Vue d'ensemble
Le composant `TicketWidgetDocComponent` (`wo-ticket-widget-doc`) contient la documentation intégrée pour le module "Ticket Widget".

## Fonctionnement Général
Le composant présente sous forme de sections interactives l'ensemble des règles de fonctionnement du widget de signalement, les phases (Repos, Capture, Formulaire), les différents modes de dessin possibles sur le canvas et les interactions de l'API.

## Entrées / Sorties
Aucune.

## Dépendances
- `CommonModule`

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Navigation interne** : S'assurer que chaque section modifie correctement la variable `activeSection` pour révéler le contenu explicatif adapté.