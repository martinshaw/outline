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

const ADD_ACTION = '__add_system_fonts__';

type ListItem =
  | { type: 'header'; label: string }
  | { type: 'option'; id: string; label: string; value: FontPickerValue }
  | { type: 'action'; id: typeof ADD_ACTION; label: string; disabled: boolean };

function valueLabel(value: FontPickerValue): string {
  if (value.kind === 'local') return value.family;
  return FONT_OPTIONS.find((o) => o.id === value.font)?.label ?? value.font;
}

function valueKey(value: FontPickerValue): string {
  return value.kind === 'local' ? `local:${value.family}` : `preset:${value.font}`;
}

export function FontPicker({
  value,
  localFamilies,
  localFontsOk,
  localBusy,
  onChange,
  onAddSystemFonts,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const families = useMemo(() => {
    const set = new Set(localFamilies);
    if (value.kind === 'local') set.add(value.family);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [localFamilies, value]);

  const items = useMemo((): ListItem[] => {
    const q = query.trim().toLowerCase();
    const match = (label: string) => !q || label.toLowerCase().includes(q);

    const out: ListItem[] = [];
    const presets = FONT_OPTIONS.filter((o) => match(o.label));
    if (presets.length > 0) {
      out.push({ type: 'header', label: 'Built-in' });
      for (const opt of presets) {
        out.push({
          type: 'option',
          id: `preset:${opt.id}`,
          label: opt.label,
          value: { kind: 'preset', font: opt.id },
        });
      }
    }

    const locals = families.filter((f) => match(f));
    if (locals.length > 0) {
      out.push({ type: 'header', label: 'System' });
      for (const family of locals) {
        out.push({
          type: 'option',
          id: `local:${family}`,
          label: family,
          value: { kind: 'local', family },
        });
      }
    }

    const addLabel = localBusy
      ? 'Loading system fonts…'
      : localFontsOk
        ? 'Add system fonts…'
        : 'System fonts unavailable';
    if (!q || match(addLabel) || 'add system fonts'.includes(q)) {
      out.push({
        type: 'action',
        id: ADD_ACTION,
        label: addLabel,
        disabled: !localFontsOk || localBusy,
      });
    }

    return out;
  }, [families, localBusy, localFontsOk, query]);

  const selectable = useMemo(
    () =>
      items.filter(
        (item): item is Extract<ListItem, { type: 'option' | 'action' }> =>
          item.type === 'option' || (item.type === 'action' && !item.disabled),
      ),
    [items],
  );

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [open]);

  const commit = (item: Extract<ListItem, { type: 'option' | 'action' }>) => {
    if (item.type === 'action') {
      onAddSystemFonts();
      setQuery('');
      // keep open so newly loaded fonts appear
      inputRef.current?.focus();
      return;
    }
    onChange(item.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, selectable.length - 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = selectable[highlight];
      if (item) commit(item);
    }
  };

  let selectableIndex = -1;

  return (
    <div className="font-picker" ref={rootRef}>
      <div className="font-picker__control">
        <input
          ref={inputRef}
          className="settings-field__control font-picker__input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Font"
          placeholder={open ? 'Search fonts…' : valueLabel(value)}
          value={open ? query : valueLabel(value)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onClick={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="font-picker__chevron"
          tabIndex={-1}
          aria-label={open ? 'Close font list' : 'Open font list'}
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
            } else {
              setOpen(true);
              setQuery('');
              inputRef.current?.focus();
            }
          }}
        >
          ▾
        </button>
      </div>

      {open && (
        <ul
          id={listId}
          className="font-picker__list"
          role="listbox"
          aria-label="Fonts"
        >
          {selectable.length === 0 && (
            <li className="font-picker__empty">No matching fonts</li>
          )}
          {items.map((item) => {
            if (item.type === 'header') {
              return (
                <li key={`h-${item.label}`} className="font-picker__header">
                  {item.label}
                </li>
              );
            }

            const disabled = item.type === 'action' && item.disabled;
            if (!disabled) selectableIndex += 1;
            const index = selectableIndex;
            const selected =
              item.type === 'option' &&
              valueKey(item.value) === valueKey(value);
            const active = !disabled && index === highlight;

            let optionFont: string | undefined;
            if (item.type === 'option') {
              const picked = item.value;
              optionFont =
                picked.kind === 'local'
                  ? `"${picked.family.replace(/"/g, '')}"`
                  : FONT_OPTIONS.find((o) => o.id === picked.font)?.css;
            }

            return (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  className={
                    active
                      ? 'font-picker__option font-picker__option--active'
                      : 'font-picker__option'
                  }
                  style={optionFont ? { fontFamily: optionFont } : undefined}
                  onMouseEnter={() => {
                    if (!disabled) setHighlight(index);
                  }}
                  onClick={() => {
                    if (!disabled) commit(item);
                  }}
                >
                  <span>{item.label}</span>
                  {selected && (
                    <span className="font-picker__check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
