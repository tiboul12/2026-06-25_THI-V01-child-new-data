# Worganic Platform — Instructions pour Claude Code

## Information général sur les prompts

### Contexte pro
- Web designer/développeur no-code freelance
- Stack : Webflow (Client-First), Framer, Figma, Shopify
- Clients : PME francophones, artisans, indépendants

### Préférences de réponse
- Réponds en français, ton direct, tutoiement
- Pas d'introductions du type "Bien sûr, voici..."
- Code commenté en français quand c'est complexe
- Pas d'explications après le code sauf demande
- Pas de récap final, pas de disclaimers

### Bridage de l'output
- Tiens-toi strictement à ce que je demande, rien de plus
- Ne crée PAS de fichier ou document sans demande explicite
- Si la réponse tient en 3 phrases, ne fais pas 3 paragraphes
- Si je dis "oui" ou "ok", ne développe pas

---

## Architecture du projet (NX Monorepo)

```
worganic-monorepo/
├── apps/
│   ├── portail/               # App principale (port 4202)
│   └── projets/               # Sous-app projets (port 4203)
├── libs/
│   ├── shared/ui/             # Composants graphiques partagés
│   └── portail-core/
│       ├── auth/              # Guards, interceptors
│       └── data-access/       # Services, tokens d'injection
├── server/                    # API Express (port 3001)
├── electron/                  # Executor IA (port 3002)
├── data/                      # Données JSON, config, users
└── version.json               # Version locale courante { "version": "BX.XXX" }
```

### Commandes clés
```bash
npx nx serve portail           # Lance portail (4202)
npx nx serve projets           # Lance projets (4203)
npm run start:all              # Lance portail + api + projets
npx nx run-many --target=build --projects=portail,projets --no-progress
```

### Points d'attention
- Le serveur actif est `server/server-data.js` (pas server.js)
- Les routes Express doivent être déclarées **avant** le catch-all `app.get('*')`
- Les utilisateurs s'authentifient via `data/config/users.json`
- Token auth : `localStorage` clé `frankenstein_token`
- Libs utilisent des tokens d'injection (`API_DATA_URL`, `API_EXECUTOR_URL`, `APP_BRANDING`) — jamais `environment` directement
- Cross-origin localStorage (ports 4202/4203) : token + thème passés via URL params

---

## Règle obligatoire : Vérification de compilation Angular

**Après toute modification d'un fichier Angular**, vérifier la compilation avant de déclarer la tâche terminée.

### Commande de vérification
```bash
npx nx run-many --target=build --projects=portail,projets --no-progress 2>&1 | grep -E "(ERROR|error TS|✘|Failed)"
```
Aucune ligne → OK. Des lignes → corriger avant de continuer.

### Pièges fréquents

**Tailwind avec `/`** — `[class.xxx]` ne supporte pas les `/` :
- ❌ `[class.border-indigo-500/40]="condition"` → NG5002
- ✅ `[ngClass]="condition ? 'border-indigo-500/40' : ''"` → correct

**`<select>` en dark mode** — ajouter `dark:[color-scheme:dark]` :
```html
<select class="dark:bg-surface dark:[color-scheme:dark]">
```

**Boutons primaires** — `text-white dark:text-btn-text` nécessite `--btn-text-color` dans `data/child/theme.json` si la couleur primaire est claire.

**Fermeture des popups** — Ne jamais fermer un popup au clic sur le backdrop. La fermeture doit être explicite : bouton ✕, bouton Annuler, ou validation du formulaire. Ne pas utiliser `(click)="closePopup()"` sur le backdrop ni `$event.stopPropagation()` sur le contenu.

**Contraste texte sur fond clair/primary** — La couleur primary de ce thème est claire (dorée). Toujours utiliser `text-black` (jamais `text-white`) sur un fond `bg-primary`. Règle générale : sur tout fond clair (bg-primary, bg-white, bg-light-surface…), le texte doit être sombre (`text-black` ou `text-gray-900`).

**Interpolation Angular avec apostrophe** — Dans un template inline (backticks TypeScript), les singles quotes à l'intérieur de `{{ }}` ne doivent pas contenir d'apostrophe :
- ❌ `{{ cond ? 'Modifier l\'événement' : 'Créer' }}` → le `'` ferme la string, affiche le code brut
- ✅ `{{ cond ? "Modifier l'événement" : 'Créer' }}` → guillemets doubles pour les strings avec apostrophe

**`[class.dark:xxx]`** — Les bindings Angular `[class.xxx]` ne supportent pas les `:` (dark mode) :
- ❌ `[class.dark:text-white]="condition"` → classe jamais appliquée
- ✅ `[ngClass]="condition ? 'dark:text-white' : ''"` → correct

---

## Règle obligatoire : Historique des modifications

À chaque prompt, enregistrer une entrée dans `data/histoModif.json`.

### Format
```json
{
  "id": "mod-XXX",
  "version": "BX.XXX",
  "date": "<ISO 8601>",
  "type": "feature | fix | refactor | config",
  "commitType": "FIX | AMELIORATION | MERGE",
  "scope": ["portail", "server"],
  "features": "portail:header|footer,system:workflow",
  "title": "Titre court",
  "description": "Description détaillée.",
  "files": ["apps/portail/src/...", "libs/shared/..."],
  "ai": "Claude Code",
  "model": "claude-sonnet-4-6",
  "prompt": "<texte exact du prompt>",
  "startedAt": "<ISO 8601>",
  "completedAt": "<ISO 8601>"
}
```

### Scopes (déduits depuis les fichiers modifiés)
- `apps/portail/` → `"portail"`
- `apps/projets/` → `"projets"`
- `libs/shared/` → `"libs"`
- `server/` → `"server"`
- `data/` → `"data"`
- `CLAUDE.md`, `version.json`, `deploy-log.js` → `"system"`

### Procédure
1. Note `startedAt` dès réception du prompt.
2. Effectue la tâche.
3. Ajoute l'entrée dans `data/histoModif.json` (dernier ID + 1).

---

## Règle obligatoire : Workflow de fin de prompt

**À la fin de chaque prompt**, après l'enregistrement dans `histoModif.json`, poser via `AskUserQuestion` :

### Étape 1 — Validation fonctionnelle
```
Question : "Est-ce que tout fonctionne ?"
Options  : Oui, tout fonctionne | Non, il y a un problème
```
Si Non → corriger d'abord, puis reprendre.

### Étape 2 — Commit (si Oui)
```
Question : "Committer et pusher ce changement ?"
Options  : Oui, committer + pusher | Non, garder en local
```
Si Non → arrêt. L'entrée histoModif est déjà enregistrée.

### Étape 3 — Si Oui (en un seul AskUserQuestion à 3 questions)
```
Question 1 : "Type de version ?"
             → Mineure (+0.001) | Majeure (+1.000)
Question 2 : "Type de commit ?"
             → FIX | AMELIORATION | MERGE
Question 3 : "Titre du commit ?"
             → 3 propositions ≤ 60 car. + Other
```

---

## Règle obligatoire : Mise à jour des fonctions.md

**À chaque ajout, modification ou suppression d'une fonctionnalité**, mettre à jour le fichier `fonctions.md` correspondant dans `tests/fonctions/`.

### Table de correspondance Composant → fichier fonctions.md

| Composant / Zone | Fichier |
|-----------------|---------|
| Admin › Utilisateurs | `connecte/admin/utilisateurs/` |
| Admin › Déploiements | `connecte/admin/deploiements/` |
| Admin › Config | `connecte/admin/config/` |
| Admin › Thème | `connecte/admin/theme/` |
| Admin › Tests | `connecte/admin/tests/` |
| Page Config utilisateur | `connecte/config/` |
| Page Déploiements | `connecte/deploiements/` |
| Outil Tchat IA | `connecte/outils/tchat-ia/` |
| Outil Cahier Recette | `connecte/outils/cahier-recette/` |
| Outil Tickets | `connecte/outils/tickets/` |
| Outil Actions IA | `connecte/outils/actions-ia/` |
| Projets › Accueil | `connecte/projets/accueil/` |
| Éditeur › Toolbar | `connecte/projets/editor/toolbar/` |
| Éditeur › Sidebar | `connecte/projets/editor/sidebar/` |
| Éditeur › Zone Code | `connecte/projets/editor/zone-code/` |
| Éditeur › Zone Structure | `connecte/projets/editor/zone-structure/` |
| Éditeur › Zone Preview | `connecte/projets/editor/zone-preview/` |
| Éditeur › Conversation | `connecte/projets/editor/zone5-conversation/` |
| Éditeur › Historique | `connecte/projets/editor/zone5-historique/` |
| Éditeur › Commentaires F6 | `connecte/projets/editor/commentaires-f6/` |
| Landing | `non-connecte/landing/` |

### Procédure

1. Identifier le fichier `fonctions.md` correspondant au composant modifié.
2. **Nouvelle fonctionnalité** → ajouter un `##` heading avec ID + items.
3. **Modification** → mettre à jour les items concernés.
4. **Suppression** → retirer le `##` heading ou les items.
5. Inclure le chemin du fichier `fonctions.md` modifié dans `histoModif.json files`.

---

## Règle obligatoire : Tag `[modification]` sur les fonctions impactées par un changement de code

**Après chaque modification d'un fichier de code** (composant Angular, service, template, route Express), vérifier si ce fichier est référencé dans les tests pré-programmés et tagger les fonctions concernées.

### Procédure

1. **Détecter les fonctions impactées** — deux méthodes complémentaires :
   - **Méthode exacte** : chercher dans tous les `tests/fonctions/**/fonctions.md` les lignes `- **Composants:**` contenant le nom du fichier modifié (correspondance partielle sur le nom de fichier ou le chemin).
   - **Méthode structurelle** : utiliser la table "Composant → fonctions.md" ci-dessus pour identifier le `fonctions.md` dont la portée couvre le composant modifié.

2. **Ajouter le tag `[modification]`** sur chaque heading `##` impacté :
   - Avant : `## \`2-5-2-3-4\` — Onglets de mode`
   - Après  : `## \`2-5-2-3-4\` — [modification] Onglets de mode`
   - Ne pas dupliquer si le tag est déjà présent.

3. **Ne pas retirer le tag manuellement** — il est retiré automatiquement par le serveur lors de l'enregistrement d'un résultat de test (OK ou KO). Le tag reste donc tant que la section n'a pas été retestée.

### Mécanisme côté serveur (implémenté — `server/server-data.js`)

- `parseFonctionsMd` détecte `[modification]` juste après le tiret long → expose `needsRetest: true` et retire le tag du libellé affiché.
- `writeFonctionsMd` **réinjecte** `[modification]` quand `needsRetest` est vrai → le tag survit aux réécritures (édition de priorité, génération IA `apply-functions`).
- `clearModificationTagForItems(itemIds)` retire le tag du heading ; appelé par `PUT /api/admin/tests/runs/:id` pour chaque fonction décidée (OK/KO).

### Côté UI (Admin › Tests › Cahier de recette)

- **Filtre « À retester »** dans la barre de filtres d'état (`Toutes / Testées / Non testées / En erreur / À retester`) → n'affiche que les fonctions `needsRetest: true`.
- **Badge ambre « Modification »** affiché sur le nœud de section (si ≥1 fonction à retester) et devant le libellé de chaque fonction taguée.

### Rapport obligatoire en fin de prompt — composants modifiés & tests liés

**À la fin de chaque prompt** (juste avant le workflow de validation), afficher un récapitulatif :

1. **Composants modifiés** : la liste des fichiers de code modifiés pendant le prompt.
2. **Tests liés** : pour chacun, indiquer s'il existe des fonctions de test référençant ce fichier (via `Composants:` ou la table de correspondance) et **lesquelles** (ID + libellé), ou « aucun test lié ».
3. **Tags posés** : la liste des fonctions sur lesquelles le tag `[modification]` a été ajouté.

Format suggéré :

```
Composants modifiés & tests liés :
- apps/.../projet-editor-zone.component.html
    → 2-5-2-3-5 (Barre de formatage mode Code) [tag posé]
    → 2-5-2-3-9 (Menus déroulants barre de formatage) [tag posé]
- server/server-data.js
    → aucun test lié
```

Si aucun fichier de code n'a été modifié (doc/config uniquement), l'indiquer en une ligne.

---

## Règle obligatoire : IDs de fonctions testables

Chaque `##` heading dans un `fonctions.md` est une fonction testable avec un **ID unique hiérarchique**.

### Format obligatoire des headings

```markdown
## `{folderID}-{N}` — Libellé de la fonction
```

Exemple : `## \`2-5-2-3-4\` — Onglets de mode`

Le tiret entre l'ID et le libellé est un **tiret long** (—, U+2014).

### Registre des IDs de dossiers

Le fichier `tests/fonctions/_registry.json` est la source de vérité. Il mappe chaque chemin de dossier à son ID hiérarchique.

Extrait :
```
"2-5-2-3" → "connecte/projets/editor/toolbar"
"2-5-2-4" → "connecte/projets/editor/zone-code"
```

### Attribution d'un ID à une nouvelle fonction

1. Lire `tests/fonctions/_registry.json` → trouver l'ID du dossier (ex: `2-5-2-3`)
2. Lire le `fonctions.md` → identifier le dernier `N` utilisé
3. Incrémenter : si le dernier est `2-5-2-3-7`, le prochain est `2-5-2-3-8`
4. Écrire : `## \`2-5-2-3-8\` — Nom de la nouvelle fonction`

### Création d'un nouveau dossier tests/fonctions/

1. Choisir le prochain ID disponible dans la hiérarchie
2. Ajouter l'entrée dans `tests/fonctions/_registry.json`
3. Créer le fichier `fonctions.md` avec les headings et IDs

### Règles d'immuabilité

- Un ID attribué **ne change jamais**, même si la section est renommée
- Si une fonction est supprimée, son ID est **définitivement retiré** (jamais réattribué)
- Ne pas renuméroter les IDs existants pour combler les trous

### Utilité pour les tests IA

L'ID permet à un agent IA de référencer une fonction précise, ex: "teste la fonction `2-5-2-3-4`".

---

## Règle obligatoire : Gestion de version

### Format
- **Main** : `version.json` → `{ "version": "B-0.XXX" }` (ex: `B-0.210`, `B-0.211`)
- **Branche** : versions DB enregistrées en `Br-0.XXX` (ex: `Br-0.001`)

### Règles d'incrément (main uniquement)
- Mineure : `B-0.210` → `B-0.211`
- Majeure : `B-0.999` → `B-1.000`

### Règle clé — version et branche
- Sur une **branche feature** : ne PAS incrémenter `version.json`, ne PAS appeler `deploy-log.js`. Les modifications sont enregistrées dans `histoModif.json` uniquement.
- Sur la **branche main** (après merge ou push direct) : incrémenter la version, committer `version.json`, puis appeler `deploy-log.js`.

---

## Règle obligatoire : Workflow Git

### Génération des titres de commit
Synthétiser tous les `mod-XXX` depuis le dernier commit pour produire 3 options :
- **Option 1** — courte et factuelle
- **Option 2** — orientée fonctionnalité
- **Option 3** — technique et précise

### Procédure complète (branche feature)
1. `git add` des fichiers modifiés (jamais `git add .`)
2. `git commit -m "vB.XXX - YYYYMMDD - [TYPE] - Titre"` (version = version courante, PAS incrémentée)
3. `git push -u origin [branche]`
4. **Ne pas** appeler `deploy-log.js` — la version en DB n'est pas mise à jour sur une branche

### Procédure complète (branche main — après merge)
1. Incrémenter `version.json` : `{ "version": "BX.XXX" }` (nouvelle version)
2. `git add version.json` + fichiers modifiés
3. `git commit -m "vBX.XXX - YYYYMMDD - [TYPE] - Titre"`
4. `git push`
5. **Enregistrer en BDD** (met à jour la DB ET `version.json` local) :
```bash
node server/deploy-log.js \
  --version "BX.XXX" \
  --commit "vBX.XXX - YYYYMMDD - [TYPE] - Titre" \
  --description "[mod-XXX] desc1\n[mod-YYY] desc2" \
  --ai "Claude Code" \
  --model "claude-sonnet-4-6" \
  --mods "mod-XXX, mod-YYY" \
  --files "apps/portail/...,libs/shared/..." \
  --scope "portail,libs" \
  --features "portail:header,system:workflow"
```

> Ce script insère en BDD ET écrit `version.json`. Les autres instances de l'app détectent la différence via `/api/version/check` et affichent le banner "Mise à jour requise".

> En cas d'échec DB : enregistrer manuellement via Admin → Déploiements.

### Détecter la branche courante
```bash
git branch --show-current
```
Si résultat = `main` → lancer `deploy-log.js`. Sinon → skip.

---

## Règle obligatoire : Composants Angular réutilisables

Tout élément d'UI présent dans plus d'un contexte → composant standalone dans `libs/shared/ui/`.

### Règles
1. Avant de coder : vérifier si un composant dans `libs/shared/ui/` peut être étendu.
2. Inputs : `@Input()` pour les données, `@Output()` pour les actions.
3. Jamais de HTML dupliqué dans plusieurs templates.
4. Les libs n'importent jamais `environment` — utiliser `inject(API_DATA_URL)` etc.

---

## Règle obligatoire : Documentation des composants

`docs/structure/<nom-composant>.component.md` pour chaque composant.

### À chaque modification d'un composant
1. Lire le doc existant (s'il existe).
2. Signaler les conflits avec la doc avant de coder.
3. Mettre à jour le doc si Inputs/Outputs, dépendances ou règles métier ont changé.

### Structure
```markdown
# NomDuComposant
## Fonctionnement Général
## Entrées / Sorties
## Dépendances
## Règles Métier
## Scénarios de Test
```
