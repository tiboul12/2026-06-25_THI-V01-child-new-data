# Éditeur › Zone 5 — Conversation IA — Fonctions métier

Composant : `ProjetConversationComponent`  
Position : panneau inférieur, onglet "Conversation"  
Contexte : lié à la section active (`activeNodeId`)

---

## `2-5-2-7-1` — Chargement de l'historique

- **Déclenchement** : changement de `sectionId` (nœud actif dans la sidebar)
- **Requête** : GET `/api/conversations/{sectionId}/history` → `{ messages: Message[] }`
- **Affichage** : messages chronologiques, bulles colorées (user = droite, IA = gauche)
- **Indicateur conversations existantes** : la sidebar affiche une bulle sur les nœuds ayant des conversations → `conversationIds Set`

---

## `2-5-2-7-2` — Envoi d'un message

- **Saisie** : input texte en bas du panel
- **Envoi** : Enter ou bouton envoyer
- **Mode normal** (pas IA) : message utilisateur enregistré, réponse attendue
- **Mode IA** (`iaMode = true` ou préfixe `@ia`) : déclenche `sendAiEdit()`
- **Streaming SSE** : réponse IA en temps réel caractère par caractère
- **Emit** : `conversationAdded` avec sectionId → sidebar met à jour `conversationIds`

---

## `2-5-2-7-3` — Toggle mode IA

- **Bouton** : `toggleIaMode()` → `iaMode.set(!iaMode())`
- **Mode IA actif** : badge coloré sur le bouton, préfixe `@ia` automatique aux messages
- **Mode IA inactif** : messages normaux (sans traitement IA)

---

## `2-5-2-7-4` — Sélection du modèle IA

- **Bouton** : `toggleModelSelect()` → affiche/masque le selecteur
- **Modèles disponibles** : `allModels = computed([...claude, ...gemini])` depuis `ConfigService`
- **Sélection** : clic sur un modèle → `selectedModel.set(model)`
- **Modèle actif** : `activeModel = selectedModel() || config.headerSelection.model`
- **Affichage** : nom du modèle actif dans le bouton

---

## `2-5-2-7-5` — Inclusion de l'historique dans le contexte IA

- **Bouton** : `toggleHistory()` → `includeHistory.set(!includeHistory())`
- **Activé** : les messages précédents de la conversation sont envoyés comme contexte à l'IA
- **Désactivé** : seul le message courant est envoyé (contexte minimal)

---

## `2-5-2-7-6` — Suggestion d'édition IA (`@ia`)

- **Envoi** : POST `/api/conversations/{sectionId}/ai-edit` avec `{ prompt, model, includeHistory }`
- **Réponse** : diff de modification du contenu de la section
- **Affichage dans la conversation** : message IA avec le diff proposé
- **Barre "Accepter/Annuler"** (via `ProjetAiEditService`) :
  - Affichée dans l'éditeur principal au-dessus de la zone de code
  - **Accepter** : `onAcceptAiEdit()` → `aiEditService.acceptEdit()` → contenu mis à jour
  - **Annuler** : `onCancelAiEdit()` → `aiEditService.rejectEdit()`
- **Diff visuel** : `ProjetAiDiffComponent` → affiche avant/après côte à côte

---

## `2-5-2-7-7` — Gestion de la section sans contenu

- **Section sans conversation** : message "Aucune conversation" + invitation à démarrer
- **Pas de sectionId** : champ désactivé, message "Sélectionnez une section"

---

## `2-5-2-7-8` — États

| État | Description |
|------|-------------|
| Chargement historique | Spinner |
| Conversation vide | Message d'invitation |
| Pas de section active | Input désactivé |
| Envoi en cours | Bouton désactivé, spinner |
| Streaming IA | Texte qui s'écrit progressivement |
| Mode IA actif | Badge coloré sur bouton |
| Sélecteur modèle ouvert | Dropdown visible |
| Diff IA proposé | Barre Accepter/Annuler dans l'éditeur |
| Erreur IA | Message d'erreur dans la conversation |
