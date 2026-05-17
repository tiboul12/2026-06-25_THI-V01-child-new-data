# Worganic Platform — Instructions pour Claude Code

## Information général sur les prompts :

### Contexte pro :
- Web designer/développeur no-code freelance
- Stack : Webflow (Client-First), Framer, Figma, Shopify
- Clients : PME francophones, artisans, indépendants

### Préférences de réponse :
- Réponds en français, ton direct, tutoiement
- Pas d'introductions du type "Bien sûr, voici..."
- Code commenté en français quand c'est complexe
- HTML/CSS en Client-First (Finsweet) par défaut
- Pas d'explications après le code sauf demande
- Indique à la fin le nombre de token utilisé.

### Bridage de l'output (CRUCIAL pour économiser) :
- Tiens-toi strictement à ce que je demande, rien de plus
- Ne propose pas d'étapes supplémentaires non sollicitées
- Ne crée PAS d'artifact, document, fichier ou canvas
  sans demande explicite
- Pas de récap final ("En résumé...", "Pour conclure...")
- Pas de disclaimers ("N'hésite pas si besoin")
- Si la réponse tient en 3 phrases, ne fais pas 3 paragraphes
- Si je dis "oui" ou "ok", ne développe pas

## Règle obligatoire : Vérification de compilation Angular

**Après toute modification d'un fichier Angular** (`.html`, `.component.ts`, `.service.ts`, `.module.ts`), vérifier que l'application compile sans erreur avant de déclarer la tâche terminée.

### Commande de vérification
```bash
cd frankenstein && npx ng build --no-progress 2>&1 | grep -E "(ERROR|✘|error TS)" | grep -v "budget"
```
Si la commande retourne des lignes → corriger avant de continuer. Si aucune ligne → compilation OK.

### Pourquoi `tsc --noEmit` est insuffisant
`tsc --noEmit` ne détecte pas les erreurs de template Angular (NG5xxx, NG8xxx). Seul `ng build` valide la compilation complète des templates.

### Piège fréquent : classes Tailwind avec `/`
Angular `[class.xxx]` **ne supporte pas** les `/` dans les noms de classe (ex: `indigo-500/40`).
- ❌ `[class.border-indigo-500/40]="condition"` — NG5002 : tag non terminé
- ✅ `[ngClass]="condition ? 'border-indigo-500/40' : 'autre-classe'"` — correct

Toujours utiliser `[ngClass]` quand une classe Tailwind contient `/`.

---

## Règle obligatoire : Historique des modifications

**À chaque fois que tu reçois un prompt**, tu dois enregistrer une entrée dans `data/histoModif.json`.

### Format d'une entrée

```json
{
  "id": "mod-XXX",
  "version": "X.XXX",
  "date": "<date ISO 8601 actuelle>",
  "type": "feature | fix | refactor | config",
  "commitType": "FIX | AMELIORATION | MERGE",
  "scope": ["frankenstein", "server"],
  "features": "frankenstein:deployments|admin,system:workflow",
  "title": "Titre court et descriptif",
  "description": "Description détaillée de ce qui a été fait et pourquoi.",
  "files": [
    "chemin/relatif/fichier1.ts",
    "chemin/relatif/fichier2.html"
  ],
  "ai": "<nom de l'IA utilisée, ex: Claude Code, Gemini CLI>",
  "model": "<modèle exact utilisé, ex: claude-sonnet-4-6, gemini-2.0-flash>",
  "prompt": "<le texte exact du prompt envoyé par l'utilisateur>",
  "startedAt": "<date ISO 8601 du début de la tâche>",
  "completedAt": "<date ISO 8601 de fin de la tâche>"
}
```

### Types disponibles
- `feature` — nouvelle fonctionnalité
- `fix` — correction de bug
- `refactor` — restructuration de code sans changement fonctionnel
- `config` — modification de configuration (angular.json, tailwind, env, etc.)

### Champs obligatoires
- `version` : Numéro de version au moment de la modification (après incrément).
- `commitType` : Type de commit — demandé à l'utilisateur au moment du git (`FIX`, `AMELIORATION` ou `MERGE`).
- `scope` : Tableau des parties du projet touchées — déduit automatiquement depuis les `files` :
  - Fichiers dans `frankenstein/` → `"frankenstein"`
  - Fichiers dans `server/` → `"server"`
  - Fichiers dans `electron/` → `"electron"`
  - Fichiers dans `data/` uniquement → `"data"`
  - `CLAUDE.md`, `version.json`, workflow → `"system"`
  - Plusieurs valeurs possibles si le prompt touche plusieurs parties : `["frankenstein", "server"]`
- `features` : Chaîne associant chaque scope à ses outils fonctionnels impactés.
  - Format : `"scope1:feature1|feature2,scope2:feature3"` — séparateur scope `,`, séparateur features `|`
  - Si un scope n'a pas de feature associée, l'omettre ou écrire juste `"scope"` sans `:`
  - Exemple : `"frankenstein:deployments|admin,system:workflow"`
  - Règles de déduction depuis les `files` :
    - `worg-help` → feature `help` (scope `frankenstein`)
    - `deployments` dans le chemin → feature `deployments` (scope `frankenstein`)
    - `admin.component` seul → feature `admin` (scope `frankenstein`)
    - `tickets` → feature `tickets` (scope `frankenstein`)
    - `documents` → feature `documents` (scope `frankenstein`)
    - `recette` → feature `recette` (scope `frankenstein`)
    - `dashboard` → feature `dashboard` (scope `frankenstein`)
    - `auth`, `landing` → feature `auth` (scope `frankenstein`)
    - `CLAUDE.md`, `deploy-log`, `histoModif`, `version.json` → feature `workflow` (scope `system`)
    - Plusieurs pages différentes sans lien fonctionnel → feature `site`
    - Valeurs libres acceptées pour les outils non listés
- `prompt` : Le texte exact écrit par l'utilisateur dans son message.
- `startedAt` : Horodatage ISO 8601 exact du début de la session.
- `completedAt` : Horodatage ISO 8601 exact de la fin de la tâche.
- `ai` : L'IA réellement utilisée pour cette session (pas une valeur fixe).
- `model` : Le modèle réellement utilisé pour cette session (pas une valeur fixe).

### Procédure
1. Note le timestamp exact de début (`startedAt`) dès la réception du prompt.
2. Effectue les modifications ou l'analyse demandée.
3. À la fin, ajoute l'entrée dans `data/histoModif.json` (append dans le tableau `modifications`).
4. L'`id` doit suivre la séquence : `mod-001`, `mod-002`, etc. (Vérifie le dernier ID dans le fichier).
5. La `date` doit être l'horodatage de fin de tâche.

---

## Règle obligatoire : Workflow de fin de prompt

**À la fin de chaque prompt** (après l'enregistrement dans `histoModif.json`), poser systématiquement la question suivante via `AskUserQuestion` :

```
Question : "Souhaitez-vous committer ce changement ?"
Options  : Oui, committer | Non, garder en local
```

> L'entrée `histoModif.json` est **toujours enregistrée**, que l'on committe ou non.

### Si Non → arrêt immédiat
Le formulaire s'arrête là. Aucune action supplémentaire.

### Si Oui → enchaîner avec 3 questions en un seul `AskUserQuestion`

```
Question 1 : "Cette modification est-elle mineure ou majeure ?"
             → Mineure (+0.001) | Majeure (+1.000)
Question 2 : "Type de commit ?"
             → FIX | AMELIORATION | MERGE
Question 3 : "Titre du commit ?"
             → 3 propositions générées + Other
```

---

## Règle obligatoire : Gestion de version

### Règles d'incrément
- **Mineure** (+0.001) : on incrémente la partie décimale de 0.001
  - `0.005` → `0.006` / `1.099` → `1.100` / `1.999` → `2.000`
- **Majeure** (+1, reset décimales) : on incrémente la partie entière de 1 et on remet les décimales à `.000`
  - `0.025` → `1.000` / `2.005` → `3.000` / `1.999` → `2.000`

### Mise à jour de version.json
Après décision de l'utilisateur, mettre à jour le champ `child` dans `version.json` :
```json
{ "base": "BX.XXX" }
```
Le préfixe `B` identifie la version comme appartenant à la base. Exemples : `B0.001` → `B0.002` / `B0.999` → `B1.000`.
Le nouveau numéro de version (ex: `B0.002`) est ensuite inclus dans le champ `version` de l'entrée histoModif.json.

---

## Règle obligatoire : Workflow Git

### Génération des propositions de titre

Le titre doit refléter **l'ensemble des prompts depuis le dernier git**, pas seulement le dernier. Pour générer les 3 propositions :
1. Relire tous les `mod-XXX` ajoutés depuis le dernier commit (ceux dont le `commitType` n'est pas encore figé dans un commit git)
2. Synthétiser leurs `title` et `prompt` pour produire 3 formulations différentes :
   - **Option 1** — courte et factuelle (ex: `Filtres déploiements + badge type commit`)
   - **Option 2** — orientée fonctionnalité (ex: `Amélioration UX historique déploiements`)
   - **Option 3** — technique et précise (ex: `Admin deploy : filtres FIX/AMELIORATION + fix doublon AI`)
   - Chaque proposition doit rester ≤ 60 caractères

### Types de commit
- `FIX` — correction de bug ou problème visuel
- `AMELIORATION` — nouvelle fonctionnalité ou amélioration existante
- `MERGE` — fusion de branches ou intégration de code

### Procédure complète

1. Mettre à jour `version.json` avec le nouveau numéro
2. `git add` des fichiers modifiés (ne pas utiliser `git add .` — lister les fichiers explicitement)
3. `git commit -m "BASE-BX.XX - YYYYMMDD - [TYPE] - Titre choisi"`
   - Format de date : YYYYMMDD (ex: 20260321)
4. `git push`
5. **Enregistrer le déploiement en BDD** via le script `server/deploy-log.js` :
   - `--description` : ⚠️ **OBLIGATOIRE — concaténer les descriptions de TOUS les mod-XXX depuis le dernier commit**, pas seulement le dernier. Format : `[mod-XXX] description1\n[mod-YYY] description2\n[mod-ZZZ] description3`
   - `--mods` : lister tous les IDs mod-XXX depuis le dernier commit (ex: `mod-305, mod-306, mod-307`)
   - `--files` : union de tous les fichiers modifiés depuis le dernier commit
```bash
node server/deploy-log.js \
  --version "BX.XXX" \
  --commit "vX.XXX - YYYYMMDD - [TYPE] - Titre choisi" \
  --description "Description consolidée de TOUS les prompts depuis le dernier git" \
  --ai "Claude Code" \
  --model "claude-sonnet-4-6" \
  --mods "mod-XXX, mod-YYY, mod-ZZZ" \
  --files "chemin/fichier1.ts,chemin/fichier2.html" \
  --scope "frankenstein,server" \
  --features "frankenstein:deployments|admin,system:workflow"
```

> **Note** : Ce script se connecte directement à MySQL sans nécessiter de session admin. Il doit être exécuté depuis la racine du projet (le `require('./db')` est relatif à `server/`). En cas d'échec, informer l'utilisateur d'enregistrer manuellement via Admin → Déploiements.

---

## Règle obligatoire : Propagation vers les children

### Fichiers "core" — propagation automatique requise
Toute modification d'un fichier dans les chemins suivants implique `propagationRequired: true` :
- `server/` (sauf `server/server-data.js` si modification purement locale)
- `electron/`
- `CLAUDE.md`
- `data/config/`
- `server/deploy-log.js`

### Question de propagation en fin de prompt
Après la question de commit (Oui/Non), si la modification touche des fichiers "core", poser :
```
Question : "Cette modification doit-elle être propagée aux children ?"
Options  : Oui — propagation requise | Non — base uniquement
```

### Si propagation requise → ajouter une entrée dans `data/base-propagation.json`
```json
{
  "baseVersion": "BX.XXX",
  "date": "<ISO 8601>",
  "modRef": "mod-XXX",
  "title": "Titre court de la modification",
  "propagationRequired": true,
  "propagationScope": ["chemin/fichier1", "chemin/fichier2"],
  "propagationNote": "Ce qu'il faut faire dans chaque child"
}
```
Ajouter l'entrée dans le tableau `entries` de `data/base-propagation.json`.

### Fichiers et dossiers JAMAIS inclus dans propagationScope
Les chemins suivants appartiennent exclusivement au child. Ne jamais les ajouter à `propagationScope` :
- `data/child/**` — configs branding, thème, nav, landing, home
- `frankenstein/src/app/child/**` — routes child, onglets admin child, pages child
- `frankenstein/src/environments/environment.ts` — URLs spécifiques au child
- `frankenstein/src/app/pages/child/**` — pages exclusives au child

### Marquer une propagation comme traitée
Quand l'utilisateur confirme qu'un child a intégré la modification, mettre `propagationRequired: false` sur l'entrée correspondante et ajouter `"syncedBy": ["THI-V01"]`.

---

## Règle obligatoire : Propagation documentée à chaque commit base

**À chaque commit base**, si des fichiers "core" ont été modifiés, il est **obligatoire** d'ajouter une entrée dans `data/base-propagation.json` **avant** de committer. Sans cette entrée, les children ne sauront jamais quoi mettre à jour.

### Pourquoi cette règle est critique
Le champ `baseSynced` dans `version.json` d'un child indique la version base référencée, **pas** que les fichiers ont été copiés. Sans entrée dans `base-propagation.json`, le child est marqué "à jour" alors que des fichiers manquent. C'est exactement ce bug qui s'est produit sur B0.026-B0.033.

### Procédure obligatoire avant tout commit base

**Étape 1 — Lister les fichiers modifiés** (automatique depuis les `files` de l'entrée histoModif)

**Étape 2 — Identifier les fichiers "core"** (ceux listés dans la section "Fichiers core — propagation automatique requise" ci-dessus)

**Étape 3 — Créer l'entrée dans `data/base-propagation.json`** si au moins un fichier core est modifié :
```json
{
  "baseVersion": "BX.XXX",
  "date": "<ISO 8601>",
  "modRef": "mod-XXX",
  "title": "Titre court de la modification",
  "propagationRequired": true,
  "propagationScope": ["liste des fichiers core modifiés"],
  "propagationNote": "Instructions précises : que copier, que modifier, que créer dans chaque child"
}
```

**Étape 4 — Inclure `data/base-propagation.json` dans le `git add`** de ce commit.

### Checklist de vérification propagation (à exécuter en début de session child)

Quand un child est ouvert avec un `baseSynced` inférieur à la version base courante, vérifier pour chaque entrée `propagationRequired: true` dans `base-propagation.json` que chaque fichier du `propagationScope` est bien à jour dans le child en le comparant à la base :

```bash
# Vérifier qu'un fichier est identique entre base et child
diff "worganic-base/chemin/fichier" "child--THI-V01/chemin/fichier"
```

Si une différence est détectée → appliquer le fichier depuis la base avant de continuer.

### Règle du `propagationNote` — être précis
La note doit permettre à un développeur (ou à une IA) d'appliquer la modification sans lire le diff git. Elle doit mentionner :
- Les nouveaux fichiers à créer
- Les sections à ajouter dans les fichiers existants (avec contexte : "après la ligne X", "dans la méthode Y")
- Les remplacements de patterns (ex: "remplacer `text-white` par `dark:text-btn-text` sur tous les boutons `bg-primary`")

---

## Architecture du projet

- **Frontend** : Angular 18 standalone — `frankenstein/src/`
- **Backend data** : Express.js `server/server-data.js` sur port 3001 ← **serveur actif**
- **Backend combiné** : `server/server.js` (non utilisé en dev)
- **Executor IA** : `electron/executor/server-executor.js` sur port 3002
- **Données** : `data/` (projets, config, users, historique)

## Règle ABSOLUE : Fichiers base — ne jamais modifier dans ce child

Les fichiers suivants proviennent de `worganic-base` et sont **écrasés à chaque synchronisation**. Ne JAMAIS les modifier directement dans ce child project. Toute modification doit être faite dans la base, puis propagée.

### Fichiers base intouchables (frankenstein/)
- `frankenstein/src/app/app.config.ts`
- `frankenstein/src/app/app.routes.ts`
- `frankenstein/src/app/base-routes.ts`
- `frankenstein/src/app/core/**` — tous les services, guards, interceptors
- `frankenstein/src/app/shared/**` — header, footer, nav, layout
- `frankenstein/src/app/pages/admin/admin.component.*`
- `frankenstein/src/app/pages/admin/tabs/**` — onglets admin base
- `frankenstein/src/app/pages/user/**` — home, documents, editor, config, deployments
- `frankenstein/src/app/pages/public/landing/**`
- `frankenstein/src/app/tools/**`
- `frankenstein/src/styles.scss`
- `frankenstein/tailwind.config.js`

### Fichiers base intouchables (server/)
- `server/server-data.js`
- `server/deploy-log.js`
- `server/db.js`

### Fichiers base intouchables (racine)
- `install.bat`
- `launch-frankenstein.bat`
- `start-dev.js`

### Fichiers MODIFIABLES dans ce child (jamais propagés depuis la base)

| Fichier | Rôle |
|---------|------|
| `data/child/app.json` | Nom de l'app, logo, copyright |
| `data/child/theme.json` | Variables CSS (couleurs custom) |
| `data/child/nav.json` | Items de navigation supplémentaires |
| `data/child/landing.json` | Textes de la page de connexion |
| `data/child/home.json` | Config home page |
| `frankenstein/src/app/child/child-routes.ts` | Routes exclusives child |
| `frankenstein/src/app/child/child-admin-tabs.ts` | Onglets admin exclusifs child |
| `frankenstein/src/app/pages/child/**` | Pages Angular exclusives child |
| `frankenstein/src/environments/environment.ts` | URLs des serveurs, appName |
| `version.json` | Version child uniquement (champ `child` et `baseSynced`) |
| `data/histoModif.json` | Historique des modifications |
| `data/config/**` | Config locale (users, conf, sessions, AI models) |
| `sync-from-base.bat` | Script de synchronisation |
| `README.md` | Documentation child |
| `CLAUDE.md` | Instructions IA child |

> Si une modification d'un fichier base est nécessaire pour ce child, la faire dans `worganic-base` et la propager via `data/base-propagation.json`.

---

## Règle obligatoire : Composants Angular réutilisables

**Tout élément d'UI qui apparaît dans plus d'une page ou d'un contexte doit être implémenté comme un composant Angular standalone dédié**, placé dans `frankenstein/src/app/components/`.

### Principe
Un popup, un badge, un panneau, un formulaire récurrent → **un seul composant**, jamais du HTML dupliqué dans plusieurs templates de pages.

### Exemples concrets
- Un popup d'information sur un rôle → `components/role-info-modal/role-info-modal.component.ts`
- Une carte de framework → `components/framework-card/framework-card.component.ts` ✅ (déjà fait)
- Un badge de statut réutilisé → `components/status-badge/status-badge.component.ts`

### Règles de mise en œuvre
1. **Avant de coder** : chercher si un composant existant dans `components/` peut être étendu.
2. **Inputs** : toutes les données nécessaires passent par `@Input()`.
3. **Outputs** : toutes les actions remontent via `@Output() EventEmitter`.
4. **Pas de duplication** : si le même bloc HTML existe déjà dans un autre template, le refactoriser en composant.
5. **Le composant gère son propre état interne** (loading, erreurs, affichage) — le parent ne gère que l'ouverture/fermeture via un Input ou méthode publique.
6. **Le composant peut recevoir le service HTTP** si il doit charger ses propres données (ex: contenu d'un document lié).

### Structure cible des components
```
frankenstein/src/app/components/
  framework-card/          ← carte framework complète
  role-info-modal/         ← popup infos rôle (catégorie, responsabilités, compétences, document)
  ai-progress/             ← progression IA
  ...
```

### Anti-patterns à éviter
- ❌ Copier-coller le même bloc HTML dans `dashboard.component.html` ET `framework-diagram.component.html`
- ❌ Gérer la logique d'un popup directement dans un composant page (`dashboard.component.ts`)
- ❌ Dupliquer des méthodes identiques (`openRoleInfo`, `closeRoleInfo`, `getRoleCategoryBgColor`…) dans plusieurs composants pages

---

## Règle obligatoire : Documentation des composants

Le dossier `docs/structure/` contient la spécification fonctionnelle de chaque composant Angular.
Convention de nommage : `<nom-du-composant>.component.md`.

### À chaque prompt touchant un composant Angular

**Étape 1 — Lire le doc** : avant toute modification, lire le fichier correspondant dans `docs/structure/`.
Si le fichier n'existe pas → le créer à la fin avec la structure ci-dessous.

**Étape 2 — Signaler un conflit éventuel** : si la modification prévue change le comportement documenté
(Inputs/Outputs, règles métier, dépendances), le signaler **avant** de coder :
> "⚠️ Cette modification affecte [section X] du doc. Je vais mettre à jour la doc après le code."

**Étape 3 — Mettre à jour le doc** : après modification du composant, mettre à jour le fichier `.md`
correspondant si l'une de ces sections a changé :
- **Fonctionnement Général** : comportement global modifié
- **Entrées / Sorties** : `@Input()` ou `@Output()` ajoutés, supprimés ou renommés
- **Dépendances** : service injecté ajouté ou retiré
- **Règles Métier** : logique métier ajoutée, modifiée ou supprimée
- **Scénarios de Test** : nouveau cas de test ou régression couverte

Ne pas mettre à jour si la modification est purement cosmétique (style, mise en page) ou un fix interne
sans impact sur l'interface publique du composant.

### Structure d'un fichier doc (à respecter à la création)

```markdown
# Documentation : NomDuComposant

## Fonctionnement Général
[Description du rôle du composant]

## Entrées (Inputs) / Sorties (Outputs)
- `@Input() xxx` : [description]
- `@Output() yyy` : [description]

## Dépendances
- `NomService` : [rôle dans ce composant]

## Règles Métier
- [Règle 1]
- [Règle 2]

## Scénarios de Test Fonctionnel (Anti-Régression)
1. [Scénario 1]
2. [Scénario 2]
```

### Fichiers doc à inclure dans `git add`
Si un fichier `docs/structure/*.md` a été modifié ou créé, l'inclure dans le commit associé.

---

## Points d'attention
- Le serveur qui tourne est **server-data.js**, pas server.js.
- Les routes Express doivent être déclarées **avant** le catch-all `app.get('*')`.
- Les utilisateurs s'authentifient via `data/config/users.json`.
- Le token auth est stocké dans `localStorage` sous la clé `frankenstein_token`.
- **API fichiers** : lire un fichier = `GET /read-file?file=<path>` (retourne `{ content: string }`). Pas de route POST pour cette action.
