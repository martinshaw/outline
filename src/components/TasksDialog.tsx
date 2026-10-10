import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  getSettings,
  getStatusDef,
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
  indexTasks,
  rankCommonEntities,
  sortTasks,
  type CommonEntity,
  type IndexedTask,
  type TaskDeadlineFilter,
  type TaskFilters,
  type TaskSort,
  type TaskSortKey,
} from '../utils/taskIndex';

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
  onChangeStatuses: (
    updates: readonly { date: string; itemId: string; status: string }[],
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
  hideCompleted: true,
};

const DEFAULT_SORT: TaskSort = { key: 'date', dir: 'desc' };
/** How many frequency-ranked entities to show before “More”. */
const COMMON_ENTITY_PREVIEW = 8;

function SortHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: TaskSortKey;
  sort: TaskSort;
  onSort: (key: TaskSortKey) => void;
}) {
  const active = sort.key === column;
  const ariaSort = active
    ? sort.dir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  return (
    <th aria-sort={ariaSort}>
      <button
        type="button"
        className={
          active
            ? 'tasks-dialog__sort tasks-dialog__sort--active'
            : 'tasks-dialog__sort'
        }
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

export function TasksDialog({
  open,
  onClose,
  docs,
  onSelectItem,
  onChangeStatus,
  onChangeStatuses,
}: Props) {
  const titleId = useId();
  const searchId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<TaskSort>(DEFAULT_SORT);
  const [activeIndex, setActiveIndex] = useState(0);
  const [statuses, setStatuses] = useState(() => getSettings().statuses);
  const [entitiesExpanded, setEntitiesExpanded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const selectionAnchorRef = useRef<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    return subscribeSettings((next) => setStatuses(next.statuses));
  }, []);

  useEffect(() => {
    if (!open) return;
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
    setActiveIndex(0);
    setEntitiesExpanded(false);
    setSelectedKeys(new Set());
    selectionAnchorRef.current = null;
    setBulkBusy(false);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (selectedKeys.size > 0) {
        setSelectedKeys(new Set());
        selectionAnchorRef.current = null;
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, selectedKeys.size]);

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

  const rows = useMemo(() => {
    return sortTasks(filterTasks(indexed, filters), sort);
  }, [indexed, filters, sort]);

  useEffect(() => {
    setActiveIndex((i) =>
      rows.length === 0 ? 0 : Math.min(i, rows.length - 1),
    );
  }, [rows.length]);

  // Drop selections that scrolled out of the filtered list.
  useEffect(() => {
    const visible = new Set(rows.map(rowKey));
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (visible.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (
      selectionAnchorRef.current != null &&
      selectionAnchorRef.current >= rows.length
    ) {
      selectionAnchorRef.current = rows.length > 0 ? rows.length - 1 : null;
    }
  }, [rows]);

  const selectedCount = selectedKeys.size;
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedKeys.has(rowKey(row)));
  const someVisibleSelected =
    !allVisibleSelected && rows.some((row) => selectedKeys.has(rowKey(row)));

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    selectionAnchorRef.current = null;
  }, []);

  const onToggleCheck = useCallback(
    (index: number, shiftKey: boolean) => {
      const row = rows[index];
      if (!row) return;
      const key = rowKey(row);

      if (shiftKey && selectionAnchorRef.current != null) {
        const lo = Math.min(selectionAnchorRef.current, index);
        const hi = Math.max(selectionAnchorRef.current, index);
        const next = new Set<string>();
        for (let i = lo; i <= hi; i++) next.add(rowKey(rows[i]));
        setSelectedKeys(next);
        setActiveIndex(index);
        return;
      }

      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      selectionAnchorRef.current = index;
      setActiveIndex(index);
    },
    [rows],
  );

  const onToggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      clearSelection();
      return;
    }
    setSelectedKeys(new Set(rows.map(rowKey)));
    selectionAnchorRef.current = rows.length > 0 ? 0 : null;
  }, [allVisibleSelected, clearSelection, rows]);

  const applyBulkStatus = useCallback(
    async (status: string) => {
      if (!status || selectedKeys.size === 0) return;
      const updates = rows
        .filter((row) => selectedKeys.has(rowKey(row)))
        .map((row) => ({
          date: row.date,
          itemId: row.itemId,
          status,
        }));
      if (updates.length === 0) return;
      setBulkBusy(true);
      try {
        await onChangeStatuses(updates);
        clearSelection();
      } finally {
        setBulkBusy(false);
      }
    },
    [clearSelection, onChangeStatuses, rows, selectedKeys],
  );

  const onSort = useCallback((key: TaskSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : {
            key,
            dir: key === 'title' || key === 'status' || key === 'kind' ? 'asc' : 'desc',
          },
    );
  }, []);

  const openRow = useCallback(
    (row: IndexedTask) => {
      onSelectItem(row.date, row.itemId);
      onClose();
    },
    [onClose, onSelectItem],
  );

  const patchFilters = useCallback((patch: Partial<TaskFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setActiveIndex(0);
  }, []);

  const toggleStatusFilter = useCallback((id: string) => {
    setFilters((prev) => {
      const has = prev.statuses.includes(id);
      const statuses = has
        ? prev.statuses.filter((s) => s !== id)
        : [...prev.statuses, id];
      return { ...prev, statuses };
    });
    setActiveIndex(0);
  }, []);

  const toggleEntityFilter = useCallback((id: string) => {
    setFilters((prev) => {
      const has = prev.entities.includes(id);
      const entities = has
        ? prev.entities.filter((e) => e !== id)
        : [...prev.entities, id];
      return { ...prev, entities };
    });
    setActiveIndex(0);
  }, []);

  const renderEntityChip = (entity: CommonEntity) => {
    const on = filters.entities.includes(entity.id);
    return (
      <button
        key={entity.id}
        type="button"
        className={
          on
            ? 'tasks-dialog__entity-chip tasks-dialog__entity-chip--on'
            : 'tasks-dialog__entity-chip'
        }
        aria-pressed={on}
        title={`${entity.typeLabel}: ${entity.label} (${entity.count})`}
        onClick={() => toggleEntityFilter(entity.id)}
      >
        <span className="tasks-dialog__entity-chip-label">{entity.label}</span>
        <span className="tasks-dialog__entity-chip-count">{entity.count}</span>
      </button>
    );
  };

  const onTableKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (rows.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const row = rows[activeIndex];
        if (row) openRow(row);
      }
    },
    [activeIndex, openRow, rows],
  );

  if (!open) return null;

  return (
    <div className="tasks-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="tasks-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onTableKeyDown}
      >
        <header className="tasks-dialog__header">
          <h2 id={titleId} className="tasks-dialog__title">
            Tasks
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="tasks-dialog__toolbar">
          <div className="tasks-dialog__row tasks-dialog__row--primary">
            <label className="tasks-dialog__search" htmlFor={searchId}>
              <span className="tasks-dialog__sr-only">Filter tasks</span>
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                className="tasks-dialog__search-input"
                placeholder="Filter tasks…"
                value={filters.query}
                onChange={(e) => patchFilters({ query: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <div
              className="tasks-dialog__seg"
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
                      ? 'tasks-dialog__seg-btn tasks-dialog__seg-btn--on'
                      : 'tasks-dialog__seg-btn'
                  }
                  aria-pressed={filters.kind === value}
                  onClick={() => patchFilters({ kind: value })}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              className="tasks-dialog__select"
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

            <label
              className="tasks-dialog__switch"
              title="Hide completed tasks"
            >
              <input
                type="checkbox"
                checked={filters.hideCompleted}
                onChange={(e) =>
                  patchFilters({ hideCompleted: e.target.checked })
                }
              />
              <span className="tasks-dialog__switch-track" aria-hidden="true" />
              <span className="tasks-dialog__switch-label">Hide done</span>
            </label>
          </div>

          <div className="tasks-dialog__row tasks-dialog__row--chips">
            <div
              className="tasks-dialog__chip-group"
              role="group"
              aria-label="Filter by status"
            >
              {statuses.map((status) => {
                const on = filters.statuses.includes(status.id);
                return (
                  <button
                    key={status.id}
                    type="button"
                    className={
                      on
                        ? 'tasks-dialog__status-chip tasks-dialog__status-chip--on'
                        : 'tasks-dialog__status-chip'
                    }
                    style={
                      { '--status-color': status.color } as CSSProperties
                    }
                    aria-pressed={on}
                    onClick={() => toggleStatusFilter(status.id)}
                  >
                    {status.label}
                  </button>
                );
              })}
              {filters.statuses.length > 0 && (
                <button
                  type="button"
                  className="tasks-dialog__clear-filters"
                  onClick={() => patchFilters({ statuses: [] })}
                >
                  Clear
                </button>
              )}
            </div>

            {commonEntities.length > 0 && (
              <>
                <span className="tasks-dialog__chip-sep" aria-hidden="true" />
                <div
                  className="tasks-dialog__chip-group"
                  role="group"
                  aria-label="Filter by entities"
                >
                  {entitiesByType
                    ? [...entitiesByType.entries()].flatMap(
                        ([typeLabel, list]) => [
                          <span
                            key={`t-${typeLabel}`}
                            className="tasks-dialog__chip-prefix"
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
                      className="tasks-dialog__clear-filters"
                      onClick={() => patchFilters({ entities: [] })}
                    >
                      Clear
                    </button>
                  )}
                  {commonEntities.length > COMMON_ENTITY_PREVIEW && (
                    <button
                      type="button"
                      className="tasks-dialog__entities-more"
                      aria-expanded={entitiesExpanded}
                      onClick={() => setEntitiesExpanded((v) => !v)}
                    >
                      {entitiesExpanded
                        ? 'Less'
                        : `+${commonEntities.length - COMMON_ENTITY_PREVIEW}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="tasks-dialog__table-wrap">
          {rows.length === 0 ? (
            <p className="tasks-dialog__empty">
              {indexed.length === 0
                ? 'No tasks in your notes yet. Promote a block with ⌘Enter / Ctrl+Enter.'
                : 'No tasks match these filters.'}
            </p>
          ) : (
            <table className="tasks-table">
              <thead>
                <tr>
                  <th className="tasks-table__check-col">
                    <input
                      type="checkbox"
                      className="tasks-table__check"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      aria-label={
                        allVisibleSelected
                          ? 'Deselect all visible tasks'
                          : 'Select all visible tasks'
                      }
                      onChange={onToggleSelectAllVisible}
                    />
                  </th>
                  <SortHeader
                    label="Note"
                    column="date"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Title"
                    column="title"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Kind"
                    column="kind"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Status"
                    column="status"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Deadline"
                    column="deadline"
                    sort={sort}
                    onSort={onSort}
                  />
                  <th>Entities</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const status = getStatusDef(row.status);
                  const overdue = isDeadlineOverdue(row.deadline);
                  const key = rowKey(row);
                  const checked = selectedKeys.has(key);
                  const rowClass = [
                    'tasks-table__row',
                    index === activeIndex ? 'tasks-table__row--active' : '',
                    checked ? 'tasks-table__row--checked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <tr
                      key={key}
                      className={rowClass}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openRow(row)}
                    >
                      <td
                        className="tasks-table__check-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="tasks-table__check"
                          checked={checked}
                          aria-label={`Select ${row.title}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleCheck(index, e.shiftKey);
                          }}
                          onChange={() => {
                            /* toggled in onClick for shift-range support */
                          }}
                        />
                      </td>
                      <td className="tasks-table__note">
                        <span className="tasks-table__date">{row.date}</span>
                        <span className="tasks-table__day-label">
                          {formatDayLabel(row.date)}
                        </span>
                      </td>
                      <td className="tasks-table__title">
                        <span className="tasks-table__title-text">
                          {row.title}
                        </span>
                        {row.parentTaskTitle && (
                          <span className="tasks-table__parent">
                            under {row.parentTaskTitle}
                          </span>
                        )}
                      </td>
                      <td className="tasks-table__kind">
                        {row.kind === 'task' ? 'Task' : 'Subtask'}
                      </td>
                      <td
                        className="tasks-table__status"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          className="tasks-table__status-select"
                          value={row.status ?? status.id}
                          aria-label={`Status for ${row.title}`}
                          style={
                            {
                              '--status-color': status.color,
                            } as CSSProperties
                          }
                          onChange={(e) => {
                            void onChangeStatus(
                              row.date,
                              row.itemId,
                              e.target.value,
                            );
                          }}
                        >
                          {statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className={
                          overdue
                            ? 'tasks-table__deadline tasks-table__deadline--overdue'
                            : 'tasks-table__deadline'
                        }
                      >
                        {row.deadline
                          ? formatDeadlineLabel(row.deadline)
                          : '—'}
                      </td>
                      <td className="tasks-table__entities">
                        {row.entityLabels || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {selectedCount > 0 && (
            <div
              className="tasks-dialog__bulk"
              role="toolbar"
              aria-label="Bulk task actions"
            >
              <span className="tasks-dialog__bulk-count">
                {selectedCount} selected
              </span>
              <label className="tasks-dialog__bulk-status">
                <span className="tasks-dialog__sr-only">Set status</span>
                <select
                  className="tasks-dialog__bulk-select"
                  disabled={bulkBusy}
                  defaultValue=""
                  key={selectedCount}
                  aria-label="Set status for selected tasks"
                  onChange={(e) => {
                    const value = e.target.value;
                    e.target.value = '';
                    if (value) void applyBulkStatus(value);
                  }}
                >
                  <option value="" disabled>
                    Set status…
                  </option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="tasks-dialog__bulk-clear"
                disabled={bulkBusy}
                onClick={clearSelection}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <footer className="tasks-dialog__footer">
          <span>
            {rows.length} of {indexed.length} task
            {indexed.length === 1 ? '' : 's'}
            {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          </span>
          <span className="tasks-dialog__footer-hint">
            <kbd>⇧</kbd> click range · <kbd>↑</kbd>
            <kbd>↓</kbd> · <kbd>Enter</kbd> open
          </span>
        </footer>
      </div>
    </div>
  );
}
