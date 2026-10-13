import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  getSettings,
  subscribeSettings,
} from '../settings/settingsStore';
import type { DayDocument } from '../types';
import { formatDayLabel } from '../utils/date';
import {
  formatDeadlineLabel,
  isDeadlineOverdue,
} from '../utils/itemMeta';
import {
  filterTasks,
  groupTasksByStatus,
  indexTasks,
  rankCommonEntities,
  type CommonEntity,
  type IndexedTask,
  type TaskDeadlineFilter,
  type TaskFilters,
} from '../utils/taskIndex';
import { CloseIcon } from './CloseIcon';

type Props = {
  open: boolean;
  onClose: () => void;
  docs: DayDocument[];
  onSelectItem: (date: string, itemId: string) => void;
  onChangeStatus: (
    date: string,
    itemId: string,
    status: string,
  ) => void | Promise<void>;
};

function rowKey(row: IndexedTask): string {
  return `${row.date}:${row.itemId}`;
}

const DEFAULT_FILTERS: TaskFilters = {
  query: '',
  kind: 'all',
  statuses: [],
  entities: [],
  deadline: 'any',
  // Always show completed — Done/Archived are board columns.
  hideCompleted: false,
};

/** How many frequency-ranked entities to show before “More”. */
const COMMON_ENTITY_PREVIEW = 8;

const DRAG_THRESHOLD_PX = 4;

type DragState = {
  key: string;
  date: string;
  itemId: string;
  fromStatus: string;
  title: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
};

type FlatCard = {
  key: string;
  row: IndexedTask;
  statusId: string;
  colIndex: number;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const altLabel = isMac ? '⌥' : 'Alt';

/**
 * Cross-note Kanban triage: one column per configured status.
 * Drag a card onto another column (or Alt+←/→) to change its status.
 */
export function BoardDialog({
  open,
  onClose,
  docs,
  onSelectItem,
  onChangeStatus,
}: Props) {
  const titleId = useId();
  const searchId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [statuses, setStatuses] = useState(() => getSettings().statuses);
  const [entitiesExpanded, setEntitiesExpanded] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropStatusRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const moveRafRef = useRef(0);

  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    return subscribeSettings((next) => setStatuses(next.statuses));
  }, []);

  useEffect(() => {
    if (!open) return;
    setFilters(DEFAULT_FILTERS);
    setEntitiesExpanded(false);
    setDraggingKey(null);
    setDropStatus(null);
    setActiveKey(null);
    dragRef.current = null;
    dropStatusRef.current = null;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (dragRef.current) {
        if (moveRafRef.current) {
          cancelAnimationFrame(moveRafRef.current);
          moveRafRef.current = 0;
        }
        setDraggingKey(null);
        setDropStatus(null);
        dropStatusRef.current = null;
        dragRef.current = null;
        if (ghostRef.current) ghostRef.current.hidden = true;
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const indexed = useMemo(() => {
    if (!open) return [] as IndexedTask[];
    return indexTasks(docs);
  }, [open, docs]);

  const commonEntities = useMemo(
    () => rankCommonEntities(indexed),
    [indexed],
  );

  const visibleEntities = useMemo(() => {
    if (entitiesExpanded || commonEntities.length <= COMMON_ENTITY_PREVIEW) {
      return commonEntities;
    }
    const preview = commonEntities.slice(0, COMMON_ENTITY_PREVIEW);
    const selected = new Set(filters.entities);
    const extras = commonEntities.filter(
      (e) => selected.has(e.id) && !preview.some((p) => p.id === e.id),
    );
    return [...preview, ...extras];
  }, [commonEntities, entitiesExpanded, filters.entities]);

  const entitiesByType = useMemo(() => {
    if (!entitiesExpanded) return null as Map<string, CommonEntity[]> | null;
    const groups = new Map<string, CommonEntity[]>();
    for (const entity of visibleEntities) {
      const key = entity.typeLabel || 'Entities';
      const list = groups.get(key);
      if (list) list.push(entity);
      else groups.set(key, [entity]);
    }
    return groups;
  }, [entitiesExpanded, visibleEntities]);

  // Columns are the status dimension — never filter by status / hide-done.
  // Defer query filtering so typing stays responsive with large boards.
  const boardFilters = useMemo(
    () => ({
      ...filters,
      query: deferredQuery,
      statuses: [] as string[],
      hideCompleted: false,
    }),
    [filters, deferredQuery],
  );

  const filtered = useMemo(
    () => filterTasks(indexed, boardFilters),
    [indexed, boardFilters],
  );

  const columns = useMemo(
    () => groupTasksByStatus(filtered, statuses),
    [filtered, statuses],
  );

  const flatCards = useMemo(() => {
    const out: FlatCard[] = [];
    columns.forEach((column, colIndex) => {
      for (const row of column.tasks) {
        out.push({
          key: rowKey(row),
          row,
          statusId: column.statusId,
          colIndex,
        });
      }
    });
    return out;
  }, [columns]);

  const activeIndex = useMemo(() => {
    if (!activeKey) return flatCards.length > 0 ? 0 : -1;
    const idx = flatCards.findIndex((c) => c.key === activeKey);
    if (idx >= 0) return idx;
    return flatCards.length > 0 ? 0 : -1;
  }, [activeKey, flatCards]);

  const activeCard = activeIndex >= 0 ? flatCards[activeIndex] : null;

  useEffect(() => {
    if (flatCards.length === 0) {
      setActiveKey(null);
      return;
    }
    setActiveKey((prev) => {
      if (prev && flatCards.some((c) => c.key === prev)) return prev;
      return flatCards[0].key;
    });
  }, [flatCards]);

  useEffect(() => {
    if (!activeCard) return;
    const el = boardWrapRef.current?.querySelector<HTMLElement>(
      `[data-board-card="${activeCard.key}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeCard]);

  const patchFilters = useCallback((patch: Partial<TaskFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleEntityFilter = useCallback((id: string) => {
    setFilters((prev) => {
      const has = prev.entities.includes(id);
      const entities = has
        ? prev.entities.filter((e) => e !== id)
        : [...prev.entities, id];
      return { ...prev, entities };
    });
  }, []);

  const openCard = useCallback(
    (row: IndexedTask) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelectItem(row.date, row.itemId);
      onClose();
    },
    [onClose, onSelectItem],
  );

  const moveCardStatus = useCallback(
    (card: FlatCard, direction: -1 | 1) => {
      const nextCol = card.colIndex + direction;
      if (nextCol < 0 || nextCol >= columns.length) return;
      const targetStatus = columns[nextCol].statusId;
      if (targetStatus === card.statusId) return;
      void onChangeStatus(card.row.date, card.row.itemId, targetStatus);
      setActiveKey(card.key);
    },
    [columns, onChangeStatus],
  );

  const focusInColumn = useCallback(
    (colIndex: number) => {
      if (colIndex < 0 || colIndex >= columns.length) return;
      const inCol = flatCards.filter((c) => c.colIndex === colIndex);
      if (inCol.length === 0) return;
      let prefer = 0;
      if (activeCard) {
        const siblings = flatCards.filter(
          (c) => c.colIndex === activeCard.colIndex,
        );
        prefer = Math.min(
          Math.max(0, siblings.findIndex((c) => c.key === activeCard.key)),
          inCol.length - 1,
        );
      }
      setActiveKey(inCol[prefer].key);
    },
    [activeCard, columns.length, flatCards],
  );

  const navigateVertical = useCallback(
    (delta: -1 | 1) => {
      if (!activeCard) {
        if (flatCards.length > 0) setActiveKey(flatCards[0].key);
        return;
      }
      const colCards = flatCards.filter((c) => c.colIndex === activeCard.colIndex);
      const idx = colCards.findIndex((c) => c.key === activeCard.key);
      const next = colCards[idx + delta];
      if (next) {
        setActiveKey(next.key);
        return;
      }
      // Wrap to adjacent column’s edge card.
      const nextCol = activeCard.colIndex + delta;
      if (nextCol < 0 || nextCol >= columns.length) return;
      const edge = flatCards.filter((c) => c.colIndex === nextCol);
      if (edge.length === 0) return;
      setActiveKey(delta === 1 ? edge[0].key : edge[edge.length - 1].key);
    },
    [activeCard, columns.length, flatCards],
  );

  const onDialogKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (flatCards.length === 0) return;
      const editable = isEditableTarget(event.target);

      // From search/select, only ↑/↓ enter the board (←/→ keep caret / options).
      if (editable && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        if (
          !(
            event.altKey &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          )
        ) {
          return;
        }
      }

      if (
        event.altKey &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        event.preventDefault();
        if (!activeCard) return;
        moveCardStatus(activeCard, event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        navigateVertical(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        navigateVertical(-1);
      } else if (event.key === 'ArrowLeft' && !editable) {
        event.preventDefault();
        if (activeCard) focusInColumn(activeCard.colIndex - 1);
      } else if (event.key === 'ArrowRight' && !editable) {
        event.preventDefault();
        if (activeCard) focusInColumn(activeCard.colIndex + 1);
      } else if (event.key === 'Home' && !editable) {
        event.preventDefault();
        setActiveKey(flatCards[0].key);
      } else if (event.key === 'End' && !editable) {
        event.preventDefault();
        setActiveKey(flatCards[flatCards.length - 1].key);
      } else if (event.key === 'Enter' && !editable) {
        event.preventDefault();
        if (activeCard) openCard(activeCard.row);
      }
    },
    [
      activeCard,
      flatCards,
      focusInColumn,
      moveCardStatus,
      navigateVertical,
      openCard,
    ],
  );

  const columnFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!(el instanceof Element)) return null;
    const col = el.closest<HTMLElement>('[data-board-status]');
    return col?.getAttribute('data-board-status') ?? null;
  }, []);

  const syncGhost = (x: number, y: number, title: string, show: boolean) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.hidden = !show;
    if (!show) return;
    ghost.textContent = title || '(empty)';
    ghost.style.transform = `translate(${x + 8}px, ${y + 8}px)`;
  };

  const onCardPointerDown = (
    event: ReactPointerEvent,
    row: IndexedTask,
    columnStatus: string,
  ) => {
    if (event.button !== 0) return;
    // Allow text selection / focus with modifiers.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const key = rowKey(row);
    setActiveKey(key);
    const next: DragState = {
      key,
      date: row.date,
      itemId: row.itemId,
      fromStatus: columnStatus,
      title: row.title,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    dragRef.current = next;

    const onMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;
      const nextDragging =
        current.dragging ||
        dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
      current.x = moveEvent.clientX;
      current.y = moveEvent.clientY;

      if (nextDragging && !current.dragging) {
        current.dragging = true;
        setDraggingKey(current.key);
      }

      if (moveRafRef.current) cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        const live = dragRef.current;
        if (!live?.dragging) return;
        syncGhost(live.x, live.y, live.title, true);
        const nextDrop = columnFromPoint(live.x, live.y);
        if (nextDrop !== dropStatusRef.current) {
          dropStatusRef.current = nextDrop;
          setDropStatus(nextDrop);
        }
      });
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (moveRafRef.current) {
        cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = 0;
      }

      const current = dragRef.current;
      dragRef.current = null;
      setDraggingKey(null);
      setDropStatus(null);
      dropStatusRef.current = null;
      syncGhost(0, 0, '', false);
      if (!current?.dragging) return;

      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      const targetStatus = columnFromPoint(upEvent.clientX, upEvent.clientY);
      if (!targetStatus || targetStatus === current.fromStatus) return;
      void onChangeStatus(current.date, current.itemId, targetStatus);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const renderEntityChip = (entity: CommonEntity) => {
    const on = filters.entities.includes(entity.id);
    return (
      <button
        key={entity.id}
        type="button"
        className={
          on
            ? 'board-dialog__entity-chip board-dialog__entity-chip--on'
            : 'board-dialog__entity-chip'
        }
        aria-pressed={on}
        title={`${entity.typeLabel}: ${entity.label} (${entity.count})`}
        onClick={() => toggleEntityFilter(entity.id)}
      >
        <span className="board-dialog__entity-chip-label">{entity.label}</span>
        <span className="board-dialog__entity-chip-count">{entity.count}</span>
      </button>
    );
  };

  if (!open) return null;

  const totalCards = filtered.length;
  const resolvedActiveKey =
    activeIndex >= 0 ? flatCards[activeIndex]?.key ?? null : null;

  return (
    <div className="board-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="board-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className="board-dialog__header">
          <h2 id={titleId} className="board-dialog__title">
            Triage
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <div className="board-dialog__toolbar">
          <div className="board-dialog__row board-dialog__row--primary">
            <label className="board-dialog__search" htmlFor={searchId}>
              <span className="board-dialog__sr-only">Filter triage</span>
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                className="board-dialog__search-input"
                placeholder="Filter triage…"
                value={filters.query}
                onChange={(e) => patchFilters({ query: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <div
              className="board-dialog__seg"
              role="group"
              aria-label="Kind"
            >
              {(
                [
                  ['all', 'All'],
                  ['task', 'Tasks'],
                  ['subtask', 'Subtasks'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    filters.kind === value
                      ? 'board-dialog__seg-btn board-dialog__seg-btn--on'
                      : 'board-dialog__seg-btn'
                  }
                  aria-pressed={filters.kind === value}
                  onClick={() => patchFilters({ kind: value })}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              className="board-dialog__select"
              aria-label="Deadline"
              value={filters.deadline}
              onChange={(e) =>
                patchFilters({
                  deadline: e.target.value as TaskDeadlineFilter,
                })
              }
            >
              <option value="any">Any deadline</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="upcoming">Upcoming</option>
              <option value="none">No deadline</option>
            </select>
          </div>

          {commonEntities.length > 0 && (
            <div className="board-dialog__row board-dialog__row--chips">
              <div
                className="board-dialog__chip-group"
                role="group"
                aria-label="Filter by entities"
              >
                {entitiesByType
                  ? [...entitiesByType.entries()].flatMap(
                      ([typeLabel, list]) => [
                        <span
                          key={`t-${typeLabel}`}
                          className="board-dialog__chip-prefix"
                        >
                          {typeLabel}
                        </span>,
                        ...list.map(renderEntityChip),
                      ],
                    )
                  : visibleEntities.map(renderEntityChip)}
                {filters.entities.length > 0 && (
                  <button
                    type="button"
                    className="board-dialog__clear-filters"
                    onClick={() => patchFilters({ entities: [] })}
                  >
                    Clear
                  </button>
                )}
                {commonEntities.length > COMMON_ENTITY_PREVIEW && (
                  <button
                    type="button"
                    className="board-dialog__entities-more"
                    aria-expanded={entitiesExpanded}
                    onClick={() => setEntitiesExpanded((v) => !v)}
                  >
                    {entitiesExpanded
                      ? 'Less'
                      : `+${commonEntities.length - COMMON_ENTITY_PREVIEW}`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="board-dialog__board-wrap" ref={boardWrapRef}>
          {indexed.length === 0 ? (
            <p className="board-dialog__empty">
              No tasks in your notes yet. Promote a block with ⌘Enter /
              Ctrl+Enter.
            </p>
          ) : totalCards === 0 ? (
            <p className="board-dialog__empty">
              No tasks match these filters.
            </p>
          ) : (
            <div className="board-dialog__board" role="list">
              {columns.map((column) => (
                <section
                  key={column.statusId}
                  className={
                    dropStatus === column.statusId
                      ? 'board-column board-column--drop'
                      : 'board-column'
                  }
                  data-board-status={column.statusId}
                  style={
                    { '--status-color': column.color } as CSSProperties
                  }
                  aria-label={`${column.label}, ${column.tasks.length} items`}
                >
                  <header className="board-column__header">
                    <span className="board-column__dot" aria-hidden="true" />
                    <h3 className="board-column__title">{column.label}</h3>
                    <span className="board-column__count">
                      {column.tasks.length}
                    </span>
                  </header>
                  <div className="board-column__cards">
                    {column.tasks.length === 0 ? (
                      <p className="board-column__empty">Drop here</p>
                    ) : (
                      column.tasks.map((row) => {
                        const key = rowKey(row);
                        const overdue =
                          row.deadline != null &&
                          isDeadlineOverdue(row.deadline);
                        const isActive = resolvedActiveKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            data-board-card={key}
                            className={[
                              'board-card',
                              draggingKey === key ? 'board-card--dragging' : '',
                              isActive ? 'board-card--active' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            tabIndex={isActive ? 0 : -1}
                            aria-current={isActive ? 'true' : undefined}
                            onPointerDown={(e) =>
                              onCardPointerDown(e, row, column.statusId)
                            }
                            onClick={() => openCard(row)}
                            onFocus={() => setActiveKey(key)}
                          >
                            <span className="board-card__title">
                              {row.title || '(empty)'}
                            </span>
                            <span className="board-card__meta">
                              <span className="board-card__kind">
                                {row.kind === 'subtask' ? 'Subtask' : 'Task'}
                              </span>
                              <span className="board-card__date">
                                {formatDayLabel(row.date)}
                              </span>
                              {row.deadline && (
                                <span
                                  className={
                                    overdue
                                      ? 'board-card__deadline board-card__deadline--overdue'
                                      : 'board-card__deadline'
                                  }
                                >
                                  {formatDeadlineLabel(row.deadline)}
                                </span>
                              )}
                            </span>
                            {row.parentTaskTitle && (
                              <span className="board-card__parent">
                                {row.parentTaskTitle}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="board-dialog__footer">
          <span className="board-dialog__footer-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <kbd>←</kbd>
            <kbd>→</kbd> move · <kbd>{altLabel}←</kbd>
            <kbd>{altLabel}→</kbd> status · <kbd>↵</kbd> open · drag to
            change status
          </span>
        </footer>
      </div>

      <div
        ref={ghostRef}
        className="board-card-ghost"
        hidden
        aria-hidden="true"
      />
    </div>
  );
}
