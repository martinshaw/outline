import { useEffect, useId, useRef } from 'react';

type Shortcut = {
  keys: string[];
  action: string;
};

type Section = {
  title: string;
  shortcuts: Shortcut[];
};

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';
const moveMod = isMac ? [mod, '⇧'] : [alt, '⇧'];

const SECTIONS: Section[] = [
  {
    title: 'Blocks',
    shortcuts: [
      { keys: ['Enter'], action: 'Create sibling block' },
      {
        keys: ['Enter'],
        action: 'On empty indented block: outdent to parent level',
      },
      {
        keys: ['Enter'],
        action: 'At end of block with children: create first child',
      },
      { keys: ['Tab'], action: 'Indent under previous sibling' },
      {
        keys: ['⇧', 'Tab'],
        action: 'Outdent (following siblings become children)',
      },
      {
        keys: [...moveMod, '↑'],
        action: 'Move block / selection up',
      },
      {
        keys: [...moveMod, '↓'],
        action: 'Move block / selection down',
      },
      {
        keys: [mod, 'Enter'],
        action:
          'Promote to project/task, or cycle status on project/task',
      },
      { keys: ['Backspace'], action: 'At start: merge or outdent' },
      { keys: ['Esc'], action: 'Clear block selection' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Click gutter'], action: 'Select block' },
      { keys: ['Drag gutter'], action: 'Multi-select contiguous blocks' },
      { keys: ['⇧', 'Click gutter'], action: 'Extend selection' },
      { keys: [alt, 'Drag'], action: 'Multi-select without gutter' },
      {
        keys: ['Select text'],
        action: 'Select those blocks (click anywhere to clear)',
      },
      {
        keys: ['Drag handle'],
        action: 'Move selection between items (adopts that level)',
      },
      { keys: ['Click'], action: 'Clear block selection' },
      { keys: ['Triple-click'], action: 'Select block' },
    ],
  },
  {
    title: 'Formatting',
    shortcuts: [
      { keys: [mod, 'B'], action: 'Bold' },
      { keys: [mod, 'I'], action: 'Italic' },
      { keys: [mod, 'U'], action: 'Underline' },
      {
        keys: ['#', 'Space'],
        action: 'Heading 1–6 (`#` … `######` then space)',
      },
      {
        keys: ['Backspace'],
        action: 'At start of heading: demote to note',
      },
      { keys: ['Paste URL'], action: 'Insert link' },
      { keys: ['Right-click link'], action: 'Remove link' },
    ],
  },
  {
    title: 'App',
    shortcuts: [
      { keys: ['?'], action: 'Open keyboard shortcuts' },
      { keys: [mod, '/'], action: 'Open keyboard shortcuts' },
      { keys: ['Menu'], action: 'Settings, exports, folder…' },
      { keys: ['Esc'], action: 'Close dialog / clear selection' },
    ],
  },
];

function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="shortcuts-kbd">
      {keys.map((key) => (
        <kbd key={key} className="shortcuts-kbd__key">
          {key}
        </kbd>
      ))}
    </span>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ShortcutsDialog({ open, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="shortcuts-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shortcuts-dialog__header">
          <h2 id={titleId} className="shortcuts-dialog__title">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="shortcuts-dialog__body">
          {SECTIONS.map((section) => (
            <section key={section.title} className="shortcuts-section">
              <h3 className="shortcuts-section__title">{section.title}</h3>
              <ul className="shortcuts-list">
                {section.shortcuts.map((row) => (
                  <li
                    key={`${section.title}-${row.action}`}
                    className="shortcuts-row"
                  >
                    <span className="shortcuts-row__action">{row.action}</span>
                    <Kbd keys={row.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
