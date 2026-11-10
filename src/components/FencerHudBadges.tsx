import type { Player } from '../game/types';
import { fencerStatusBadges } from '../game/prestige';

export function FencerHudBadges({ stats, evasion }: { stats: Player['stats']; evasion: number }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="fencer-hud-badges">
      {fencerStatusBadges(stats, evasion).map(badge => (
        <span
          key={badge.id}
          data-testid={`fencer-badge-${badge.id}`}
          title={badge.title}
          className={`px-1 py-px rounded border text-[8px] font-bold leading-none ${
            badge.dim
              ? 'border-white/15 bg-white/5 text-white/35'
              : 'border-sky-300/40 bg-sky-500/20 text-sky-100'
          }`}
        >
          {badge.label}
        </span>
      ))}
    </span>
  );
}
