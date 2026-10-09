type Props = {
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenTasks: () => void;
  onOpenSearch: () => void;
};

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

/** Faint top-right shortcut reminders (also clickable), longest first. */
export function AppHints({
  onOpenPalette,
  onOpenShortcuts,
  onOpenSettings,
  onOpenTasks,
  onOpenSearch,
}: Props) {
  return (
    <div className="app-hints" aria-label="Keyboard shortcuts">
      <button
        type="button"
        className="app-hints__item"
        onClick={onOpenSettings}
        title={`Settings (${mod}+${alt}+,)`}
      >
        <kbd>{mod}{alt},</kbd> for settings
      </button>
      <button
        type="button"
        className="app-hints__item"
        onClick={onOpenPalette}
        title={`Command palette (${mod}+P)`}
      >
        <kbd>{mod}P</kbd> for commands
      </button>
      <button
        type="button"
        className="app-hints__item"
        onClick={onOpenSearch}
        title={`Search notes (${mod}+${alt}+F)`}
      >
        <kbd>{mod}{alt}F</kbd> for search
      </button>
      <button
        type="button"
        className="app-hints__item"
        onClick={onOpenTasks}
        title={`Manage tasks (${mod}+${alt}+T)`}
      >
        <kbd>{mod}{alt}T</kbd> for tasks
      </button>
      <button
        type="button"
        className="app-hints__item"
        onClick={onOpenShortcuts}
        title={`Keyboard shortcuts (${mod}+/)`}
      >
        <kbd>{mod}/</kbd> for help
      </button>
    </div>
  );
}
