import { Player } from '../../game/types';

interface MobileTopBarProps {
  player: Player;
  className: string;
  level: number;
  currentFloor: number;
  xpProgress: number;
  onExpand: () => void;
  onMenu: () => void;
}

/** Slim always-visible stat strip for touch devices. Tapping it opens the full StatsModal. */
export function MobileTopBar({ player, className, level, currentFloor, xpProgress, onExpand, onMenu }: MobileTopBarProps) {
  const hp = player.stats.hp;
  const maxHp = player.stats.maxHp;
  const overheal = hp > maxHp;
  const hpPct = overheal ? Math.min(100, (hp / (maxHp * 1.5)) * 100) : (hp / maxHp) * 100;
  const hpColor = overheal ? '#f59e0b' : hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';
  const isWizard = player.characterClass === '🧙';

  return (
    <div className="bg-sidebar border-b border-border/40 flex items-center gap-2 px-2 py-1.5 shrink-0 z-10 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
      <button
        onClick={onExpand}
        className="flex items-center gap-2 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
        aria-label="Show detailed stats"
      >
        <span className="text-xl shrink-0">{player.emoji}</span>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-[9px] leading-none">
            <span className="font-bold uppercase tracking-wide shrink-0">{className.slice(0, 4)} L{level}</span>
            <span className="font-bold tabular-nums shrink-0" style={{ color: hpColor }}>{overheal ? '✨' : ''}{hp}/{maxHp}</span>
            {isWizard && <span className="font-bold tabular-nums text-violet-300 shrink-0">🔵{player.stats.mana ?? 0}/{player.stats.maxMana ?? 4}</span>}
            <span className="font-bold tabular-nums text-amber-300 shrink-0">💰{player.stats.gold}</span>
            <span className="text-muted-foreground/60 shrink-0 ml-auto">D:{currentFloor}</span>
          </div>
          {/* HP + XP mini bars */}
          <div className="flex items-center gap-1">
            <div className="h-1.5 flex-1 bg-secondary/30 rounded-full overflow-hidden border border-border/40">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${hpPct}%`, backgroundColor: hpColor }} />
            </div>
            <div className="h-1.5 flex-1 bg-secondary/30 rounded-full overflow-hidden border border-border/40">
              <div className="h-full rounded-full bg-cyan-400 transition-all duration-300" style={{ width: `${xpProgress * 100}%` }} />
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/40 shrink-0">ⓘ</span>
      </button>
      <button
        data-testid="button-hamburger"
        onClick={onMenu}
        className="flex flex-col items-center justify-center gap-[3px] w-8 h-8 rounded-lg border border-border/50 bg-secondary/40 active:scale-90 transition-all shrink-0"
        aria-label="Menu"
      >
        <span className="block w-4 h-0.5 bg-foreground/70 rounded-full" />
        <span className="block w-4 h-0.5 bg-foreground/70 rounded-full" />
        <span className="block w-4 h-0.5 bg-foreground/70 rounded-full" />
      </button>
    </div>
  );
}
