export type ItemKind = 'note' | 'project' | 'task' | 'heading';

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
  /** Status id for project/task items (from settings.statuses). */
  status?: string | null;
  content: InlineSegment[];
  children: OutlineItem[];
};

export type DayDocument = {
  version: 1;
  date: string;
  items: OutlineItem[];
};

export type SidebarTask = {
  id: string;
  title: string;
};

export type SidebarProject = {
  id: string;
  title: string;
  tasks: SidebarTask[];
};

export type SidebarDay = {
  date: string;
  label: string;
  projects: SidebarProject[];
};

export type NotesManifest = {
  version: 1;
  days: string[];
};
