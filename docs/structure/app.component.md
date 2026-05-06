# AppComponent

## Fonctionnement général
C'est le composant racine de l'application (le `app-root`). Il orchestre l'initialisation globale de l'interface, intègre les principaux widgets (header, footer, tchat, panneaux d'outils) et expose le conteneur de routage (`RouterOutlet`).

## Règles métier spécifiques
- Au démarrage, le composant initialise le thème de l'application via le `ThemeService`.
- Si un jeton d'authentification (token) est détecté dans le `AuthService`, une vérification silencieuse de sa validité est déclenchée.
- Expose un objet global `window.WoActionHistory` pour permettre à des scripts externes ou non-Angular (comme l'application Electron ou des scripts injectés) de pouvoir logger des événements dans le service `WoActionHistoryService`.

## Entrées
Aucune (composant racine).

## Sorties
Aucune (composant racine).

## Dépendances
- `ThemeService` : pour l'initialisation du thème.
- `AuthService` : pour la gestion du token et l'état de connexion.
- `ConfigService` & `LayoutService` : pour la gestion de la configuration et de l'affichage.
- `WoActionHistoryService` : pour le traçage des actions.
- Widgets et composants partagés (Header, Footer, TicketWidget, TchatIA, etc.).

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Démarrage avec session valide** : Recharger l'application avec un token valide en cache ; s'assurer qu'aucune déconnexion impromptue ne se produit.
2. **Démarrage sans session** : L'application charge correctement sans erreur de vérification de token bloquante.
3. **Bridge JS global** : Exécuter `window.WoActionHistory.track({...})` dans la console du navigateur et vérifier que l'action est bien interceptée par le service.
4. **Ouverture du panneau d'outils** : Appeler la méthode `openToolsPanel()` (via un bouton ou un événement) et vérifier que le panneau latéral s'affiche correctement.