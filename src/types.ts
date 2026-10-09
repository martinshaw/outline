export type ItemKind = 'note' | 'task' | 'subtask' | 'heading';

/** Markdown-style heading depth (`#` … `######`). */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type InlineMark = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type InlineSegment =
  | { type: 'text'; text: string; format?: InlineMark }
  | { type: 'link'; url: string; text: string };

export type OutlineItem = {
  id: string;
  kind: ItemKind;
  /** Present when kind is `heading` (1–6 from `#` … `######`). */
  headingLevel?: HeadingLevel | null;
  /** Status id for task/subtask items (from settings.statuses). */
  status?: string | null;
  /** ISO date `YYYY-MM-DD` for task/subtask items. */
  deadline?: string | null;
  /**
   * Workspace entity ids from `entities.json` linked to this task/subtask.
   * Labels/types are resolved from the catalog.
   */
  entities?: string[];
  /**
   * @deprecated Legacy person ids/labels — migrated to `entities` on load.
   */
  people?: string[];
  content: InlineSegment[];
  children: OutlineItem[];
};

/** Current on-disk day document version (`task` / `subtask` kinds). */
export const DAY_DOCUMENT_VERSION = 2 as const;

export type DayDocument = {
  version: typeof DAY_DOCUMENT_VERSION;
  date: string;
  items: OutlineItem[];
};

export type SidebarSubtask = {
  id: string;
  title: string;
};

export type SidebarTask = {
  id: string;
  title: string;
  subtasks: SidebarSubtask[];
};

export type SidebarDay = {
  date: string;
  label: string;
  tasks: SidebarTask[];
};

export type NotesManifest = {
  version: 1;
  days: string[];
};

/** Task or subtask — items that carry status / deadline / entities. */
export function isRoleKind(kind: ItemKind): boolean {
  return kind === 'task' || kind === 'subtask';
}

/**
 * Normalize a kind string from disk or DOM.
 * Day docs at version < 2 used `project` / `task` (now `task` / `subtask`).
 */
export function normalizeItemKind(
  raw: unknown,
  docVersion: number = DAY_DOCUMENT_VERSION,
): ItemKind {
  if (typeof raw !== 'string') return 'note';
  if (docVersion < 2) {
    if (raw === 'project') return 'task';
    if (raw === 'task') return 'subtask';
  }
  if (raw === 'project') return 'task'; // stray legacy
  if (raw === 'note' || raw === 'task' || raw === 'subtask' || raw === 'heading') {
    return raw;
  }
  return 'note';
}

function migrateOutlineItem(raw: OutlineItem, docVersion: number): OutlineItem {
  return {
    ...raw,
    kind: normalizeItemKind(raw.kind, docVersion),
    children: Array.isArray(raw.children)
      ? raw.children.map((c) => migrateOutlineItem(c, docVersion))
      : [],
  };
}

/** Accept v1 (`project`/`task`) or v2 (`task`/`subtask`) day JSON. */
export function normalizeDayDocument(
  partial: Partial<DayDocument> & { version?: number } | null | undefined,
): DayDocument | null {
  if (!partial || typeof partial !== 'object') return null;
  const version = typeof partial.version === 'number' ? partial.version : 0;
  if (version !== 1 && version !== 2) return null;
  if (typeof partial.date !== 'string' || !partial.date) return null;
  const items = Array.isArray(partial.items) ? partial.items : [];
  return {
    version: DAY_DOCUMENT_VERSION,
    date: partial.date,
    items: items.map((item) => migrateOutlineItem(item as OutlineItem, version)),
  };
}
