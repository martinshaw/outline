type Props = {
  onOpen: () => void;
};

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

/** Compact topbar control that opens the command palette. */
export function CommandPaletteTrigger({ onOpen }: Props) {
  return (
    <button
      type="button"
      className="btn btn--ghost btn--nav command-palette-trigger"
      onClick={onOpen}
      aria-haspopup="dialog"
      title={`Command palette (${mod}+P)`}
    >
      <span className="command-palette-trigger__label">Commands</span>
      <kbd className="command-palette-trigger__kbd">
        {mod}P
      </kbd>
    </button>
  );
}
