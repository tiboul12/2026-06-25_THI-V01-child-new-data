# AdminComponent

## Fonctionnement général
Le composant sert de vue principale pour l'espace d'administration. Il gère la disposition de la page et la navigation entre les différents onglets de gestion (Utilisateurs, Déploiements, Aide, Config, Thème) via un système de routage dynamique basé sur les paramètres d'URL.

## Règles métier spécifiques
- **Contrôle d'accès** : Lors de l'initialisation, le composant vérifie si l'utilisateur connecté possède le rôle `admin`. Si ce n'est pas le cas, il redirige automatiquement l'utilisateur vers la page `/home`.
- **Navigation par URL** : L'onglet actif est mémorisé via le paramètre de requête `tab` dans l'URL. Si aucun paramètre n'est fourni, il l'initialise par défaut.
- **Badges de notification dynamiques** : Le système d'onglets permet l'affichage de badges (pour signaler des notifications comme le nombre d'éléments) et d'alertes (pour signaler, par exemple, qu'un environnement enfant/base n'est pas à jour).
- **Registre dynamique** : Utilise l'`AdminTabsRegistryService` pour injecter et configurer les composants des sous-onglets.

## Entrées
Aucune.

## Sorties
Aucune.

## Dépendances
- `AuthService` : Vérification du rôle administrateur.
- `Router`, `ActivatedRoute` : Gestion de la navigation et lecture des paramètres d'URL.
- `AdminTabsRegistryService` : Registre des onglets disponibles.

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Accès refusé** : Se connecter avec un compte 'user' et tenter d'accéder à la route d'administration ; l'application doit rediriger vers `/home`.
2. **Accès autorisé** : Se connecter en tant qu'admin ; la page s'affiche et les onglets sont visibles.
3. **Mémorisation de l'onglet** : Cliquer sur l'onglet "Thème", recharger la page, et s'assurer que l'application reste sur l'onglet "Thème" (lecture correcte de `?tab=theme`).
4. **Alertes de version** : Simuler un état où le mode enfant n'est pas à jour, et vérifier que le badge d'alerte apparaît sur l'onglet "Déploiement".