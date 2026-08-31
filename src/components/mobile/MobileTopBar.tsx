import { Player } from '../../game/types';

interface MobileTopBarProps {
  player: Player;
  className: string;
  level: number;
  currentFloor: number;
  xpProgress: number;
  onExpand: () => void;
  onMenu: () => void;
  /** When set, the hamburger sits on this side for thumb reach. */
  menuSide?: 'left' | 'right';
}

function MiniBar({ pct, color, label, value }: { pct: number; color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="text-[8px] font-bold w-4 shrink-0 leading-none" style={{ color }}>{label}</span>
      <div className="h-1.5 flex-1 min-w-0 bg-black/40 rounded-full overflow-hidden border border-white/10">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
        />
      </div>
      {value !== '' && (
        <span className="text-[8px] font-bold tabular-nums shrink-0 leading-none min-w-[2.1rem] text-right" style={{ color }}>{value}</span>
      )}
    </div>
  );
}

/** Slim always-visible stat strip for touch devices. Tapping it opens the full StatsModal. */
export function MobileTopBar({ player, className, level, currentFloor, xpProgress, onExpand, onMenu, menuSide = 'right' }: MobileTopBarProps) {
  const hp = player.stats.hp;
  const maxHp = player.stats.maxHp;
  const overheal = hp > maxHp;
  const hpPct = overheal ? Math.min(100, (hp / (maxHp * 1.5)) * 100) : (hp / Math.max(1, maxHp)) * 100;
  const hpColor = overheal ? '#f59e0b' : hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';
  const isWizard = player.characterClass === '🧙';
  const mana = player.stats.mana ?? 0;
  const maxMana = player.stats.maxMana ?? 4;
  const mpPct = (mana / Math.max(1, maxMana)) * 100;
  const showAmmo = (player.characterClass === '🧝' || player.characterClass === '🤠') && (player.ammo ?? 0) >= 0
    && (player.characterClass === '🧝' || (player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun'));

  return (
    <div
      className="bg-sidebar border-b border-border/40 flex items-center gap-1.5 px-1.5 py-1 shrink-0 z-10 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      style={{ paddingTop: 'calc(0.25rem + env(safe-area-inset-top, 0px))' }}
    >
      {menuSide === 'left' && (
        <PauseEscButton onMenu={onMenu} />
      )}
      <button
        onClick={onExpand}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
        aria-label="Show detailed stats"
      >
        <span className="text-lg shrink-0 leading-none">{player.emoji}</span>
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          <div className="flex items-center gap-1.5 text-[9px] leading-none min-w-0">
            <span className="font-bold uppercase tracking-wide truncate">{className.slice(0, 4)} L{level}</span>
            {showAmmo && (
              <span className="font-bold tabular-nums text-amber-300/90 shrink-0">
                {player.characterClass === '🧝' ? '🏹' : '🪙'}{player.ammo}
              </span>
            )}
            <span className="font-bold tabular-nums text-amber-300 shrink-0 ml-auto">💰{player.stats.gold}</span>
            <span className="text-muted-foreground/60 shrink-0">D:{currentFloor}</span>
          </div>
          <MiniBar
            label="HP"
            value={`${overheal ? '✨' : ''}${hp}/${maxHp}`}
            pct={hpPct}
            color={hpColor}
          />
          {isWizard && (
            <MiniBar
              label="MP"
              value={`${mana}/${maxMana}`}
              pct={mpPct}
              color={mana > 0 ? '#8b5cf6' : '#6b7280'}
            />
          )}
          <MiniBar label="XP" value="" pct={xpProgress * 100} color="#22d3ee" />
        </div>
      </button>
      {menuSide !== 'left' && (
        <PauseEscButton onMenu={onMenu} />
      )}
    </div>
  );
}

function PauseEscButton({ onMenu }: { onMenu: () => void }) {
  return (
    <button
      data-testid="button-hamburger"
      onClick={onMenu}
      className="flex flex-col items-center justify-center w-8 h-8 rounded-lg border border-border/50 bg-secondary/40 active:scale-90 transition-all shrink-0 leading-none"
      aria-label="Pause (Esc)"
      title="Pause (Esc)"
    >
      <span className="text-[13px] leading-none">⏸</span>
      <span className="text-[7px] font-bold text-muted-foreground/80 tracking-wide">Esc</span>
    </button>
  );
}
