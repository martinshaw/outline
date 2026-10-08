import type {
  DayDocument,
  InlineSegment,
  OutlineItem,
  SidebarDay,
  SidebarProject,
} from '../types';
import { formatDayLabel } from './date';

export function segmentsToPlainText(segments: InlineSegment[]): string {
  return segments.map((s) => s.text).join('');
}

export function itemTitle(item: OutlineItem): string {
  const text = segmentsToPlainText(item.content).trim();
  return text || 'Untitled';
}

export function isDayEmpty(doc: DayDocument): boolean {
  const walk = (items: OutlineItem[]): boolean => {
    for (const item of items) {
      if (segmentsToPlainText(item.content).trim().length > 0) return false;
      if (!walk(item.children)) return false;
    }
    return true;
  };
  return walk(doc.items);
}

export function extractSidebarDay(doc: DayDocument): SidebarDay {
  const projects: SidebarProject[] = [];

  const visit = (items: OutlineItem[]) => {
    for (const item of items) {
      if (item.kind === 'project') {
        const tasks: { id: string; title: string }[] = [];
        const collectTasks = (children: OutlineItem[]) => {
          for (const child of children) {
            if (child.kind === 'task') {
              tasks.push({ id: child.id, title: itemTitle(child) });
            }
            collectTasks(child.children);
          }
        };
        collectTasks(item.children);
        projects.push({
          id: item.id,
          title: itemTitle(item),
          tasks,
        });
      }
      visit(item.children);
    }
  };

  visit(doc.items);

  return {
    date: doc.date,
    label: formatDayLabel(doc.date),
    projects,
  };
}

/** True when sidebar projection for a day is unchanged (skip React updates). */
export function sidebarDaysEqual(a: SidebarDay, b: SidebarDay): boolean {
  if (a.date !== b.date || a.label !== b.label) return false;
  if (a.projects.length !== b.projects.length) return false;
  for (let i = 0; i < a.projects.length; i++) {
    const pa = a.projects[i];
    const pb = b.projects[i];
    if (pa.id !== pb.id || pa.title !== pb.title) return false;
    if (pa.tasks.length !== pb.tasks.length) return false;
    for (let j = 0; j < pa.tasks.length; j++) {
      if (
        pa.tasks[j].id !== pb.tasks[j].id ||
        pa.tasks[j].title !== pb.tasks[j].title
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
