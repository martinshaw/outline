import { describe, expect, it } from 'vitest';
import {
  formatDeadlineLabel,
  formatSubtaskProgress,
  isCompleteStatus,
  isDeadlineOverdue,
  isIsoDate,
  parseIsoDate,
} from './itemMeta';

describe('isIsoDate / parseIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isIsoDate('2026-10-10')).toBe(true);
    expect(parseIsoDate('2026-10-10')).toEqual(new Date(2026, 9, 10));
  });

  it('rejects impossible dates and junk', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('10/10/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('formatDeadlineLabel', () => {
  const now = new Date(2026, 9, 10); // Oct 10 2026

  it('labels today / tomorrow / overdue', () => {
    expect(formatDeadlineLabel('2026-10-10', now)).toBe('Due today');
    expect(formatDeadlineLabel('2026-10-11', now)).toBe('Due tomorrow');
    expect(formatDeadlineLabel('2026-10-09', now)).toMatch(/^Overdue /);
  });
});

describe('isDeadlineOverdue', () => {
  const now = new Date(2026, 9, 10);
  it('is true only for past dates', () => {
    expect(isDeadlineOverdue('2026-10-09', now)).toBe(true);
    expect(isDeadlineOverdue('2026-10-10', now)).toBe(false);
    expect(isDeadlineOverdue('bad', now)).toBe(false);
  });
});

describe('isCompleteStatus / formatSubtaskProgress', () => {
  it('treats done and archived as complete', () => {
    expect(isCompleteStatus('done')).toBe(true);
    expect(isCompleteStatus('archived')).toBe(true);
    expect(isCompleteStatus('todo')).toBe(false);
    expect(isCompleteStatus(null)).toBe(false);
  });

  it('formats progress labels', () => {
    expect(formatSubtaskProgress(0, 0)).toBeNull();
    expect(formatSubtaskProgress(10, 0)).toBe('10');
    expect(formatSubtaskProgress(10, 6)).toBe('6 of 10 done');
  });
});
