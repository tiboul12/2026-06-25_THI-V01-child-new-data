# LandingComponent

## Fonctionnement général
Sert de point d'entrée public pour l'application. Cette page d'accueil affiche une présentation (avec un fond animé par des particules) et gère les processus d'inscription et de connexion de l'utilisateur via des modales (pop-up).

## Règles métier spécifiques
- **Thème forcé** : Au chargement, la page force l'application en thème 'dark' (`themeService.applyTheme('dark')`) pour correspondre au design de l'accueil.
- **Redirection automatique** : Si la base de données est accessible ET que l'utilisateur est déjà connecté, il est automatiquement renvoyé vers son espace privé (`/projets`).
- **Disponibilité de la base de données** : Si l'API/Base de données est en erreur (`DbStatusService`), la page bloque l'accès aux formulaires et permet à l'utilisateur de déclencher une tentative de reconnexion manuelle (`retryDb`).
- **Règles d'inscription** : L'inscription effectue des validations en amont côté front : champs obligatoires, mot de passe de plus de 6 caractères, et correspondance parfaite avec la confirmation de mot de passe.
- **Accessibilité/Ergonomie** : Permet de fermer les fenêtres modales d'inscription/connexion en cliquant à l'extérieur de celles-ci (sur l'overlay) ou en pressant la touche "Échap" (Escape).

## Entrées
Aucune.

## Sorties
Aucune.

## Dépendances
- `AuthService` : Gère les appels de `login` et `register`.
- `Router` : Pour rediriger l'utilisateur vers `/projets` après un login réussi.
- `ThemeService` : Pour forcer le style visuel.
- `DbStatusService` : Vérifie la viabilité de l'infrastructure backend avant de permettre une connexion.
- `AppConfigService` : Pour récupérer dynamiquement le nom de l'application, l'année, et les infos de copyright.

## Scénarios de tests fonctionnels pour éviter les régressions
1. **Base de données indisponible** : Simuler une panne de base de données. L'application ne doit pas rediriger, doit afficher un message d'erreur et empêcher l'ouverture des modales. Le bouton de réessai doit relancer un ping.
2. **Redirection de session active** : Charger la page de `landing` alors que le navigateur possède déjà un jeton d'authentification valide. L'utilisateur ne doit pas voir la page et doit être propulsé directement sur `/projets`.
3. **Erreur d'inscription** : Tenter de s'inscrire avec un mot de passe de 4 caractères ou une confirmation divergente. S'assurer que le formulaire bloque l'envoi vers l'API et affiche un message pertinent en rouge.
4. **Fermeture de modale (UX)** : Ouvrir la fenêtre de connexion et appuyer sur Échap (Escape). La modale doit se fermer immédiatement. Recommencer en cliquant sur l'arrière-plan grisé de la modale.