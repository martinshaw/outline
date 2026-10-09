import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getRoot } from 'lexical';
import {
  getSettings,
  subscribeSettings,
} from '../../settings/settingsStore';
import {
  $isOutlineItemNode,
  OutlineItemNode,
} from '../nodes/OutlineItemNode';

const MENU_CLASS = 'outline-status-menu';

function closeAllMenus(): void {
  document.querySelectorAll(`.${MENU_CLASS}`).forEach((el) => el.remove());
  document
    .querySelectorAll('.outline-status-chip[aria-expanded="true"]')
    .forEach((el) => el.setAttribute('aria-expanded', 'false'));
}

function $markStatusChipsDirty(): void {
  const walk = (node: OutlineItemNode) => {
    if (node.getKind() === 'task' || node.getKind() === 'subtask') {
      node.markDirty();
    }
    for (const child of node.getChildren()) {
      if ($isOutlineItemNode(child)) walk(child);
    }
  };
  for (const child of $getRoot().getChildren()) {
    if ($isOutlineItemNode(child)) walk(child);
  }
}

/** Keep parent task “N of M done” labels in sync when the tree changes. */
function $markAncestorTasksDirtyFromKey(key: string): void {
  const node = $getNodeByKey(key);
  if (!$isOutlineItemNode(node)) return;
  node.markAncestorTasksDirty();
}

/**
 * Click handling + status menu for chips owned by OutlineItemNode DOM.
 * Menus render on document.body so Lexical's mutation observer won't strip them.
 */
export function StatusChipPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const chip = target.closest<HTMLButtonElement>('.outline-status-chip');
      const root = editor.getRootElement();
      if (chip && root?.contains(chip)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        target.closest(`.${MENU_CLASS}`) ||
        target.closest('.outline-status-chip')
      ) {
        return;
      }
      closeAllMenus();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const option = target.closest<HTMLButtonElement>(
        `.${MENU_CLASS}__option`,
      );
      if (option) {
        event.preventDefault();
        event.stopPropagation();
        const statusId = option.dataset.statusId;
        const outlineId = option.dataset.outlineId;
        if (!statusId || !outlineId) return;

        editor.update(() => {
          const walk = (node: OutlineItemNode): boolean => {
            if (node.getId() === outlineId) {
              node.setStatus(statusId);
              return true;
            }
            for (const child of node.getChildren()) {
              if ($isOutlineItemNode(child) && walk(child)) return true;
            }
            return false;
          };
          for (const child of $getRoot().getChildren()) {
            if ($isOutlineItemNode(child) && walk(child)) break;
          }
        });
        closeAllMenus();
        return;
      }

      const chip = target.closest<HTMLButtonElement>('.outline-status-chip');
      const root = editor.getRootElement();
      if (!chip || !root?.contains(chip)) return;

      event.preventDefault();
      event.stopPropagation();

      const itemEl = chip.closest<HTMLElement>('.outline-item');
      const outlineId = itemEl?.getAttribute('data-outline-id');
      if (!outlineId) return;

      const wasOpen = chip.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if (wasOpen) return;

      const menu = document.createElement('div');
      menu.className = MENU_CLASS;
      menu.setAttribute('role', 'listbox');

      const rect = chip.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.left = `${Math.round(rect.left)}px`;
      menu.style.top = `${Math.round(rect.bottom + 4)}px`;

      const currentStatus = chip.dataset.status;
      for (const status of getSettings().statuses) {
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = `${MENU_CLASS}__option`;
        opt.setAttribute('role', 'option');
        opt.dataset.statusId = status.id;
        opt.dataset.outlineId = outlineId;
        opt.textContent = status.label;
        opt.style.setProperty('--status-color', status.color);
        if (status.id === currentStatus) {
          opt.classList.add(`${MENU_CLASS}__option--active`);
        }
        menu.appendChild(opt);
      }

      chip.setAttribute('aria-expanded', 'true');
      document.body.appendChild(menu);
    };

    const unsubSettings = subscribeSettings(() => {
      editor.update(() => {
        $markStatusChipsDirty();
      });
    });

    const unsubMutations = editor.registerMutationListener(
      OutlineItemNode,
      (mutations) => {
        const keys: string[] = [];
        for (const [key, type] of mutations) {
          if (type !== 'destroyed') keys.push(key);
        }
        if (keys.length === 0) return;
        // Defer so we aren't nesting updates inside the mutation callback.
        queueMicrotask(() => {
          editor.update(
            () => {
              for (const key of keys) $markAncestorTasksDirtyFromKey(key);
            },
            { tag: 'historic' },
          );
        });
      },
    );

    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('click', onClick, true);

    return () => {
      unsubSettings();
      unsubMutations();
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('click', onClick, true);
      closeAllMenus();
    };
  }, [editor]);

  return null;
}
