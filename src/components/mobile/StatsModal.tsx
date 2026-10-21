import { Player, GameState, BagPassiveSummary } from '../../game/types';
import { applyEquipmentAndPassives, computeNinjaEvasion, pressureForRun, playerSoftCap } from '../../game/gameHelpers';
import { fencerEvasion, isArcaneCaster, isFencer } from '../../game/prestige';
import { getCowboyUnarmedBonus } from '../../game/combat';
import { nullMomentumPercent } from '../../game/voidDamage';
import { blinkStrikeDamagePhrase, blinkTalentById, blinkTalentProgress, knownBlinkTalents, overkillStatusPhrase } from '../../game/blinkStrike';
import { DODGE_CHANCE_CAP, softCapBonusLines, softCapTitles } from '../../game/softCap';
import { MiniMap } from '../MiniMap';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './oneHandedLayout';
import { useDismissGuard } from '../../hooks/useDismissGuard';

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

function StatPill({ label, value, color, title }: { label: string; value: string | number; color: string; title?: string }) {
  return (
    <div title={title || undefined} className="bg-card/60 border border-border/40 rounded-lg px-2 py-1.5 flex flex-col items-center leading-none gap-1">
      <span className={`font-bold text-sm ${color}`}>{value}</span>
      <span className="text-[9px] text-muted-foreground/50">{label}</span>
    </div>
  );
}

export function StatsModal({ player, className, currentFloor, moodEmoji, moodName, bagPassiveSummary, gameState, onClose }: StatsModalProps) {
  const eff = applyEquipmentAndPassives(player);
  const caps = playerSoftCap(player);
  const titles = softCapTitles(caps);
  const bonusLines = softCapBonusLines(caps);
  const dualGuns = player.characterClass === '🤠' && player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
  const unarmed = player.characterClass === '🤠' && !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
  const ironFist = (dualGuns && player.ammo <= 0) || unarmed ? getCowboyUnarmedBonus(player.stats.level) : 0;
  const atk = caps.attack + ironFist;
  const crit = caps.crit;
  const dodge = player.characterClass === '🥷'
    ? computeNinjaEvasion(eff)
    : isFencer(player.characterClass)
      ? fencerEvasion(eff.stats.hp, eff.stats.maxHp, eff.stats.evasion ?? 0)
      : Math.min(DODGE_CHANCE_CAP, caps.evasion);
  const pressure = pressureForRun(currentFloor, gameState.deepDive);
  const voidDr = player.characterClass === '👤' ? nullMomentumPercent(player.stats.level) : 0;
  const p = bagPassiveSummary;
  const hp = player.stats.hp;
  const maxHp = caps.maxHp;
  const overheal = hp > maxHp;
  const hpPct = overheal ? Math.min(100, (hp / (maxHp * 2)) * 100) : (hp / Math.max(1, maxHp)) * 100;
  const hpColor = overheal ? '#f59e0b' : hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';
  const mana = player.stats.mana ?? 0;
  const maxMana = player.stats.maxMana ?? 4;
  const hand = useMobileHand();
  const dismiss = useDismissGuard(onClose);

  return (
    <div
      className={`fixed inset-0 z-[60] flex bg-black/70 backdrop-blur-sm overflow-y-auto ${hand ? overlayFlexClass(hand) : 'items-start justify-center'}`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-border shadow-2xl p-3 flex flex-col gap-3 ${hand ? overlayPanelClass(hand) : 'rounded-2xl w-[92vw] max-w-md my-4'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
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
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="font-bold text-destructive">❤️ HP</span>
              <span className="tabular-nums font-bold" style={{ color: hpColor }} title={titles.HP || undefined}>{overheal ? '✨' : ''}{hp}/{maxHp}</span>
            </div>
            <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${hpPct}%`, backgroundColor: hpColor }} />
            </div>
          </div>
          {isArcaneCaster(player.characterClass) && (
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="font-bold text-violet-400">🔵 MP</span>
                <span className="tabular-nums font-bold text-violet-300">{mana}/{maxMana}</span>
              </div>
              <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(mana / Math.max(1, maxMana)) * 100}%`, backgroundColor: mana > 0 ? '#8b5cf6' : '#6b7280' }}
                />
              </div>
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
          <StatPill label="ATK" value={atk} color="text-orange-400" title={[titles.ATK, ironFist > 0 ? `+${ironFist} Iron Fist` : ''].filter(Boolean).join(' · ')} />
          <StatPill label="DEF" value={caps.defense} color="text-blue-400" title={titles.DEF} />
          <StatPill label="SPD" value={caps.speed} color="text-yellow-400" title={titles.SPD} />
          <StatPill label="EVA" value={caps.evasion} color="text-emerald-400" title={titles.EVA} />
          <StatPill label="LCK" value={caps.luck} color="text-pink-400" title={titles.LCK} />
          <StatPill label="CRIT" value={`${crit}%`} color="text-rose-300" title={titles.CRIT} />
          <StatPill label="DODGE" value={`${dodge}%`} color="text-sky-300" />
          {voidDr > 0 && <StatPill label="DR" value={`${voidDr}%`} color="text-zinc-200" />}
          {pressure.atk > 0 && <StatPill label="PRESSURE" value={`+${pressure.atk}/+${pressure.def}`} color="text-red-400" />}
        </div>

        {bonusLines.length > 0 && (
          <div data-testid="soft-cap-bonuses" className="text-[10px] leading-snug text-amber-200/90">
            {bonusLines.join(' · ')}
          </div>
        )}

        {player.characterClass === '🥷' && (() => {
          const progress = blinkTalentProgress(player.stats.blinkStrikeCredits ?? 0, player.stats.blinkTalents);
          const owned = knownBlinkTalents(player.stats.blinkTalents) ?? [];
          const overkill = overkillStatusPhrase(player.stats);
          return (
            <div data-testid="stats-blink-talents" className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-2 py-2 text-[11px] leading-snug">
              <div className="font-bold text-violet-200">{progress.statsLabel}</div>
              <div className="text-muted-foreground">{progress.nextLabel} · {blinkStrikeDamagePhrase(eff.stats.luck, owned)}{overkill ? ` · ${overkill}` : ''}</div>
              {owned.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {owned.map(id => {
                    const talent = blinkTalentById(id);
                    return <li key={id}>⚡ {talent.name} — {talent.detail}</li>;
                  })}
                </ul>
              )}
            </div>
          );
        })()}

        {/* Active food buffs and the current drink */}
        {((player.stats.activeBuffs ?? []).length > 0 || (player.drinkBuff && player.drinkBuff.turnsLeft > 0)) && (
          <div className="flex flex-wrap gap-1">
            {(player.stats.activeBuffs ?? []).map((buf, i) => (
              <span key={i} className="flex items-center gap-0.5 bg-orange-950/40 border border-orange-500/40 rounded px-1.5 py-0.5 text-[10px] text-orange-300">
                🍽️ <span className="font-bold">{buf.label}</span> <span className="text-orange-400/60">{buf.turnsLeft}t</span>
              </span>
            ))}
            {player.drinkBuff && player.drinkBuff.turnsLeft > 0 && (
              <span className="flex items-center gap-0.5 bg-sky-950/40 border border-sky-500/40 rounded px-1.5 py-0.5 text-[10px] text-sky-300">
                🧃 <span className="font-bold">{player.drinkBuff.label}</span> <span className="text-sky-400/60">{player.drinkBuff.turnsLeft}t</span>
              </span>
            )}
          </div>
        )}

        {/* Soul powers */}
        {(() => {
          const tags: string[] = [];
          if (p.vampiricStrike > 0) tags.push(`🩸 Vampiric×${p.vampiricStrike}`);
          if (p.lightningBolt > 0) tags.push(p.lightningBolt > 1 ? `⚡ Chain Arc×${p.lightningBolt}` : '⚡ Chain Arc');
          if (p.thorns) tags.push(`💎 Thorns×${p.thorns}`);
          if (p.bonusLoot) tags.push(`🍀 Loot×${p.bonusLoot} · rarer`);
          if (p.execBlow) tags.push('💥 Death Crit');
          if (p.trueVision) tags.push('👁️ True Vision');
          if (p.itemMagnet) tags.push('🧲 Magnet');
          if (p.shieldWall) tags.push(`🛡️ Shield×${p.shieldWall}`);
          if (p.healOnKill) tags.push(`🍄 Heal/Kill×${p.healOnKill}`);
          if (p.trueAim) tags.push('🎯 True Aim');
          if (p.regeneration) tags.push(`💊 Regen×${p.regeneration}`);
          if (p.ninjaCombo > 0) tags.push(`🗡️ Ninja Combo×${p.ninjaCombo}`);
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
