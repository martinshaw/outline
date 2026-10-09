import { resolveEntityLabels } from '../entities/entityStore';
import { getStatusDef } from '../settings/settingsStore';
import type { DayDocument, ItemKind, OutlineItem } from '../types';
import { segmentsToPlainText } from '../utils/outline';
import { tokenize, tokenizeQuery } from './tokenize';

export type SearchDoc = {
  key: string;
  date: string;
  itemId: string;
  kind: ItemKind;
  /** Plain body text used for snippets. */
  text: string;
  /** Extra indexed text (status, entities, date) not shown in snippet. */
  boostText: string;
};

export type SearchHit = {
  date: string;
  itemId: string;
  kind: ItemKind;
  text: string;
  snippet: string;
  /** Character ranges in `snippet` to highlight (UTF-16 offsets). */
  highlights: Array<{ start: number; end: number }>;
  score: number;
};

export type NotesIndexStats = {
  days: number;
  documents: number;
  terms: number;
  /** True while a background rebuild is in progress. */
  building: boolean;
};

type Posting = {
  /** term → tf within this document */
  tfs: Map<string, number>;
};

const SNIPPET_RADIUS = 42;
const DEFAULT_LIMIT = 80;
const DAYS_PER_SLICE = 8;

function docKey(date: string, itemId: string): string {
  return `${date}\0${itemId}`;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 32 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function buildItemSearchText(item: OutlineItem): {
  text: string;
  boostText: string;
} {
  const text = segmentsToPlainText(item.content);
  const parts: string[] = [];
  if (item.status) parts.push(getStatusDef(item.status).label);
  if (item.deadline) parts.push(item.deadline);
  const entities = item.entities ?? item.people ?? [];
  if (entities.length) parts.push(resolveEntityLabels(entities).join(' '));
  if (item.kind !== 'note') parts.push(item.kind);
  return { text, boostText: parts.join(' ') };
}

function collectItems(
  date: string,
  items: OutlineItem[],
  out: SearchDoc[],
): void {
  for (const item of items) {
    const { text, boostText } = buildItemSearchText(item);
    // Index empty titles too so entity/status-only hits still work, but skip
    // totally blank leaves with no boost metadata.
    if (text.trim() || boostText.trim()) {
      out.push({
        key: docKey(date, item.id),
        date,
        itemId: item.id,
        kind: item.kind,
        text,
        boostText,
      });
    }
    if (item.children.length) collectItems(date, item.children, out);
  }
}

function makeSnippet(
  text: string,
  terms: string[],
  prefix: string | null,
): { snippet: string; highlights: Array<{ start: number; end: number }> } {
  const lower = text.toLowerCase();
  let anchor = -1;
  let matchLen = 0;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (anchor < 0 || i < anchor)) {
      anchor = i;
      matchLen = term.length;
    }
  }
  if (prefix) {
    // Prefer a word starting with the prefix.
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}\\p{N}]*)`,
      'iu',
    );
    const m = re.exec(text);
    if (m && m.index >= 0) {
      const start = m.index + m[1]!.length;
      if (anchor < 0 || start < anchor) {
        anchor = start;
        matchLen = m[2]!.length;
      }
    }
  }

  if (anchor < 0) {
    const snippet =
      text.length <= SNIPPET_RADIUS * 2
        ? text
        : `${text.slice(0, SNIPPET_RADIUS * 2).trimEnd()}…`;
    return { snippet, highlights: [] };
  }

  let start = Math.max(0, anchor - SNIPPET_RADIUS);
  let end = Math.min(text.length, anchor + matchLen + SNIPPET_RADIUS);
  while (start > 0 && !/\s/.test(text[start]!)) start -= 1;
  while (end < text.length && !/\s/.test(text[end - 1]!)) end += 1;

  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;

  const highlights: Array<{ start: number; end: number }> = [];
  const snippetLower = snippet.toLowerCase();
  const mark = (needle: string) => {
    if (!needle) return;
    let from = 0;
    while (from < snippetLower.length) {
      const i = snippetLower.indexOf(needle, from);
      if (i < 0) break;
      highlights.push({ start: i, end: i + needle.length });
      from = i + needle.length;
    }
  };
  for (const term of terms) mark(term);
  if (prefix) {
    // Highlight prefix hits as whole tokens in the snippet.
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}\\p{N}]*)`,
      'giu',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(snippet)) !== null) {
      const s = m.index + m[1]!.length;
      highlights.push({ start: s, end: s + m[2]!.length });
    }
  }

  highlights.sort((a, b) => a.start - b.start);
  // Merge overlaps
  const merged: Array<{ start: number; end: number }> = [];
  for (const h of highlights) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else merged.push({ ...h });
  }

  return { snippet, highlights: merged };
}

/**
 * Inverted full-text index over outline items across day documents.
 * Supports incremental day upserts and chunked async rebuilds so large
 * workspaces stay responsive.
 */
export class NotesSearchIndex {
  private docs = new Map<string, SearchDoc>();
  private postings = new Map<string, Posting>();
  /** term → document keys containing the term */
  private inverted = new Map<string, Set<string>>();
  /** date → document keys for that day (for fast remove/upsert) */
  private dayKeys = new Map<string, Set<string>>();
  private building = false;
  private rebuildGen = 0;

  getStats(): NotesIndexStats {
    return {
      days: this.dayKeys.size,
      documents: this.docs.size,
      terms: this.inverted.size,
      building: this.building,
    };
  }

  clear(): void {
    this.docs.clear();
    this.postings.clear();
    this.inverted.clear();
    this.dayKeys.clear();
  }

  removeDay(date: string): void {
    const keys = this.dayKeys.get(date);
    if (!keys) return;
    for (const key of keys) this.removeDoc(key);
    this.dayKeys.delete(date);
  }

  upsertDay(doc: DayDocument): void {
    this.removeDay(doc.date);
    const items: SearchDoc[] = [];
    collectItems(doc.date, doc.items, items);
    if (items.length === 0) return;
    const keys = new Set<string>();
    for (const item of items) {
      this.addDoc(item);
      keys.add(item.key);
    }
    this.dayKeys.set(doc.date, keys);
  }

  /**
   * Rebuild from a full docs snapshot in idle slices.
   * Concurrent rebuilds cancel older generations.
   */
  async rebuildAsync(docs: Iterable<DayDocument>): Promise<void> {
    const gen = ++this.rebuildGen;
    this.building = true;
    const list = [...docs].sort((a, b) => (a.date < b.date ? 1 : -1));
    this.clear();

    try {
      for (let i = 0; i < list.length; i++) {
        if (gen !== this.rebuildGen) return;
        this.upsertDay(list[i]!);
        if (i > 0 && i % DAYS_PER_SLICE === 0) {
          await yieldToMain();
        }
      }
    } finally {
      if (gen === this.rebuildGen) this.building = false;
    }
  }

  /** Synchronous rebuild for small corpora / tests. */
  rebuild(docs: Iterable<DayDocument>): void {
    this.rebuildGen += 1;
    this.building = false;
    this.clear();
    for (const doc of docs) this.upsertDay(doc);
  }

  search(query: string, limit = DEFAULT_LIMIT): SearchHit[] {
    const { terms, prefix } = tokenizeQuery(query);
    if (terms.length === 0 && !prefix) return [];

    let candidates: Set<string> | null = null;

    for (const term of terms) {
      const keys = this.inverted.get(term);
      if (!keys || keys.size === 0) return [];
      candidates = candidates
        ? intersect(candidates, keys)
        : new Set(keys);
      if (candidates.size === 0) return [];
    }

    if (prefix) {
      const prefixKeys = this.keysForPrefix(prefix);
      if (prefixKeys.size === 0) return [];
      candidates = candidates
        ? intersect(candidates, prefixKeys)
        : prefixKeys;
      if (candidates.size === 0) return [];
    }

    if (!candidates) return [];

    const scored: SearchHit[] = [];
    for (const key of candidates) {
      const doc = this.docs.get(key);
      const posting = this.postings.get(key);
      if (!doc || !posting) continue;

      let score = 0;
      for (const term of terms) {
        score += (posting.tfs.get(term) ?? 0) * 3;
      }
      if (prefix) {
        for (const [term, tf] of posting.tfs) {
          if (term.startsWith(prefix)) score += tf * (term === prefix ? 3 : 1.5);
        }
      }
      // Mild recency bias from ISO date digits (newer days rank slightly higher).
      score += Number(doc.date.replace(/-/g, '')) * 1e-10;

      const { snippet, highlights } = makeSnippet(
        doc.text.trim() || doc.boostText,
        terms,
        prefix,
      );
      scored.push({
        date: doc.date,
        itemId: doc.itemId,
        kind: doc.kind,
        text: doc.text,
        snippet: snippet || 'Untitled',
        highlights,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1));
    return scored.slice(0, limit);
  }

  private keysForPrefix(prefix: string): Set<string> {
    const out = new Set<string>();
    if (!prefix) return out;
    // Small term dictionaries: linear scan is fine; for huge indexes
    // terms are still far fewer than documents.
    for (const [term, keys] of this.inverted) {
      if (term.startsWith(prefix)) {
        for (const key of keys) out.add(key);
      }
    }
    return out;
  }

  private addDoc(doc: SearchDoc): void {
    const tokens = [
      ...tokenize(doc.text),
      ...tokenize(doc.boostText),
      ...tokenize(doc.date),
    ];
    if (tokens.length === 0) return;

    const tfs = new Map<string, number>();
    for (const term of tokens) {
      tfs.set(term, (tfs.get(term) ?? 0) + 1);
    }

    this.docs.set(doc.key, doc);
    this.postings.set(doc.key, { tfs });

    for (const term of tfs.keys()) {
      let bucket = this.inverted.get(term);
      if (!bucket) {
        bucket = new Set();
        this.inverted.set(term, bucket);
      }
      bucket.add(doc.key);
    }
  }

  private removeDoc(key: string): void {
    const posting = this.postings.get(key);
    if (!posting) return;
    for (const term of posting.tfs.keys()) {
      const bucket = this.inverted.get(term);
      if (!bucket) continue;
      bucket.delete(key);
      if (bucket.size === 0) this.inverted.delete(term);
    }
    this.postings.delete(key);
    this.docs.delete(key);
  }
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<string>();
  for (const key of small) {
    if (large.has(key)) out.add(key);
  }
  return out;
}
