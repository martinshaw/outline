import { describe, expect, it } from 'vitest';
import {
  scoreCommand,
  SHOW_EMPTY_HINTS_COMMAND,
  type Command,
} from './CommandPalette';

function cmd(partial: Partial<Command> & Pick<Command, 'id' | 'label'>): Command {
  return {
    group: 'Workspace',
    run: () => {},
    ...partial,
  };
}

describe('scoreCommand', () => {
  it('gives every command a base score for an empty query', () => {
    expect(scoreCommand('', cmd({ id: 'a', label: 'Settings' }))).toBe(1);
    expect(scoreCommand('   ', cmd({ id: 'a', label: 'Settings' }))).toBe(1);
  });

  it('prefers label prefix matches', () => {
    const settings = cmd({ id: 'settings', label: 'Settings' });
    expect(scoreCommand('set', settings)).toBe(100);
    expect(scoreCommand('tings', settings)).toBe(80);
  });

  it('matches keyword tokens for get started hints', () => {
    const hints = cmd({ ...SHOW_EMPTY_HINTS_COMMAND });
    expect(scoreCommand('get started', hints)).toBeGreaterThan(0);
    expect(scoreCommand('onboarding', hints)).toBe(50);
    expect(scoreCommand('tips intro', hints)).toBe(40);
    expect(scoreCommand('xyzzy', hints)).toBe(0);
  });
});
