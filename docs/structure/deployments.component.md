# Documentation du composant `DeploymentsComponent`

## Rôle Général
Le `DeploymentsComponent` a pour mission d'afficher l'historique des déploiements de l'application et de comparer la version locale actuelle par rapport à la dernière version disponible ou déployée. Il agit comme un moniteur de versionnage au sein du back-office.

## Règles Métier Spécifiques
- **Extraction intelligente des données Git** : Le système parse les messages de commit pour en extraire des types stricts (`FIX`, `AMELIORATION`, `MERGE`), le titre brut du commit et les modules touchés ("scopes" tels que `electron`, `server`, `data`, etc.).
- **Vérification asynchrone** : Dès l'initialisation (`ngOnInit`), le composant lance deux processus de récupération simultanés : la vérification de la version globale et la récupération de l'historique de déploiement en base.
- **Coloration sémantique** : Les labels des types de commits et des scopes (ex. "server") reçoivent des classes CSS sémantiques strictes (ex. vert pour `server`, orange pour `data`).

## Entrées (Inputs)
Aucun.

## Sorties (Outputs)
Aucun.

## Dépendances
- API Globale `fetch` et `localStorage` (récupération d'un token d'administration `frankenstein_token`).
- Variables d'environnement : `environment.apiDataUrl`.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Extraction de type de commit :** Tester la méthode `extractCommitType('[FIX] Correction bug')` et vérifier que le retour est `'FIX'`.
2. **Absence de déploiement :** S'assurer que le composant gère correctement un tableau de déploiements vide sans jeter d'erreurs UI.
3. **Traitement de scopes :** Passer des données mal formatées dans `getScopedRows('admin,system', '')` et s'assurer qu'aucun crash n'est observé.
4. **Vérification d'authentification :** S'assurer que si aucun token n'est présent dans le `localStorage`, l'API de base est néanmoins appelée (soit elle retourne 401, ce qui doit être capturé par le bloc try/catch et affiché dans le signal `error`).