# AgendaOutilComponent

## Fonctionnement Général

Outil projet de type `agenda` affichant un calendrier interactif en 3 vues (Mois, Semaine, Année). Les événements sont liés au projet et stockés en tant que fichiers JSON individuels dans `data/projets/{projectId}/agenda/`.

## Entrées / Sorties

### Inputs
| Input | Type | Description |
|-------|------|-------------|
| `projectId` | `string \| null` | ID du projet (nom dossier), déclenche le chargement des événements |
| `projectName` | `string` | Nom affiché du projet |
| `activeOutilId` | `string \| null` | ID de l'instance d'outil active |

### Outputs
Aucun output (l'outil gère ses données de manière autonome via `AgendaOutilService`).

## Dépendances

- `AgendaOutilService` (`@worganic/portail-core/data-access`) — CRUD événements
- `AgendaEvent` (interface) — modèle de données événement

## Règles Métier

- Un événement est stocké dans un fichier `{eventId}.json` dans `data/projets/{projectId}/agenda/`
- L'outil ne dépend pas des `rootFolderIds` du projet (données indépendantes)
- Vue par défaut au chargement : Mois
- `ngOnChanges` relance `loadEvents()` à chaque changement de `projectId`
- Si `allDay = true`, les inputs datetime sont remplacés par des inputs date
- Suppression : irréversible, pas de corbeille

## Scénarios de Test

Voir `tests/fonctions/connecte/projets/editor/agenda-outil/fonctions.md` — IDs `2-5-2-10-1` à `2-5-2-10-4`.
