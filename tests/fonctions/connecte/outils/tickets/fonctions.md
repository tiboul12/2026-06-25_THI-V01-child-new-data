# Outils › Tickets / Signalement Bugs — Fonctions métier

Composant : `TicketWidgetComponent`  
Accès : panneau outils — onglet Tickets  
Requis : activé dans la configuration

---

## `2-4-4-1` — Capture d'écran

- **Déclenchement** : clic bouton "Capturer l'écran" → `html2canvas` sur `document.body`
- **Rendu** : screenshot de la page courante en image PNG
- **Affichage** : aperçu dans le widget

---

## `2-4-4-2` — Annotation

- **Canvas interactif** : dessiner sur le screenshot avec la souris
- **Outils** : crayon, couleur, épaisseur
- **Effacer** : bouton reset

---

## `2-4-4-3` — Soumission d'un ticket

- **Champs** : titre, description, sévérité (low/medium/high/critical)
- **Screenshot** : attaché automatiquement (base64)
- **Envoi** : POST `/api/tickets` ou stockage local
- **Confirmation** : toast "Ticket soumis"

---

## `2-4-4-4` — Liste des tickets

- **Affichage** : liste des tickets avec statut, date, sévérité
- **Filtres** : par statut (ouvert/fermé), par sévérité

---

## `2-4-4-5` — États

| État | Description |
|------|-------------|
| Désactivé | Non visible si désactivé dans config |
| Capture en cours | Spinner |
| Annotation | Canvas visible |
| Soumission | Bouton désactivé |
| Succès | Toast de confirmation |
| Erreur | Message d'erreur |
