import type { Player } from '../game/types';
import { classHudBadges } from '../game/classHud';

export function ClassHudBadges({
  player,
  evasion,
  stealth,
  tile,
}: {
  player: Player;
  evasion?: number;
  stealth?: boolean;
  tile?: string;
}) {
  const badges = classHudBadges({ player, evasion, stealth, tile });
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex max-w-[10.5rem] flex-wrap items-center gap-0.5" data-testid="class-hud-badges">
      {badges.map(badge => (
        <span
          key={badge.id}
          data-testid={`class-badge-${badge.id}`}
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
