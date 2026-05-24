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

## Règle obligatoire : Gestion de version

### Format
`version.json` à la racine : `{ "version": "BX.XXX" }`

### Règles d'incrément
- **Mineure** (+0.001) : `B0.005` → `B0.006` / `B0.999` → `B1.000`
- **Majeure** (+1.000) : `B0.025` → `B1.000` / `B2.005` → `B3.000`

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
2. `git commit -m "vBX.XXX - YYYYMMDD - [TYPE] - Titre"` (version = version courante, PAS incrémentée)
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
