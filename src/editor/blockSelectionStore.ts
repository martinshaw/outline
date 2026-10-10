type Listener = () => void;

let selectedIds = new Set<string>();
/** Selected parents whose nested children should stay put on move/indent. */
let selfOnlyIds = new Set<string>();
const listeners = new Set<Listener>();

/** Last ids we applied classes for — avoids full DOM walks when unchanged. */
let paintedIds = new Set<string>();
let paintedSelfOnlyIds = new Set<string>();

export function getBlockSelectedIds(): ReadonlySet<string> {
  return selectedIds;
}

export function getBlockSelfOnlyIds(): ReadonlySet<string> {
  return selfOnlyIds;
}

export function isBlockSelfOnly(id: string): boolean {
  return selfOnlyIds.has(id);
}

export function setBlockSelectedIds(ids: Iterable<string>): void {
  const next = new Set(ids);
  let selfChanged = false;
  for (const id of [...selfOnlyIds]) {
    if (!next.has(id)) {
      selfOnlyIds.delete(id);
      selfChanged = true;
    }
  }
  const selectionChanged = !setsEqual(selectedIds, next);
  if (!selectionChanged && !selfChanged) return;
  if (selectionChanged) selectedIds = next;
  for (const listener of listeners) listener();
}

/** Mark selected parents as moving without their nested outline children. */
export function setBlockSelfOnlyIds(ids: Iterable<string>): void {
  const next = new Set<string>();
  for (const id of ids) {
    if (selectedIds.has(id)) next.add(id);
  }
  if (setsEqual(selfOnlyIds, next)) return;
  selfOnlyIds = next;
  for (const listener of listeners) listener();
}

export function clearBlockSelectedIds(): void {
  if (selectedIds.size === 0 && selfOnlyIds.size === 0) return;
  selectedIds = new Set();
  selfOnlyIds = new Set();
  for (const listener of listeners) listener();
}

/** Full reset including paint caches — for unit tests. */
export function resetBlockSelectionStore(): void {
  selectedIds = new Set();
  selfOnlyIds = new Set();
  paintedIds = new Set();
  paintedSelfOnlyIds = new Set();
  for (const listener of listeners) listener();
}

/** Notify subscribers even when the id set is unchanged (e.g. after relocate). */
export function refreshBlockSelectionChrome(): void {
  for (const listener of listeners) listener();
}

export function subscribeBlockSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

function itemById(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector(
    `.outline-item[data-outline-id="${CSS.escape(id)}"]`,
  );
}

/** Apply selected / drag-root / self-only classes. */
export function syncBlockSelectionDom(root: HTMLElement | null): void {
  if (!root) return;
  const next = selectedIds;
  const nextSelf = selfOnlyIds;
  const selectionSame = setsEqual(paintedIds, next);
  const selfSame = setsEqual(paintedSelfOnlyIds, nextSelf);

  if (!selectionSame) {
    // Clear selection styling for ids that left the set.
    for (const id of paintedIds) {
      if (next.has(id)) continue;
      const el = itemById(root, id);
      if (!el) continue;
      el.classList.remove(
        'outline-item--selected',
        'outline-item--drag-root',
        'outline-item--self-only',
      );
      el.style.removeProperty('--outline-self-sel-h');
    }

    // Clear stale drag-root on still-selected items before recomputing.
    for (const id of next) {
      if (!paintedIds.has(id)) continue;
      itemById(root, id)?.classList.remove('outline-item--drag-root');
    }

    for (const id of next) {
      const el = itemById(root, id);
      if (!el) continue;
      el.classList.add('outline-item--selected');
      const parentSelected = el.parentElement?.closest(
        '.outline-item.outline-item--selected',
      );
      if (!parentSelected) el.classList.add('outline-item--drag-root');
    }

    paintedIds = new Set(next);
  }

  if (!selfSame || !selectionSame) {
    for (const id of paintedSelfOnlyIds) {
      if (nextSelf.has(id)) continue;
      const el = itemById(root, id);
      if (!el) continue;
      el.classList.remove('outline-item--self-only');
      el.style.removeProperty('--outline-self-sel-h');
    }
    paintedSelfOnlyIds = new Set(nextSelf);
  }

  // Always (re)apply class + row height so recreated DOM / layout stay correct.
  for (const id of nextSelf) {
    const el = itemById(root, id);
    if (!el) continue;
    el.classList.add('outline-item--self-only');
    syncSelfOnlyHighlightVar(el, true);
  }
}

/**
 * Height of parent content only (attachment / text / meta), excluding nested
 * outline rows. Uses viewport rects — offsetTop is wrong under flex layouts
 * (e.g. attachment items).
 */
export function selfOnlyHighlightHeight(el: HTMLElement): number {
  const parentRect = el.getBoundingClientRect();
  let cutoff = parentRect.bottom;
  let found = false;
  for (const child of el.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!child.classList.contains('outline-item')) continue;
    const top = child.getBoundingClientRect().top;
    if (top < cutoff) cutoff = top;
    found = true;
  }
  if (found) {
    return Math.max(Math.round(cutoff - parentRect.top), 1);
  }
  return Math.max(Math.round(parentRect.height), 1);
}

/** Apply or clear the self-only highlight height CSS variable. */
export function syncSelfOnlyHighlightVar(el: HTMLElement, on: boolean): void {
  if (!on) {
    el.style.removeProperty('--outline-self-sel-h');
    return;
  }
  // createDOM runs before mount — skip; syncBlockSelectionDom will set it.
  if (!el.isConnected) return;
  el.style.setProperty(
    '--outline-self-sel-h',
    `${selfOnlyHighlightHeight(el)}px`,
  );
}

const handleEls = new Map<string, HTMLButtonElement>();
let handleLayer: HTMLElement | null = null;

function ensureHandleLayer(shell: HTMLElement): HTMLElement {
  if (handleLayer?.isConnected) return handleLayer;
  handleLayer = shell.querySelector('.outline-block-handle-layer');
  if (!handleLayer) {
    handleLayer = document.createElement('div');
    handleLayer.className = 'outline-block-handle-layer';
    shell.appendChild(handleLayer);
  }
  return handleLayer;
}

function makeHandle(id: string): HTMLButtonElement {
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'outline-block-handle';
  handle.tabIndex = -1;
  handle.dataset.outlineId = id;
  handle.setAttribute('aria-label', 'Drag to move selection');
  handle.setAttribute('title', 'Drag to move');
  handle.innerHTML =
    '<span class="outline-block-handle__grip" aria-hidden="true"></span>';
  return handle;
}

function syncHandleLabel(handle: HTMLButtonElement, id: string): void {
  if (selfOnlyIds.has(id)) {
    handle.setAttribute('aria-label', 'Drag to move item without children');
    handle.setAttribute('title', 'Drag to move (children stay)');
  } else {
    handle.setAttribute('aria-label', 'Drag to move selection');
    handle.setAttribute('title', 'Drag to move');
  }
}

/**
 * Position drag handles in an overlay outside contenteditable.
 * Cheap when nothing is selected; reuses handle elements across paints.
 */
export function syncBlockDragHandles(root: HTMLElement | null): void {
  if (!root) return;
  const shell = root.closest('.editor-shell');
  if (!(shell instanceof HTMLElement)) return;

  const layer = ensureHandleLayer(shell);

  if (selectedIds.size === 0) {
    if (!layer.hidden) {
      layer.replaceChildren();
      handleEls.clear();
      layer.hidden = true;
    }
    return;
  }

  layer.hidden = false;
  const shellRect = shell.getBoundingClientRect();
  const keep = new Set<string>();

  // Top-level rows share one gutter column — nested handles align to it.
  // Use viewport deltas only (shell is not the scroll container; .main is).
  const rootRow = root.querySelector(':scope > .outline-item');
  const rootGutterLeft = rootRow
    ? rootRow.getBoundingClientRect().left - shellRect.left + 2
    : null;

  root.querySelectorAll('.outline-item--drag-root').forEach((node) => {
    const el = node as HTMLElement;
    const id = el.getAttribute('data-outline-id');
    if (!id) return;
    keep.add(id);

    let handle = handleEls.get(id);
    if (!handle || !handle.isConnected) {
      handle = makeHandle(id);
      handleEls.set(id, handle);
      layer.appendChild(handle);
    }

    const rect = el.getBoundingClientRect();
    // Self-only: anchor to parent content, not the full subtree box.
    const anchorH = selfOnlyIds.has(id)
      ? selfOnlyHighlightHeight(el)
      : rect.height;
    const top = rect.top - shellRect.top + anchorH / 2;
    const nested = Boolean(el.parentElement?.closest('.outline-item'));
    let left = rect.left - shellRect.left + 2;
    if (nested) {
      if (rootGutterLeft != null) {
        left = rootGutterLeft;
      } else {
        // Fallback: one nest step into the indent gutter.
        const nest =
          parseFloat(getComputedStyle(el).getPropertyValue('--outline-nest')) ||
          20;
        left -= nest;
      }
    }
    // Avoid style thrash when position is unchanged (sub-pixel noise ignored).
    const topPx = `${Math.round(top)}px`;
    const leftPx = `${Math.round(left)}px`;
    if (handle.style.top !== topPx) handle.style.top = topPx;
    if (handle.style.left !== leftPx) handle.style.left = leftPx;
    handle.classList.toggle('outline-block-handle--self-only', selfOnlyIds.has(id));
    syncHandleLabel(handle, id);
  });

  for (const [id, handle] of handleEls) {
    if (keep.has(id)) continue;
    handle.remove();
    handleEls.delete(id);
  }
}

/** Drop overlay + caches (editor unmount / date change). */
export function disposeBlockDragHandles(): void {
  handleLayer?.remove();
  handleLayer = null;
  handleEls.clear();
  paintedIds = new Set();
  paintedSelfOnlyIds = new Set();
}
