import { Player, GameState, BagPassiveSummary } from '../../game/types';
import { applyEquipmentAndPassives, computeNinjaEvasion, getDungeonPressure } from '../../game/gameHelpers';
import { getCowboyUnarmedBonus } from '../../game/combat';
import { MiniMap } from '../MiniMap';

interface StatsModalProps {
  player: Player;
  className: string;
  currentFloor: number;
  moodEmoji: string;
  moodName: string;
  bagPassiveSummary: BagPassiveSummary;
  gameState: GameState;
  onClose: () => void;
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card/60 border border-border/40 rounded-lg px-2 py-1.5 flex flex-col items-center leading-none gap-1">
      <span className={`font-bold text-sm ${color}`}>{value}</span>
      <span className="text-[9px] text-muted-foreground/50">{label}</span>
    </div>
  );
}

export function StatsModal({ player, className, currentFloor, moodEmoji, moodName, bagPassiveSummary, gameState, onClose }: StatsModalProps) {
  const eff = applyEquipmentAndPassives(player);
  const dualGuns = player.characterClass === '🤠' && player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
  const unarmed = player.characterClass === '🤠' && !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
  const ironFist = (dualGuns && player.ammo <= 0) || unarmed ? getCowboyUnarmedBonus(player.stats.level) : 0;
  const atk = eff.stats.attack + ironFist;
  const crit = Math.min(99, 5 + eff.stats.luck);
  const dodge = player.characterClass === '🥷' ? computeNinjaEvasion(eff) : Math.min(50, eff.stats.evasion ?? 0);
  const pressure = getDungeonPressure(currentFloor);
  const p = bagPassiveSummary;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-[92vw] max-w-md my-6 p-4 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/50 pb-3">
          <span className="text-3xl">{player.emoji}</span>
          <div className="flex-1">
            <div className="text-sm font-bold uppercase tracking-wide">{className} · Lv {player.stats.level}</div>
            <div className="text-[11px] text-muted-foreground/60">Floor {currentFloor} · {moodEmoji} {moodName}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground text-lg leading-none px-2" aria-label="Close">✕</button>
        </div>

        {/* Resource bars */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="font-bold text-destructive">❤️ HP</span>
            <span className="tabular-nums font-bold">{player.stats.hp}/{player.stats.maxHp}</span>
          </div>
          {player.characterClass === '🧙' && (
            <div className="flex justify-between text-[11px]">
              <span className="font-bold text-violet-400">🔵 MP</span>
              <span className="tabular-nums font-bold text-violet-300">{player.stats.mana ?? 0}/{player.stats.maxMana ?? 4}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="font-bold text-amber-300">💰 Gold</span>
            <span className="tabular-nums font-bold text-amber-300">{player.stats.gold}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-bold text-cyan-300">⭐ XP</span>
            <span className="tabular-nums font-bold">{player.stats.xp}</span>
          </div>
        </div>

        {/* Combat stats */}
        <div className="grid grid-cols-4 gap-1.5">
          <StatPill label="ATK" value={atk} color="text-orange-400" />
          <StatPill label="DEF" value={eff.stats.defense} color="text-blue-400" />
          <StatPill label="SPD" value={eff.stats.speed} color="text-yellow-400" />
          <StatPill label="EVA" value={eff.stats.evasion} color="text-emerald-400" />
          <StatPill label="LCK" value={eff.stats.luck} color="text-pink-400" />
          <StatPill label="CRIT" value={`${crit}%`} color="text-rose-300" />
          <StatPill label="DODGE" value={`${dodge}%`} color="text-sky-300" />
          {pressure.atk > 0 && <StatPill label="PRESSURE" value={`T${pressure.atk}`} color="text-red-400" />}
        </div>

        {/* Active food buffs */}
        {(player.stats.activeBuffs ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(player.stats.activeBuffs ?? []).map((buf, i) => (
              <span key={i} className="flex items-center gap-0.5 bg-orange-950/40 border border-orange-500/40 rounded px-1.5 py-0.5 text-[10px] text-orange-300">
                🍽️ <span className="font-bold">{buf.label}</span> <span className="text-orange-400/60">{buf.turnsLeft}t</span>
              </span>
            ))}
          </div>
        )}

        {/* Soul powers */}
        {(() => {
          const tags: string[] = [];
          if (p.vampiricStrike > 0) tags.push(`🩸 Vampiric×${p.vampiricStrike}`);
          if (p.lightningBolt) tags.push('⚡ Chain Arc');
          if (p.thorns) tags.push(`💎 Thorns×${p.thorns}`);
          if (p.bonusLoot) tags.push(`🍀 Loot×${p.bonusLoot}`);
          if (p.execBlow) tags.push('💥 Exec Blow');
          if (p.trueVision) tags.push('👁️ True Vision');
          if (p.itemMagnet) tags.push('🧲 Magnet');
          if (p.shieldWall) tags.push(`🛡️ Shield×${p.shieldWall}`);
          if (p.healOnKill) tags.push(`🍄 Heal/Kill×${p.healOnKill}`);
          if (p.trueAim) tags.push('🎯 True Aim');
          if (p.regeneration) tags.push(`💊 Regen×${p.regeneration}`);
          if (p.ninjaCombo > 0) tags.push(`🗡️ Combo×${p.ninjaCombo}`);
          if (p.royalAura) tags.push('👑 Royal Aura');
          if (p.combatRegen > 0) tags.push(`🌊 Combat Regen×${p.combatRegen}`);
          if (p.dodgeHeal > 0) tags.push(`🦋 Dodge Heal×${p.dodgeHeal}`);
          if (tags.length === 0) return null;
          return (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">✨ Soul Powers</div>
              <div className="flex flex-wrap gap-1">
                {tags.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 bg-card/40 border border-border/30 rounded">{t}</span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Mini-map */}
        <div className="flex justify-center pt-1">
          <MiniMap map={gameState.map} playerPos={player.pos} enemies={gameState.enemies} />
        </div>
      </div>
    </div>
  );
}
