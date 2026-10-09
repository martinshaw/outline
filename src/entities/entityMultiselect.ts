import {
  ensureEntity,
  getEntityById,
  listEntities,
  subscribeEntities,
} from './entityStore';
import type { EntityTypeId, WorkspaceEntity } from './types';

export type EntityMultiselectHandle = {
  root: HTMLElement;
  getSelectedIds: () => string[];
  /** Create/select from the current input text if non-empty. */
  commitPending: () => void;
  /** Remove all selected entities of this type. */
  clear: () => void;
  focus: () => void;
  destroy: () => void;
};

type Options = {
  typeId: EntityTypeId;
  typeLabel: string;
  selectedIds: string[];
  /** BEM prefix; defaults to outline-meta-popover */
  classPrefix?: string;
  onEscape?: () => void;
  /** Fired when the selection set changes. */
  onChange?: () => void;
};

function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

/**
 * Non-native multiselect for one entity type: chip list + typeahead.
 * Enter with an empty filtered list creates a new entity of that type.
 */
export function createEntityMultiselect(
  options: Options,
): EntityMultiselectHandle {
  const prefix = options.classPrefix ?? 'outline-meta-popover';
  const typeId = options.typeId;
  const selected = new Set<string>();

  for (const id of options.selectedIds) {
    const entity = getEntityById(id);
    if (entity && entity.type === typeId) selected.add(id);
  }

  const root = document.createElement('div');
  root.className = `${prefix}__ms`;
  root.dataset.entityType = typeId;

  const control = document.createElement('div');
  control.className = `${prefix}__ms-control`;
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', options.typeLabel);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = `${prefix}__ms-input`;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'Type to add…';

  const listId = `entity-ms-${typeId}-${Math.random().toString(36).slice(2, 9)}`;
  input.setAttribute('aria-controls', listId);

  const dropdown = document.createElement('ul');
  dropdown.className = `${prefix}__ms-list`;
  dropdown.id = listId;
  dropdown.setAttribute('role', 'listbox');
  dropdown.hidden = true;

  // Chips are direct flex children of the control (before the input).
  control.append(input);
  root.append(control, dropdown);

  let open = false;
  let highlight = 0;
  let filtered: WorkspaceEntity[] = [];
  let unsub: (() => void) | null = null;
  let destroyed = false;

  const chipEls = new Map<string, HTMLElement>();

  const renderChips = () => {
    // Remove stale chips.
    for (const [id, el] of chipEls) {
      if (!selected.has(id)) {
        el.remove();
        chipEls.delete(id);
      }
    }
    // Ensure selected chips exist, in order, before the input.
    for (const id of selected) {
      const entity = getEntityById(id);
      if (!entity || entity.type !== typeId) {
        selected.delete(id);
        const stale = chipEls.get(id);
        if (stale) {
          stale.remove();
          chipEls.delete(id);
        }
        continue;
      }
      let chip = chipEls.get(id);
      if (!chip) {
        chip = document.createElement('span');
        chip.className = `${prefix}__ms-chip`;
        chip.dataset.id = id;

        const label = document.createElement('span');
        label.className = `${prefix}__ms-chip-label`;
        label.textContent = entity.label;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = `${prefix}__ms-chip-remove`;
        remove.setAttribute('aria-label', `Remove ${entity.label}`);
        remove.textContent = '×';
        remove.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        remove.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selected.delete(id);
          renderChips();
          syncFiltered();
          if (open) renderList();
          options.onChange?.();
          input.focus();
        });

        chip.append(label, remove);
        chipEls.set(id, chip);
      } else {
        const labelEl = chip.querySelector(`.${prefix}__ms-chip-label`);
        if (labelEl && labelEl.textContent !== entity.label) {
          labelEl.textContent = entity.label;
        }
      }
      if (chip.nextSibling !== input) {
        control.insertBefore(chip, input);
      }
    }
  };

  const syncFiltered = () => {
    const q = normalizeQuery(input.value).toLowerCase();
    filtered = listEntities(typeId).filter((e) => {
      if (selected.has(e.id)) return false;
      if (!q) return true;
      return e.label.toLowerCase().includes(q);
    });
    if (highlight >= filtered.length) {
      highlight = Math.max(0, filtered.length - 1);
    }
  };

  const setOpen = (next: boolean) => {
    open = next;
    dropdown.hidden = !next;
    input.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      syncFiltered();
      renderList();
    }
  };

  const updateHighlightClasses = () => {
    const options = dropdown.querySelectorAll<HTMLElement>(
      `.${prefix}__ms-option`,
    );
    options.forEach((el, index) => {
      const active = index === highlight;
      el.classList.toggle(`${prefix}__ms-option--active`, active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };

  const renderList = () => {
    syncFiltered();
    dropdown.replaceChildren();

    if (filtered.length === 0) {
      const empty = document.createElement('li');
      empty.className = `${prefix}__ms-empty`;
      empty.setAttribute('role', 'presentation');
      const qLabel = normalizeQuery(input.value);
      empty.textContent = qLabel
        ? `No matches — press Enter to add “${qLabel}”`
        : 'No entities yet — type a name and press Enter';
      dropdown.appendChild(empty);
      return;
    }

    filtered.forEach((entity, index) => {
      const li = document.createElement('li');
      li.className = `${prefix}__ms-option`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', index === highlight ? 'true' : 'false');
      if (index === highlight) li.classList.add(`${prefix}__ms-option--active`);
      li.textContent = entity.label;
      // pointerdown (not click): list re-renders must not swallow the gesture.
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectEntity(entity);
      });
      li.addEventListener('mouseenter', () => {
        if (highlight === index) return;
        highlight = index;
        updateHighlightClasses();
      });
      dropdown.appendChild(li);
    });
  };

  const selectEntity = (entity: WorkspaceEntity) => {
    if (destroyed) return;
    if (entity.type !== typeId) return;
    const already = selected.has(entity.id);
    selected.add(entity.id);
    input.value = '';
    highlight = 0;
    renderChips();
    setOpen(false);
    if (!already) options.onChange?.();
    input.focus();
  };

  const clear = () => {
    if (destroyed) return;
    const had = selected.size > 0 || normalizeQuery(input.value).length > 0;
    selected.clear();
    input.value = '';
    highlight = 0;
    renderChips();
    setOpen(false);
    if (had) options.onChange?.();
  };

  const createFromQuery = (): boolean => {
    const label = normalizeQuery(input.value);
    if (!label) return false;
    const entity = ensureEntity(typeId, label);
    selectEntity(entity);
    return true;
  };

  const commitPending = () => {
    const label = normalizeQuery(input.value);
    if (!label) return;
    syncFiltered();
    const exact = filtered.find(
      (e) => e.label.toLowerCase() === label.toLowerCase(),
    );
    if (exact) {
      selectEntity(exact);
      return;
    }
    // Also match already-selected / full catalog by label before creating.
    const existing = listEntities(typeId).find(
      (e) => e.label.toLowerCase() === label.toLowerCase(),
    );
    if (existing) {
      selectEntity(existing);
      return;
    }
    createFromQuery();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (open) {
        setOpen(false);
        return;
      }
      options.onEscape?.();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else {
        syncFiltered();
        if (filtered.length) {
          highlight = Math.min(highlight + 1, filtered.length - 1);
          updateHighlightClasses();
        }
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else {
        syncFiltered();
        if (filtered.length) {
          highlight = Math.max(highlight - 1, 0);
          updateHighlightClasses();
        }
      }
      return;
    }

    if (e.key === 'Backspace' && !input.value && selected.size > 0) {
      e.preventDefault();
      const ids = [...selected];
      const last = ids[ids.length - 1]!;
      selected.delete(last);
      renderChips();
      syncFiltered();
      if (open) renderList();
      options.onChange?.();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!open) setOpen(true);

      syncFiltered();
      const q = normalizeQuery(input.value);
      if (filtered.length > 0) {
        const exact = q
          ? filtered.find((e) => e.label.toLowerCase() === q.toLowerCase())
          : undefined;
        selectEntity(exact ?? filtered[highlight]!);
        return;
      }

      // No results — create new entity of this type.
      if (q) createFromQuery();
    }
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('focus', () => setOpen(true));
  input.addEventListener('input', () => {
    highlight = 0;
    setOpen(true);
  });
  // Close when focus leaves this multiselect (e.g. another type field).
  input.addEventListener('blur', () => {
    requestAnimationFrame(() => {
      if (destroyed) return;
      if (root.contains(document.activeElement)) return;
      setOpen(false);
    });
  });
  control.addEventListener('pointerdown', (e) => {
    if (e.target === input) return;
    if ((e.target as Element).closest(`.${prefix}__ms-chip-remove`)) return;
    if (!(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      input.focus();
    }
  });

  unsub = subscribeEntities(() => {
    if (destroyed) return;
    for (const id of [...selected]) {
      const entity = getEntityById(id);
      if (!entity || entity.type !== typeId) selected.delete(id);
    }
    renderChips();
    if (open) renderList();
  });

  renderChips();

  return {
    root,
    getSelectedIds: () => [...selected],
    commitPending,
    clear,
    focus: () => input.focus(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unsub?.();
      unsub = null;
      root.remove();
    },
  };
}
