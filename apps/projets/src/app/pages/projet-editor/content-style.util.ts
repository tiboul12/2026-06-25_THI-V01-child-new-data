/**
 * Système « double fichier » contenu : un fichier Markdown propre (AI-facing) et un jumeau
 * stylisé `*-css.md` (Markdown + HTML inline pour couleur/surlignage/taille/soulignage/alignement).
 *
 * Invariant : `stripStyleMarkdown(styled)` == clean (texte affiché identique).
 */

/** Nom du jumeau stylisé d'un fichier (`contenu.md` → `contenu-css.md`). */
export function cssTwinName(name: string): string {
  return name.replace(/\.md$/i, '-css.md');
}

/** Vrai si le nom est un jumeau stylisé (`*-css.md`). */
export function isCssTwinName(name: string): boolean {
  return /-css\.md$/i.test(name);
}

/** Enrobe un contenu inline avec un marqueur Markdown en hissant les espaces hors des marqueurs. */
function wrapMd(marker: string, content: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(content);
  if (!m || !m[2]) return content;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

/**
 * Normalise un contenu STYLISÉ : les styles compatibles Markdown (gras/italique/barré)
 * sont exprimés en Markdown (`**`, `*`, `~~`) même dans le fichier `-css.md`. Seuls les
 * styles SANS équivalent Markdown (couleur, surlignage, taille, soulignage, alignement)
 * restent en HTML inline (`<span style=…>`, `<u>`, blocs alignés).
 */
export function normalizeStyledMarkdown(md: string): string {
  if (!md) return md;
  return md
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => wrapMd('**', inner))
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => wrapMd('*', inner))
    .replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => wrapMd('~~', inner));
}

/** Retire les balises de style inline (span/font/u) en convertissant le gras/italique/barré en Markdown. */
function stripInlineHtml(s: string): string {
  return s
    // Gras / italique / barré portés par des balises HTML → Markdown
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
    // Soulignage : pas d'équivalent Markdown → on garde le texte
    .replace(/<\/?u\b[^>]*>/gi, '')
    // Couleur / surlignage / taille (span, font) → on garde le texte
    .replace(/<span\b[^>]*>/gi, '').replace(/<\/span>/gi, '')
    .replace(/<font\b[^>]*>/gi, '').replace(/<\/font>/gi, '');
}

/**
 * Produit la version Markdown PROPRE d'un contenu stylisé : retire le HTML de style
 * non-markdown, en conservant le Markdown standard, les fences ```TRELLO/ARRAY``` et
 * les marqueurs {{IMG}} / {{MOCKUP}}.
 */
export function stripStyleMarkdown(md: string): string {
  if (!md) return md;
  let out = md;
  // Blocs alignés : <h1..4 …>inner</h1..4> → "#.. inner"
  out = out.replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, lvl, inner) => '\n' + '#'.repeat(Number(lvl)) + ' ' + stripInlineHtml(inner).trim() + '\n');
  // Paragraphes alignés : <p …>inner</p> → inner
  out = out.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (_m, inner) => '\n' + stripInlineHtml(inner).trim() + '\n');
  // Styles inline restants
  out = stripInlineHtml(out);
  return out.replace(/\n{3,}/g, '\n\n');
}

/**
 * Fusionne une édition du fichier PROPRE dans le master stylisé : les lignes inchangées
 * gardent leur style, les lignes modifiées/ajoutées repassent en texte brut.
 * Si l'alignement de lignes n'est pas fiable (divergence de nombre de lignes), on abandonne
 * les styles (retourne le contenu propre) — l'invariant texte est ainsi toujours respecté.
 */
export function mergeCleanIntoStyled(cleanNew: string, cleanOld: string, styledOld: string): string {
  const cn = cleanNew.split('\n');
  const co = cleanOld.split('\n');
  const so = styledOld.split('\n');
  if (co.length !== so.length) return cleanNew;
  const styledByClean = new Map<string, string>();
  for (let i = 0; i < co.length; i++) {
    if (co[i] && !styledByClean.has(co[i])) styledByClean.set(co[i], so[i]);
  }
  return cn.map(line => (line && styledByClean.has(line)) ? styledByClean.get(line)! : line).join('\n');
}
