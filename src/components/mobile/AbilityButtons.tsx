import { AbilityDescriptor } from './classAbilities';

interface AbilityButtonsProps {
  abilities: AbilityDescriptor[];
  align: 'left' | 'right';
}

/** Compact vertical stack of per-class ability buttons with live cooldown text. */
export function AbilityButtons({ abilities, align }: AbilityButtonsProps) {
  if (abilities.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {abilities.map(a => (
        <button
          key={a.id}
          data-testid={`ability-${a.id}`}
          onPointerDown={e => { e.preventDefault(); if (!a.disabled) a.onUse(); }}
          disabled={a.disabled}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border shadow-lg select-none touch-none',
            'transition-transform duration-75 active:scale-90',
            a.disabled
              ? 'bg-black/40 border-white/10 text-white/35'
              : a.active
                ? 'bg-violet-700/75 border-violet-300/50 text-white'
                : 'bg-indigo-800/70 border-indigo-300/40 text-white',
          ].join(' ')}
          title={`${a.label}${a.detail ? ` — ${a.detail}` : ''}`}
          aria-label={a.label}
        >
          <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{a.icon}</span>
          <span className="flex flex-col leading-none text-left">
            <span className="text-[10px] font-bold">{a.label}</span>
            {a.detail && <span className="text-[8px] opacity-70">{a.detail}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
