# wo-tchat-ia-widget.component

## 1. Objectif général et fonctionnement
Le composant `WoTchatIaWidgetComponent` est l'élément d'interface utilisateur déclencheur (widget ou bouton) qui permet d'afficher la fenêtre de discussion avec l'IA.

## 2. Règles métier spécifiques
- **Gestion du volet / modale :** Il propose de la même manière que l'outil "Actions" une double intégration. Soit dans le panneau de configuration principal (sidebar), soit de façon détachée (modale par-dessus le contenu).
- **Phrases d'accroche :** Fournit quelques suggestions dynamiques (`tchatIaQuickPrompts`) pour orienter l'utilisateur dans l'usage de la plateforme Frankenstein Junior.
- **Contextualisation :** Lit l'utilisateur actuel pour le saluer dans l'interface (ex: `currentUsername`).

## 3. Entrées (Inputs), Sorties (Outputs) et Dépendances
- **Inputs / Outputs :** Aucun.
- **Dépendances :**
  - `ConfigService` (contrôle l'outil activé).
  - `AuthService` (lecture des informations sur l'utilisateur courant).
  - `TchatIaComponent` (pour instancier le vrai moteur de chat IA dans la modale).

## 4. Scénarios de tests fonctionnels (Prévention des régressions)
- **T1 - Toggle de Sidebar :** Vérifier que cliquer sur le bouton d'ouverture met à jour `ConfigService.setActiveTool('tchat')`.
- **T2 - Identité Utilisateur :** Si l'utilisateur est connecté sous le nom "Admin", vérifier que le getter `currentUsername` retourne bien "Admin" au lieu de "Utilisateur".
- **T3 - Affichage des prompts rapides :** Contrôler que la liste des suggestions préremplies (quick prompts) s'affiche correctement à l'initialisation du composant.
