import { Enemy } from '../game/types';

function detectionRadius(speed: number): number {
  return 3 + Math.floor(speed / 3);
}

export interface EnemyCardProps {
  enemy: Enemy;
  vx: number;
  vy: number;
  viewWidth: number;
  viewHeight: number;
}

export function EnemyCard({ enemy, vx, vy, viewWidth, viewHeight }: EnemyCardProps) {
  const TILE_PX = 32;
  const POPUP_W = 160;
  const traitCount = [enemy.cowardly, enemy.berserker, enemy.packHunter, enemy.silent].filter(Boolean).length;
  const POPUP_H = 145 + (enemy.isEcho ? 16 : 0) + (traitCount > 0 ? 10 + traitCount * 16 : 0);

  const spaceRight = (viewWidth - 1 - vx) * TILE_PX;
  const spaceBelow = (viewHeight - 1 - vy) * TILE_PX;

  const left = spaceRight >= POPUP_W + 4
    ? (vx + 1) * TILE_PX + 4
    : vx * TILE_PX - POPUP_W - 4;

  const top = spaceBelow >= POPUP_H
    ? vy * TILE_PX
    : Math.max(0, vy * TILE_PX - (POPUP_H - TILE_PX));

  if (enemy.isSpectator) {
    return (
      <div
        className="absolute z-30 pointer-events-none select-none"
        style={{ left, top, width: POPUP_W }}
      >
        <div className="bg-card border border-border rounded-lg shadow-xl p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{enemy.emoji}</span>
            <div className="font-bold text-foreground leading-tight">Spectator</div>
          </div>
          <p className="text-muted-foreground leading-snug">Here for the show. They block the aisle and won't fight.</p>
        </div>
      </div>
    );
  }

  const hpPct = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
  const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#eab308' : '#ef4444';

  return (
    <div
      className="absolute z-30 pointer-events-none select-none"
      style={{ left, top, width: POPUP_W }}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl p-2.5 text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{enemy.emoji}</span>
          <div className="min-w-0">
            <div className="font-bold text-foreground leading-tight">{enemy.name}</div>
            {enemy.isEcho && (
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="inline-flex items-center gap-0.5 font-bold rounded px-1 py-0.5"
                  style={{ fontSize: 8, background: 'rgba(139,92,246,0.3)', color: '#c4b5fd', letterSpacing: '0.08em', border: '1px solid rgba(139,92,246,0.5)' }}
                >
                  ✨ ECHO
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-muted-foreground">
            <span>HP</span>
            <span className="font-bold text-foreground tabular-nums">{enemy.hp}/{enemy.maxHp}</span>
          </div>
          <div className="h-1.5 bg-secondary/20 rounded-full overflow-hidden border border-border/40">
            <div className="h-full rounded-full transition-all" style={{ width: `${hpPct * 100}%`, background: hpColor }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {[
            { label: 'ATK', value: enemy.attack, color: 'text-orange-400' },
            { label: 'DEF', value: enemy.defense, color: 'text-blue-400' },
            { label: 'SPD', value: enemy.speed, color: 'text-yellow-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-background/60 rounded px-1 py-0.5 flex flex-col items-center gap-0.5">
              <span className={`font-bold uppercase leading-none ${color}`} style={{ fontSize: 9 }}>{label}</span>
              <span className="font-bold tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        {(() => {
          const r = detectionRadius(enemy.speed);
          const [dotColor, tierLabel] =
            r <= 3 ? ['#22c55e', 'Close range'] :
            r <= 5 ? ['#eab308', 'Mid range'] :
                     ['#ef4444', 'Far range'];
          return (
            <div className="flex items-center justify-between text-muted-foreground" style={{ fontSize: 9 }}>
              <span className="uppercase tracking-wide">Threat</span>
              <span className="flex items-center gap-1 font-bold text-foreground">
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  boxShadow: `0 0 3px ${dotColor}`,
                }} />
                {tierLabel}
              </span>
            </div>
          );
        })()}

        {(enemy.frozenTurns ?? 0) > 0 && (
          <div className="text-blue-300 text-center" style={{ fontSize: 9 }}>❄️ Frozen {enemy.frozenTurns}t</div>
        )}
        {(enemy.slowedTurns ?? 0) > 0 && (
          <div className="text-cyan-300 text-center" style={{ fontSize: 9 }}>🐢 Slowed {enemy.slowedTurns}t</div>
        )}
        {(enemy.webbedTurns ?? 0) > 0 && (
          <div className="text-purple-300 text-center" style={{ fontSize: 9 }}>🕸️ Webbed {enemy.webbedTurns}t</div>
        )}
        {(enemy.paralyzedTurns ?? 0) > 0 && (
          <div className="text-yellow-300 text-center" style={{ fontSize: 9 }}>⚡ Paralyzed {enemy.paralyzedTurns}t</div>
        )}

        {traitCount > 0 && (
          <div className="border-t border-border/40 pt-1.5 mt-0.5 space-y-1">
            {enemy.berserker && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 9 }}>
                <span>🔥</span>
                <span className="font-semibold" style={{ color: '#fca5a5' }}>Berserker</span>
                <span className="text-muted-foreground">— gains ATK when injured</span>
              </div>
            )}
            {enemy.cowardly && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 9 }}>
                <span>🏃</span>
                <span className="font-semibold" style={{ color: '#fde047' }}>Cowardly</span>
                <span className="text-muted-foreground">— flees when low HP</span>
              </div>
            )}
            {enemy.packHunter && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 9 }}>
                <span>🐺</span>
                <span className="font-semibold" style={{ color: '#d8b4fe' }}>Pack Hunter</span>
                <span className="text-muted-foreground">— stronger with allies</span>
              </div>
            )}
            {enemy.silent && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 9 }}>
                <span>🤫</span>
                <span className="font-semibold" style={{ color: '#cbd5e1' }}>Silent</span>
                <span className="text-muted-foreground">— never calls for backup</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
