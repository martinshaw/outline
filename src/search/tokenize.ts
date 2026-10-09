/** Unicode-aware tokenization for the notes full-text index. */

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

export function normalizeSearchText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeSearchText(text);
  return normalized.match(TOKEN_RE) ?? [];
}

/** Query tokens; last token may be a prefix when `prefixLast` is true. */
export function tokenizeQuery(
  query: string,
): { terms: string[]; prefix: string | null } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { terms: [], prefix: null };
  // Trailing space → last token is complete (no prefix match).
  const prefix = /\S$/.test(query) ? tokens[tokens.length - 1]! : null;
  const terms = prefix ? tokens.slice(0, -1) : tokens;
  return { terms, prefix };
}
