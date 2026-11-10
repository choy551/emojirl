import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bagHotkey } from './bagHotkey';

describe('bag hotkeys', () => {
  it('opens Equipment on b and Bank on Shift+B, and still closes with b', () => {
    expect(bagHotkey('b', false)).toBe('equipment');
    expect(bagHotkey('B', false)).toBe('bank');
    expect(bagHotkey('b', true)).toBe('close');
    expect(bagHotkey('B', true)).toBe('bank');
    expect(bagHotkey('g', false)).toBeNull();
    const page = readFileSync(new URL('../pages/game.tsx', import.meta.url), 'utf8');
    expect(page).toContain('bagHotkey');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('b opens the Bag on Equipment');
    expect(manual).toContain('Shift+B opens the Bag on Bank');
  });
});
