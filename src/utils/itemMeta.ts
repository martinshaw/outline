import {
  getEntityById,
  normalizeEntityIdList,
  resolveEntityIds,
  resolveEntityLabels,
} from '../entities/entityStore';

/** ISO calendar date `YYYY-MM-DD` helpers for task/subtask attributes. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const d = parseIsoDate(value);
  return d != null;
}

export function parseIsoDate(value: string): Date | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function formatDeadlineLabel(iso: string, now = new Date()): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  const label = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startDue.getTime() - startToday.getTime()) / 86_400_000,
  );
  if (diffDays < 0) return `Overdue ${label}`;
  if (diffDays === 0) return `Due today`;
  if (diffDays === 1) return `Due tomorrow`;
  return `Due ${label}`;
}

/**
 * Normalize linked entity ids. Known ids are kept; bare labels are resolved
 * (legacy day files) via the workspace catalog.
 */
export function normalizeEntities(
  entities: string[] | null | undefined,
): string[] {
  if (!entities?.length) return [];
  const tokens = entities.map((v) => String(v).trim()).filter(Boolean);
  if (tokens.every((id) => getEntityById(id))) {
    return normalizeEntityIdList(tokens);
  }
  return resolveEntityIds(tokens);
}

export function formatMetaSubline(
  deadline: string | null | undefined,
  entities: string[] | null | undefined,
): string {
  const parts: string[] = [];
  if (deadline && isIsoDate(deadline)) {
    parts.push(formatDeadlineLabel(deadline));
  }
  const names = resolveEntityLabels(entities);
  if (names.length) parts.push(names.join(', '));
  return parts.join(' · ');
}

/** Status ids treated as complete for subtask progress (“N of M done”). */
const COMPLETE_STATUS_IDS = new Set(['done', 'archived']);

export function isCompleteStatus(statusId: string | null | undefined): boolean {
  return typeof statusId === 'string' && COMPLETE_STATUS_IDS.has(statusId);
}

/**
 * Progress label for a task with subtasks.
 * None complete → `"10"`; any done/archived → `"6 of 10 done"`.
 */
export function formatSubtaskProgress(
  total: number,
  complete: number,
): string | null {
  if (total <= 0) return null;
  if (complete > 0) return `${complete} of ${total} done`;
  return String(total);
}

export function isDeadlineOverdue(
  iso: string | null | undefined,
  now = new Date(),
): boolean {
  if (!iso || !isIsoDate(iso)) return false;
  const date = parseIsoDate(iso)!;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return startDue.getTime() < startToday.getTime();
}
