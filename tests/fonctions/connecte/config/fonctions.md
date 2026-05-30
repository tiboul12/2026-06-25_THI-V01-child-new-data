# Configuration — Fonctions métier

Route : `/config`  
Composant : `ConfigComponent`  
Accès : utilisateur connecté

---

## `2-2-1` — Thème

- **Toggle thème** : `toggleTheme()` → cycle dark → light → pink
- **Persistance** : thème stocké dans `localStorage`
- **Application immédiate** : classe CSS mise à jour sur `<html>`

---

## `2-2-2` — Clés API

- **Affichage** : toggle `toggleApiKeys()` → afficher/masquer la section clés
- **Gemini API Key** :
  - Saisie de la clé
  - Toggle actif/inactif
- **Claude API Key** :
  - Saisie de la clé
  - Toggle actif/inactif
- **Sauvegarde** : POST `/api/config/keys` → `{ geminiKey, claudeKey, geminiActive, claudeActive, ... }`
- **Chargement** : GET `/api/config/keys` au montage

---

## `2-2-3` — Configuration CLI IA

- **Toggle section** : `toggleCliIa()` → afficher/masquer
- **Providers actifs** : liste des providers (claude, gemini)
  - `toggleProvider(provider)` → active/désactive un provider
  - `isProviderActive(provider)` → état courant
- **Modèles par provider** :
  - `toggleModel(provider, model)` → enable/disable un modèle spécifique
  - `isModelEnabled(provider, model)` → état courant
  - Liste des modèles disponibles depuis `cliConfig().modelsList`
- **Statut CLI** :
  - GET `/api/cli-check-only?force=true` → vérification rapide installation
  - GET `/api/cli-status` → version installée, liste modèles disponibles
  - `loadingStatus.gemini|claude` : spinners pendant vérification
  - `cliError` : message si CLI non installé
- **Auto-save** : toggle provider/model → sauvegarde automatique

---

## `2-2-4` — Outils externes (activation/désactivation)

- **Toggle header IA** : `toggleHeaderIa()` → afficher/masquer section IA dans le header
- **Toggle historique nav** : `toggleWoActionHistoryNav()` → lien historique dans la navigation
- **Tickets widget** : `onTicketsToggle(val)` → enable/disable widget signalement bugs
- **Cahier recette widget** : `onRecetteWidgetToggle(val)` → enable/disable widget recette
- **Tchat IA** : `toggleCliIa()` → enable/disable le panneau tchat

---

## `2-2-5` — Mise à jour des coûts modèles (admin)

- **Bouton "Rafraîchir coûts"** : POST `/api/admin/update-models-costs { provider }`
- **Recharge** : `refreshModels()` → GET `/api/cli-status` après mise à jour
- **Affichage** : coût input/output en tokens par modèle

---

## `2-2-6` — Sauvegarde

- **Auto-save** : sur certains toggles
- **Sauvegarde manuelle** : bouton "Sauvegarder"
- **Statut** : `saveStatus` → idle | saving | success | error
- **Confirmation visuelle** : badge "Sauvegardé" 2s après succès

---

## `2-2-7` — États

| État | Description |
|------|-------------|
| Chargement initial | Spinner pendant GET `/api/config/keys` |
| Section clés masquée | `toggleApiKeys()` non activé |
| Section CLI masquée | `toggleCliIa()` non activé |
| Provider inactif | Badge grisé |
| Modèle désactivé | Case non cochée |
| CLI non installé | Alerte + lien installation |
| Sauvegarde en cours | Bouton désactivé, spinner |
| Sauvegarde OK | Badge vert 2s |
| Erreur sauvegarde | Message erreur |
