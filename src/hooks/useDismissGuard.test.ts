import { describe, it, expect } from 'vitest';
import { shouldIgnoreDismiss } from './useDismissGuard';

describe('shouldIgnoreDismiss', () => {
  it('ignores dismiss during the grace window, then allows it', () => {
    const openedAt = 1_000_000;
    expect(shouldIgnoreDismiss(openedAt, openedAt, 400)).toBe(true);
    expect(shouldIgnoreDismiss(openedAt, openedAt + 399, 400)).toBe(true);
    expect(shouldIgnoreDismiss(openedAt, openedAt + 400, 400)).toBe(false);
    expect(shouldIgnoreDismiss(openedAt, openedAt + 800, 400)).toBe(false);
  });
});
