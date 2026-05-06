# Documentation : WorgHelpTriggerComponent

## Fonctionnement Général
Le composant `WorgHelpTriggerComponent` (`<worg-help>`) est un petit bouton interactif affichant généralement un point d'interrogation ("?"). Son rôle est de déclencher l'ouverture du tiroir d'aide (`WorgHelpDrawerComponent`) pour un identifiant d'aide précis.

## Entrées (Inputs)
- `@Input({ required: true }) helpId!: number` : L'identifiant unique du contenu d'aide à charger et afficher.

## Sorties (Outputs)
- *Aucune*

## Dépendances
- `HelpService` : Pour récupérer le titre associé à `helpId` et commander l'ouverture du tiroir d'aide.

## Règles Métier
- **Initialisation :** Au chargement (`ngOnInit`), le composant interroge le `HelpService` pour obtenir le titre du contenu d'aide lié. Ce titre est utilisé comme infobulle (`tooltipTitle`) au survol du bouton.
- **Action de clic :** Un clic sur le bouton appelle `helpService.open(helpId)`, déclenchant l'ouverture de l'aide correspondante dans toute l'application.

## Scénarios de Test Fonctionnel (Anti-Régression)
1. **Fetch du Titre :** Vérifier que le titre de l'infobulle est correctement mis à jour suite au retour asynchrone du service d'aide.
2. **Ouverture de l'Aide :** Vérifier qu'un clic sur le composant appelle `open()` du `HelpService` avec le bon identifiant (`helpId`).
