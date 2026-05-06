# AdminDeploymentsComponent

## Fonctionnement général
Ce composant gère l'onglet des déploiements dans le panel d'administration. Il permet de lister l'historique des déploiements, d'en créer de nouveaux, de filtrer les commits, et de suivre la synchronisation des versions entre le projet enfant (child) et le projet parent (base).

## Règles métier spécifiques
- **Différenciation Child/Base** : Le système identifie si l'application s'exécute en tant que projet enfant ou racine. L'interface s'adapte pour indiquer quelle est la version locale par rapport aux déploiements.
- **Suivi de la propagation** : Permet de visualiser les mises à jour en attente depuis la base vers le projet enfant. Une action permet de marquer explicitement une propagation comme synchronisée via un PATCH sur l'API.
- **Formulaire de déploiement** : La création d'un déploiement exige un numéro de version. Il prend en compte le nom du commit, sa description, les fichiers modifiés, et l'intervention potentielle d'une IA.
- **Classification visuelle** : Les commits sont formatés et colorisés selon leur type (`[FIX]`, `[AMELIORATION]`, `[MERGE]`) et selon leur portée (`frankenstein`, `server`, `electron`, `data`).

## Entrées
Aucune directe (`@Input`).

## Sorties
- `@Output() versionStatusChange = new EventEmitter<any>()` : Émet le nouvel état de la version de l'application suite à une vérification.

## Dépendances
- `AuthService` : Ajout du token JWT dans les requêtes de l'API.
- Appels réseau directs avec `fetch` vers les endpoints `/api/admin/deployments`, `/api/admin/propagation`, `/api/version/check`.

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Création de déploiement** : Ouvrir le formulaire, laisser la version vide et tenter de valider (doit être bloqué). Remplir correctement et valider : la liste doit se mettre à jour sans erreur.
2. **Filtrage des déploiements** : Utiliser les filtres par type (ex: FIX) ou par IA, et vérifier que la liste se met à jour dynamiquement.
3. **Mise à jour d'état de propagation** : Marquer une propagation comme synchronisée, vérifier que l'appel API est effectué et que l'élément disparaît de la liste des attente.
4. **Mise en surbrillance de la version locale** : S'assurer que la ligne correspondant à la version locale actuelle de l'application a un style de surbrillance spécifique (couleur de fond/bordure).