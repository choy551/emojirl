interface AutoConsumeButtonProps {
  enabled: boolean;
  onToggle: () => void;
  size?: 'desktop' | 'mobile';
}

export function AutoConsumeButton({ enabled, onToggle, size = 'desktop' }: AutoConsumeButtonProps) {
  const mobile = size === 'mobile';
  return (
    <button
      type="button"
      data-testid="auto-consume"
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn off auto-consume' : 'Turn on auto-consume'}
      title={enabled
        ? 'Auto-consume is on. Excess Bank emoji are used for their effect.'
        : 'Auto-consume excess Bank emoji. Bombs, guns, and food stay. Stacks wait until the hotbar is full.'}
      onClick={onToggle}
      className={mobile
        ? `min-h-11 min-w-11 shrink-0 rounded-lg border text-base font-bold ${enabled ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100' : 'border-border/50 bg-secondary/40 text-muted-foreground'}`
        : `h-6 px-1.5 rounded border text-[10px] font-bold leading-none ${enabled ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100' : 'border-border/50 bg-secondary/30 text-muted-foreground/80'}`}
    >
      🫳
    </button>
  );
}
