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
