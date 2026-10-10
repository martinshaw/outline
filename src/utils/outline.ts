import type {
  DayDocument,
  InlineSegment,
  OutlineItem,
  SidebarDay,
  SidebarTask,
} from '../types';
import { formatDayLabel } from './date';

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
        const subtasks: { id: string; title: string }[] = [];
        const collectSubtasks = (children: OutlineItem[]) => {
          for (const child of children) {
            if (child.kind === 'subtask') {
              subtasks.push({ id: child.id, title: itemTitle(child) });
            }
            collectSubtasks(child.children);
          }
        };
        collectSubtasks(item.children);
        tasks.push({
          id: item.id,
          title: itemTitle(item),
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
    if (ta.id !== tb.id || ta.title !== tb.title) return false;
    if (ta.subtasks.length !== tb.subtasks.length) return false;
    for (let j = 0; j < ta.subtasks.length; j++) {
      if (
        ta.subtasks[j].id !== tb.subtasks[j].id ||
        ta.subtasks[j].title !== tb.subtasks[j].title
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
