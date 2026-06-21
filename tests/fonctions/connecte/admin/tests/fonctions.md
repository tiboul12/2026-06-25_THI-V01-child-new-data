# Admin › Tests — Fonctions métier

Route : `/admin` onglet "Tests"  
Composant : `AdminTestsComponent`  
Accès : admin uniquement

---

## `2-1-5-1` — Tableau de bord (dashboard)

- **Chargement** : GET `/api/admin/tests/runs` → liste des runs + topKo
- **Bouton "Lancer un nouveau test"** : ouvre le popup de lancement (voir `2-1-5-6`)
- **Liste des runs** : date, testeur, nom (si défini), stats (OK/KO/ND/%), statut (en cours / terminé)
- **Bouton supprimer par ligne** : icône poubelle → confirmation → DELETE `/api/admin/tests/runs/:id` (stopPropagation pour ne pas ouvrir le détail)
- **Encart KO fréquents** : fonctions les plus souvent KO sur tous les runs (top 10)
  - Affichage : badge ID + libellé + compteur
- **Clic sur un run** : ouvre la vue Détail
- **Bouton "Rafraîchir la liste de fonctions"** : POST `/api/admin/tests/functions/refresh` → invalide le cache serveur
- **Référentiel de fonctions (arbre)** : chaque nœud a au survol :
  - un bouton "Lancer un test sur cette section" (play_arrow) → ouvre le popup de lancement (`2-1-5-6`) avec la/les section(s) du nœud pré-cochée(s) ; nœud branche = toutes ses sous-sections
  - un bouton "Ouvrir le dossier local" (folder_open) → POST `/api/admin/tests/open-folder { path }` ouvre le répertoire du `fonctions.md` dans l'explorateur

---

## `2-1-5-2` — Runner (session de test en cours)

- **Périmètre** : si le run a été lancé sur une sélection de sections, seules ces fonctions sont affichées (filtrage par `activeRun.results`)
- **En-tête** : nom du testeur (pré-rempli), progression `X% (A/B)`, indicateur de sauvegarde, bouton "Annuler", bouton "Terminer"
- **Bouton "Annuler"** : ouvre la confirmation d'abandon → supprime le run en cours (voir `2-1-5-6`)
- **Barre de progression** : s'incrémente à chaque item décidé (OK ou KO)
- **Groupes de fonctions** : organisés par `pageTitle` (titre du fichier fonctions.md), avec bouton "Ouvrir le dossier local" dans l'en-tête de groupe
- **Par item** :
  - Badge ID cliquable (copie dans le presse-papiers via `navigator.clipboard`)
  - Libellé de la section
  - 3 boutons radio : **OK** (vert) / **KO** (rouge) / **ND** (gris)
  - Si KO → champ note optionnel apparaît
- **Auto-save** : debounce 2s → PUT `/api/admin/tests/runs/:id { results: [items modifiés] }`
- **Indicateur de sauvegarde** : spinner + texte "Sauvegarde…"
- **Bouton "Terminer"** : sauvegarde complète + `status: 'completed'` → retour au dashboard

---

## `2-1-5-3` — Détail d'un run

- **En-tête** : testeur, date, stats (OK/KO/ND/okPct%), statut
- **Bouton "Reprendre"** : visible si run en cours → bascule en vue Runner avec le run actif
- **Bouton supprimer** : DELETE `/api/admin/tests/runs/:id` → retour dashboard
- **Filtre** : Tout / KO uniquement
- **Liste résultats** : triée ko → ok → pending
  - Icône statut (check_circle vert / cancel rouge / radio_button_unchecked gris)
  - Badge ID + libellé de la section
  - Note si KO
  - **Dépliable** : clic sur le libellé → affiche le contenu markdown de la fonction (liste des tâches à tester), via `getFunctionContent(itemId)` + `renderContent`

---

## `2-1-5-4` — IDs de fonctions

- **Format ID** : `{dossierID}-{N}` où `dossierID` vient de `_registry.json` (ex: `2-5-2-3`) et `N` est séquentiel dans le fichier
- **Badge ID cliquable** : copie l'ID dans le presse-papiers (utile pour référencer une fonction à tester via IA)
- **Registre** : `tests/fonctions/_registry.json` — source de vérité pour les IDs de dossiers

---

## `2-1-5-5` — États

| État | Description |
|------|-------------|
| Chargement dashboard | Spinner |
| Aucun run | Message + bouton créer |
| Run en cours | Pulse ambre sur le run dans la liste |
| Run terminé | Indicateur vert |
| KO fréquents visibles | Encart rouge si topKo non vide |
| Runner actif | Barre de progression + boutons OK/KO/ND |
| Auto-save | Indicateur "Sauvegarde…" |
| Note KO visible | Input texte sous l'item KO |
| Détail ouvert | Vue résultats complète |
| Filtre KO actif | Seuls les items KO affichés |

---

## `2-1-5-6` — Popup de lancement & confirmations

- **Popup de lancement** (bouton "Lancer un nouveau test") :
  - **Champ nom** (optionnel) : transmis au serveur (`name`), affiché dans la liste et le détail
  - **Sélection de sections** : liste des sections testables (1 ligne par dossier `folderId`) avec cases à cocher ; compteur `sélectionnées/total`
  - **Boutons "Tout" / "Aucun"** : sélection globale
  - **Lancer le test** : POST `/api/admin/tests/runs { tester, name, folderIds }` — `folderIds` = sous-ensemble sélectionné (vide si toutes les sections cochées = tout le référentiel)
  - **Désactivé** si aucune section sélectionnée
- **Filtrage serveur** : le run ne contient que les `results` des fonctions des sections sélectionnées
- **Popup de confirmation** (annulation / suppression) :
  - **Annuler un test en cours** : abandon = DELETE du run → retour dashboard
  - **Supprimer un test** (depuis la liste ou le détail) : DELETE → retour dashboard
  - Boutons : "Retour" (annule) / "Abandonner" ou "Supprimer" (confirme)

---

## `2-1-5-7` — Mode automatique (test IA via Claude Code + Browser MCP)

- **Toggle Manuel / Automatique (IA)** dans le popup de lancement.
- **Mode IA** :
  - **Sélecteur IA** : providers CLI agentiques actifs dans admin/config (Claude Code, Antigravity) — depuis `ConfigService.cliConfig().availableProviders` (type `cli`)
  - **Sélecteur Modèle** : `modelsList[baseId]` du provider choisi
  - **Consignes éditables** (textarea) : intro du prompt, modifiable
  - **Format de retour imposé** (lecture seule) : exemple `@@TEST_RESULT@@{"itemId":…,"status":"ok|ko|nd","note":…}` pour un retour constant
  - **Lancer avec l'IA** : POST `/runs { mode:'ai', aiProvider, aiModel, prompt, folderIds }`
- **Exécution** : `GET /api/admin/tests/runs/:id/ai-stream` (SSE, auth `?token=`) construit le prompt (consignes + format imposé + liste des fonctions), appelle l'executor local `/execute-prompt` (Claude Code / agy pilotent le navigateur via l'extension **Browser MCP**), parse les lignes `@@TEST_RESULT@@`, persiste chaque résultat et ré-émet en SSE (`start`, `case-result`, `ai-log`, `complete`, `ai-error`, `run-failed`).
- **Deux mécanismes de capture selon le provider** :
  - **Claude** : émet les `@@TEST_RESULT@@` sur **stdout** → le serveur parse le flux stdout de l'executor.
  - **Antigravity (`agy`)** : `agy -p` n'écrit **jamais** sur stdout (print mode = modifications de fichiers). Le serveur écrit un **fichier de tâches** (lu par agy) + un **fichier de sortie** sous `data/tests-admin/ai-runs/<runId>/`, envoie un prompt directif (agy ÉCRIT les `@@TEST_RESULT@@` dans le fichier via son outil d'écriture), et **poll ce fichier** toutes les 1,5 s pour émettre les `case-result`. L'executor spawn agy **directement** (pas `cmd /c`, chemin résolu via `where agy`), `cwd` = racine projet. Voir aussi le CLI `tests/run-recette-cli.js` (même approche).
- **Retours en direct (`ai-log`)** : tout le stdout/stderr/info de l'IA (hors lignes sentinelles) est forwardé en temps réel via l'événement SSE `ai-log` `{ stream, text }`. Le serveur n'avale plus le raisonnement de l'IA. (Antigravity étant muet sur stdout, le journal live est plus pauvre — les résultats arrivent via le fichier.)
- **Runner IA** : bannière « Claude Code teste… (X/Y) » + spinner pendant `aiRunning`, résultats remplis **progressivement** ; à la fin → « Tests IA terminés — à revoir » (revue manuelle puis Terminer).
- **Journal live** (panneau « Retours en direct de l'IA », collapsible, sous la bannière) : affiche au fil de l'eau les lignes `ai-log`, les verdicts (`case-result`) et les messages début/fin/erreur. Coloration par flux (stdout/stderr/info/result/error), auto-scroll vers le bas, borné à 500 lignes, compteur de lignes, réinitialisé à chaque lancement.
- **Dashboard** : badge **IA** sur les runs automatiques.
- **Pré-requis** : extension **Browser MCP** installée + enregistrée auprès de Claude Code (`claude mcp add`), onglet de l'app **connecté** relié à Browser MCP, executor (port 3002) lancé.
- **Champs run** : `mode:'ai'`, `aiProvider`, `aiModel`, `aiState` (`idle|running|done|error`), `prompt`.
