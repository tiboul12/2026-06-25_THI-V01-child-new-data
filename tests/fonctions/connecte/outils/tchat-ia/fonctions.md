# Outils › Tchat IA — Fonctions métier

Composant : `WoTchatIaWidgetComponent`  
Accès : panneau outils (F2) — onglet Tchat  
Requis : clé API Claude ou Gemini configurée

---

## `2-4-3-1` — Conversation

- **Envoi message** : saisie + Enter → streaming SSE
- **Réponse IA** : affichage progressif caractère par caractère
- **Historique** : conversation conservée pendant la session

---

## `2-4-3-2` — Sélection du modèle

- **Provider** : Claude ou Gemini
- **Modèle** : liste depuis `ConfigService.cliConfig().modelsList`
- **Persistance** : modèle sélectionné mémorisé

---

## `2-4-3-3` — États

| État | Description |
|------|-------------|
| Tchat désactivé | Pas visible (ConfigService) |
| Sans clé API | Message invitation à configurer |
| En attente réponse | Spinner |
| Streaming | Texte progressif |
| Erreur API | Message d'erreur |
