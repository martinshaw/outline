import {
  DAY_DOCUMENT_VERSION,
  type DayDocument,
  type InlineMark,
  type InlineSegment,
  type ItemKind,
  type OutlineItem,
} from '../types';
import { createId } from './id';

function text(t: string, format?: InlineMark): InlineSegment[] {
  return [{ type: 'text', text: t, format }];
}

function item(
  kind: ItemKind,
  title: string,
  children: OutlineItem[] = [],
  format?: InlineMark,
): OutlineItem {
  return {
    id: createId(),
    kind,
    status: kind === 'task' || kind === 'subtask' ? 'todo' : null,
    content: text(title, format),
    children,
  };
}

/** Large multi-level outline for keyboard / indent / move testing. */
export function createDummyHierarchy(date: string): DayDocument {
  return {
    version: DAY_DOCUMENT_VERSION,
    date,
    items: [
      item('note', 'Morning notes', [
        item('note', 'Coffee, skim Slack'),
        item('note', 'Standup at 10:00'),
        item('note', 'Parking lot thoughts', [
          item('note', 'Maybe rename the outliner package'),
          item('note', 'Check font loading on slow networks'),
        ]),
      ]),

      item('task', 'Auth refactor', [
        item('note', 'Context: migrate session cookies to opaque tokens'),
        item('subtask', 'Map current auth middleware call sites', [
          item('note', 'api/gateway'),
          item('note', 'api/admin'),
          item('note', 'workers/session-janitor'),
        ]),
        item('subtask', 'Draft token refresh flow'),
        item('subtask', 'Fix redirect loop on expired session', [
          item('note', 'Repro: open two tabs, expire one'),
          item('note', 'Expected: soft re-auth, keep draft'),
        ]),
        item('note', 'Open questions', [
          item('note', 'Do mobile clients need rotating refresh tokens?'),
          item('note', 'Can we drop legacy cookie path in one release?'),
        ]),
      ]),

      item('task', 'Outline editor polish', [
        item('subtask', 'Enter on empty indented item outdents'),
        item('subtask', 'Cmd/Alt+Shift move matches LogSeq tree walk', [
          item('note', 'First child up → last child of uncle'),
          item('note', 'Last child down → first child of aunt'),
        ]),
        item('subtask', 'Logical outdent adopts following siblings'),
        item('note', 'Deep nest for stress', [
          item('note', 'Level 2', [
            item('note', 'Level 3', [
              item('note', 'Level 4', [
                item('note', 'Level 5 — move me around'),
                item('note', 'Level 5b'),
                item('note', 'Level 5c'),
              ]),
              item('note', 'Level 4 sibling'),
            ]),
            item('note', 'Level 3 sibling A'),
            item('note', 'Level 3 sibling B'),
          ]),
          item('note', 'Level 2 sibling'),
        ]),
      ]),

      item('task', 'Infra / deploy', [
        item('subtask', 'Wire preview deploys to PRs'),
        item('subtask', 'Document Chrome folder-permission flow'),
        item('note', 'Notes only — not a subtask'),
      ]),

      item('note', 'Sibling block A (top level)'),
      item('note', 'Sibling block B (top level)', [
        item('note', 'B1'),
        item('note', 'B2'),
        item('note', 'B3 last child — try move down into next aunt'),
      ]),
      item('note', 'Sibling block C (top level)', [
        item('note', 'C1 first child — try move up into previous uncle'),
        item('note', 'C2'),
      ]),
      item('note', 'Sibling block D (top level)'),

      item('note', 'Formatting samples', [
        item('note', 'Bold sample', undefined, { bold: true }),
        item('note', 'Italic sample', undefined, { italic: true }),
        item('note', 'Underline sample', undefined, { underline: true }),
        {
          id: createId(),
          kind: 'note',
          content: [
            { type: 'text', text: 'Link sample: ' },
            {
              type: 'link',
              url: 'https://example.com',
              text: 'https://example.com',
            },
          ],
          children: [],
        },
      ]),

      item('note', 'End of fixture — clear day or keep editing'),
    ],
  };
}
