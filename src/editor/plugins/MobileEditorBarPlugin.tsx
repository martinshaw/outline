import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactPortal,
} from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';
import { isRoleKind } from '../../types';
import {
  $getMoveTargets,
  $getNearestTaskParent,
  $getSelectedOutlineItem,
} from '../utils/outlineHelpers';
import { INDENT_COMMAND, MOVE_COMMAND } from './IndentReorderPlugin';
import { TOGGLE_ROLE_COMMAND } from './RolePlugin';

const NARROW_MQ = '(max-width: 768px)';

function isNarrowViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW_MQ).matches
  );
}

type RoleLabel = 'task' | 'subtask';

function $readRoleLabel(): RoleLabel {
  const item = $getMoveTargets()[0] ?? $getSelectedOutlineItem();
  if (!item) return 'task';
  if (isRoleKind(item.getKind())) {
    return item.getKind() === 'subtask' ? 'subtask' : 'task';
  }
  return $getNearestTaskParent(item) ? 'subtask' : 'task';
}

function $readFormats(): Record<TextFormatType, boolean> {
  const selection = $getSelection();
  const active = {
    bold: false,
    italic: false,
    underline: false,
  } as Record<TextFormatType, boolean>;
  if ($isRangeSelection(selection)) {
    active.bold = selection.hasFormat('bold');
    active.italic = selection.hasFormat('italic');
    active.underline = selection.hasFormat('underline');
  }
  return active;
}

type BarBtn = {
  id: string;
  label: string;
  ariaLabel: string;
  className?: string;
  active?: boolean;
  run: () => void;
};

/**
 * Fixed bottom controls for narrow viewports — Tab / Shift+Tab / move /
 * ⌘Enter / bold / italic / underline when soft keyboards lack modifiers.
 */
export function MobileEditorBarPlugin(): ReactPortal | null {
  const [editor] = useLexicalComposerContext();
  const [narrow, setNarrow] = useState(isNarrowViewport);
  const [roleLabel, setRoleLabel] = useState<RoleLabel>('task');
  const [formats, setFormats] = useState(() => ({
    bold: false,
    italic: false,
    underline: false,
  }));
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_MQ);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!narrow) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [narrow]);

  useEffect(() => {
    if (!narrow) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setRoleLabel($readRoleLabel());
        const next = $readFormats();
        setFormats({
          bold: next.bold,
          italic: next.italic,
          underline: next.underline,
        });
      });
    });
  }, [editor, narrow]);

  if (!narrow || typeof document === 'undefined') return null;

  const keepFocus = (event: ReactPointerEvent | ReactMouseEvent) => {
    event.preventDefault();
  };

  const run = (action: () => void) => {
    editor.focus();
    action();
  };

  const buttons: BarBtn[] = [
    {
      id: 'indent',
      label: '→',
      ariaLabel: 'Indent (Tab)',
      run: () => run(() => editor.dispatchCommand(INDENT_COMMAND, 'indent')),
    },
    {
      id: 'outdent',
      label: '←',
      ariaLabel: 'Outdent (Shift+Tab)',
      run: () => run(() => editor.dispatchCommand(INDENT_COMMAND, 'outdent')),
    },
    {
      id: 'up',
      label: '↑',
      ariaLabel: 'Move up',
      run: () => run(() => editor.dispatchCommand(MOVE_COMMAND, 'up')),
    },
    {
      id: 'down',
      label: '↓',
      ariaLabel: 'Move down',
      run: () => run(() => editor.dispatchCommand(MOVE_COMMAND, 'down')),
    },
    {
      id: 'role',
      label: roleLabel,
      ariaLabel:
        roleLabel === 'subtask'
          ? 'Turn into subtask or cycle status'
          : 'Turn into task or cycle status',
      className: 'mobile-editor-bar__btn--role',
      run: () => run(() => editor.dispatchCommand(TOGGLE_ROLE_COMMAND, undefined)),
    },
    {
      id: 'bold',
      label: 'b',
      ariaLabel: 'Bold',
      className: 'mobile-editor-bar__btn--format mobile-editor-bar__btn--bold',
      active: formats.bold,
      run: () =>
        run(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')),
    },
    {
      id: 'italic',
      label: 'i',
      ariaLabel: 'Italic',
      className: 'mobile-editor-bar__btn--format mobile-editor-bar__btn--italic',
      active: formats.italic,
      run: () =>
        run(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')),
    },
    {
      id: 'underline',
      label: 'u',
      ariaLabel: 'Underline',
      className:
        'mobile-editor-bar__btn--format mobile-editor-bar__btn--underline',
      active: formats.underline,
      run: () =>
        run(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')),
    },
  ];

  return createPortal(
    <div
      className="mobile-editor-bar"
      style={{ bottom: keyboardInset }}
      role="toolbar"
      aria-label="Editor controls"
    >
      <div className="mobile-editor-bar__row">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            className={[
              'mobile-editor-bar__btn',
              btn.className,
              btn.active ? 'mobile-editor-bar__btn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={btn.ariaLabel}
            aria-pressed={btn.active}
            title={btn.ariaLabel}
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={btn.run}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
