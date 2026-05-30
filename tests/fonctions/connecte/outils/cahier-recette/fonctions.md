# Outils › Cahier de Recette — Fonctions métier

Composant : `CahierRecetteWidgetComponent`  
Accès : panneau outils (F3) — onglet Recette  
Requis : activé dans la configuration

---

## `2-4-2-1` — Gestion des campagnes de test

- **Création** : nouvelle campagne avec titre et description
- **Édition** : modification d'une campagne existante
- **Suppression** : avec confirmation
- **Liste** : affichage de toutes les campagnes avec statut (en attente, en cours, terminé, erreur)

---

## `2-4-2-2` — Cas de test

- **Ajout** : nouveau cas de test dans une campagne (titre, description, étapes)
- **Variables** : définition de variables substituables dans les prompts IA
- **Ordre** : réorganisation des cas de test

---

## `2-4-2-3` — Exécution des tests

- **Lancement** : `runCampaign(campaignId)` → exécution séquentielle des cas de test
- **Exécution IA** : chaque cas envoyé au provider IA configuré
- **Résultats** : statut par cas (succès/échec), réponse IA, temps d'exécution
- **Rapport** : synthèse globale à la fin de la campagne

---

## `2-4-2-4` — États

| État | Description |
|------|-------------|
| Désactivé | Non visible si désactivé dans config |
| Aucune campagne | Message + bouton créer |
| Campagne en cours | Barre de progression, cas en cours surligné |
| Test réussi | Badge vert |
| Test échoué | Badge rouge + détail erreur |
| Rapport disponible | Synthèse cliquable |
