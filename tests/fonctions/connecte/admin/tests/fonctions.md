# Admin › Tests — Fonctions métier

Route : `/admin` onglet "Tests"  
Composant : `AdminTestsComponent`  
Accès : admin uniquement

Interface organisée en **4 onglets** (inspirée de l'outil projets `tests-outil`) : **Cahier de recette**, **Exécution**, **Résultats**, **Historique**.

---

## `2-1-5-1` — [modification] Navigation par onglets + Onglet Cahier de recette

- **Barre d'onglets** : Cahier de recette (`checklist`) / Exécution (`play_circle`) / Résultats (`bar_chart`) / Historique (`history`) / Site Map (`account_tree`).
- **URL par sous-onglet** : chaque onglet a une URL directe — `/admin/tests/cahier`, `/admin/tests/execution`, `/admin/tests/resultats`, `/admin/tests/historique`, `/admin/tests/sitemap`. Navigation par URL directe ou via le navigateur (retour arrière) possible.
  - L'onglet actif est souligné (border + texte primary).
  - À l'activation : Exécution initialise les défauts IA ; Résultats charge la matrice (GET `/api/admin/tests/matrix`).
- **Bouton "Rafraîchir le référentiel"** (en haut à droite, toutes vues) : POST `/api/admin/tests/functions/refresh` → invalide le cache serveur puis recharge.
- **Onglet Cahier de recette** : référentiel des fonctions testables affiché en **arbre hiérarchique** (catégorie → sous-catégorie → section), chargé via GET `/api/admin/tests/functions`.
  - **Hiérarchie & tri** : arbre reconstruit depuis les chemins des `fonctions.md`. Les nœuds sont triés **numériquement par ID hiérarchique** en pré-ordre (`1`, `1-1`, `2`, `2-1`, `2-1-1`, …). L'ID d'un nœud intermédiaire est déduit du `folderId` d'une feuille descendante (segments tronqués à la profondeur du nœud).
  - **Accordéon** : au 1er niveau seules les catégories racines (`1` non-connecte, `2` connecte) sont visibles ; clic sur un nœud déplie/replie ses enfants. Boutons globaux "Tout ouvrir" / "Tout fermer".
  - **Recherche** (champ avec icône loupe) : filtre l'arbre sur le libellé, le `pageTitle`, l'`ID` et le contenu des fonctions (insensible aux accents/casse). **Autocomplétion** : dropdown de max 8 suggestions (icône d'état + ID + section + page) ; clic → applique la section comme filtre. Bouton ✕ pour vider.
  - **Filtre d'état** : `Toutes` / `Testées` / `Non testées` / `En erreur` (KO) / `À retester` — masque les sections/fonctions hors critère. Le filtre `À retester` affiche uniquement les fonctions dont le heading contient le tag `[modification]` (champ `needsRetest: true`), indiquant que le code source a été modifié depuis le dernier test.
  - **Favoris** : bouton étoile (`star`/`star_border`) sur chaque section feuille → (dé)marque en favori (POST `/api/admin/tests/favorites { folderId, favorite }`, persistant). Chip filtre **« Favoris »** (★) pour n'afficher que les sections favorites. Chargé via GET `/api/admin/tests/favorites`.
  - Quand une recherche ou un filtre est actif, l'arbre se déplie automatiquement sur les résultats ; message "Aucun résultat" si vide.
  - **Surcharge « afficher toute la section »** : sous un filtre actif, une section feuille n'affiche que ses fonctions correspondantes. **Cliquer sur le titre de la section** bascule l'affichage de **toutes** ses fonctions (malgré le filtre) ; re-cliquer ré-applique le filtre (`onCahierNodeClick` → `toggleSectionFull`, signal `forceFullPaths`). Badge bleu **« Tout »** affiché tant que la surcharge est active. Réinitialisé automatiquement dès que le filtre/recherche change.
  - **Nœud** : chevron, badge ID cliquable (copie), icône (`folder`/`folder_open` pour une catégorie, `description` pour une section feuille), nom (`pageTitle` ou nom du dossier), compteur de fonctions, bouton "Lancer un test sur cette section" (sur une feuille → pré-coche la section + bascule Exécution), bouton "Ouvrir le dossier local" (POST `/api/admin/tests/open-folder { path }`).
  - **Tableau des fonctions** (déplié sur une section feuille) : colonnes `#` / `Action / Titre` / `ID` / `Étapes` / `Priorité` / `État`.
    - Action / Titre : libellé de la fonction (`section`) + résumé (1re ligne du contenu).
    - ID : badge cliquable → copie dans le presse-papiers.
    - Étapes : nombre de puces (`- …`) du contenu markdown.
    - **Priorité** : `mineur` (jaune) / `critique` (orange) / `bloquant` (rouge), **éditable** via un select → POST `/api/admin/tests/function-priority { itemId, priority }` (réécrit la ligne `- **Priorité:**` du fonctions.md). Voir `2-1-5-12`.
    - État : dernier résultat décidé (`OK` vert / `KO` rouge / `non testé`) + date du dernier test.
  - **Clic sur une ligne de fonction** : déplie le contenu markdown complet (liste des tâches, via `renderContent`).
- **Croisement avec les résultats** (`2-1-5-8`) : les nœuds et lignes sont colorés selon les derniers résultats (matrice GET `/api/admin/tests/matrix`).

---

## `2-1-5-2` — Onglet Exécution — campagne en cours (runner OK/KO/ND)

- **Périmètre** : le run ne couvre que les fonctions des sections sélectionnées (filtrage par `activeRun.results`).
- **En-tête** : "Campagne en cours — testeur (— nom)", progression `X% (A/B)`, indicateur de sauvegarde, bouton "Annuler", bouton "Terminer le test".
- **Bouton "Annuler"** : confirmation d'abandon → DELETE du run (voir `2-1-5-6`).
- **Barre de progression** : s'incrémente à chaque item décidé (OK ou KO).
- **Groupes de fonctions** : organisés par `pageTitle` + badge `folderId`.
- **Par item** :
  - Badge ID cliquable (copie presse-papiers via `navigator.clipboard`).
  - Libellé de la section, dépliable → contenu markdown des tâches.
  - **État du dernier test précédent** (à gauche des boutons) : pastille `OK`/`KO` (verte/rouge) + label « préc. », issue du dernier run décidé **hors run en cours** (`funcPrevious` = `funcLatest` excluant `activeRun.id`). Absente si la fonction n'a jamais été testée. La matrice est rechargée au lancement du run pour fiabiliser cet historique.
    - **Sous la pastille** : nom du **testeur** (icône `person` ; `IA` + icône `smart_toy` pour un run automatique) + **date** du test (`testedAt` réel si dispo), et, si le run était une **campagne**, son **nom** (icône `campaign`). Infobulle complète au survol (statut + testeur + date + campagne).
  - **Flèche de tendance** entre l'état précédent et la décision en cours (`resultTrend`) : `trending_up` vert si **corrigé** (KO→OK), `trending_down` rouge si **régression** (OK→KO).
  - 3 boutons : **OK** (vert) / **KO** (rouge) / **ND** (gris).
  - Si KO → champ note optionnel.
- **Auto-save** : debounce 2 s → PUT `/api/admin/tests/runs/:id { results }`.
- **Bouton "Terminer le test"** : sauvegarde + `status:'completed'` → recharge runs + matrice → bascule sur l'onglet Résultats.

---

## `2-1-5-3` — Onglet Résultats — matrice runs × fonctions

- **Chargement** : GET `/api/admin/tests/matrix` → tous les runs (ordre chronologique) avec leurs résultats (statut, note, date).
- **Barre d'outils** : « Tout ouvrir / Tout fermer » (accordéon des sections), filtre **« KO uniquement »** (ne garde que les lignes/sections avec au moins un KO), **légende** (OK/KO/·/—).
- **Tableau matrice** (en-têtes collants, 1re colonne collante) :
  - **Colonnes = runs / campagnes** : badge **CAMPAGNE** + nom si campagne, date courte, mode (`IA` / testeur), ratio `OK/décidées`, **score global** coloré (vert ≥80, ambre ≥50, rouge <50), suppression au survol (DELETE `/api/admin/tests/runs/:id`).
  - **Lignes = fonctions groupées par section** :
    - Ligne section **cliquable** (accordéon) : nom + folderId + compteur + **verdict de section** par run (voir `2-1-5-12` : vert = valide ✓ / rouge = invalide ✗ + %, infobulle = raison), et **MAJ** (date + IA).
    - Ligne fonction : pastille **couleur de priorité** + libellé + cellule par run → **OK** / **KO** (icône note si présente) / `·` (non décidé) / `—` (non couvert). **Infobulle** par cellule : statut + note + date.
- **Seuils d'invalidation** éditables dans la barre d'outils (voir `2-1-5-12`).
- **Filtrage** : seules les sections réellement couvertes par au moins un run sont affichées.
- **Vide** : "Aucune campagne exécutée." si aucun run ; "Aucune ligne KO." si le filtre KO ne renvoie rien.

---

## `2-1-5-4` — IDs de fonctions

- **Format ID** : `{dossierID}-{N}` où `dossierID` vient de `_registry.json` (ex: `2-5-2-3`) et `N` est séquentiel dans le fichier.
- **Badge ID cliquable** : copie l'ID dans le presse-papiers (utile pour référencer une fonction à tester via IA).
- **Registre** : `tests/fonctions/_registry.json` — source de vérité pour les IDs de dossiers.

---

## `2-1-5-5` — États

| État | Description |
|------|-------------|
| Chargement fonctions | Spinner (onglet Cahier / sélection sections) |
| Aucune fonction | Message + invitation à rafraîchir |
| Item déplié (Cahier) | Contenu markdown des tâches affiché |
| Campagne en cours | En-tête + barre de progression + boutons OK/KO/ND |
| Auto-save | Indicateur "Sauvegarde…" |
| Note KO visible | Input texte sous l'item KO |
| Chargement matrice | Spinner (onglet Résultats) |
| Matrice vide | "Aucune campagne exécutée." |
| Run IA en cours | Bannière indigo + journal live |

---

## `2-1-5-6` — Onglet Exécution — configuration de lancement & confirmations

- **Configuration inline** (visible tant qu'aucune campagne n'est en cours) :
  - **Type** : `Test ponctuel` (1 run = 1 colonne) ou `Campagne`.
    - Campagne : sélecteur `Nouvelle campagne` (+ nom) ou **campagne ouverte existante** (`openCampaigns` = runs `isCampaign` in_progress). Permet de tester des sections **petit à petit** et de les regrouper dans **une seule colonne** de résultats.
  - **Toggle mode** : Automatique (IA) / Manuel (testeur).
  - **Catégories à tester** : chips de sections testables + chip "Toutes (N)" ; sélection multiple (compteur de fonctions couvertes).
  - **Commentaire** (test ponctuel) : transmis comme `name` du run.
  - **Mode Manuel** : champ "Nom du testeur" + bouton "Démarrer le test / la campagne / Ajouter à la campagne".
  - **Mode IA** : voir `2-1-5-7` + bouton "Lancer l'analyse IA / Ajouter à la campagne (IA)".
- **Création** : POST `/api/admin/tests/runs { tester, name, folderIds, isCampaign?, [mode/aiProvider/aiModel/prompt] }`.
- **Ajout à une campagne** : POST `/api/admin/tests/runs/:id/add-sections { folderIds }` — ajoute les fonctions des sections (en `pending`, sans réinitialiser l'existant), rouvre le run. En IA, seules les fonctions **pending** sont testées (ajout incrémental).
- **Runner campagne** : boutons "Enregistrer (ajouter d'autres sections)" (`saveAndExit` : enregistre, garde la campagne ouverte, recale la cible) et "Clôturer la campagne" (`completeRun`).
- **Popup de confirmation** (annulation / suppression) :
  - **Annuler un test en cours** : abandon = DELETE du run.
  - **Supprimer un run** (depuis la matrice) : DELETE.
  - Boutons : "Retour" (annule) / "Abandonner" ou "Supprimer" (confirme).

---

## `2-1-5-7` — Mode automatique (test IA via Claude Code + Browser MCP)

- **Toggle Manuel / Automatique (IA)** dans la configuration de l'onglet Exécution.
- **Mode IA** :
  - **Sélecteur IA** : providers CLI agentiques actifs dans admin/config (Claude Code, Antigravity) — depuis `ConfigService.cliConfig().availableProviders` (type `cli`).
  - **Sélecteur Modèle** : `modelsList[baseId]` du provider choisi.
  - **Mémorisation du choix** : tout changement de provider ou de modèle (formulaire d'exécution, popup de génération, popup nouvelle section) est **persisté** via `ConfigService.saveHeaderSelection(provider, model)` (`headerSelection`, partagé avec le sélecteur IA du header). Tous les formulaires IA se ré-initialisent depuis ce choix (`onAiModelChange` / `onGenModelChange` / `onCsModelChange` + `persistAiSelection`), de sorte que la dernière IA/modèle utilisée est proposée par défaut au prochain test.
  - **Consignes éditables** (textarea) : intro du prompt, modifiable.
  - **Format de retour imposé** (lecture seule) : exemple `@@TEST_RESULT@@{"itemId":…,"status":"ok|ko|nd","note":…}` pour un retour constant.
  - **Lancer l'analyse IA** : POST `/runs { mode:'ai', aiProvider, aiModel, prompt, folderIds }`.
- **Exécution** : `GET /api/admin/tests/runs/:id/ai-stream` (SSE, auth `?token=`) construit le prompt (consignes + format imposé + liste des fonctions), appelle l'executor local `/execute-prompt` (Claude Code / agy pilotent le navigateur via l'extension **Browser MCP**), parse les lignes `@@TEST_RESULT@@`, persiste chaque résultat et ré-émet en SSE (`start`, `case-result`, `ai-log`, `complete`, `ai-error`, `run-failed`).
- **Deux mécanismes de capture selon le provider** :
  - **Claude** : émet les `@@TEST_RESULT@@` sur **stdout** → le serveur parse le flux stdout de l'executor.
  - **Antigravity (`agy`)** : `agy -p` n'écrit **jamais** sur stdout (print mode = modifications de fichiers). Le serveur écrit un **fichier de tâches** (lu par agy) + un **fichier de sortie** sous `data/tests-admin/ai-runs/<runId>/`, envoie un prompt directif (agy ÉCRIT les `@@TEST_RESULT@@` dans le fichier via son outil d'écriture), et **poll ce fichier** toutes les 1,5 s pour émettre les `case-result`. L'executor spawn agy **directement** (pas `cmd /c`, chemin résolu via `where agy`), `cwd` = racine projet. Voir aussi le CLI `tests/run-recette-cli.js` (même approche).
- **Retours en direct (`ai-log`)** : tout le stdout/stderr/info de l'IA (hors lignes sentinelles) est forwardé en temps réel via l'événement SSE `ai-log` `{ stream, text }`.
- **Runner IA** (onglet Exécution) : bannière « L'IA teste… (X/Y) » + spinner pendant `aiRunning`, résultats remplis **progressivement** ; à la fin → « Tests IA terminés — à revoir » (revue manuelle puis Terminer).
- **Journal live** (panneau « Retours en direct de l'IA », collapsible) : affiche au fil de l'eau les lignes `ai-log`, les verdicts (`case-result`) et les messages début/fin/erreur. Coloration par flux, auto-scroll, borné à 500 lignes, compteur, réinitialisé à chaque lancement.
- **Résultats** : badge mode `IA` sur les colonnes de runs automatiques dans la matrice.
- **Pré-requis** : extension **Browser MCP** installée + enregistrée auprès de Claude Code (`claude mcp add`), onglet de l'app **connecté** relié à Browser MCP, executor (port 3002) lancé.
- **Champs run** : `mode:'ai'`, `aiProvider`, `aiModel`, `aiState` (`idle|running|done|error`), `prompt`.

---

## `2-1-5-8` — Cahier de recette — couleurs d'après les derniers résultats

- **Source** : `GET /api/admin/tests/matrix` (chargé à l'init et à l'ouverture du Cahier).
- **Dernier état par fonction** (`funcLatest`) : pour chaque fonction, le dernier résultat **décidé** (OK/KO) tous runs confondus, avec sa date (le plus récent par `startedAt`). Un résultat `pending` n'écrase pas un état décidé.
- **Agrégat par nœud** (`cahierStats`) : chaque fonction remonte sur tous ses chemins ancêtres → par section ET par catégorie : `total`, `ok`, `ko`, `untested` (jamais décidé), `pct` = OK/(OK+KO), `lastDate`.
- **Couleur d'un nœud** : **rouge** si ≥1 fonction KO, **vert** si tout décidé est OK, **gris** si rien testé. Rendu : liseré gauche + fond teinté de l'en-tête.
- **Bloc état dans l'en-tête** : `pct%` (coloré), `X OK / Y KO`, badge `Z non testé(s)`, date du dernier test (`jj/mm hh:mm`).
- **Ligne de fonction** : fond teinté (vert/rouge/neutre) + colonne **État** (`OK`/`KO`/`non testé`) + date du dernier test.

---

## `2-1-5-9` — Cahier de recette — génération/mise à jour des fonctions par IA

- **Bouton par section** (icône `auto_fix_high`, à côté de Lancer/Ouvrir) sur chaque section feuille → ouvre un popup.
- **Popup** : sélecteur IA (providers CLI agentiques de admin/config), sélecteur Modèle, consignes éditables, **case « Récupérer les composants liés à chaque fonction »**, journal live, boutons Annuler/Fermer + « Lancer la mise à jour ».
- **Composants liés** : si l'option est cochée, l'IA renseigne le champ `components` de chaque proposition. À l'application, le serveur écrit une ligne \`- **Composants:** \`chemin\`, …\` sous la fonction ; au scan, \`extractFunctionComponents\` les reparse → champ \`components[]\`, **affiché en chips** sous le titre dans le Cahier (`2-1-5-1`). Paramètre SSE \`components=1|0\`.

---

## `2-1-5-10` — Revue & validation des propositions avant migration

- **Déclenchement** : à la fin de la génération IA (`2-1-5-9`), un popup de revue s'ouvre avec la liste des propositions.
- **En-tête** : compteurs `+ajouts`, `modifs`, `suppr.`, `inchangées`.
- **Par proposition** : badge `op` coloré (Ajout vert / Modif ambre / Suppr rouge / Inchangée gris), badge ID (`nouveau` si ajout), libellé, chips composants, et **case à cocher** (sauf inchangées). Dépliable :
  - **Modif** : vue **Avant / Après** côte à côte (contenu rendu).
  - **Ajout / Suppr** : contenu de la fonction.
- **Sélection** : ajouts/modifs/suppressions cochés par défaut ; l'utilisateur décoche ce qu'il refuse. Compteur de changements sélectionnés.
- **Appliquer** : le client construit la liste finale (ordre existant + modifs/suppressions validées + ajouts validés) → POST `/api/admin/tests/apply-functions { folderId, functions }`.
- **Historique** : chaque application est enregistrée (`2-1-5-11`) et listée dans l'onglet Historique.
- **Endpoint application** : `POST /api/admin/tests/apply-functions { folderId, functions, updatedBy, changes }` réécrit le `fonctions.md` (`writeFonctionsMd` : conserve le titre `#`, assigne les nouveaux IDs en continuant après le max, normalise la ligne Composants), invalide le cache, renvoie les fonctions à jour. Le Cahier recharge fonctions + couleurs.
- **Date + IA de mise à jour** : à l'application, le serveur écrit un commentaire \`<!-- worganic:meta updatedAt="…" updatedBy="…" -->\` en tête du fichier (`updatedBy` = provider + modèle). Reparsé au scan (`parseFonctionsMd`) → champs \`updatedAt\`/\`updatedBy\` sur chaque fonction, affichés : (1) en **chip discret dans l'en-tête** de section (date courte + IA, masqué sur petit écran), et (2) en **bandeau au-dessus du tableau des tests** quand la section est dépliée (« Fonctions mises à jour le {date} par {IA} »).
- **Objectif** : l'IA analyse le **code** de la section (composants Angular, templates, routes serveur) et **propose** la liste cible des fonctions à tester (ajouts/corrections/suppressions), en respectant le **système d'IDs** existant (format `## \`{folderId}-{N}\` — Libellé`, tiret long, pas de renumérotation, IDs supprimés non réattribués). **Aucune écriture directe** du `fonctions.md`.
- **Endpoint proposition** : `GET /api/admin/tests/generate-functions-stream?folderId=&provider=&model=&prompt=&components=&token=` (SSE). Résout `folderId`→path via `_registry.json`, prépare un fichier de sortie `data/tests-admin/gen-runs/<id>/proposals.json`, construit un prompt demandant à l'IA d'**écrire un tableau JSON** (liste cible : `id` réutilisé si existant, omis si nouveau, `section`, `tasks`, `components?`), appelle l'executor local `/execute-prompt` (`cwd` = racine), streame (`start`, `ai-log`, `ai-error`, `complete`, `run-failed`). À la fin, lit le JSON et calcule le **diff** vs l'existant (`computeFunctionProposals`) → `op` = `add|modify|delete|unchanged`, renvoyé dans `complete.proposals`.
- **Popup de revue** (`2-1-5-10`) : avant migration, l'utilisateur valide chaque ajout/modif/suppression.
- Fonctionne avec Claude Code et Antigravity (tous deux écrivent le fichier JSON).

---

## `2-1-5-11` — Onglet Historique des mises à jour du référentiel

- **Onglet « Historique »** (icône `history`) : liste, du plus récent au plus ancien, chaque **application** de mise à jour des fonctions (générations IA validées).
- **Source** : `GET /api/admin/tests/functions-history` (fichier `data/tests-admin/functions-history.json`). Une entrée est créée à chaque `apply-functions` ayant au moins un changement.
- **Par entrée** : date, section (`pageTitle` + `folderId`), IA (`updatedBy`), badges de compteurs (+ajouts `green` / ~modifs `amber` / −suppr `red`). **Dépliable** : listes détaillées des fonctions ajoutées / modifiées / supprimées, chacune avec **badge de priorité** (couleur), ID, libellé et une **explication courte** (ajout : résumé ; modification : ce qui a changé — libellé/tâches/composants/priorité avant→après ; suppression : ancien résumé). Total après mise à jour.
- **Diff** : fourni par le client à l'application (`changes` = added/modified/deleted avec `priority` + `explanation`), persisté tel quel.
- **Échange IA complet** : chaque entrée issue d'une génération conserve le **prompt envoyé** (`aiPrompt`) et la **réponse brute de l'IA** (`aiResponse`), affichés dans un bloc dépliable « Échange IA complet (prompt + réponse) » — utile pour vérifier que l'IA renvoie bien les infos demandées (dont la priorité). Transmis par le SSE `complete` de la génération (`prompt`, `rawResponse`) puis au POST apply.

---

## `2-1-5-12` — Priorité des fonctions & validation des sections

- **Priorité par fonction** : `mineur` / `critique` / `bloquant`, stockée dans le `fonctions.md` (ligne `- **Priorité:** …`), parsée (`extractFunctionPriority`) en champ `priority`.
  - **Renseignée par l'IA** lors de la génération (champ `priority` du JSON de propositions, voir `2-1-5-9`) — le prompt impose d'évaluer fonction par fonction avec exemples (connexion/inscription/paiement/sauvegarde = `bloquant`, etc.) ; le serveur normalise les synonymes FR/EN (`normalizePriority`).
  - **Éditable manuellement** dans le Cahier (select par fonction) → POST `/api/admin/tests/function-priority`.
- **Validation d'une section (onglet Résultats)** — par section et par run :
  - **1 bloquant KO ⇒ section invalide** (quel que soit le reste).
  - sinon **% de critiques KO > seuil critique** (défaut 15%) ⇒ invalide.
  - sinon **% de mineurs KO > seuil mineur** (défaut 40%) ⇒ invalide.
  - sinon valide (si au moins une fonction décidée ; sinon « non testée »).
- **Seuils modifiables** dans la barre d'outils de l'onglet Résultats (2 champs %), persistés : GET/POST `/api/admin/tests/settings { critiqueThreshold, mineurThreshold }`.
- **Affichage** : la cellule de score de section devient verte (✓ valide) ou rouge (✗ invalide) avec le %, infobulle = raison de l'invalidation.

## `2-1-5-14` — Créer une nouvelle section de tests avec l'IA

- **Bouton "Nouvelle section"** (indigo, icône `add_circle`) dans la barre en haut à droite d'Admin › Tests, visible en permanence (tous onglets).
- **Popup "Nouvelle section de tests"** : formulaire de création avant génération IA.
  - **Section parente** : dropdown listant tous les nœuds de `cahierTree()` (catégories et sections existantes), libellé indenté (`csNodeLabel`) incluant `fullPath`. Option "— Racine —" pour créer au premier niveau.
  - **Nom de section** (`slug`, `font-mono`) : kebab-case, normalisé à la soumission (`trim + lowercase + replace(/[^a-z0-9-]/g, '-')`).
  - **Titre de la page** : libellé affiché dans le cahier de recette.
  - **Objectif / précisions** : champ libre ajouté automatiquement au prompt de base lors de la génération.
  - **Provider IA + Modèle** : sélecteurs identiques à ceux du popup de génération (pré-remplis depuis `headerSelection` d'admin/config).
  - **Checkbox "Composants liés"** : idem génération classique.
  - **Bouton "Créer & Générer avec l'IA"** : désactivé si slug ou titre vide ou provider absent. Spinner pendant la création.
  - **Annuler** : fermeture sans modification (bouton ✕ ou "Annuler" ; interdit si `csRunning`).
- **Flux de création** (`confirmCreateSection()`) :
  1. POST `/api/admin/tests/create-section { parentPath, slug, pageTitle }` → crée le dossier `tests/fonctions/<parentPath>/<slug>/`, un `fonctions.md` minimal, et une entrée dans `_registry.json` (ID hiérarchique calculé : enfant suivant du parent, ou prochain ID racine si pas de parent).
  2. Recharge le référentiel (`refreshFunctions()`).
  3. Pré-remplit le popup de génération (`showGenPopup`) avec : `folderId`, `pageTitle`, provider/modèle choisis, prompt = `defaultCreateSectionInstructions()` + objectif utilisateur.
  4. Ferme le popup de création et ouvre le popup de génération existant.
- **Serveur POST `/api/admin/tests/create-section`** :
  - Valide `slug` (regex `[a-z0-9-]+`), `pageTitle` requis.
  - Vérifie l'unicité du chemin dans le registry (409 si doublon).
  - Exige que `parentPath` soit dans le registry (400 sinon).
  - Calcule le prochain ID (max des frères + 1, ou 1 si aucun frère).
  - Crée dossier + `fonctions.md` (`# <pageTitle>\n`) + met à jour `_registry.json` (trié numériquement).
  - Enregistre le `folderId` dans `tests/fonctions/_user-created.json` (tableau JSON persistant).
  - Invalide `_functionItemsCache` (côté serveur).
- **Tag "Personnalisée"** (badge violet, icône `person_add`) affiché sur les sections créées via ce flux :
  - `scanAllFunctions()` lit `_user-created.json` et injecte `userCreated: true` sur chaque `FunctionItem` du dossier concerné.
  - Badge visible dans le **Cahier** (nœud feuille), dans l'onglet **Résultats** (en-tête de groupe matrice) et l'onglet **Exécution** (en-tête de groupe runner).
  - Méthode `isSectionUserCreated(folderId)` : retourne `true` si au moins un item de ce dossier a `userCreated: true`.

## `2-1-5-15` — [modification] Détection automatique des fonctions à retester après modification de code

- **Déclencheur** : après chaque modification de code (composant Angular, service, template, route Express) par Claude Code, le système vérifie si le fichier modifié est référencé dans les tests pré-programmés.
- **Sources de détection** :
  - **Méthode exacte** : lignes `- **Composants:** …` dans les `fonctions.md` contenant le nom ou chemin du fichier modifié.
  - **Méthode structurelle** : table de correspondance Composant → `fonctions.md` dans CLAUDE.md.
- **Tag `[modification]`** : ajouté par Claude Code directement dans le heading `##` du `fonctions.md` concerné, entre le tiret long et le libellé.
  - Format : `## \`2-5-2-3-4\` — [modification] Onglets de mode`
  - Non dupliqué si déjà présent.
- **Champ serveur** : `parseFonctionsMd` détecte `[modification]` après le tiret long → expose `needsRetest: true` et retire le tag du libellé affiché. `writeFonctionsMd` réinjecte le tag tant que `needsRetest` reste vrai (survie aux éditions de priorité et aux générations IA `apply-functions`).
- **Retrait automatique** : `PUT /api/admin/tests/runs/:id` appelle `clearModificationTagForItems(itemIds)` pour chaque fonction décidée (OK/KO) → le tag disparaît du heading. Il reste donc tant que la section n'a pas été retestée.
- **Filtre "À retester"** dans l'onglet Cahier de recette (5e chip d'état) : voir `2-1-5-1`. N'affiche que les fonctions `needsRetest: true`.
- **Visuel** : badge ambre **« Modification »** (icône `edit_note`) affiché (1) sur l'en-tête de nœud de section si ≥1 fonction enfant a `needsRetest` (`isSectionNeedsRetest(folderId)`), et (2) devant le libellé de chaque fonction taguée dans le tableau (`item.needsRetest`).

---

## `2-1-5-13` — [modification] Onglet Site Map graphique

- **5e onglet "Site Map"** (`account_tree`) dans la barre Admin › Tests.
- **Carte SVG interactive** reflétant le **parcours réel de l'utilisateur** (et non un simple listing de routes), avec pan/zoom.
  - **Groupes encadrés** (pointillés colorés, label) = parties du système : `Public :4202`, `App connectée :4202` (menu Documents · Projets · Admin), `Admin` (onglets, réservé admin), `App Projets :4203`, `Outils & widgets embarqués`.
  - **Nœuds cliquables** par page : fond coloré selon le type (`public` sky / `protected` indigo / `admin` ambre / `projets` émeraude / `widget` violet), label + URL + badge port.
  - **Structure réelle du menu** : les entrées de navigation (Documents, Projets→:4203, Historique conditionnel, Config, Déploiements, Admin) sont des nœuds dans le groupe « App connectée ».
  - **Onglets Admin réels** (ordre du registry) en nœuds dans le groupe Admin : Projets, Utilisateurs, Déploiement, Config, Thème, Méga-outils, Mémo, Outils, Tests.
  - **Onglets internes** affichés sous l'URL pour les pages tabulées (Éditeur de projet, onglet Tests).
  - **Arêtes dirigées** (Bézier) : navigation `connexion` (vert), `cross-app` (orange), `nav` (indigo) ; **relations fonctionnelles** en pointillés violet (`relation`) entre éléments — ex : `Méga-outils → Éditeur de projet` (Trello instancié dans l'admin, utilisé dans l'éditeur), `Outils → widgets` (visibilité TchatIA/Tickets/Cahier), `Outils → Historique` (active l'entrée de menu), `Config (admin) → Config (user)` (même composant), `Admin Projets → Liste projets`.
- **Zoom et déplacement** :
  - **Molette** : zoom in/out (min 15%, max 250%).
  - **Cliquer-glisser** sur le fond : pan.
  - **Barre d'outils** : boutons `−` / `+` / reset (`center_focus_strong`), % de zoom courant.
- **Déplacement des nœuds (drag & drop)** :
  - Glisser un nœud le repositionne ; les **liaisons suivent** le déplacement en temps réel (positions recalculées).
  - Un clic sans mouvement (< 3px) ouvre/ferme le volet de détails ; au-delà, c'est un déplacement.
  - La disposition (nœuds + zones) est **persistée en localStorage** (`wo_sitemap_layout_v2`) et survit au rechargement.
  - Bouton **« Disposition »** (`restart_alt`) dans la barre d'outils : restaure la disposition par défaut (nœuds + zones).
- **Déplacement & redimensionnement des zones (groupes)** :
  - Glisser la **bordure** (le contour réagit, l'intérieur reste libre pour le pan) ou l'**étiquette** de la zone la déplace ; **tous les nœuds internes suivent** du même delta.
  - **Poignée de redimensionnement** (coin bas-droit, `nwse-resize`) : agrandit/réduit la zone (min 160×120 px). Les nœuds ne bougent pas au redimensionnement.
- **Multi-sélection & alignement de nœuds** :
  - **Ctrl/Maj+clic** ajoute/retire un nœud de la multi-sélection (contour cyan épais). Un clic simple réinitialise la sélection.
  - Glisser un nœud déjà multi-sélectionné **déplace tout le groupe** ensemble.
  - **Barre d'alignement** (visible dès 2 nœuds) : aligner gauche / centre vertical / droite, haut / milieu horizontal / bas ; **répartir** horizontalement/verticalement (dès 3 nœuds) ; bouton « Effacer la sélection ».
- **Créer / lancer un test depuis un nœud** (volet de détails) :
  - **« Lancer »** (vert, `play_circle`) sur chaque section de test liée → pré-sélectionne la section et bascule sur l'onglet Exécution.
  - **« Créer une section de test ici »** (indigo, `add`) → ouvre le popup de création pré-rempli (section parente = chemin du nœud, titre/slug d'après le label).
- **Carte en pleine largeur** : la zone SVG occupe toute la largeur disponible ; le volet de détails s'affiche en **overlay** (coin haut-droit) au clic sur un nœud, sans réduire la largeur de la carte.
- **Lisibilité des liaisons** : chaque arête est tracée avec un **halo sombre** sous le trait coloré (la liaison reste lisible quand elle survole un nœud), une courbure de Bézier plus ample, et son libellé posé **sur la courbe** (point à t=0.5) dans une pastille bordée de la couleur de l'arête.
- **Volet latéral** (clic sur un nœud) :
  - Label, URL, badges (type + port), description (rôle dans le parcours).
  - Liste des **composants Angular** réels du nœud.
  - Liste des **onglets** (si page tabulée).
  - Liste des **chemins du cahier de recette** associés.
  - Bouton « Ouvrir la page » (`http://localhost:<port><url>`) ou mention « Widget embarqué » si pas de route propre.
- **Filtre par section du cahier de recette** :
  - Dropdown listant toutes les sections (mêmes données que l'onglet Exécution).
  - Section sélectionnée → nœuds liés mis en surbrillance (autres en opacité réduite) + chip avec ✕.
  - **Bouton "Voir seulement cette section"** : masque les nœuds/groupes non liés à la section.
- Composants : `AdminTestsComponent` (onglet `sitemap`), données par défaut `SM_BASE_GROUPS`, `SM_BASE_NODES`, `smEdges` dans le TS ; signaux `smGroups`/`smNodes` pour la disposition éditable (à maintenir à jour avec les routes/onglets réels).
