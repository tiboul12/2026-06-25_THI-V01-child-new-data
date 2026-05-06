# Documentation du composant `ConfigComponent`

## Rôle Général
Le `ConfigComponent` sert de tableau de bord pour la configuration globale et l'administration de l'application. Il permet la gestion des thèmes, des paramètres de navigation, des services tiers (comme Gemini et Claude), et de la base de clés API. Ce composant permet de centraliser le contrôle de l'état de l'application (ex: activation du module de tickets ou du widget de recette).

## Règles Métier Spécifiques
- **Gestion du thème** : Cycle entre trois thèmes principaux (`dark`, `light`, `pink`) sauvegardés de manière persistante dans le `localStorage`.
- **Sauvegarde et historique** : Chaque modification (par exemple l'activation/désactivation d'une clé API ou d'un affichage de composant) est poussée sur le backend pour sauvegarde. De plus, ces actions sont traquées via le `WoActionHistoryService`, ce qui autorise les annulations et répétitions (`undo/redo`).
- **Gestion du CLI IA** : Le composant vérifie l'installation locale des CLI pour Gemini et Claude. Si le fournisseur est installé, l'utilisateur peut configurer précisément les modèles utilisés et actualiser leurs coûts, le tout via les requêtes asynchrones à un exécuteur (`EXECUTOR_API`).

## Entrées (Inputs)
- `@Input() embeddedMode: boolean` : Détermine si le panneau de configuration est intégré dans une vue existante (`true`) ou s'il occupe toute la page (`false`).

## Sorties (Outputs)
Aucun `@Output` direct, les données modifiées sont stockées globalement via les services et le backend.

## Dépendances
- `ConfigService` : Pour la synchronisation locale/globale des paramètres.
- `WoActionHistoryService` : Pour la gestion de l'historique et des rollbacks.
- `HttpClient` : Pour communiquer avec le serveur de configuration et d'exécution IA.
- Variables d'environnement : `environment.apiDataUrl`, `environment.apiExecutorUrl`.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Bascule de Thème :** Vérifier que cliquer sur le bouton de thème change la classe de la racine DOM (`dark`, `pink`) et met à jour le `localStorage`.
2. **Sauvegarde des Clés API :** Insérer une clé, sauvegarder, et s'assurer que le composant lance bien une requête POST valide.
3. **Chargement des Statuts CLI :** Mock l'API locale pour simuler un service "Claude" non installé. Vérifier que la case associée au provider est désactivée/décochée.
4. **Historique des actions :** Désactiver le module "Tickets" et vérifier que le service d'historique enregistre correctement l'action dans le cache pour un potentiel undo.