import {
  getEntityById,
  getEntityTypeDef,
  resolveEntityLabels,
} from '../entities/entityStore';
import { getStatusDef } from '../settings/settingsStore';
import type { DayDocument, OutlineItem } from '../types';
import { isRoleKind } from '../types';
import {
  isCompleteStatus,
  isDeadlineOverdue,
  isIsoDate,
  parseIsoDate,
} from './itemMeta';
import { itemTitle } from './outline';

export type IndexedTask = {
  date: string;
  itemId: string;
  kind: 'task' | 'subtask';
  title: string;
  status: string | null;
  deadline: string | null;
  entities: string[];
  /** Joined entity labels for search. */
  entityLabels: string;
  parentTaskId: string | null;
  parentTaskTitle: string | null;
};

export type TaskDeadlineFilter =
  | 'any'
  | 'none'
  | 'overdue'
  | 'today'
  | 'upcoming';

export type TaskKindFilter = 'all' | 'task' | 'subtask';

export type TaskSortKey = 'date' | 'title' | 'status' | 'deadline' | 'kind';

export type TaskFilters = {
  query: string;
  kind: TaskKindFilter;
  /** Empty = all statuses. */
  statuses: string[];
  /** Empty = all entities. Task matches if it has any selected id. */
  entities: string[];
  deadline: TaskDeadlineFilter;
  hideCompleted: boolean;
};

/** Entity ranked by how often it appears on tasks/subtasks. */
export type CommonEntity = {
  id: string;
  label: string;
  type: string;
  typeLabel: string;
  count: number;
};

export type TaskSort = {
  key: TaskSortKey;
  dir: 'asc' | 'desc';
};

/**
 * Flatten every task/subtask across day docs into a search/filter index.
 * Call when opening the tasks dialog or when the docs cache changes while open.
 */
export function indexTasks(docs: Iterable<DayDocument>): IndexedTask[] {
  const out: IndexedTask[] = [];

  const walk = (
    date: string,
    item: OutlineItem,
    parentTask: OutlineItem | null,
  ) => {
    if (item.kind === 'task' || item.kind === 'subtask') {
      const entities = item.entities ?? item.people ?? [];
      out.push({
        date,
        itemId: item.id,
        kind: item.kind,
        title: itemTitle(item),
        status: item.status ?? null,
        deadline: item.deadline ?? null,
        entities: [...entities],
        entityLabels: resolveEntityLabels(entities).join(', '),
        parentTaskId:
          item.kind === 'subtask' && parentTask ? parentTask.id : null,
        parentTaskTitle:
          item.kind === 'subtask' && parentTask
            ? itemTitle(parentTask)
            : null,
      });
    }

    const nextParent =
      item.kind === 'task' ? item : parentTask;
    for (const child of item.children) walk(date, child, nextParent);
  };

  for (const doc of docs) {
    for (const item of doc.items) walk(doc.date, item, null);
  }

  return out;
}

/**
 * Entities used on indexed tasks, most frequent first.
 * Useful for filter chips (“common entities”).
 */
export function rankCommonEntities(
  tasks: IndexedTask[],
  limit = Infinity,
): CommonEntity[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const id of task.entities) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const ranked: CommonEntity[] = [];
  for (const [id, count] of counts) {
    const entity = getEntityById(id);
    const label = entity?.label ?? id;
    const type = entity?.type ?? '';
    const typeLabel = getEntityTypeDef(type)?.label ?? type;
    ranked.push({ id, label, type, typeLabel, count });
  }

  ranked.sort(
    (a, b) =>
      b.count - a.count ||
      a.typeLabel.localeCompare(b.typeLabel) ||
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );

  return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function matchesDeadline(
  deadline: string | null,
  filter: TaskDeadlineFilter,
  now: Date,
): boolean {
  if (filter === 'any') return true;
  if (filter === 'none') return !deadline || !isIsoDate(deadline);
  if (!deadline || !isIsoDate(deadline)) return false;
  if (filter === 'overdue') return isDeadlineOverdue(deadline, now);

  const due = parseIsoDate(deadline);
  if (!due) return false;
  const today = startOfDay(now).getTime();
  const dueDay = startOfDay(due).getTime();
  if (filter === 'today') return dueDay === today;
  if (filter === 'upcoming') return dueDay > today;
  return true;
}

export function filterTasks(
  tasks: IndexedTask[],
  filters: TaskFilters,
  now = new Date(),
): IndexedTask[] {
  const q = filters.query.trim().toLowerCase();
  const statusSet =
    filters.statuses.length > 0 ? new Set(filters.statuses) : null;
  const entitySet =
    filters.entities.length > 0 ? new Set(filters.entities) : null;

  return tasks.filter((task) => {
    if (filters.kind !== 'all' && task.kind !== filters.kind) return false;
    if (filters.hideCompleted && isCompleteStatus(task.status)) return false;
    if (statusSet && (!task.status || !statusSet.has(task.status))) {
      return false;
    }
    if (
      entitySet &&
      !task.entities.some((id) => entitySet.has(id))
    ) {
      return false;
    }
    if (!matchesDeadline(task.deadline, filters.deadline, now)) return false;

    if (!q) return true;
    const statusLabel = getStatusDef(task.status).label.toLowerCase();
    const hay = [
      task.title,
      task.date,
      task.kind,
      statusLabel,
      task.status ?? '',
      task.deadline ?? '',
      task.entityLabels,
      task.parentTaskTitle ?? '',
    ]
      .join(' ')
      .toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every((t) => hay.includes(t));
  });
}

function compareNullableIso(
  a: string | null,
  b: string | null,
  dir: 1 | -1,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  return (a < b ? -1 : 1) * dir;
}

export function sortTasks(tasks: IndexedTask[], sort: TaskSort): IndexedTask[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort.key) {
      case 'date':
        cmp = a.date === b.date ? 0 : a.date < b.date ? -1 : 1;
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title, undefined, {
          sensitivity: 'base',
        });
        break;
      case 'status': {
        const la = getStatusDef(a.status).label;
        const lb = getStatusDef(b.status).label;
        cmp = la.localeCompare(lb, undefined, { sensitivity: 'base' });
        break;
      }
      case 'deadline':
        return compareNullableIso(a.deadline, b.deadline, dir);
      case 'kind':
        cmp = a.kind.localeCompare(b.kind);
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return cmp * dir;
    // Stable secondary: newer notes first, then title.
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
  return sorted;
}

/** Immutable status update for one outline item id inside a day document. */
export function setItemStatusInDocument(
  doc: DayDocument,
  itemId: string,
  status: string,
): DayDocument | null {
  let found = false;

  const mapItems = (items: OutlineItem[]): OutlineItem[] =>
    items.map((item) => {
      if (item.id === itemId && isRoleKind(item.kind)) {
        found = true;
        return { ...item, status };
      }
      if (item.children.length === 0) return item;
      return { ...item, children: mapItems(item.children) };
    });

  const items = mapItems(doc.items);
  if (!found) return null;
  return { ...doc, items };
}
