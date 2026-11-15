// Table opener library (owner's decision, 15 Nov 2026): one conversation question per shared theme, shown under the
// shared-themes line once the table is revealed. Only lines the owner has approved go here, word for word.
// Drafts come from qatar/ops/draft-openers.mjs (qatar/docs/openers/drafts.json); a draft is never shown to members.
// Keyed `${q}:${o}` (question and option keys of the theme) -> { ar, en }. Empty until the owner approves lines.
// (A plain object, not frozen, so the API test can stub a line in-process and remove it again.)
export const OPENERS = {};

/**
 * The first approved opener for the table's themes ([{ q, o }] in display order) in her language, or null when none of
 * the themes has an approved line.
 */
export function openerFor(themes, locale, library = OPENERS) {
  for (const th of themes || []) {
    const key = th && `${th.q}:${th.o}`;
    const line = key && Object.hasOwn(library, key) ? library[key] : null;
    const text = line && (locale === "en" ? line.en : line.ar);
    if (text) return text;
  }
  return null;
}
