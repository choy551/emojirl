import { ContextActionDescriptor } from '../../game/contextAction';

interface ContextActionButtonProps {
  descriptor: ContextActionDescriptor;
  onAct: () => void;
  /** Highlight when the idle Explore action is currently running. */
  exploring?: boolean;
}

/** Half-Life-style "use" button: one tap performs the most relevant nearby action. */
export function ContextActionButton({ descriptor, onAct, exploring = false }: ContextActionButtonProps) {
  const danger = descriptor.kind === 'attack';
  const explore = descriptor.kind === 'explore';
  return (
    <button
      data-testid="context-action-button"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onAct(); }}
      className={[
        'flex flex-col items-center justify-center rounded-2xl border shadow-2xl select-none touch-none',
        'transition-transform duration-75 active:scale-90',
        danger
          ? 'bg-red-700/55 border-red-400/40 text-white'
          : exploring
            ? 'bg-cyan-700/60 border-cyan-300/50 text-white'
            : explore
              ? 'bg-sky-800/55 border-sky-300/40 text-white'
              : 'bg-emerald-700/55 border-emerald-300/40 text-white',
      ].join(' ')}
      style={{ width: 56, height: 56 }}
      aria-label={descriptor.label}
      title={descriptor.label}
    >
      <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>{descriptor.icon}</span>
      <span className="text-[8px] font-bold mt-0.5 max-w-[52px] truncate px-0.5">{descriptor.label}</span>
    </button>
  );
}
