import { ContextActionDescriptor } from '../../game/contextAction';

interface ContextActionButtonProps {
  descriptor: ContextActionDescriptor;
  onAct: () => void;
}

/** Half-Life-style "use" button: one tap performs the most relevant nearby action. */
export function ContextActionButton({ descriptor, onAct }: ContextActionButtonProps) {
  const danger = descriptor.kind === 'attack';
  return (
    <button
      data-testid="context-action-button"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onAct(); }}
      className={[
        'flex flex-col items-center justify-center rounded-2xl border shadow-2xl select-none touch-none',
        'transition-transform duration-75 active:scale-90',
        danger
          ? 'bg-red-700/55 border-red-400/40 text-white'
          : 'bg-emerald-700/55 border-emerald-300/40 text-white',
      ].join(' ')}
      style={{ width: 72, height: 72 }}
      aria-label={descriptor.label}
      title={descriptor.label}
    >
      <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>{descriptor.icon}</span>
      <span className="text-[9px] font-bold mt-0.5 max-w-[64px] truncate px-1">{descriptor.label}</span>
    </button>
  );
}
