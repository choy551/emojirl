interface HotbarLockButtonProps {
  locked: boolean;
  onToggle: () => void;
  /** Mobile uses a 44px target. Desktop stays a small label beside the bag. */
  size?: 'desktop' | 'mobile';
}

export function HotbarLockButton({ locked, onToggle, size = 'desktop' }: HotbarLockButtonProps) {
  const mobile = size === 'mobile';
  return (
    <button
      type="button"
      data-testid="hotbar-lock"
      aria-pressed={locked}
      aria-label={locked ? 'Unlock hotbar' : 'Lock hotbar'}
      title={locked ? 'Hotbar locked. New finds go to the Bank.' : 'Lock the hotbar. New finds go to the Bank. Swaps still work.'}
      onClick={onToggle}
      className={mobile
        ? `min-h-11 min-w-11 shrink-0 rounded-lg border text-base font-bold ${locked ? 'border-amber-400/70 bg-amber-500/20 text-amber-100' : 'border-border/50 bg-secondary/40 text-muted-foreground'}`
        : `h-6 px-1.5 rounded border text-[10px] font-bold leading-none ${locked ? 'border-amber-400/70 bg-amber-500/20 text-amber-100' : 'border-border/50 bg-secondary/30 text-muted-foreground/80'}`}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  );
}
