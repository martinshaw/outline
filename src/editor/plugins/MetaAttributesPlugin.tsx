import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import {
  getEntityById,
  getEntityTypes,
  normalizeEntityIdList,
  subscribeEntities,
} from '../../entities/entityStore';
import {
  createEntityMultiselect,
  type EntityMultiselectHandle,
} from '../../entities/entityMultiselect';
import {
  $getSelectedOutlineItem,
  $getMoveTargets,
} from '../utils/outlineHelpers';
import { isRoleKind } from '../../types';
import {
  $isOutlineItemNode,
  type OutlineItemNode,
} from '../nodes/OutlineItemNode';

const POPOVER_CLASS = 'outline-meta-popover';

export const OPEN_ITEM_META_EVENT = 'outline:open-item-meta';

let activeDismiss: (() => void) | null = null;

function closePopover(): void {
  if (activeDismiss) {
    activeDismiss();
    return;
  }
  document.querySelectorAll(`.${POPOVER_CLASS}`).forEach((el) => el.remove());
}

function $findItemById(outlineId: string): OutlineItemNode | null {
  const walk = (node: OutlineItemNode): OutlineItemNode | null => {
    if (node.getId() === outlineId) return node;
    for (const child of node.getChildren()) {
      if ($isOutlineItemNode(child)) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  };
  for (const child of $getRoot().getChildren()) {
    if ($isOutlineItemNode(child)) {
      const found = walk(child);
      if (found) return found;
    }
  }
  return null;
}

function openMetaPopover(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  outlineId: string,
  anchor: HTMLElement,
): void {
  closePopover();

  let deadline = '';
  let entityIds: string[] = [];
  editor.getEditorState().read(() => {
    const item = $findItemById(outlineId);
    if (!item) return;
    deadline = item.getDeadline() ?? '';
    entityIds = item.getEntities();
  });

  const typeDefs = getEntityTypes();
  // Preserve linked entities whose type was removed from settings.
  const knownTypeIds = new Set(typeDefs.map((t) => t.id));
  const orphanIds = entityIds.filter((id) => {
    const entity = getEntityById(id);
    return entity != null && !knownTypeIds.has(entity.type);
  });

  const pop = document.createElement('div');
  pop.className = POPOVER_CLASS;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Deadline and entities');

  const multiselects: EntityMultiselectHandle[] = [];
  let closed = false;
  let deadlineInput: HTMLInputElement;

  const collectEntities = (commitPending: boolean): string[] => {
    if (commitPending) {
      for (const ms of multiselects) ms.commitPending();
    }
    const merged: string[] = [...orphanIds];
    for (const ms of multiselects) {
      merged.push(...ms.getSelectedIds());
    }
    return normalizeEntityIdList(merged);
  };

  const persist = (commitPending = false) => {
    if (closed) return;
    const raw = deadlineInput.value.trim();
    const nextEntities = collectEntities(commitPending);
    editor.update(() => {
      const item = $findItemById(outlineId);
      if (!item) return;
      item.setDeadline(raw || null);
      item.setEntities(nextEntities);
    });
  };

  const teardown = () => {
    for (const ms of multiselects) ms.destroy();
    multiselects.length = 0;
  };

  const dismiss = () => {
    if (closed) return;
    persist(true);
    closed = true;
    if (activeDismiss === dismiss) activeDismiss = null;
    teardown();
    pop.remove();
  };

  const makeFieldClear = (ariaLabel: string, onClear: () => void) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${POPOVER_CLASS}__field-clear`;
    btn.setAttribute('aria-label', ariaLabel);
    btn.textContent = '×';
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClear();
    });
    return btn;
  };

  // Deadline
  {
    const field = document.createElement('div');
    field.className = `${POPOVER_CLASS}__field`;

    const label = document.createElement('span');
    label.className = `${POPOVER_CLASS}__label`;
    label.textContent = 'Deadline';
    field.appendChild(label);

    const row = document.createElement('div');
    row.className = `${POPOVER_CLASS}__field-row`;

    deadlineInput = document.createElement('input');
    deadlineInput.type = 'date';
    deadlineInput.className = `${POPOVER_CLASS}__input ${POPOVER_CLASS}__deadline`;
    deadlineInput.value = deadline;
    deadlineInput.addEventListener('change', () => persist());
    deadlineInput.addEventListener('input', () => persist());
    deadlineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    });

    row.append(
      deadlineInput,
      makeFieldClear('Clear deadline', () => {
        deadlineInput.value = '';
        persist();
        deadlineInput.focus();
      }),
    );
    field.appendChild(row);
    pop.appendChild(field);
  }

  for (const typeDef of typeDefs) {
    const field = document.createElement('div');
    field.className = `${POPOVER_CLASS}__field`;

    const label = document.createElement('span');
    label.className = `${POPOVER_CLASS}__label`;
    label.textContent = typeDef.label;
    field.appendChild(label);

    const row = document.createElement('div');
    row.className = `${POPOVER_CLASS}__field-row`;

    const selectedForType = entityIds.filter((id) => {
      const entity = getEntityById(id);
      return entity?.type === typeDef.id;
    });

    const ms = createEntityMultiselect({
      typeId: typeDef.id,
      typeLabel: typeDef.label,
      selectedIds: selectedForType,
      classPrefix: POPOVER_CLASS,
      onEscape: dismiss,
      onChange: () => persist(),
    });
    multiselects.push(ms);

    row.append(
      ms.root,
      makeFieldClear(`Clear ${typeDef.label}`, () => {
        ms.clear();
        persist();
        ms.focus();
      }),
    );
    field.appendChild(row);
    pop.appendChild(field);
  }

  activeDismiss = dismiss;
  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;
  if (top + popRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - popRect.height - 6);
  }
  if (left + popRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - popRect.width - 8);
  }
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;

  queueMicrotask(() => deadlineInput.focus());
}

/**
 * Tagline click + command-palette hook for deadline / entities on tasks & subtasks.
 * Popover mounts on document.body so Lexical won't strip it.
 */
function $markRoleItemsDirty(): void {
  const walk = (node: OutlineItemNode) => {
    if (isRoleKind(node.getKind())) {
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

export function MetaAttributesPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return subscribeEntities(() => {
      editor.update(() => {
        $markRoleItemsDirty();
      });
    });
  }, [editor]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const meta = target.closest<HTMLButtonElement>('.outline-meta');
      const root = editor.getRootElement();
      if (meta && root?.contains(meta)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (target.closest(`.${POPOVER_CLASS}`) || target.closest('.outline-meta')) {
        return;
      }
      closePopover();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest(`.${POPOVER_CLASS}`)) return;

      const meta = target.closest<HTMLButtonElement>('.outline-meta');
      const root = editor.getRootElement();
      if (!meta || !root?.contains(meta)) return;

      event.preventDefault();
      event.stopPropagation();
      const itemEl = meta.closest<HTMLElement>('.outline-item');
      const outlineId = itemEl?.dataset.outlineId;
      if (!outlineId) return;
      openMetaPopover(editor, outlineId, meta);
    };

    const openForId = (outlineId: string) => {
      const root = editor.getRootElement();
      const itemEl = root?.querySelector<HTMLElement>(
        `[data-outline-id="${CSS.escape(outlineId)}"]`,
      );
      if (!itemEl) return;
      const anchor =
        itemEl.querySelector<HTMLElement>(':scope > .outline-meta') ?? itemEl;
      openMetaPopover(editor, outlineId, anchor);
    };

    const onOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ outlineId?: string }>).detail;
      if (detail?.outlineId) {
        openForId(detail.outlineId);
        return;
      }
      editor.getEditorState().read(() => {
        const targets = $getMoveTargets();
        const item =
          targets.find((t) => isRoleKind(t.getKind())) ??
          $getSelectedOutlineItem();
        if (!item) return;
        if (!isRoleKind(item.getKind())) return;
        openForId(item.getId());
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘⌥A / Ctrl+Alt+A — use code: macOS ⌥ can rewrite event.key.
      if (event.code !== 'KeyA') return;
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(OPEN_ITEM_META_EVENT));
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener(OPEN_ITEM_META_EVENT, onOpenEvent);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(OPEN_ITEM_META_EVENT, onOpenEvent);
      window.removeEventListener('keydown', onKeyDown);
      closePopover();
    };
  }, [editor]);

  return null;
}
