# Documentation du composant `TchatIaComponent`

## Vue d'ensemble
Le composant `TchatIaComponent` (`wo-tchat-ia`) est une interface de discussion avancée avec une Intelligence Artificielle. Il gère la communication en streaming (SSE), le parsing markdown, la sélection de texte contextuelle, et l'injection de formulaires automatisés.

## Fonctionnement Général
Le tchat permet à l'utilisateur de converser avec une IA configurée (fournisseur et modèle) via un serveur d'exécution (executor). Les réponses sont reçues en flux continu (Server-Sent Events) pour un affichage "mot par mot". Il inclut un historique de session, un rendu visuel complexe des réponses (markdown, formulaires) et des outils de diagnostic technique.

## Règles Métier
- **Prompt Système Dynamique** : Le `systemPrompt` est enrichi automatiquement avec des informations contextuelles (nom utilisateur, environnement, consignes de sécurité sur le répertoire de travail, règles pour la génération de formulaires et de variantes).
- **Streaming SSE** : Connexion POST sur `/execute-chat-turn` avec récupération et parsing des événements `data: ` contenant des tokens (`stdout`), de la télémétrie (`tokens`, `stderr`) ou des erreurs.
- **Parsing de Marqueurs Spéciaux** :
  - `[FORM_START]...[FORM_END]` : Interprété pour remplacer le texte brut par un formulaire interactif (`parsedForm`) que l'utilisateur peut soumettre.
  - `[VARIANTE N]` : Détecté pour diviser la réponse en un tableau d'alternatives présentées à l'utilisateur.
  - `[DOCUMENT_CRÉÉ: fichier]` : Enregistre le nom d'un fichier créé par l'IA dans l'état `documentsCreated`.
  - `[FIN_TCHAT]` : Définit le statut `conversationDone` à `true`, bloquant potentiellement l'envoi de nouveaux messages.
- **Sélection de Zones** : Si l'utilisateur sélectionne du texte dans une réponse IA, une barre d'outils flottante permet d'envoyer immédiatement un prompt pour "Modifier", "Développer" ou "Supprimer" spécifiquement ce segment de texte.
- **Historique** : Les sessions sont sauvegardées dans le `localStorage` (max 20 sessions).
- **Sécurité des modèles** : Forçage des modèles compatibles si la configuration est incohérente (ex: basculer sur `claude-sonnet-4-6` pour le provider `claude`).

## Entrées (`@Input`)
- Configurations serveur : `executorUrl`, `apiUrl`.
- Modèles : `provider`, `model`.
- Données de prompt : `systemPrompt`, `initialPrompt`, `context`, `projectId`.
- Options booléennes : `allowFormGeneration`, `allowZoneSelection`, `allowMarkdown`, `allowExport`, `allowContinueAfterEnd`.
- `quickPrompts` (string[]) : Actions rapides sous l'input utilisateur.
- `formTemplates` (TchatForm[]) : Formulaires d'aide au prompt préconçus.

## Sorties (`@Output`)
- `closed` : Émis à la fermeture, transmet l'historique et les datas générées.
- `aiResponse` : Émis à la fin complète d'une réponse IA.
- `formSubmitted` : Émis lorsque l'utilisateur valide un formulaire IA.
- `zoneModificationRequested` : Émis pour une action sur du texte sélectionné.
- `messageSent` : Émis à l'envoi d'un message.

## Dépendances
- `HttpClient` : Pour sauvegarder les logs (télémétrie IA).
- `DomSanitizer` : Pour l'injection sécurisée du rendu Markdown.
- API `fetch` native pour la lecture du stream SSE.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Initialisation** : S'assurer que le changement de `visible` à `true` lance bien la récupération du prompt initial si défini.
2. **Streaming de réponse** : Vérifier que le décodage du flux SSE remplit correctement `msg.content` (les chunks de `stdout`) et que le loader s'arrête en fin de flux.
3. **Extraction de formulaire** : Ajouter un marqueur `[FORM_START]...` dans une réponse mockée et valider qu'il est bien converti en un objet `parsedForm` retiré du texte.
4. **Sélection de texte** : Mettre en surbrillance une portion de texte et vérifier que les offsets et le contenu sont correctement détectés (`onMessageMouseUp`).
5. **Gestion de l'historique** : Valider que la conversation se sauvegarde automatiquement dans `tchat-ia-sessions` et se recharge sans problème.