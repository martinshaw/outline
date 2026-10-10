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

  type ActiveTypeField = {
    typeId: string;
    field: HTMLElement;
    ms: EntityMultiselectHandle;
  };

  const multiselects: EntityMultiselectHandle[] = [];
  const activeTypeFields = new Map<string, ActiveTypeField>();
  let closed = false;
  let deadlineInput: HTMLInputElement;
  let typePickerOpen = false;

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
    activeTypeFields.clear();
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
    btn.innerHTML =
      '<svg class="btn__close-icon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
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

  const entityFieldsHost = document.createElement('div');
  entityFieldsHost.className = `${POPOVER_CLASS}__entity-fields`;
  pop.appendChild(entityFieldsHost);

  const addTypeWrap = document.createElement('div');
  addTypeWrap.className = `${POPOVER_CLASS}__add-type`;

  const addTypeBtn = document.createElement('button');
  addTypeBtn.type = 'button';
  addTypeBtn.className = `${POPOVER_CLASS}__add-type-btn`;
  addTypeBtn.textContent = '+ Add entity type';

  const typeMenuId = `${POPOVER_CLASS}-types-${outlineId}`;
  const typeMenu = document.createElement('ul');
  typeMenu.id = typeMenuId;
  typeMenu.className = `${POPOVER_CLASS}__add-type-menu`;
  typeMenu.setAttribute('role', 'listbox');
  typeMenu.setAttribute('aria-label', 'Entity types');
  typeMenu.hidden = true;

  let typeHighlight = 0;

  const remainingTypes = () =>
    typeDefs.filter((t) => !activeTypeFields.has(t.id));

  const typeOptionEls = () =>
    [
      ...typeMenu.querySelectorAll<HTMLElement>(
        `.${POPOVER_CLASS}__add-type-option`,
      ),
    ];

  const syncAddTypeVisibility = () => {
    const remaining = remainingTypes();
    addTypeWrap.hidden = remaining.length === 0;
    if (remaining.length === 0) {
      typeMenu.hidden = true;
      typePickerOpen = false;
      addTypeBtn.setAttribute('aria-expanded', 'false');
      addTypeBtn.removeAttribute('aria-activedescendant');
    }
  };

  const closeTypeMenu = () => {
    typeMenu.hidden = true;
    typePickerOpen = false;
    addTypeBtn.setAttribute('aria-expanded', 'false');
    addTypeBtn.removeAttribute('aria-activedescendant');
  };

  const updateTypeHighlight = () => {
    const opts = typeOptionEls();
    if (opts.length === 0) {
      addTypeBtn.removeAttribute('aria-activedescendant');
      return;
    }
    if (typeHighlight >= opts.length) typeHighlight = opts.length - 1;
    if (typeHighlight < 0) typeHighlight = 0;
    opts.forEach((el, index) => {
      const active = index === typeHighlight;
      el.classList.toggle(`${POPOVER_CLASS}__add-type-option--active`, active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) {
        addTypeBtn.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const selectTypeAt = (index: number) => {
    const remaining = remainingTypes();
    const typeDef = remaining[index];
    if (!typeDef) return;
    closeTypeMenu();
    addEntityTypeField(typeDef.id, typeDef.label, [], true);
  };

  const renderTypeMenu = () => {
    typeMenu.replaceChildren();
    const remaining = remainingTypes();
    remaining.forEach((typeDef, index) => {
      const opt = document.createElement('li');
      opt.id = `${typeMenuId}-${typeDef.id}`;
      opt.className = `${POPOVER_CLASS}__add-type-option`;
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', index === typeHighlight ? 'true' : 'false');
      if (index === typeHighlight) {
        opt.classList.add(`${POPOVER_CLASS}__add-type-option--active`);
      }
      opt.textContent = typeDef.label;
      opt.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectTypeAt(index);
      });
      opt.addEventListener('mouseenter', () => {
        if (typeHighlight === index) return;
        typeHighlight = index;
        updateTypeHighlight();
      });
      typeMenu.appendChild(opt);
    });
    typeMenu.hidden = remaining.length === 0;
    typePickerOpen = remaining.length > 0;
    addTypeBtn.setAttribute('aria-expanded', typePickerOpen ? 'true' : 'false');
    if (typePickerOpen) updateTypeHighlight();
    else addTypeBtn.removeAttribute('aria-activedescendant');
  };

  const openTypeMenu = (fromEnd = false) => {
    const remaining = remainingTypes();
    if (remaining.length === 0) return;
    typeHighlight = fromEnd ? remaining.length - 1 : 0;
    renderTypeMenu();
  };

  const removeEntityTypeField = (typeId: string) => {
    const active = activeTypeFields.get(typeId);
    if (!active) return;
    active.ms.clear();
    const idx = multiselects.indexOf(active.ms);
    if (idx >= 0) multiselects.splice(idx, 1);
    active.ms.destroy();
    active.field.remove();
    activeTypeFields.delete(typeId);
    persist();
    syncAddTypeVisibility();
  };

  const addEntityTypeField = (
    typeId: string,
    typeLabel: string,
    selectedForType: string[],
    focusInput: boolean,
  ) => {
    if (activeTypeFields.has(typeId)) {
      if (focusInput) activeTypeFields.get(typeId)?.ms.focus();
      return;
    }

    const field = document.createElement('div');
    field.className = `${POPOVER_CLASS}__field`;
    field.dataset.entityType = typeId;

    const label = document.createElement('span');
    label.className = `${POPOVER_CLASS}__label`;
    label.textContent = typeLabel;
    field.appendChild(label);

    const row = document.createElement('div');
    row.className = `${POPOVER_CLASS}__field-row`;

    const ms = createEntityMultiselect({
      typeId,
      typeLabel,
      selectedIds: selectedForType,
      classPrefix: POPOVER_CLASS,
      onEscape: dismiss,
      onChange: () => persist(),
    });
    multiselects.push(ms);

    row.append(
      ms.root,
      makeFieldClear(`Remove ${typeLabel}`, () => {
        removeEntityTypeField(typeId);
      }),
    );
    field.appendChild(row);
    entityFieldsHost.appendChild(field);
    activeTypeFields.set(typeId, { typeId, field, ms });
    syncAddTypeVisibility();
    if (focusInput) queueMicrotask(() => ms.focus());
  };

  addTypeBtn.setAttribute('aria-haspopup', 'listbox');
  addTypeBtn.setAttribute('aria-expanded', 'false');
  addTypeBtn.setAttribute('aria-controls', typeMenuId);
  addTypeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  addTypeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typePickerOpen) closeTypeMenu();
    else openTypeMenu();
  });
  addTypeBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (!typePickerOpen) openTypeMenu();
      else {
        typeHighlight = Math.min(
          typeHighlight + 1,
          Math.max(0, typeOptionEls().length - 1),
        );
        updateTypeHighlight();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!typePickerOpen) openTypeMenu(true);
      else {
        typeHighlight = Math.max(typeHighlight - 1, 0);
        updateTypeHighlight();
      }
      return;
    }
    if (e.key === 'Home' && typePickerOpen) {
      e.preventDefault();
      e.stopPropagation();
      typeHighlight = 0;
      updateTypeHighlight();
      return;
    }
    if (e.key === 'End' && typePickerOpen) {
      e.preventDefault();
      e.stopPropagation();
      typeHighlight = Math.max(0, typeOptionEls().length - 1);
      updateTypeHighlight();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && typePickerOpen) {
      e.preventDefault();
      e.stopPropagation();
      selectTypeAt(typeHighlight);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (typePickerOpen) {
        closeTypeMenu();
        return;
      }
      dismiss();
    }
  });
  addTypeBtn.addEventListener('blur', () => {
    requestAnimationFrame(() => {
      if (closed || !typePickerOpen) return;
      if (addTypeWrap.contains(document.activeElement)) return;
      closeTypeMenu();
    });
  });

  addTypeWrap.append(addTypeBtn, typeMenu);
  pop.appendChild(addTypeWrap);

  pop.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof Node)) return;
    if (addTypeWrap.contains(e.target)) return;
    if (typePickerOpen) closeTypeMenu();
  });

  // Escape from clear buttons / other chrome dismisses the dialog.
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (typePickerOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeTypeMenu();
      addTypeBtn.focus();
      return;
    }
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target === deadlineInput) return;
    if (target.closest(`.${POPOVER_CLASS}__ms`)) return;
    if (target === addTypeBtn) return;
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  });

  // Show types that already have linked entities on this item.
  for (const typeDef of typeDefs) {
    const selectedForType = entityIds.filter((id) => {
      const entity = getEntityById(id);
      return entity?.type === typeDef.id;
    });
    if (selectedForType.length === 0) continue;
    addEntityTypeField(typeDef.id, typeDef.label, selectedForType, false);
  }
  syncAddTypeVisibility();

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
