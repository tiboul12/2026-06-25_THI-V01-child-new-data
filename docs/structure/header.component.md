# Documentation : HeaderComponent

## Fonctionnement Général
Le composant `HeaderComponent` gère la barre de navigation principale (en-tête) de l'application. Il inclut le logo, la navigation principale (`NavComponent`), les paramètres globaux (choix du thème, choix du fournisseur IA et du modèle IA), ainsi que l'état d'authentification de l'utilisateur. Il s'occupe aussi de l'affichage contextuel d'une bannière de version et réagit au scroll de la page.

## Entrées / Sorties
- *Aucune spécifique, lit directement les services d'état global.*

## Dépendances
- `ThemeService` : Basculement du thème clair/sombre.
- `AuthService` : Statut et informations utilisateur (déconnexion).
- `ConfigService` : Liste des fournisseurs d'IA, listes des modèles, et sauvegarde de la sélection.
- `LayoutService` : Détermine si le header doit être en mode "réduit" (`expanded=false`) suite à un scroll.
- `AppConfigService` : Configuration globale de l'app.
- `Router` : Navigation suite à la déconnexion.

## Règles Métier
- **Comportement au Scroll :** Le header s'adapte au défilement vertical (`@HostListener('window:scroll')`). Si le scroll dépasse 10px, le signal `headerExpanded` du `LayoutService` est mis à jour, ce qui modifie potentiellement son design.
- **Vérification de Version :** Comme le footer, le header check la version de l'application et peut afficher une bannière temporaire (qui se ferme après 5 secondes) si la version locale n'est pas à jour.
- **Sélection IA :** Il permet à l'utilisateur de choisir entre différents fournisseurs (ex: Claude, Gemini) et différents modèles rattachés. Les listes sont filtrées par les configurations activées dans le `ConfigService` (enabledModels). Le composant se rafraîchit automatiquement toutes les 30s.
- **Choix Persisté :** Les choix de modèle et de fournisseur sont sauvegardés via le `ConfigService`.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Scrolling :** Simuler un scroll vers le bas et s'assurer que la fonction `onScroll()` met bien à jour l'état "réduit" du header dans le `LayoutService`.
2. **Changement d'IA :** Sélectionner un fournisseur différent dans le dropdown et vérifier que la liste des modèles s'actualise correctement (modèles Claude vs Gemini). Vérifier que le changement déclenche la sauvegarde dans le `ConfigService`.
3. **Thème :** Le clic sur l'icône de thème doit basculer l'icône et appeler `toggleTheme()` du `ThemeService`.
4. **Bannière de version :** Forcer une réponse `upToDate: false` de l'API et vérifier que la bannière s'affiche, puis disparaît au bout de 5 secondes.
