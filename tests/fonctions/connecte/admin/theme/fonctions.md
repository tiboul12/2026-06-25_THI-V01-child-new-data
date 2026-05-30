# Admin › Thème — Fonctions métier

Route : `/admin` onglet "Thème"  
Composant : `AdminThemeComponent`  
Accès : admin uniquement

---

## `2-1-3-1` — Gestion du thème global

- **Sélection du thème** : dark | light | pink
- **Aperçu en temps réel** : le thème s'applique immédiatement à l'interface
- **Persistance** : stocké dans `localStorage` et propagé via `ConfigService`
- **Thèmes disponibles** :
  - `dark` : fond sombre, texte clair (défaut)
  - `light` : fond clair, texte sombre
  - `pink` : thème rose

---

## `2-1-3-2` — Branding / Personnalisation

- **Modification couleurs primaires** : palette de couleurs de l'interface
- **Logo** : upload ou sélection du logo de l'application
- **Nom de l'application** : éditable via `APP_BRANDING` token
- **Thème child** : chargé depuis `data/child/theme.json`
- **Variables CSS** : `--btn-text-color`, couleurs de surface, bordures, etc.

---

## `2-1-3-3` — Aperçu

- **Rendu live** : les changements de couleur sont visibles immédiatement
- **Reset** : bouton pour revenir aux valeurs par défaut

---

## `2-1-3-4` — États

| État | Description |
|------|-------------|
| Thème dark actif | Fond sombre, indicateur actif |
| Thème light actif | Fond clair, indicateur actif |
| Thème pink actif | Fond rose, indicateur actif |
| Sauvegarde | Confirmation visuelle |
