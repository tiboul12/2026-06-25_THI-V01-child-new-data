# Configuration — Fonctions métier

---

## `2-2-1` — Thème

- Changement de thème au clic sur le bouton : cycle entre dark, light et pink (toggleTheme)
- Persistance du thème sélectionné dans le localStorage
- Application immédiate de la classe CSS correspondante sur l'élément <html> (dark ou dark+pink)
- Changement d'icône dynamique sur le bouton en fonction du thème (dark_mode, light_mode, favorite)
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`

---

## `2-2-2` — Clés API

- Affichage/masquage de la section des clés au clic sur le toggle d'activation globale (toggleApiKeys)
- Saisie de la clé API Gemini et activation via sa checkbox dédiée
- Affichage/masquage en clair de la clé API Gemini en cliquant sur le bouton de visibilité
- Saisie de la clé API Claude et activation via sa checkbox dédiée
- Affichage/masquage en clair de la clé API Claude en cliquant sur le bouton de visibilité
- Chargement initial des clés et de leur état d'activation via GET /api/config/keys
- Persistance des clés lors de la sauvegarde manuelle via POST /api/config/keys au format imbriqué { gemini: { key, active }, claude: { key, active } }
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`, `server/server-data.js`

---

## `2-2-3` — Configuration CLI IA

- Affichage/masquage de la section des outils CLI au clic sur son toggle global (toggleCliIa)
- Activation/désactivation d'un fournisseur CLI (Antigravity ou Claude) via sa checkbox dédiée (toggleProvider)
- Activation de tous les modèles d'un fournisseur CLI par défaut lors de son activation
- Désactivation automatique et décochage de tous les modèles d'un fournisseur CLI s'il est désactivé
- Activation/désactivation individuelle des modèles disponibles pour chaque fournisseur (toggleModel)
- Tri automatique des modèles d'un fournisseur par coût total décroissant (sortModelsByCost)
- Affichage d'un badge indiquant la source des modèles disponibles : "API" (direct) ou "Fallback" (statique)
- Récupération rapide de l'état d'installation via GET /api/cli-check-only?force=true
- Récupération complète des versions installées, dates de dernière mise à jour et modèles via GET /api/cli-status
- Affichage d'un spinner de chargement individuel par fournisseur lors des vérifications
- Affichage d'une alerte bloquante si le serveur executor sur le port 3002 n'est pas disponible, avec bouton pour réessayer (loadCliStatus)
- Sauvegarde automatique immédiate de la configuration lors du basculement d'un fournisseur ou d'un modèle (saveKeys)
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`, `libs/portail-core/data-access/src/lib/config.service.ts`, `electron/executor/server-executor.js`

---

## `2-2-4` — Outils externes (activation/désactivation)

- Affichage/masquage de la zone IA dans le header de l'application via son toggle dédié (toggleHeaderIa)
- Activation/désactivation de l'Historique des actions dans la navigation principale via son toggle dédié (toggleWoActionHistoryNav)
- Enregistrement immédiat dans l'historique d'actions (tracking de l'action toggle pour 'woActionHistoryNav')
- Sauvegarde et propagation de l'état de l'historique de navigation via le signal global configService.saveNavItems
- Chargement initial et envoi des configurations des outils secondaires (tickets, recette, tchat, actions) lors de la sauvegarde manuelle
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`, `libs/portail-core/data-access/src/lib/config.service.ts`, `server/server-data.js`

---

## `2-2-5` — Mise à jour des coûts modèles (admin)

- Déclenchement de la mise à jour des coûts par fournisseur au clic sur le bouton "Mettre à jour les coûts" via POST /api/admin/update-models-costs
- Rechargement automatique de l'état local du CLI concerné après mise à jour des coûts (loadCliStatus)
- Affichage des coûts en tokens d'entrée (In) et de sortie (Out) en dollars par million de tokens pour chaque modèle
- Affichage de la date et heure de dernière mise à jour des coûts formatée au format local français (formatDate)
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`, `server/server-data.js`

---

## `2-2-6` — Sauvegarde

- Sauvegarde automatique en arrière-plan sur les actions rapides de toggles de CLI (saveKeys avec isAutoSave = true)
- Déclenchement d'une sauvegarde manuelle complète de tous les champs via le bouton "Sauvegarder" (saveKeys)
- Transition d'états de sauvegarde gérée par la variable saveStatus (idle -> saving -> success ou error)
- Désactivation du bouton de sauvegarde et affichage d'un spinner pendant l'enregistrement
- Affichage d'un badge de confirmation vert avec message personnalisé pendant 3 secondes après un succès, puis retour à l'état initial (idle)
- Affichage d'un message d'erreur rouge pendant 3 secondes en cas d'échec de la requête
- Propagation immédiate des modifications aux signaux de configService en local pour réactivité UI
- Mise à jour conjointe de la configuration utilisateur en BDD (table users) et du fichier global conf.json pour la version et outils activés
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`, `libs/portail-core/data-access/src/lib/config.service.ts`, `server/server-data.js`

---

## `2-2-7` — États

- État de chargement initial : spinners affichés pour chaque fournisseur CLI tant que le chargement n'est pas terminé (cliConfigLoaded/cliStatusLoaded)
- État section clés masquée : les champs de clé API ne sont pas rendus si apiKeysEnabled est désactivé
- État section CLI masquée : toute la section de configuration des CLI n'est pas rendue si cliIaEnabled est désactivé
- État fournisseur inactif : badge du statut d'installation affiché en grisé et modèles affichés avec opacité réduite (40%) si non installé
- État modèle désactivé : case à cocher non cochée pour les modèles exclus de la visibilité du header
- État serveur executor indisponible : bandeau d'alerte rouge avec message d'Electron non démarré et bouton Réessayer
- État sauvegarde en cours : bouton "Sauvegarder" désactivé avec spinner
- État sauvegarde OK : badge vert de confirmation avec message de succès visible pendant 3 secondes
- État erreur sauvegarde : badge rouge avec message d'erreur visible pendant 3 secondes
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`

---

## `2-2-8` — Version de l'application

- Affichage de la version courante de l'application chargée depuis conf.json (via GET /api/config/keys)
- Modification de la version via le champ de saisie de texte dédié dans la section Général
- Persistance du numéro de version dans le fichier conf.json global lors d'une sauvegarde manuelle (POST /api/config/keys)
- **Composants:** `apps/portail/src/app/pages/user/config/config.component.ts`, `apps/portail/src/app/pages/user/config/config.component.html`, `server/server-data.js`
