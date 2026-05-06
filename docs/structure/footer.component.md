# Documentation : FooterComponent

## Fonctionnement Général
Le composant `FooterComponent` affiche le pied de page de l'application. Il contient typiquement des informations de copyright, de version, et des accès rapides vers certains panneaux ou outils transverses de l'application.

## Entrées (Inputs)
- `@Input() onOpenTools?: () => void` : Une fonction optionnelle passée par le composant parent pour déclencher l'ouverture d'un panneau d'outils externe.

## Sorties (Outputs)
- *Aucune (utilise la fonction callback Input)*

## Dépendances
- `AuthService` : Pour adapter l'affichage du footer en fonction de l'état connecté/déconnecté.
- `ConfigService` : Pour lire la configuration de l'application et déterminer quels outils ou fonctionnalités sont activés.
- `AppConfigService` : Pour d'éventuelles autres configurations globales (comme les URL d'API).

## Règles Métier
- **Vérification de Version :** Lors de l'initialisation, le footer effectue une requête réseau (`fetch` vers `/api/version/check`) pour vérifier l'état de la version de l'application et l'affiche s'il réussit.
- **Compteur d'outils actifs :** Le getter `activeToolsCount` calcule dynamiquement le nombre d'outils disponibles (Tchat IA, Tickets, Widget Recette, Actions) en interrogeant le `ConfigService`.
- **Ouverture du panneau :** Si `onOpenTools` est fourni, l'appel à `openToolsPanel()` déclenchera ce callback.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Appel de Version :** Intercepter la requête réseau de vérification de version et s'assurer que le footer met bien à jour le signal `versionStatus`.
2. **Comptage des outils :** Modifier l'état activé/désactivé de certains outils dans le `ConfigService` et vérifier que `activeToolsCount` retourne le nombre correct.
3. **Bouton Outils :** Tester que le clic sur le bouton déclenchant `openToolsPanel` invoque bien la fonction de l'Input si elle est fournie.
