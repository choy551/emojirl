import { EmojiItem } from '../game/types';
import { isStackableBagPassive, getStackableBonusLabel, getStackableCumulativeLabel } from '../game/passives';

interface ItemStatCardProps {
  item: EmojiItem;
  onClose: () => void;
}

export function ItemStatCard({ item: si, onClose }: ItemStatCardProps) {
  const effect = (si as any).effect as Record<string, number | boolean> | undefined;
  const consumeLines: string[] = [];
  if (effect) {
    if (effect.hpBonus)      consumeLines.push(`+${effect.hpBonus} HP`);
    if (effect.maxHpBonus)   consumeLines.push(`+${effect.maxHpBonus} max HP`);
    if (effect.attackBonus)  consumeLines.push(`+${effect.attackBonus} ATK`);
    if (effect.defenseBonus) consumeLines.push(`+${effect.defenseBonus} DEF`);
    if (effect.speedBonus)   consumeLines.push(`+${effect.speedBonus} SPD`);
    if (effect.evasionBonus) consumeLines.push(`+${effect.evasionBonus} EVA`);
    if (effect.luckBonus)    consumeLines.push(`+${effect.luckBonus} LCK`);
    if (effect.moodBonus)    consumeLines.push(`+${effect.moodBonus} mood`);
    if (effect.xpBonus)      consumeLines.push(`+${effect.xpBonus} XP`);
    if (effect.instakillNearest) consumeLines.push('⚡ Instakill nearest visible enemy');
  }
  const equipBonusLines = si.isEquipment
    ? Object.entries(si.equipBonus ?? {}).filter(([,v]) => (v ?? 0) !== 0).map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${k.toUpperCase()}`)
    : [];
  const typeLabel = si.isEquipment ? '⚔️ Equipment'
    : si.healAmount !== undefined ? '💊 Heal Item'
    : si.ammoAmount !== undefined ? '🪖 Ammo'
    : si.activeKind ? `⚡ Active — ${si.activeKind}`
    : si.bagPassive ? '✨ Soul Passive'
    : '✨ Soul';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/80 rounded-2xl p-5 shadow-2xl w-72 max-w-[90vw] space-y-3"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="text-5xl leading-none select-none">{si.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-foreground leading-tight">{si.name}</div>
            <div className="text-[11px] text-muted-foreground/60 mt-0.5">{typeLabel}</div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground/80 leading-relaxed">{si.description}</p>

        {/* Equipment bonuses */}
        {si.isEquipment && equipBonusLines.length > 0 && (
          <div className="bg-black/20 rounded-lg p-2.5 space-y-1">
            <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Stat bonuses</div>
            <div className="flex flex-wrap gap-1.5">
              {equipBonusLines.map(b => (
                <span key={b} className="text-xs text-emerald-400 font-semibold bg-emerald-900/20 border border-emerald-800/40 px-1.5 py-0.5 rounded">{b}</span>
              ))}
            </div>
            {si.equipSlots && <div className="text-[10px] text-muted-foreground/40 mt-1">Slots: {si.equipSlots.join(', ')}</div>}
          </div>
        )}

        {/* Bag passive */}
        {si.bagPassive && (
          <div className="bg-black/20 rounded-lg p-2.5 space-y-1.5">
            <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Bag passive</div>
            <p className="text-xs text-sky-300/80 leading-relaxed">{si.bagPassive.description}</p>
            {isStackableBagPassive(si) ? (() => {
              const perStack = getStackableBonusLabel(si);
              const stackN = si.stackCount ?? 1;
              const cumulative = getStackableCumulativeLabel(si);
              return (
                <div className="space-y-1 pt-0.5">
                  {perStack && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Per copy:</span>
                      <span className="text-[10px] text-emerald-400/80 font-medium bg-emerald-900/20 border border-emerald-800/30 px-1.5 py-0.5 rounded">{perStack}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Stacked:</span>
                    <span className="text-[10px] text-emerald-300/90 font-semibold">×{stackN}</span>
                    {cumulative && (
                      <span className="text-[10px] text-emerald-300/80 bg-emerald-900/25 border border-emerald-800/30 px-1.5 py-0.5 rounded font-medium">{cumulative}</span>
                    )}
                  </div>
                </div>
              );
            })() : si.bagPassive.nonStackable
              ? <div className="text-[10px] text-amber-400/60">Non-stackable — only 1 copy applies</div>
              : <div className="text-[10px] text-emerald-400/60">Stackable — each copy adds another instance</div>
            }
          </div>
        )}

        {/* Consume effect */}
        {consumeLines.length > 0 && (
          <div className="bg-black/20 rounded-lg p-2.5 space-y-1">
            <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Consume effect</div>
            <div className="flex flex-wrap gap-1.5">
              {consumeLines.map(l => (
                <span key={l} className="text-xs text-violet-300/90 font-medium bg-violet-900/20 border border-violet-800/40 px-1.5 py-0.5 rounded">{l}</span>
              ))}
            </div>
          </div>
        )}

        {/* Heal / ammo / charges */}
        {si.healAmount !== undefined && (
          <div className="text-xs text-emerald-400/80">Restores <span className="font-bold">+{si.healAmount} HP</span> when consumed</div>
        )}
        {si.ammoAmount !== undefined && (
          <div className="text-xs text-sky-400/80">Ammo: <span className="font-bold">+{si.ammoAmount}</span></div>
        )}
        {si.charges !== undefined && si.charges >= 0 && (
          <div className="text-xs text-amber-400/80">Charges remaining: <span className="font-bold">×{si.charges}</span></div>
        )}

        <button
          onClick={onClose}
          className="w-full text-xs py-1.5 rounded-lg bg-secondary/40 border border-border/50 text-muted-foreground hover:bg-secondary/60 transition-colors mt-1"
        >Close</button>
      </div>
    </div>
  );
}
