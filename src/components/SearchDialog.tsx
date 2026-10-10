import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { NotesSearchIndex, SearchHit } from '../search/notesIndex';
import { formatDayLabel } from '../utils/date';
import { CloseIcon } from './CloseIcon';

type Props = {
  open: boolean;
  onClose: () => void;
  index: NotesSearchIndex;
  /** Bumps when the index contents change so results refresh. */
  indexRevision: number;
  onSelectItem: (date: string, itemId: string) => void;
};

function kindLabel(kind: SearchHit['kind']): string {
  if (kind === 'task') return 'Task';
  if (kind === 'subtask') return 'Subtask';
  if (kind === 'heading') return 'Heading';
  return 'Note';
}

function HighlightedSnippet({
  snippet,
  highlights,
}: {
  snippet: string;
  highlights: SearchHit['highlights'];
}) {
  if (highlights.length === 0) return <>{snippet}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  highlights.forEach((h, i) => {
    if (h.start > cursor) {
      parts.push(snippet.slice(cursor, h.start));
    }
    parts.push(
      <mark key={`${h.start}-${i}`} className="search-dialog__mark">
        {snippet.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  });
  if (cursor < snippet.length) parts.push(snippet.slice(cursor));
  return <>{parts}</>;
}

export function SearchDialog({
  open,
  onClose,
  index,
  indexRevision,
  onSelectItem,
}: Props) {
  const titleId = useId();
  const inputId = useId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebouncedQuery('');
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const tick = () => setBuilding(index.getStats().building);
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [open, index, indexRevision]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const stats = useMemo(
    () => index.getStats(),
    [index, indexRevision, building],
  );

  const results = useMemo(() => {
    if (!open) return [] as SearchHit[];
    return index.search(debouncedQuery);
  }, [open, index, debouncedQuery, indexRevision]);

  useEffect(() => {
    setActiveIndex((i) =>
      results.length === 0 ? 0 : Math.min(i, results.length - 1),
    );
  }, [results.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-search-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openHit = useCallback(
    (hit: SearchHit) => {
      onSelectItem(hit.date, hit.itemId);
      onClose();
    },
    [onClose, onSelectItem],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (results.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const hit = results[activeIndex];
        if (hit) openHit(hit);
      }
    },
    [activeIndex, openHit, results],
  );

  if (!open) return null;

  const trimmed = query.trim();

  return (
    <div className="search-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="search-dialog__header">
          <h2 id={titleId} className="search-dialog__title">
            Search notes
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <label className="search-dialog__search" htmlFor={inputId}>
          <span className="search-dialog__sr-only">Search all notes</span>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            className="search-dialog__input"
            placeholder="Search titles and body text…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            autoComplete="off"
            spellCheck={false}
            aria-controls={listId}
            aria-autocomplete="list"
          />
        </label>

        <div
          ref={listRef}
          id={listId}
          className="search-dialog__results"
          role="listbox"
          aria-label="Search results"
        >
          {!trimmed && (
            <p className="search-dialog__empty">
              Type to search across {stats.documents.toLocaleString()} item
              {stats.documents === 1 ? '' : 's'} in{' '}
              {stats.days.toLocaleString()} note
              {stats.days === 1 ? '' : 's'}
              {building ? ' · indexing…' : ''}.
            </p>
          )}
          {trimmed && results.length === 0 && (
            <p className="search-dialog__empty">
              {building
                ? 'Still indexing — try again in a moment.'
                : 'No matching items.'}
            </p>
          )}
          {results.map((hit, i) => (
            <button
              key={`${hit.date}:${hit.itemId}`}
              type="button"
              role="option"
              data-search-index={i}
              aria-selected={i === activeIndex}
              className={
                i === activeIndex
                  ? 'search-dialog__hit search-dialog__hit--active'
                  : 'search-dialog__hit'
              }
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => openHit(hit)}
            >
              <div className="search-dialog__hit-meta">
                <span className="search-dialog__hit-date">{hit.date}</span>
                <span className="search-dialog__hit-day">
                  {formatDayLabel(hit.date)}
                </span>
                <span className="search-dialog__hit-kind">
                  {kindLabel(hit.kind)}
                </span>
              </div>
              <div className="search-dialog__hit-snippet">
                <HighlightedSnippet
                  snippet={hit.snippet}
                  highlights={hit.highlights}
                />
              </div>
            </button>
          ))}
        </div>

        <footer className="search-dialog__footer">
          <span>
            {trimmed
              ? `${results.length} result${results.length === 1 ? '' : 's'}`
              : `${stats.terms.toLocaleString()} terms indexed`}
            {building ? ' · indexing…' : ''}
          </span>
          <span className="search-dialog__footer-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd> select · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}
