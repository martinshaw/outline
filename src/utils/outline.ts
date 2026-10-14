import type {
  DayDocument,
  InlineSegment,
  OutlineItem,
  SidebarDay,
  SidebarTask,
} from '../types';
import { formatDayLabel, todayKey } from './date';

export function segmentsToPlainText(segments: InlineSegment[]): string {
  return segments.map((s) => s.text).join('');
}

export function itemTitle(item: OutlineItem): string {
  const text = segmentsToPlainText(item.content).trim();
  if (text) return text;
  if (item.kind === 'attachment' && item.attachment?.name) {
    return item.attachment.name;
  }
  return 'Untitled';
}

export function isDayEmpty(doc: DayDocument): boolean {
  const walk = (items: OutlineItem[]): boolean => {
    for (const item of items) {
      if (item.kind === 'attachment' && item.attachment?.path) return false;
      if (segmentsToPlainText(item.content).trim().length > 0) return false;
      if (!walk(item.children)) return false;
    }
    return true;
  };
  return walk(doc.items);
}

export function extractSidebarDay(doc: DayDocument): SidebarDay {
  const tasks: SidebarTask[] = [];

  const visit = (items: OutlineItem[]) => {
    for (const item of items) {
      if (item.kind === 'task') {
        const subtasks: SidebarTask['subtasks'] = [];
        const collectSubtasks = (children: OutlineItem[]) => {
          for (const child of children) {
            if (child.kind === 'subtask') {
              subtasks.push({
                id: child.id,
                title: itemTitle(child),
                status: child.status ?? null,
              });
            }
            collectSubtasks(child.children);
          }
        };
        collectSubtasks(item.children);
        tasks.push({
          id: item.id,
          title: itemTitle(item),
          status: item.status ?? null,
          subtasks,
        });
      }
      visit(item.children);
    }
  };

  visit(doc.items);

  return {
    date: doc.date,
    label: formatDayLabel(doc.date),
    tasks,
  };
}

/** True when sidebar projection for a day is unchanged (skip React updates). */
export function sidebarDaysEqual(a: SidebarDay, b: SidebarDay): boolean {
  if (a.date !== b.date || a.label !== b.label) return false;
  if (a.tasks.length !== b.tasks.length) return false;
  for (let i = 0; i < a.tasks.length; i++) {
    const ta = a.tasks[i];
    const tb = b.tasks[i];
    if (ta.id !== tb.id || ta.title !== tb.title || ta.status !== tb.status) {
      return false;
    }
    if (ta.subtasks.length !== tb.subtasks.length) return false;
    for (let j = 0; j < ta.subtasks.length; j++) {
      if (
        ta.subtasks[j].id !== tb.subtasks[j].id ||
        ta.subtasks[j].title !== tb.subtasks[j].title ||
        ta.subtasks[j].status !== tb.subtasks[j].status
      ) {
        return false;
      }
    }
  }
  return true;
}

export function buildSidebarFromDocs(docs: DayDocument[]): SidebarDay[] {
  return docs
    .filter((d) => !isDayEmpty(d))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map(extractSidebarDay);
}

/**
 * Always surface today's date in the sidebar (even when empty) so a midnight
 * rollover is reachable without restarting the app.
 */
export function ensureTodayInSidebar(
  days: SidebarDay[],
  today: string = todayKey(),
): SidebarDay[] {
  if (days.some((d) => d.date === today)) return days;
  const pinned: SidebarDay = {
    date: today,
    label: formatDayLabel(today),
    tasks: [],
  };
  return [pinned, ...days].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}
