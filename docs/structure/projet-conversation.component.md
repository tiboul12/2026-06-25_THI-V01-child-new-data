# Documentation du composant `ProjetConversationComponent`

## Rôle Général
Le `ProjetConversationComponent` fournit une interface de messagerie (chat) liée à une section spécifique d'un projet (`sectionId`). Ce widget permet d'ajouter des notes ou de communiquer avec d'autres acteurs/l'IA sur un bout du projet particulier.

## Règles Métier Spécifiques
- **Chargement réactif** : Le composant écoute les changements sur l'Input `sectionId`. Si la valeur change et est valide, il déclenche immédiatement une requête pour charger l'historique associé.
- **Auto-Scroll** : L'affichage défile automatiquement vers le bas de la liste (méthode `scrollToBottom()`) à chaque ajout de nouveau message ou au chargement initial de l'historique pour améliorer l'UX.
- **Emission d'événements** : Une fois le message envoyé avec succès via le service, le composant émet un événement vers le parent pour l'informer de la nouvelle activité.

## Entrées (Inputs)
- `@Input() sectionId: string | null` : L'identifiant de la section active qui sert de canal de conversation.

## Sorties (Outputs)
- `@Output() conversationAdded: EventEmitter<string>` : Émis lorsqu'un message a été inséré dans la conversation.

## Dépendances
- `ConversationService` : Service gérant la persistance et la réception de messages.

## Scénarios de Test Fonctionnel (Anti-régression)
1. **Détection de changement (ngOnChanges) :** Modifier la valeur du paramètre `sectionId` depuis le parent et valider que l'historique du chat est vidé puis rechargé avec la nouvelle section.
2. **Envoi de message :** Entrer un texte, cliquer sur Envoyer. S'assurer que le champ texte est réinitialisé, que le nouveau message apparait, et que l'événement `conversationAdded` est déclenché.
3. **Scroll UI :** S'assurer qu'une fois un message affiché, l'élément `.nativeElement.scrollTop` est mis à jour pour coller au bas de la fenêtre.