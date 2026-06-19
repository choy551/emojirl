import { useState, useRef, useEffect } from 'react';
import { Player, EmojiItem, GameState, EquipSlot, BagPassiveSummary } from '../game/types';
import { getPassiveTooltipSuffix } from '../game/passives';
import { getCowboyUnarmedBonus } from '../game/combat';
import { MiniMap } from './MiniMap';
import { activeKindEmoji } from './itemUtils';

const HEAL_DISPLAY_LIMIT = 9;

interface RightSidebarProps {
  player: Player;
  gameState: Pick<GameState, 'map' | 'enemies' | 'activeProjectile'>;
  bagSlots: EmojiItem[];
  healSlots: EmojiItem[];
  bagPassiveSummary: BagPassiveSummary;
  equippedPlayer: Player;
  handleUseSlot: (i: number) => void;
  handleUseHeal: () => void;
  setBankOpen: (open: boolean) => void;
  setBagTab: (tab: 'hotbar' | 'equipment' | 'bank') => void;
  setSelectedItemId: (id: string | null) => void;
  onShowStatCard: (item: EmojiItem) => void;
}

export function RightSidebar({
  player,
  gameState,
  bagSlots,
  healSlots,
  bagPassiveSummary,
  equippedPlayer,
  handleUseSlot,
  handleUseHeal,
  setBankOpen,
  setBagTab,
  setSelectedItemId,
  onShowStatCard,
}: RightSidebarProps) {
  const p = bagPassiveSummary;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemInspectProps = (item: EmojiItem | null) => ({
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); if (item) onShowStatCard(item); },
    onPointerDown: (e: React.PointerEvent) => {
      if (item && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
        longPressTimerRef.current = setTimeout(() => onShowStatCard(item), 500);
      }
    },
    onPointerUp:     () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
    onPointerLeave:  () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
    onPointerCancel: () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } },
  });
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowAnchor, setOverflowAnchor] = useState<{ top: number; right: number } | null>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        overflowRef.current && !overflowRef.current.contains(e.target as Node) &&
        overflowBtnRef.current && !overflowBtnRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [overflowOpen]);

  const handleOverflowToggle = () => {
    if (overflowBtnRef.current) {
      const rect = overflowBtnRef.current.getBoundingClientRect();
      setOverflowAnchor({ top: rect.top, right: window.innerWidth - rect.right });
    }
    setOverflowOpen(o => !o);
  };

  return (
    <div className="w-60 bg-sidebar p-3 flex flex-col gap-2.5 shadow-[-8px_0_24px_rgba(0,0,0,0.5)] z-10 overflow-y-auto border-l border-border/40 shrink-0">

      {/* Mini-map */}
      <MiniMap
        map={gameState.map}
        playerPos={player.pos}
        enemies={gameState.enemies}
      />

      {/* Bag — 9 hotbar slots */}
      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bag</h3>
          <button
            onClick={() => { setBankOpen(true); setSelectedItemId(null); }}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {(() => {
              const eq = player.bank.filter(i => i.isEquipment && !i.consumed).length;
              const em = player.bank.filter(i => !i.isEquipment && !i.consumed).length;
              if (eq === 0 && em === 0) return 'B = Bank';
              if (eq === 0) return `Bank: ${em} · B`;
              if (em === 0) return `Bank: ${eq}⚔️ · B`;
              return `Bank: ${eq + em} (${eq}⚔️ · ${em}🏦) · B`;
            })()}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }, (_, i) => {
            const item = bagSlots[i] ?? null;
            if (!item) {
              return (
                <div key={`empty-${i}`} className="relative aspect-square bg-black/20 border border-border/20 rounded flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground/20 font-bold">{i + 1}</span>
                </div>
              );
            }
            const kindEmoji = activeKindEmoji(item.activeKind);
            const isInFlight = !!item.activeKind && !!gameState.activeProjectile && gameState.activeProjectile.kind === item.activeKind;
            const bankDupes = !item.isEquipment
              ? player.bank.filter(b => !b.isEquipment && !b.consumed && b.emoji === item.emoji).length
              : 0;
            return (
              <button
                key={item.id}
                data-testid={`soul-slot-${i + 1}`}
                onClick={() => handleUseSlot(i)}
                {...itemInspectProps(item)}
                title={`[${i + 1}] ${item.name}: ${item.description.replace(/ · Bag: [^·]+$/, '')}${item.charges !== undefined && item.charges >= 0 ? ` (${item.charges}×)` : ''}${getPassiveTooltipSuffix(item)}${bankDupes > 0 ? ` · ${bankDupes} more in Bank` : ''} · Right-click for details`}
                className={`relative aspect-square bg-card border rounded flex items-center justify-center text-xl transition-all
                  ${item.isEquipment
                    ? 'border-amber-500/60 hover:border-amber-300 cursor-pointer shadow-sm hover:scale-105 active:scale-95 shadow-amber-900/30'
                    : item.activeKind
                      ? 'border-amber-600/40 hover:border-amber-400 cursor-pointer shadow-sm hover:scale-105 active:scale-95'
                      : 'border-border hover:border-primary cursor-pointer shadow-sm hover:scale-105 active:scale-95'}`}
              >
                {item.emoji}
                <>
                  <span className="absolute top-0.5 left-1 text-[8px] text-muted-foreground font-bold leading-none">{i + 1}</span>
                  {item.isEquipment && <span className="absolute bottom-0.5 right-0.5 text-[8px] leading-none">⚔️</span>}
                  {!item.isEquipment && kindEmoji && (
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none">{kindEmoji}</span>
                  )}
                  {item.charges !== undefined && item.charges >= 0 && (
                    <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-400/80 font-bold leading-none">×{item.charges}</span>
                  )}
                  {!item.isEquipment && !kindEmoji && (item.stackCount ?? 0) > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-emerald-400 font-bold leading-none">×{item.stackCount}</span>
                  )}
                  {!item.isEquipment && !kindEmoji && bankDupes > 0 && (
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] text-sky-400 font-bold leading-none">+{bankDupes}</span>
                  )}
                </>
                {isInFlight && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Heal Bag */}
      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Healing</h3>
          <span className="text-xs text-muted-foreground/50">H</span>
        </div>
        {healSlots.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic">No items yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {healSlots.slice(0, HEAL_DISPLAY_LIMIT).map(item => (
              <button
                key={item.id}
                data-testid={`heal-slot-${item.id}`}
                onClick={handleUseHeal}
                {...itemInspectProps(item)}
                title={`${item.name}: ${item.description} · Right-click for details`}
                className="relative w-9 h-9 bg-card border border-emerald-500/40 rounded flex items-center justify-center text-lg hover:border-emerald-400 hover:scale-105 transition-all cursor-pointer shadow-sm"
              >
                {item.emoji}
              </button>
            ))}
            {healSlots.length > HEAL_DISPLAY_LIMIT && (
              <>
                <button
                  ref={overflowBtnRef}
                  onClick={handleOverflowToggle}
                  title={healSlots.slice(HEAL_DISPLAY_LIMIT).map(i => `${i.emoji} ${i.name} (+${i.healAmount} HP)`).join('\n')}
                  className="w-9 h-9 bg-card border border-emerald-500/40 rounded flex items-center justify-center text-[11px] font-bold text-emerald-400 hover:border-emerald-400 hover:scale-105 transition-all cursor-pointer shadow-sm leading-none"
                >
                  +{healSlots.length - HEAL_DISPLAY_LIMIT}
                </button>
                {overflowOpen && overflowAnchor && (
                  <div
                    ref={overflowRef}
                    style={{ position: 'fixed', top: overflowAnchor.top, right: overflowAnchor.right + 4, transform: 'translateY(-100%) translateY(-6px)', zIndex: 9999 }}
                    className="bg-popover border border-border rounded-lg shadow-xl p-2 min-w-[140px]"
                  >
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold mb-1.5">Overflow Heals</p>
                    <div className="flex flex-wrap gap-1">
                      {healSlots.slice(HEAL_DISPLAY_LIMIT).map(item => (
                        <button
                          key={item.id}
                          onClick={() => { handleUseHeal(); setOverflowOpen(false); }}
                          title={`${item.name}: ${item.description}`}
                          className="w-8 h-8 bg-card border border-emerald-500/40 rounded flex items-center justify-center text-base hover:border-emerald-400 hover:scale-110 transition-all cursor-pointer shadow-sm"
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 mt-1.5 italic">H key uses best for current HP</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Ammo Counter */}
      {(player.characterClass === '🧝' || player.characterClass === '🤠') && (
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Ammo</h3>
          </div>
          <div className="flex gap-1.5">
            <div
              title={player.characterClass === '🤠' ? `${player.ammo} bullets` : `${player.ammo} arrows`}
              className={`relative w-10 h-10 rounded border flex items-center justify-center text-xl shadow-sm
                ${player.ammo > 0 ? 'bg-amber-950/30 border-amber-700/40' : 'bg-red-950/30 border-red-700/50'}`}
            >
              <span>{player.characterClass === '🤠' ? '🪙' : '🏹'}</span>
              <span className={`absolute bottom-0 right-0.5 text-[9px] font-bold leading-none ${player.ammo > 0 ? 'text-amber-300' : 'text-red-400'}`}>
                ×{player.ammo}
              </span>
            </div>
            <div className="flex flex-col justify-center">
              <span className={`text-[11px] font-bold leading-tight ${player.ammo > 0 ? 'text-amber-300' : 'text-red-400'}`}>
                {player.ammo > 0 ? player.ammo : 'Empty'}
              </span>
              <span className="text-[9px] text-muted-foreground/50 leading-tight">
                {player.characterClass === '🤠' ? 'bullets' : 'arrows'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Equipped gear mini-HUD */}
      {Object.values(player.equipment).some(Boolean) && (
        <div className="border border-amber-600/20 rounded-lg p-2 bg-amber-900/10">
          <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1.5">⚔️ Equipped</div>
          <div className="flex flex-wrap gap-1">
            {(['body', 'mainHand', 'offHand', 'accessory'] as EquipSlot[]).map(slot => {
              const item = player.equipment[slot];
              if (!item) return null;
              const label = slot === 'body' ? '🥋' : slot === 'mainHand' ? '⚔️' : slot === 'offHand' ? '🛡️' : '💍';
              return (
                <button
                  key={slot}
                  onClick={() => { setBagTab('equipment'); setBankOpen(true); setSelectedItemId(null); }}
                  {...itemInspectProps(item)}
                  title={`${label} ${item.name}: ${item.description} — click to manage, right-click for details`}
                  className="flex items-center gap-1 px-1.5 py-1 bg-card border border-amber-600/30 rounded text-sm hover:border-amber-400 transition-all cursor-pointer"
                >
                  <span className="text-[9px] text-muted-foreground/40">{label}</span>
                  <span>{item.emoji}</span>
                </button>
              );
            })}
          </div>
          {(() => {
            const eq = equippedPlayer;
            const parts: string[] = [];
            if (p.attack)        parts.push(`+${p.attack}ATK`);
            if (p.defense)       parts.push(`+${p.defense}DEF`);
            if (p.losBonus)      parts.push(`+${p.losBonus}LOS`);
            if (p.stealthBonus)  parts.push(`+${p.stealthBonus}STEALTH`);
            if (p.luck)          parts.push(`+${p.luck}LUCK`);
            if (p.canSwim)       parts.push(`⛵SWIM`);
            if (p.burningOnHit)  parts.push(`🔥BURN`);
            if (p.freezeAura)    parts.push(`❄️AURA`);
            if (p.advantageDice) parts.push(`🎲ADV`);
            if (p.stealthPenalty) parts.push(`👁️ALERT`);
            const _eqDualGuns = player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
            const _eqUnarmed = !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
            const eqIronFistBonus = player.characterClass === '🤠' && ((_eqDualGuns && player.ammo <= 0) || _eqUnarmed)
              ? getCowboyUnarmedBonus(player.stats.level) : 0;
            const displayAtk = eq.stats.attack + eqIronFistBonus;
            return (
              <div className="mt-1.5 text-[9px] text-muted-foreground/40">
                ATK {displayAtk} DEF {eq.stats.defense}
                {parts.length > 0 && <span className="text-emerald-400/70 ml-1">{parts.join(' ')}</span>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Cowboy Iron Fist passive indicator */}
      {player.characterClass === '🤠' && (() => {
        const _dualGuns = player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
        const _unarmed = !player.equipment.mainHand?.weaponKind && !player.equipment.offHand?.weaponKind;
        const ifBonus = (_dualGuns && player.ammo <= 0) || _unarmed ? getCowboyUnarmedBonus(player.stats.level) : 0;
        if (ifBonus === 0) return null;
        const mode = _unarmed ? 'Unarmed' : 'Pistol-whip';
        return (
          <div
            title={`Iron Fist (${mode}) — Unarmed ATK scales with level. Base ATK ${player.stats.attack} + ${ifBonus} Iron Fist = ${player.stats.attack + ifBonus} effective ATK.`}
            className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-950/30 border border-amber-700/40 rounded-lg cursor-help"
          >
            <span className="text-base leading-none">🤛</span>
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-[10px] font-bold text-amber-300">Iron Fist +{ifBonus} ATK</span>
              <span className="text-[9px] text-amber-600/70">{mode} · Lv {player.stats.level}</span>
            </div>
          </div>
        );
      })()}

      {/* Active bag passives — Soul Powers */}
      {(() => {
        const tags: { icon: string; label: string; color: string; desc: string }[] = [];
        if (p.vampiricStrike > 0) tags.push({ icon: '🩸', label: p.vampiricStrike > 1 ? `Vampiric ×${p.vampiricStrike}` : 'Vampiric', color: 'text-rose-400', desc: `Melee hits restore ${p.vampiricStrike} HP.` });
        if (p.lightningBolt)  tags.push({ icon: '⚡', label: 'Chain Arc', color: 'text-yellow-300', desc: 'Melee attacks arc lightning to 1–3 nearby enemies.' });
        if (p.thorns)         tags.push({ icon: '💎', label: `Thorns ×${p.thorns}`, color: 'text-cyan-400', desc: `Reflect ${p.thorns} damage back to attackers in melee (stacks per copy).` });
        if (p.bonusLoot)      tags.push({ icon: '🍀', label: `+Loot ×${p.bonusLoot}`, color: 'text-amber-300', desc: `${Math.round(Math.min(95, 55 + 15 * p.bonusLoot))}% enemy drop chance (stacks per copy; base 55%).` });
        if (p.execBlow)       tags.push({ icon: '💥', label: 'Exec Blow', color: 'text-orange-400', desc: 'Instantly kill low-HP enemies on hit.' });
        if (p.trueVision)     tags.push({ icon: '👁️', label: 'True Vision', color: 'text-violet-400', desc: 'See enemies through walls and in the dark.' });
        if (p.itemMagnet)     tags.push({ icon: '🧲', label: 'Magnet', color: 'text-blue-300', desc: 'Nearby ground items drift toward you.' });
        if (p.shieldWall)     tags.push({ icon: '🛡️', label: `Shield Wall ×${p.shieldWall}`, color: 'text-blue-400', desc: `${p.shieldWall * 25}% block chance, −${p.shieldWall} incoming dmg (stacks).` });
        if (p.healOnKill)     tags.push({ icon: '🍄', label: `Heal on Kill ×${p.healOnKill}`, color: 'text-emerald-400', desc: `+${p.healOnKill} HP per kill (stacks per copy).` });
        if (p.trueAim)        tags.push({ icon: '🎯', label: 'True Aim', color: 'text-green-400', desc: 'Ranged attacks never miss.' });
        if (p.regeneration)   tags.push({ icon: '💊', label: `Regen ×${p.regeneration}`, color: 'text-teal-300', desc: `+1 HP every ${Math.max(1, 6 - p.regeneration)} turns out of combat (stacks per copy).` });
        if (p.ninjaCombo > 0) tags.push({ icon: '🗡️', label: `Ninja Combo ×${p.ninjaCombo}`, color: 'text-slate-300', desc: `${25 + (p.ninjaCombo-1)*15}% chance of bonus melee strike.` });
        if (p.royalAura)      tags.push({ icon: '👑', label: 'Royal Aura', color: 'text-yellow-400', desc: 'Weak enemies hesitate before attacking you.' });
        if (p.combatRegen > 0) tags.push({ icon: '🌊', label: `Combat Regen ×${p.combatRegen}`, color: 'text-cyan-300', desc: `+${p.combatRegen} HP per turn even while in combat (stacks).` });
        if (p.dodgeHeal > 0) tags.push({ icon: '🦋', label: `Dodge Heal ×${p.dodgeHeal}`, color: 'text-purple-300', desc: `Heal ${p.dodgeHeal} HP each time you dodge an attack (stacks).` });
        if (tags.length === 0) return null;
        return (
          <div>
            <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1">✨ Soul Powers</div>
            <div className="flex flex-wrap gap-1">
              {tags.map(t => (
                <div
                  key={t.label}
                  title={`${t.label} — ${t.desc}`}
                  className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-card/40 border border-border/30 rounded cursor-help ${t.color}`}
                >
                  <span>{t.icon}</span><span>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Controls */}
      <div className="mt-auto text-[10px] text-muted-foreground/40 space-y-0.5 border-t border-border/40 pt-2">
        <div>Move: arrows / WASD / numpad</div>
        <div>1–9 use emoji · H heal · B bag</div>
        <div>Z wait · R rest · O explore · / log</div>
        <div>Tab/Shift-Tab target · T tactics</div>
        {player.characterClass === '🧝' && <div className="text-amber-400/50">Ranger: step close to shoot</div>}
        {player.characterClass === '🧙' && <div className="text-violet-400/50">Wizard: Tab to lock target</div>}
        {player.characterClass === '🥷' && <div className="text-slate-400/50">Ninja: T to toggle stealth</div>}
        {player.characterClass === '🤠' && (() => {
          const isDualGun = player.equipment.mainHand?.weaponKind === 'gun' && player.equipment.offHand?.weaponKind === 'gun';
          const phase = isDualGun
            ? (player.ammo > 0 ? '🔫 Dual Guns' : '💢 Pistol Whip')
            : '🤠 Unarmed';
          return <div className="text-amber-400/50">{phase} · YEEHAW every 45t</div>;
        })()}
      </div>
    </div>
  );
}
