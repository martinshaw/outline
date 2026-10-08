export type ItemKind = 'note' | 'project' | 'task';

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
