import { describe, it, expect } from 'vitest';
import { dialogKeyAction } from './useDialogHotkeys';

describe('dialogKeyAction', () => {
  it('maps Esc to cancel', () => {
    expect(dialogKeyAction({ key: 'Escape', code: 'Escape' })).toBe('cancel');
  });

  it('maps Enter and Space to confirm', () => {
    expect(dialogKeyAction({ key: 'Enter', code: 'Enter' })).toBe('confirm');
    expect(dialogKeyAction({ key: ' ', code: 'Space' })).toBe('confirm');
    expect(dialogKeyAction({ key: 'Enter', code: 'NumpadEnter' })).toBe('confirm');
  });

  it('ignores other keys', () => {
    expect(dialogKeyAction({ key: 'z', code: 'KeyZ' })).toBeNull();
    expect(dialogKeyAction({ key: 'Tab', code: 'Tab' })).toBeNull();
  });
});
