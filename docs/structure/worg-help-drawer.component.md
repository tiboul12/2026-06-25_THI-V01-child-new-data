# Documentation : WorgHelpDrawerComponent

## Fonctionnement Général
Le composant `WorgHelpDrawerComponent` affiche un panneau latéral (drawer) coulissant qui contient la documentation ou l'aide contextuelle pour l'utilisateur. Il est contrôlé via le `HelpService`.

## Entrées / Sorties
- *Géré via l'état du service (HelpService).*

## Dépendances
- `HelpService` : Fournit l'état d'ouverture/fermeture du tiroir, son contenu et l'ID de l'aide affichée.
- `AuthService` : Pour vérifier les droits d'accès (ex: pour l'édition de l'aide).
- `Router` : Pour la navigation vers la page d'administration.

## Règles Métier
- **Animations :** Le composant intègre des animations Angular (`slideIn`, `fadeIn`) pour une apparition et disparition fluides du tiroir et du voile de fond.
- **Accès Admin :** Si l'utilisateur a les droits, un bouton permet de basculer en mode édition. L'action `goToAdminEdit(id)` ferme le tiroir et redirige vers `/admin` avec les paramètres appropriés (`tab=help`, `editId`).
- **Fermeture :** L'utilisateur peut fermer le tiroir en cliquant à l'extérieur (sur le voile d'arrière-plan) ou via un bouton dédié, ce qui appelle `helpService.close()`.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Ouverture / Fermeture :** Vérifier que le tiroir réagit correctement aux états du `HelpService` et que les animations se déclenchent.
2. **Redirection d'Édition :** S'assurer que le clic sur le bouton d'édition (si visible) ferme bien le tiroir et appelle le `Router` avec les bons QueryParams.
