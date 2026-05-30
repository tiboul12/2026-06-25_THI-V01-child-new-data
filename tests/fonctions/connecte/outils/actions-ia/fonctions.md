# Outils › Actions IA (Orchestrateur) — Fonctions métier

Composant : `WoActionsWidgetComponent`  
Accès : panneau outils (F5) — onglet Actions  
Requis : activé dans la configuration, CLI IA installé

---

## `2-4-1-1` — Gestion des actions

- **Création** : nouvelle action avec prompt IA et configuration
- **Édition** : modification d'une action existante
- **Suppression** : avec confirmation

---

## `2-4-1-2` — Exécution batch

- **Lancement** : `runActions()` → exécution séquentielle ou parallèle des prompts
- **Branch Git** : chaque exécution peut créer une branche dédiée
- **Commit automatique** : résultats commités sur la branche
- **Logs** : affichage en temps réel des sorties

---

## `2-4-1-3` — Historique

- **Liste** : historique des exécutions avec statut et résultats
- **Détail** : clic → voir les logs et résultats complets

---

## `2-4-1-4` — États

| État | Description |
|------|-------------|
| Désactivé | Non visible si désactivé dans config |
| CLI non installé | Message + lien installation |
| Exécution en cours | Logs en temps réel |
| Terminé avec succès | Badge vert |
| Erreur | Badge rouge + détail |
