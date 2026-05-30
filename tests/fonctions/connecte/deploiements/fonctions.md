# Déploiements — Fonctions métier

Route : `/deployments`  
Composant : `DeploymentsComponent`  
Accès : utilisateur connecté

---

## `2-3-1` — Chargement

- **Statut version** : GET `/api/version/check` → `{ upToDate, localVersion, latestDeployment }`
- **Liste déploiements** : GET `/api/admin/deployments`

---

## `2-3-2` — Affichage

- **Statut version** : bannière "À jour" ou "Mise à jour disponible"
- **Version locale** : depuis `version.json`
- **Liste chronologique** : déploiements du plus récent au plus ancien
- **Par déploiement** :
  - Badge type commit : `extractCommitType()` → FIX (rouge) | AMELIORATION (vert) | MERGE (bleu)
  - Titre propre : `extractCommitTitle()` → retire le préfixe version/date/type
  - Scopes affectés : `parseScopeList()` → badges colorés par scope
  - Features : `getScopedRows()` → format scopé ou positionnel
  - Date, IA utilisée, modèle

---

## `2-3-3` — Navigation

- **Retour** : bouton retour → `location.back()`

---

## `2-3-4` — États

| État | Description |
|------|-------------|
| Chargement | Spinner |
| À jour | Badge vert "Version à jour" |
| Outdated | Badge rouge "Mise à jour disponible" |
| Liste vide | Message "Aucun déploiement" |
| Erreur | Message d'erreur |
