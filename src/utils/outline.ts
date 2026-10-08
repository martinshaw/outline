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

  const visit = (items: OutlineItem[], underProject: OutlineItem | null) => {
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
        visit(item.children, item);
      } else {
        visit(item.children, underProject);
      }
    }
  };

  visit(doc.items, null);

  return {
    date: doc.date,
    label: formatDayLabel(doc.date),
    projects,
  };
}

export function buildSidebarFromDocs(docs: DayDocument[]): SidebarDay[] {
  return docs
    .filter((d) => !isDayEmpty(d))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map(extractSidebarDay);
}
