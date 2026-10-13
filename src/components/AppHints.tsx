type Props = {
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenTasks: () => void;
  onOpenBoard: () => void;
  onOpenSearch: () => void;
};

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

type Hint = {
  id: string;
  kbd: string;
  label: string;
  title: string;
  onClick: () => void;
};

/** Faint top-right shortcut reminders (also clickable), longest first. */
export function AppHints({
  onOpenPalette,
  onOpenShortcuts,
  onOpenSettings,
  onOpenTasks,
  onOpenBoard,
  onOpenSearch,
}: Props) {
  const hints: Hint[] = [
    {
      id: 'settings',
      kbd: `${mod}${alt},`,
      label: 'for settings',
      title: `Settings (${mod}+${alt}+,)`,
      onClick: onOpenSettings,
    },
    {
      id: 'palette',
      kbd: `${mod}P`,
      label: 'for commands',
      title: `Command palette (${mod}+P)`,
      onClick: onOpenPalette,
    },
    {
      id: 'search',
      kbd: `${mod}${alt}F`,
      label: 'for search',
      title: `Search notes (${mod}+${alt}+F)`,
      onClick: onOpenSearch,
    },
    {
      id: 'tasks',
      kbd: `${mod}${alt}T`,
      label: 'for tasks',
      title: `Manage tasks (${mod}+${alt}+T)`,
      onClick: onOpenTasks,
    },
    {
      id: 'board',
      kbd: `${mod}${alt}B`,
      label: 'for triage',
      title: `Open triage (${mod}+${alt}+B)`,
      onClick: onOpenBoard,
    },
    {
      id: 'help',
      kbd: `${mod}/`,
      label: 'for help',
      title: `Keyboard shortcuts (${mod}+/)`,
      onClick: onOpenShortcuts,
    },
  ].sort(
    (a, b) =>
      `${b.kbd} ${b.label}`.length - `${a.kbd} ${a.label}`.length ||
      a.id.localeCompare(b.id),
  );

  return (
    <div className="app-hints" aria-label="Keyboard shortcuts">
      {hints.map((hint) => (
        <button
          key={hint.id}
          type="button"
          className="app-hints__item"
          onClick={hint.onClick}
          title={hint.title}
        >
          <kbd>{hint.kbd}</kbd> {hint.label}
        </button>
      ))}
    </div>
  );
}
