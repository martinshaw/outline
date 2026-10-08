import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $selectAll,
  COMMAND_PRIORITY_HIGH,
  SELECT_ALL_COMMAND,
} from 'lexical';

function isUiChromeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        'input',
        'textarea',
        'select',
        'button',
        'a',
        '[role="dialog"]',
        '.sidebar',
        '.sidebar-backdrop',
        '.topbar',
        '.top-menu',
        '.settings-overlay',
        '.shortcuts-overlay',
        '.debug-overlay',
        '.toast-host',
        '.gate',
        '.outline-status-chip',
        '.outline-status-menu',
      ].join(','),
    ),
  );
}

/**
 * Keep the Lexical document focused for editing shortcuts (e.g. ⌘A), except
 * when the user is interacting with menus, sidebar, dialogs, or form fields.
 */
export function EditorFocusPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event) => {
        event?.preventDefault();
        editor.update(() => {
          $selectAll();
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (isUiChromeTarget(target)) return;
      if (target.closest('.editor-input')) return;
      if (target.closest('.main, .editor-shell')) {
        event.preventDefault();
        editor.focus();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'a') return;
      if (event.altKey || event.shiftKey) return;

      const target = event.target;
      if (target instanceof Element) {
        if (
          target.closest(
            'input, textarea, select, [role="dialog"], .settings-overlay, .shortcuts-overlay',
          )
        ) {
          return;
        }
      }

      event.preventDefault();
      editor.focus();
      editor.dispatchCommand(SELECT_ALL_COMMAND, event);
    };

    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [editor]);

  return null;
}
