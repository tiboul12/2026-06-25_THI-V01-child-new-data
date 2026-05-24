/**
 * Corrige le contenu retourné par l'IA pour un fichier contenu.md de section.
 *
 * L'éditeur auto-injecte le heading (# Titre) depuis le nom du dossier :
 * le contenu brut NE doit PAS commencer par un heading.
 *
 * Les blocs de documents additionnels sont délimités par ', ` ou ^ et doivent
 * être correctement fermés.
 *
 * Les marqueurs d'images doivent respecter {{IMG:id}} avec un ID uuid-like.
 */
export function sanitizeIaContent(content: string): string {
  let text = content;

  // ── 1. Supprimer le heading initial ajouté par l'IA ──────────────────────
  // L'IA ajoute souvent "# Titre" car le prompt inclut le nom de la section.
  // Ce heading est auto-injecté par l'éditeur → le retirer du contenu brut.
  text = text.replace(/^\s*#{1,4}\s+[^\n]+\n?/, '');

  // ── 2. Supprimer les lignes vides en tête (reste propre après strip heading) ─
  text = text.replace(/^\n+/, '');

  // ── 3. Fermer les blocs de documents additionnels non fermés ─────────────
  // Format : `NomDoc\ncontent\n` (délimiteur ', ` ou ^)
  const DELIMITERS = ["'", '`', '^'];
  const lines = text.split('\n');
  const fixed: string[] = [];
  let openDelim: string | null = null;

  for (const line of lines) {
    if (!openDelim) {
      // Détection ouverture : délimiteur immédiatement suivi d'un titre (non vide)
      const m = /^(['`^])(.+)$/.exec(line);
      if (m && DELIMITERS.includes(m[1])) {
        openDelim = m[1];
      }
      fixed.push(line);
    } else {
      // Détection fermeture : délimiteur seul sur la ligne
      if (line.trim() === openDelim) {
        openDelim = null;
      }
      fixed.push(line);
    }
  }
  // Fermer le bloc si non terminé
  if (openDelim) {
    fixed.push(openDelim);
  }

  text = fixed.join('\n');

  // ── 4. Normaliser les marqueurs d'images {{IMG:...}} ─────────────────────
  // L'ID doit être en minuscules, sans espaces (format uuid : a-z0-9 et tirets).
  // Supprimer les marqueurs avec un ID vide ou invalide.
  text = text.replace(/\{\{IMG:([^}]*)\}\}/gi, (_match, inner) => {
    const parts = inner.split('|');
    const rawId = parts[0].trim();
    // Normaliser l'ID : minuscules, espaces → tirets, garder uniquement a-z0-9-
    const id = rawId.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id) return ''; // Marqueur sans ID → supprimer
    const params = parts.slice(1).map((p: string) => p.trim()).filter(Boolean).join('|');
    return params ? `{{IMG:${id}|${params}}}` : `{{IMG:${id}}}`;
  });

  // ── 5. Supprimer les images markdown ![alt](url) non supportées ──────────
  // L'éditeur n'utilise pas la syntaxe standard Markdown pour les images.
  // Les conserver tel quel casserait l'affichage (lien mort ou texte brut).
  // On les retire pour ne pas polluer le contenu.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // ── 6. Nettoyer les lignes vides multiples consécutives (max 2) ──────────
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
