import type { ReactNode } from 'react';
import { useIsMobile } from '../hooks/use-mobile';

interface CloseHintButtonProps {
  /**
   * Parent's `useDismissGuard(onClose)` result.
   * Do not pass a raw setter — this button does not mount its own dismiss guard.
   */
  onClose: () => void;
  children?: ReactNode;
  label?: string;
  className?: string;
}

/** Tappable footer hint that closes the overlay (same as Esc / B / that menu's close key). */
export function CloseHintButton({ onClose, children, label, className = '' }: CloseHintButtonProps) {
  const isMobile = useIsMobile();
  const fallback = isMobile ? 'Tap to close · Esc/B' : 'Esc or B to close';
  const content = children ?? label ?? fallback;
  const aria = typeof content === 'string' ? content : (label ?? 'Close');

  return (
    <button
      type="button"
      aria-label={aria}
      className={`w-full min-h-11 text-xs text-muted-foreground text-center hover:text-foreground/80 active:opacity-70 transition-colors mt-4 pt-3 border-t border-border/50 ${className}`}
      onClick={e => {
        e.stopPropagation();
        onClose();
      }}
    >
      {content}
    </button>
  );
}
