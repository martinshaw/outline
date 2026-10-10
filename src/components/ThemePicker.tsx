import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  THEME_OPTIONS,
  type ThemeId,
} from '../settings/types';

type Props = {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
};

export function ThemePicker({ value, onChange }: Props) {
  const gridId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return THEME_OPTIONS.filter((opt) => {
      if (!q) return true;
      const hay = `${opt.label} ${opt.description ?? ''} ${opt.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  useEffect(() => {
    const idx = cards.findIndex((c) => c.id === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [cards, value, query]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-theme-card-index="${highlight}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (cards.length === 0) return;
    const cols =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)')
        .matches
        ? 1
        : typeof window !== 'undefined' &&
            window.matchMedia('(max-width: 900px)').matches
          ? 2
          : 3;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + cols, cards.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - cols, 0));
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, cards.length - 1));
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const card = cards[highlight];
      if (card) onChange(card.id);
    }
  };

  const coreCards = cards.filter((c) => c.group === 'core');
  const atmosphereCards = cards.filter((c) => c.group === 'atmosphere');
  const selectedLabel =
    THEME_OPTIONS.find((o) => o.id === value)?.label ?? value;

  const renderCard = (
    opt: (typeof THEME_OPTIONS)[number],
    index: number,
  ) => {
    const selected = opt.id === value;
    const active = index === highlight;
    return (
      <button
        key={opt.id}
        id={`theme-card-${opt.id}`}
        type="button"
        role="option"
        aria-selected={selected}
        data-theme-card-index={index}
        className={[
          'theme-picker__card',
          selected ? 'theme-picker__card--selected' : '',
          active ? 'theme-picker__card--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={() => setHighlight(index)}
        onClick={() => onChange(opt.id)}
      >
        {opt.id === 'system' ? (
          <span className="theme-picker__preview theme-picker__preview--split" aria-hidden="true">
            <span
              className="theme-picker__split-half"
              data-theme-preview="light"
            >
              <span className="theme-picker__preview-lines">
                <span />
                <span />
              </span>
              <span className="theme-picker__dots">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span
              className="theme-picker__split-half"
              data-theme-preview="dark"
            >
              <span className="theme-picker__preview-lines">
                <span />
                <span />
              </span>
              <span className="theme-picker__dots">
                <i />
                <i />
                <i />
              </span>
            </span>
          </span>
        ) : (
          <span
            className="theme-picker__preview"
            data-theme-preview={opt.id}
            aria-hidden="true"
          >
            <span className="theme-picker__preview-lines">
              <span />
              <span />
              <span />
            </span>
            <span className="theme-picker__dots">
              <i />
              <i />
              <i />
            </span>
          </span>
        )}
        <span className="theme-picker__card-name">{opt.label}</span>
        {opt.description && (
          <span className="theme-picker__card-desc">{opt.description}</span>
        )}
      </button>
    );
  };

  let indexCursor = 0;

  return (
    <div className="theme-picker">
      <div className="theme-picker__toolbar">
        <label className="theme-picker__search">
          <span className="theme-picker__sr-only">Search themes</span>
          <input
            ref={searchRef}
            id={gridId}
            className="theme-picker__search-input"
            type="search"
            placeholder="Search themes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div
        className="theme-picker__scroll"
        role="listbox"
        aria-label="Themes"
        aria-activedescendant={
          cards[highlight] ? `theme-card-${cards[highlight].id}` : undefined
        }
      >
        {cards.length === 0 && (
          <p className="theme-picker__empty">No matching themes</p>
        )}

        {coreCards.length > 0 && (
          <section className="theme-picker__group" aria-label="Core themes">
            <h4 className="theme-picker__group-label">Core</h4>
            <div className="theme-picker__grid">
              {coreCards.map((card) => {
                const i = indexCursor++;
                return renderCard(card, i);
              })}
            </div>
          </section>
        )}

        {atmosphereCards.length > 0 && (
          <section
            className="theme-picker__group"
            aria-label="Atmosphere themes"
          >
            <h4 className="theme-picker__group-label">Atmosphere</h4>
            <div className="theme-picker__grid">
              {atmosphereCards.map((card) => {
                const i = indexCursor++;
                return renderCard(card, i);
              })}
            </div>
          </section>
        )}
      </div>

      <p className="theme-picker__current">
        Current: <span>{selectedLabel}</span>
      </p>
    </div>
  );
}
