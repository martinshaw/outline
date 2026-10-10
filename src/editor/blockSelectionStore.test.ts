import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearBlockSelectedIds,
  getBlockSelectedIds,
  getBlockSelfOnlyIds,
  isBlockSelfOnly,
  resetBlockSelectionStore,
  setBlockSelectedIds,
  setBlockSelfOnlyIds,
  subscribeBlockSelection,
} from './blockSelectionStore';

beforeEach(() => {
  resetBlockSelectionStore();
});

describe('blockSelectionStore', () => {
  it('sets and clears selected ids', () => {
    setBlockSelectedIds(['a', 'b']);
    expect([...getBlockSelectedIds()]).toEqual(['a', 'b']);
    clearBlockSelectedIds();
    expect(getBlockSelectedIds().size).toBe(0);
  });

  it('notifies subscribers on change', () => {
    let n = 0;
    const unsub = subscribeBlockSelection(() => {
      n += 1;
    });
    setBlockSelectedIds(['a']);
    setBlockSelectedIds(['a']); // no-op
    setBlockSelectedIds(['a', 'b']);
    clearBlockSelectedIds();
    unsub();
    setBlockSelectedIds(['z']);
    expect(n).toBe(3); // set a, set a+b, clear
  });

  it('tracks self-only only for currently selected ids', () => {
    setBlockSelectedIds(['parent']);
    setBlockSelfOnlyIds(['parent', 'stray']);
    expect([...getBlockSelfOnlyIds()]).toEqual(['parent']);
    expect(isBlockSelfOnly('parent')).toBe(true);
    expect(isBlockSelfOnly('stray')).toBe(false);
  });

  it('clears self-only when the id leaves the selection', () => {
    setBlockSelectedIds(['parent', 'other']);
    setBlockSelfOnlyIds(['parent']);
    setBlockSelectedIds(['other']);
    expect(getBlockSelfOnlyIds().size).toBe(0);
  });

  it('clearBlockSelectedIds also clears self-only', () => {
    setBlockSelectedIds(['parent']);
    setBlockSelfOnlyIds(['parent']);
    clearBlockSelectedIds();
    expect(getBlockSelfOnlyIds().size).toBe(0);
  });

  it('toggling self-only off notifies listeners', () => {
    setBlockSelectedIds(['p']);
    setBlockSelfOnlyIds(['p']);
    let n = 0;
    const unsub = subscribeBlockSelection(() => {
      n += 1;
    });
    setBlockSelfOnlyIds([]);
    unsub();
    expect(n).toBe(1);
    expect(isBlockSelfOnly('p')).toBe(false);
  });
});
