# Admin › Config — Fonctions métier

Route : `/admin` onglet "Config" (réutilise `ConfigComponent`)  
Voir aussi : `connecte/config/fonctions.md` pour la version standalone  
Accès : admin uniquement dans ce contexte

---

## `2-1-1-1` — Identique à la page Config autonome

Ce composant est le même que celui accessible via `/config`.  
Se référer à `connecte/config/fonctions.md` pour la liste complète des fonctions.

---

## `2-1-1-2` — Spécificités du contexte admin

- **Accès** : uniquement via l'onglet "Config" du panneau admin
- **Portée** : les modifications s'appliquent à l'instance globale
- **Droits étendus** : l'admin voit les clés API et les configs sensibles
- **Mise à jour des coûts modèles** : bouton "Rafraîchir coûts" → POST `/api/admin/update-models-costs`
