import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { FONT_OPTIONS, type FontId } from '../settings/types';

export type FontPickerValue =
  | { kind: 'preset'; font: FontId }
  | { kind: 'local'; family: string };

type Props = {
  value: FontPickerValue;
  localFamilies: string[];
  localFontsOk: boolean;
  localBusy: boolean;
  onChange: (value: FontPickerValue) => void;
  onAddSystemFonts: () => void;
};

type FontCard = {
  id: string;
  label: string;
  css: string;
  value: FontPickerValue;
  group: 'builtin' | 'system';
};

function valueKey(value: FontPickerValue): string {
  return value.kind === 'local'
    ? `local:${value.family}`
    : `preset:${value.font}`;
}

function cssForValue(value: FontPickerValue): string {
  if (value.kind === 'local') {
    return `"${value.family.replace(/"/g, '')}"`;
  }
  return FONT_OPTIONS.find((o) => o.id === value.font)?.css ?? 'serif';
}

export function FontPicker({
  value,
  localFamilies,
  localFontsOk,
  localBusy,
  onChange,
  onAddSystemFonts,
}: Props) {
  const gridId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const families = useMemo(() => {
    const set = new Set(localFamilies);
    if (value.kind === 'local') set.add(value.family);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [localFamilies, value]);

  const cards = useMemo((): FontCard[] => {
    const q = query.trim().toLowerCase();
    const match = (label: string) => !q || label.toLowerCase().includes(q);
    const out: FontCard[] = [];

    for (const opt of FONT_OPTIONS) {
      if (!match(opt.label)) continue;
      out.push({
        id: `preset:${opt.id}`,
        label: opt.label,
        css: opt.css,
        value: { kind: 'preset', font: opt.id },
        group: 'builtin',
      });
    }
    for (const family of families) {
      if (!match(family)) continue;
      out.push({
        id: `local:${family}`,
        label: family,
        css: `"${family.replace(/"/g, '')}"`,
        value: { kind: 'local', family },
        group: 'system',
      });
    }
    return out;
  }, [families, query]);

  const selectedKey = valueKey(value);

  useEffect(() => {
    const idx = cards.findIndex((c) => c.id === selectedKey);
    setHighlight(idx >= 0 ? idx : 0);
  }, [cards, selectedKey, query]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-font-card-index="${highlight}"]`,
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
      if (card) onChange(card.value);
    }
  };

  const builtinCards = cards.filter((c) => c.group === 'builtin');
  const systemCards = cards.filter((c) => c.group === 'system');

  const renderCard = (card: FontCard, index: number) => {
    const selected = card.id === selectedKey;
    const active = index === highlight;
    return (
      <button
        key={card.id}
        id={`font-card-${card.id}`}
        type="button"
        role="option"
        aria-selected={selected}
        data-font-card-index={index}
        className={[
          'font-picker__card',
          selected ? 'font-picker__card--selected' : '',
          active ? 'font-picker__card--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={() => setHighlight(index)}
        onClick={() => onChange(card.value)}
      >
        <span className="font-picker__card-name">{card.label}</span>
        <span className="font-picker__card-sample" style={{ fontFamily: card.css }}>
          Ag
        </span>
        <span
          className="font-picker__card-sentence"
          style={{ fontFamily: card.css }}
        >
          The quick brown fox jumps over the lazy dog.
        </span>
      </button>
    );
  };

  let indexCursor = 0;

  return (
    <div className="font-picker">
      <div className="font-picker__toolbar">
        <label className="font-picker__search">
          <span className="font-picker__sr-only">Search fonts</span>
          <input
            ref={searchRef}
            id={gridId}
            className="font-picker__search-input"
            type="search"
            placeholder="Search fonts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={!localFontsOk || localBusy}
          onClick={onAddSystemFonts}
        >
          {localBusy
            ? 'Loading…'
            : localFontsOk
              ? families.length > 0
                ? 'Refresh system fonts'
                : 'Add system fonts'
              : 'System fonts unavailable'}
        </button>
      </div>

      <div
        className="font-picker__scroll"
        role="listbox"
        aria-label="Fonts"
        aria-activedescendant={
          cards[highlight] ? `font-card-${cards[highlight].id}` : undefined
        }
      >
        {cards.length === 0 && (
          <p className="font-picker__empty">No matching fonts</p>
        )}

        {builtinCards.length > 0 && (
          <section className="font-picker__group" aria-label="Built-in fonts">
            <h4 className="font-picker__group-label">Built-in</h4>
            <div className="font-picker__grid">
              {builtinCards.map((card) => {
                const i = indexCursor++;
                return renderCard(card, i);
              })}
            </div>
          </section>
        )}

        {systemCards.length > 0 && (
          <section className="font-picker__group" aria-label="System fonts">
            <h4 className="font-picker__group-label">System</h4>
            <div className="font-picker__grid">
              {systemCards.map((card) => {
                const i = indexCursor++;
                return renderCard(card, i);
              })}
            </div>
          </section>
        )}
      </div>

      <p className="font-picker__current">
        Current:{' '}
        <span style={{ fontFamily: cssForValue(value) }}>
          {value.kind === 'local'
            ? value.family
            : (FONT_OPTIONS.find((o) => o.id === value.font)?.label ??
              value.font)}
        </span>
      </p>
    </div>
  );
}
