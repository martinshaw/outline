import { CloseIcon } from './CloseIcon';

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

type Hint = {
  keys?: string[];
  text: string;
};

const HINTS: Hint[] = [
  { text: 'Type to start a note' },
  {
    keys: [mod, 'Enter'],
    text: 'Turn a line into a task (again under a task for a subtask)',
  },
  { keys: ['Tab'], text: 'Indent the next line under the one above' },
  { text: 'Drop files or images onto the page to attach them' },
  { keys: [mod, 'P'], text: 'Open the command palette' },
  { keys: [mod, '/'], text: 'See all keyboard shortcuts' },
];

type Props = {
  onDismiss: () => void;
};

/** Gentle first-run tips shown above an empty day note. */
export function EmptyDocHints({ onDismiss }: Props) {
  return (
    <div className="editor-empty-hints">
      <div className="editor-empty-hints__header">
        <p className="editor-empty-hints__lead">Get started</p>
        <button
          type="button"
          className="btn btn--ghost btn--icon-sm editor-empty-hints__close"
          onClick={onDismiss}
          aria-label="Dismiss tips"
          title="Dismiss"
        >
          <CloseIcon size={12} />
        </button>
      </div>
      <ol className="editor-empty-hints__list">
        {HINTS.map((hint) => (
          <li key={hint.text} className="editor-empty-hints__item">
            {hint.keys && hint.keys.length > 0 && (
              <span className="editor-empty-hints__keys">
                {hint.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            )}
            <span className="editor-empty-hints__text">{hint.text}</span>
          </li>
        ))}
      </ol>
      <p className="editor-empty-hints__privacy">
        Everything stays on your device — nothing is sent to us or any
        third-party server. Outline is a single <code>index.html</code> you can
        download and run yourself; no backend.
      </p>
    </div>
  );
}
