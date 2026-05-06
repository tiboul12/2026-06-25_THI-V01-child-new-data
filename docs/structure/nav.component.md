# Documentation : NavComponent

## Fonctionnement Général
Le composant `NavComponent` est responsable du rendu du menu de navigation principal (liste de liens). Il est souvent encapsulé dans le composant Header ou affiché dans une barre latérale selon la conception globale.

## Entrées / Sorties
- *Aucune spécifique, comportement déterminé par l'état global et les services.*

## Dépendances
- `AuthService` : Pour afficher/masquer certains liens en fonction du statut de connexion de l'utilisateur ou de son rôle (ex: accès Admin).
- `AppConfigService` : Pour des règles d'accès générales.
- `ConfigService` : Pour afficher/masquer des entrées de menu selon que certains modules sont activés (ex: gestion des Documents, etc.).

## Règles Métier
- Ce composant est principalement axé sur la vue (template). Sa logique TypeScript se limite à injecter les services nécessaires pour que le HTML (`nav.component.html`) puisse utiliser les conditions structurelles (comme des `*ngIf`).
- Les liens ne doivent être accessibles que si les conditions de service (droits, configuration active) sont remplies.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Utilisateur non connecté :** Vérifier que les liens nécessitant une authentification n'apparaissent pas.
2. **Utilisateur standard :** Vérifier que l'onglet "Administration" n'est pas présent.
3. **Utilisateur administrateur :** S'assurer que le lien vers le panneau d'administration est visible.
4. **Configuration de Modules :** Désactiver un module via la configuration et vérifier que le lien associé disparait de la navigation.
