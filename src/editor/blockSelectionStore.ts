type Listener = () => void;

let selectedIds = new Set<string>();
const listeners = new Set<Listener>();

export function getBlockSelectedIds(): ReadonlySet<string> {
  return selectedIds;
}

export function setBlockSelectedIds(ids: Iterable<string>): void {
  const next = new Set(ids);
  if (setsEqual(selectedIds, next)) return;
  selectedIds = next;
  for (const listener of listeners) listener();
}

export function clearBlockSelectedIds(): void {
  if (selectedIds.size === 0) return;
  selectedIds = new Set();
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

/** Apply selected classes on the editor DOM from the id set. */
export function syncBlockSelectionDom(root: HTMLElement | null): void {
  if (!root) return;
  const selected = selectedIds;
  root.querySelectorAll('.outline-item').forEach((el) => {
    const id = el.getAttribute('data-outline-id');
    const on = !!id && selected.has(id);
    el.classList.toggle('outline-item--selected', on);
  });
}
