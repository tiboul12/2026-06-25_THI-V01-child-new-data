# Éditeur › Zone 5 — Historique — Fonctions métier

Composant : `ProjetHistoryComponent`  
Position : panneau inférieur, onglet "Historique"  
Données : via `ProjetCollabService`, temps réel WebSocket

---

## `2-5-2-8-1` — Chargement

- **Connexion WebSocket** : lors de l'ouverture de l'éditeur → `collab.connect(projectId)`
- **Historique initial** : chargé depuis le signal `collab.history()`
- **Mises à jour temps réel** : nouvelles entrées poussées via WebSocket

---

## `2-5-2-8-2` — Affichage

- **Groupage par jour** : entrées groupées par date (`HistoryGroup[]`)
- **Expand/collapse par jour** :
  - Aujourd'hui : ouvert par défaut
  - Jours précédents : repliés par défaut (sauf si `expandedDays` override)
  - `toggleDay(date)` → bascule
- **Format heure** : `formatTime(timestamp)` → "HH:MM"
- **Icône par type d'action** : `getActionIcon(entry)` → Material icon
- **Couleur badge** : `getIconBgColor(entry)` → vert (create), bleu (update), rouge (delete), violet (undo/redo)
- **Compteur** : nombre total d'entrées affiché dans le badge de l'onglet

---

## `2-5-2-8-3` — Filtrage par entité active

- **Filtre automatique** : si `activeIds` est défini → `filteredEntries = computed` ne retient que les entrées pour ces IDs
- **Activation** : sélection d'un nœud dans la sidebar → `activeIds` mis à jour
- **Vue complète** : aucun filtre → tout l'historique du projet affiché

---

## `2-5-2-8-4` — Entrées en état "pending" (édition en cours)

- **Source** : `collab.pending()` → `PendingEditInfo[]`
- **Affichage** : entrées grisées avec label "en cours d'édition" ou "sauvegarde…"
- **State** : `editing` (frappe en cours) | `saving` (envoi serveur)
- **Username** : affiché pour identifier qui est en train d'éditer

---

## `2-5-2-8-5` — Clic sur une entrée (voir le diff)

- **Déclenchement** : `onEntryClick(entry)` → emit `entryClick`
- **Parent** : `ProjetEditorComponent` → `diffEntry.set(entry)`
- **Vue diff** : `ProjetDiffComponent` s'affiche → remplace temporairement la zone d'édition
- **Lazy load** : si `beforeState`/`afterState` non chargés → `collab.fetchEntry(id)` → GET pour charger le diff complet
- **Fermeture diff** : bouton "Fermer" → `closeDiff()` → `diffEntry.set(null)` → retour à l'éditeur

---

## `2-5-2-8-6` — Suppression de l'historique

- **Ouverture** : `openClear()` → modal de confirmation avec `clearOpen.set(true)`
- **Scope** :
  - `mine` : supprimer uniquement mes propres entrées
  - `all` : supprimer tout l'historique (admin seulement)
- **Compteur** : `clearTargetCount` → nombre d'entrées qui seront supprimées
- **Confirmation** : `confirmClear()` → POST `/api/collab/clear-history { projectId, scope, entityIds? }`
- **Après suppression** : liste rechargée, modal fermée

---

## `2-5-2-8-7` — Affichage du diff

- **Composant** : `ProjetDiffComponent`
- **Données** : `entry.beforeState` et `entry.afterState`
- **Vue** : côte à côte avant/après, lignes ajoutées/supprimées surlignées
- **Fermeture** : bouton × ou clic "Retour"

---

## `2-5-2-8-8` — États

| État | Description |
|------|-------------|
| Chargement | Spinner |
| Historique vide | Message "Aucune modification" |
| Filtre actif | Seules les entrées de la section active |
| Entrée pending | Grisé, label "en cours" |
| Groupe du jour ouvert | Entrées visibles |
| Groupe précédent replié | Seul l'en-tête de date visible |
| Modal suppression ouverte | Confirmation + compteur |
| Scope "mine" sélectionné | Supprimer mes entrées |
| Scope "all" (admin) | Supprimer tout |
| Vue diff active | `ProjetDiffComponent` visible |
