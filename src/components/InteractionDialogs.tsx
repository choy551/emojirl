import { useState } from 'react';
import { GameState, Enemy, EmojiItem } from '../game/types';
import { addToBag } from '../game/gameHelpers';

type SetGameState = React.Dispatch<React.SetStateAction<GameState | null>>;

interface MonkeyDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  interaction: { id: string; wants: string };
  onClose: () => void;
}

export function MonkeyInteractionDialog({ gameState, setGameState, interaction, onClose }: MonkeyDialogProps) {
  const monkey = gameState.enemies.find(e => e.id === interaction.id);
  if (!monkey) return null;
  const { wants } = interaction;
  const stolenCount = monkey.stolenEmojis?.length ?? 0;
  const wantsItemIdx = gameState.player.inventory.findIndex(i => !i.consumed && i.emoji === wants);
  const playerHasIt = wantsItemIdx !== -1;

  const handleGive = () => {
    if (!playerHasIt) return;
    setGameState(prev => {
      if (!prev) return prev;
      const itemIdx = prev.player.inventory.findIndex(i => !i.consumed && i.emoji === wants);
      if (itemIdx === -1) return prev;
      const remainingInv = prev.player.inventory.filter((_, i) => i !== itemIdx);
      const { inventory: _inv, bank: _bnk } = addToBag(remainingInv, prev.player.bank, ...(monkey.stolenEmojis ?? []));
      return {
        ...prev,
        player: { ...prev.player, inventory: _inv, bank: _bnk },
        enemies: prev.enemies.filter(e => e.id !== interaction.id),
        logs: [{ id: Math.random().toString(), text: `🐒 ${monkey.name} happily takes the ${wants} and drops your emojis! 🎉`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  const handleAttack = () => {
    setGameState(prev => {
      if (!prev) return prev;
      const idx = prev.enemies.findIndex(e => e.id === interaction.id);
      if (idx === -1) return prev;
      const newEnemies = [...prev.enemies];
      newEnemies[idx] = { ...newEnemies[idx], engaged: true, tag: 'Hostile' as const };
      return {
        ...prev,
        enemies: newEnemies,
        logs: [{ id: Math.random().toString(), text: `🐒 ${monkey.name} shrieks and bares its teeth — it's hostile now!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-amber-400/40 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{monkey.emoji}</div>
          <div className="text-sm font-bold text-amber-300 mb-2">{monkey.name}</div>
          <div className="text-xs text-muted-foreground leading-relaxed italic">
            "Oo oo! Give {wants}... give {wants}!"
          </div>
          {stolenCount > 0 && (
            <div className="mt-2 text-xs text-amber-400/80">
              Holding <span className="font-semibold">{stolenCount}</span> stolen emoji{stolenCount !== 1 ? 's' : ''}: {(monkey.stolenEmojis ?? []).map(s => s.emoji).join('')}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <button
            className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
              playerHasIt
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/35 cursor-pointer'
                : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
            }`}
            onClick={handleGive}
            disabled={!playerHasIt}
          >
            {playerHasIt
              ? `Give ${wants} — get your emojis back`
              : `Give ${wants} — you don't have one`}
          </button>
          <button
            className="w-full py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-colors"
            onClick={handleAttack}
          >
            ⚔️ Attack — turns it hostile
          </button>
          <button
            className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            Back away slowly 🤫
          </button>
        </div>
      </div>
    </div>
  );
}

interface FairyDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  fairyId: string;
  onClose: () => void;
}

export function FairyInteractionDialog({ gameState, setGameState, fairyId, onClose }: FairyDialogProps) {
  const fairy = gameState.enemies.find(e => e.id === fairyId);
  if (!fairy) return null;
  const handleYes = () => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        player: { ...prev.player, stats: { ...prev.player.stats, hp: prev.player.stats.maxHp } },
        enemies: prev.enemies.filter(e => e.id !== fairyId),
        logs: [{ id: Math.random().toString(), text: `🧚‍♀️ ${fairy.name} heals you to full HP! ✨`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-pink-400/40 rounded-xl p-6 shadow-2xl max-w-xs w-full mx-4">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{fairy.emoji}</div>
          <div className="text-sm font-bold text-pink-300 mb-2">{fairy.name}</div>
          <div className="text-xs text-muted-foreground leading-relaxed italic">
            "Hehe, you look tired~ Want me to heal you? ✨"
          </div>
        </div>
        <div className="flex gap-3">
          <button
            className="flex-1 py-2.5 rounded-lg bg-pink-500/20 border border-pink-400/40 text-pink-200 text-sm font-semibold hover:bg-pink-500/35 transition-colors"
            onClick={handleYes}
          >
            Yes please 💗
          </button>
          <button
            className="flex-1 py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            No thanks 🤚
          </button>
        </div>
      </div>
    </div>
  );
}

interface AdventurerDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  adventurerId: string;
  onClose: () => void;
}

const ADV_LINES: Record<string, string> = {
  '🧙': `Hm, you seem capable~ I've been wandering these floors researching arcane theory. A little company wouldn't hurt. Have anything shiny for me?`,
  '🥷': `You actually spotted me. I'm impressed. I need someone worth walking alongside — prove it. What've you got?`,
  '🧝': `I've been riding solo for too long. My arrows fly true and I know these floors well. Trade me something good and I'm yours.`,
  '🤠': `Howdy, partner~ Reckon these here dungeons ain't no place to ride alone. Got anything worth a handshake deal?`,
  '🧑‍🎤': `Oh~! A protagonist! My ballad needs a hero to follow around. I'll trade my loyalty for one little trinket~`,
};
const ADV_COLORS: Record<string, string> = {
  '🧙': 'text-violet-300',
  '🥷': 'text-slate-300',
  '🧝': 'text-emerald-300',
  '🤠': 'text-amber-300',
  '🧑‍🎤': 'text-pink-300',
};
const ADV_BORDER: Record<string, string> = {
  '🧙': 'border-violet-400/40',
  '🥷': 'border-slate-400/40',
  '🧝': 'border-emerald-400/40',
  '🤠': 'border-amber-400/40',
  '🧑‍🎤': 'border-pink-400/40',
};
const ADV_FRIENDLY_LINES: Record<string, string> = {
  '🧙': `Oh, it's you! I was hoping you'd come by~ I'm ready to travel with you, no strings attached!`,
  '🥷': `I've already decided I like you. Don't make me regret it. Let's move.`,
  '🧝': `I've been waiting for the right person. Looks like that's you — shall we?`,
  '🤠': `Well, I reckon you're exactly the kind of partner I was lookin' for. Ready when you are, partner~`,
  '🧑‍🎤': `I had a good feeling about you! The ballad practically writes itself. Come on, let's go~`,
};

export function AdventurerInteractionDialog({ gameState, setGameState, adventurerId, onClose }: AdventurerDialogProps) {
  const adv = gameState.enemies.find(e => e.id === adventurerId);
  if (!adv) return null;
  const fav = adv.favoriteEmoji ?? '❓';
  const isAlreadyFriendly = adv.tag === 'Friendly';
  const playerHasIt = gameState.player.inventory.some(i => !i.consumed && i.emoji === fav);

  const flavorLine = ADV_LINES[adv.emoji] ?? `Hey, adventurer! These floors are rough alone. Got something to share?`;
  const nameColor = ADV_COLORS[adv.emoji] ?? 'text-cyan-300';
  const borderColor = ADV_BORDER[adv.emoji] ?? 'border-cyan-400/40';
  const friendlyLine = ADV_FRIENDLY_LINES[adv.emoji] ?? `I'm already on your side — let's go!`;

  const handleGive = () => {
    if (!playerHasIt) return;
    setGameState(prev => {
      if (!prev) return prev;
      const itemIdx = prev.player.inventory.findIndex(i => !i.consumed && i.emoji === fav);
      if (itemIdx === -1) return prev;
      const newInventory = prev.player.inventory.filter((_, idx) => idx !== itemIdx);
      return {
        ...prev,
        player: { ...prev.player, inventory: newInventory },
        enemies: prev.enemies.map(e =>
          e.id === adventurerId
            ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: true }
            : e
        ),
        logs: [{ id: Math.random().toString(), text: `🤝 ${adv.emoji} ${adv.name} beams with joy! "${fav}?! For me?!" — joins as your companion!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  const handleAcceptFriendly = () => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        enemies: prev.enemies.map(e =>
          e.id === adventurerId
            ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: true }
            : e
        ),
        logs: [{ id: Math.random().toString(), text: `🤝 ${adv.emoji} ${adv.name} grins warmly — joins as your companion!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-card border ${borderColor} rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4`}>
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{adv.emoji}</div>
          <div className={`text-sm font-bold ${nameColor} mb-3`}>{adv.name}</div>
          <div className="text-xs text-muted-foreground leading-relaxed italic px-1">
            "{isAlreadyFriendly ? friendlyLine : flavorLine}"
          </div>
        </div>
        <div className="space-y-2">
          {isAlreadyFriendly ? (
            <button
              className="w-full py-2.5 rounded-lg border bg-cyan-500/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 text-sm font-semibold transition-colors"
              onClick={handleAcceptFriendly}
            >
              Accept companion 🤝
            </button>
          ) : (
            <button
              className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                playerHasIt
                  ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 cursor-pointer'
                  : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
              }`}
              onClick={handleGive}
              disabled={!playerHasIt}
            >
              {playerHasIt
                ? `Recruit — give ${fav} 🤝`
                : `Recruit — need ${fav} (you don't have one)`}
            </button>
          )}
          <button
            className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            Exit dialogue 👋
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CompanionTalkDialog ────────────────────────────────────────────────────

interface CompanionTalkProps {
  gameState: GameState;
  setGameState: SetGameState;
  companionId: string;
  onClose: () => void;
}

type TalkSection = 'main' | 'heal' | 'give' | 'soul';

const BEHAVIOR_OPTIONS: { value: Enemy['companionBehavior']; icon: string; label: string; desc: string }[] = [
  { value: 'close',      icon: '🤝', label: 'Stay Close',    desc: 'Follow tightly, charge engaged enemies near you' },
  { value: 'far',        icon: '🏹', label: 'Hang Back',     desc: 'Keep distance (7 tiles), only strike enemies that reach you' },
  { value: 'flee',       icon: '🏃', label: 'Flee at Low HP', desc: 'Retreat toward you when below 50% HP' },
  { value: 'aggressive', icon: '⚔️', label: 'Fight to Death', desc: 'Charge any visible foe — reckless but relentless' },
];

function soulEmojiStatPreview(item: EmojiItem): string {
  const eff = (item as unknown as Record<string, Record<string, number>>).effect;
  if (!eff) return '';
  const parts: string[] = [];
  if (eff.attackBonus)  parts.push(`+${eff.attackBonus} ATK`);
  if (eff.defenseBonus) parts.push(`+${eff.defenseBonus} DEF`);
  if (eff.speedBonus)   parts.push(`+${eff.speedBonus} SPD`);
  if (eff.evasionBonus) parts.push(`+${eff.evasionBonus} EVA`);
  if (eff.luckBonus)    parts.push(`+${eff.luckBonus} LCK`);
  if (eff.hpBonus)      parts.push(`+${eff.hpBonus} HP`);
  if (eff.maxHpBonus)   parts.push(`+${eff.maxHpBonus} max HP`);
  return parts.join(', ');
}

export function CompanionTalkDialog({ gameState, setGameState, companionId, onClose }: CompanionTalkProps) {
  const [section, setSection] = useState<TalkSection>('main');

  const companion = gameState.enemies.find(e => e.id === companionId);
  if (!companion) return null;

  const hpPct = Math.round((companion.hp / companion.maxHp) * 100);
  const behavior = companion.companionBehavior ?? 'close';

  // Player item pools
  const healItems = gameState.player.inventory.filter(it => !it.consumed && it.healAmount !== undefined);
  const soulItems = gameState.player.inventory.filter(it =>
    !it.consumed && !it.isEquipment && !it.activeKind && it.healAmount === undefined && it.bagPassive
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleFavorite = () => {
    setGameState(prev => {
      if (!prev) return prev;
      const nowFavorite = !companion.isFavoriteCompanion;
      return {
        ...prev,
        enemies: prev.enemies.map(e =>
          e.id === companionId
            ? { ...e, isFavoriteCompanion: nowFavorite }
            : e.isRecruited ? { ...e, isFavoriteCompanion: false } : e
        ),
        logs: [{
          id: Math.random().toString(),
          text: nowFavorite
            ? `⭐ ${companion.emoji} ${companion.name} is now your Favorite Companion — they'll descend with you!`
            : `${companion.emoji} ${companion.name} is no longer your Favorite.`,
          turn: prev.turn,
        }, ...prev.logs].slice(0, 24),
      };
    });
  };

  const handleHeal = (item: EmojiItem) => {
    setGameState(prev => {
      if (!prev) return prev;
      const comp = prev.enemies.find(e => e.id === companionId);
      if (!comp) return prev;
      const amount = item.healAmount ?? 0;
      const newHp = Math.min(comp.maxHp, comp.hp + amount);
      return {
        ...prev,
        player: { ...prev.player, inventory: prev.player.inventory.filter(it => it.id !== item.id) },
        enemies: prev.enemies.map(e => e.id === companionId ? { ...e, hp: newHp } : e),
        logs: [{
          id: Math.random().toString(),
          text: `💊 ${comp.emoji} ${comp.name} is healed for ${amount} HP with ${item.emoji} ${item.name}. (${newHp}/${comp.maxHp} HP)`,
          turn: prev.turn,
        }, ...prev.logs].slice(0, 24),
      };
    });
    setSection('main');
  };

  const handleGiveEmoji = (item: EmojiItem) => {
    setGameState(prev => {
      if (!prev) return prev;
      const comp = prev.enemies.find(e => e.id === companionId);
      if (!comp) return prev;
      const eff = (item as unknown as Record<string, Record<string, number>>).effect;
      let newComp = { ...comp };
      const parts: string[] = [];
      if (eff) {
        if (eff.attackBonus)  { newComp.attack  = (newComp.attack  ?? 0) + eff.attackBonus;  parts.push(`+${eff.attackBonus} ATK`); }
        if (eff.defenseBonus) { newComp.defense  = (newComp.defense ?? 0) + eff.defenseBonus; parts.push(`+${eff.defenseBonus} DEF`); }
        if (eff.speedBonus)   { newComp.speed    = (newComp.speed   ?? 0) + eff.speedBonus;   parts.push(`+${eff.speedBonus} SPD`); }
        if (eff.hpBonus)      { newComp.hp       = Math.min(newComp.maxHp + (eff.maxHpBonus ?? 0), newComp.hp + eff.hpBonus); parts.push(`+${eff.hpBonus} HP`); }
        if (eff.maxHpBonus)   { newComp.maxHp    = newComp.maxHp + eff.maxHpBonus; parts.push(`+${eff.maxHpBonus} max HP`); }
      }
      const summary = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      return {
        ...prev,
        player: { ...prev.player, inventory: prev.player.inventory.filter(it => it.id !== item.id) },
        enemies: prev.enemies.map(e => e.id === companionId ? newComp : e),
        logs: [{
          id: Math.random().toString(),
          text: `🎁 ${comp.emoji} ${comp.name} absorbs ${item.emoji} ${item.name}!${summary}`,
          turn: prev.turn,
        }, ...prev.logs].slice(0, 24),
      };
    });
    setSection('main');
  };

  const handleGiftSoul = (item: EmojiItem) => {
    setGameState(prev => {
      if (!prev) return prev;
      const comp = prev.enemies.find(e => e.id === companionId);
      if (!comp) return prev;
      return {
        ...prev,
        player: { ...prev.player, inventory: prev.player.inventory.filter(it => it.id !== item.id) },
        enemies: prev.enemies.map(e =>
          e.id === companionId ? { ...e, companionSoulEmoji: item } : e
        ),
        logs: [{
          id: Math.random().toString(),
          text: `🌟 ${comp.emoji} ${comp.name} holds ${item.emoji} ${item.name} as their soul — its power flows through them!`,
          turn: prev.turn,
        }, ...prev.logs].slice(0, 24),
      };
    });
    setSection('main');
  };

  const handleBehavior = (val: Enemy['companionBehavior']) => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        enemies: prev.enemies.map(e =>
          e.id === companionId ? { ...e, companionBehavior: val } : e
        ),
      };
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const borderColor = companion.isFavoriteCompanion ? 'border-yellow-400/60' : 'border-cyan-400/40';

  // Sub-panel: heal
  if (section === 'heal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className={`bg-card border ${borderColor} rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4`}>
          <div className="text-sm font-bold text-cyan-300 mb-3">💊 Heal {companion.emoji} {companion.name}</div>
          <div className="text-xs text-muted-foreground mb-3">
            Current HP: <span className="text-white font-semibold">{companion.hp}/{companion.maxHp}</span>
          </div>
          {healItems.length === 0 ? (
            <div className="text-xs text-slate-400 italic mb-3">No healing items in your bag.</div>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto mb-3">
              {healItems.map(it => {
                const wouldHeal = Math.min(it.healAmount!, companion.maxHp - companion.hp);
                const full = companion.hp >= companion.maxHp;
                return (
                  <button
                    key={it.id}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 transition-colors ${
                      full
                        ? 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
                        : 'bg-green-500/15 border-green-500/30 text-green-200 hover:bg-green-500/25 cursor-pointer'
                    }`}
                    onClick={() => !full && handleHeal(it)}
                    disabled={full}
                  >
                    <span>{it.emoji} {it.name}</span>
                    <span className="text-green-400 font-semibold">+{wouldHeal} HP{full ? ' (full)' : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            className="w-full py-2 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-xs font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={() => setSection('main')}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // Sub-panel: give emoji for stat boost
  if (section === 'give') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className={`bg-card border ${borderColor} rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4`}>
          <div className="text-sm font-bold text-cyan-300 mb-1">🎁 Give Emoji for Stats</div>
          <div className="text-xs text-muted-foreground mb-3">The companion consumes it for a permanent boost.</div>
          {soulItems.length === 0 ? (
            <div className="text-xs text-slate-400 italic mb-3">No soul emojis in your bag.</div>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto mb-3">
              {soulItems.map(it => {
                const preview = soulEmojiStatPreview(it);
                return (
                  <button
                    key={it.id}
                    className="w-full text-left px-3 py-2 rounded-lg border bg-violet-500/15 border-violet-500/30 text-violet-200 hover:bg-violet-500/25 text-xs transition-colors cursor-pointer"
                    onClick={() => handleGiveEmoji(it)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{it.emoji} {it.name}</span>
                      {preview && <span className="text-violet-400 shrink-0">{preview}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <button
            className="w-full py-2 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-xs font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={() => setSection('main')}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // Sub-panel: gift soul emoji passive
  if (section === 'soul') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className={`bg-card border ${borderColor} rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4`}>
          <div className="text-sm font-bold text-cyan-300 mb-1">🌟 Gift Soul Emoji Passive</div>
          <div className="text-xs text-muted-foreground mb-1">One passive slot — replaces any previous gift.</div>
          {companion.companionSoulEmoji && (
            <div className="text-xs text-amber-400/80 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1 mb-3">
              Current: {companion.companionSoulEmoji.emoji} {companion.companionSoulEmoji.name}
              <span className="block text-[10px] text-amber-400/60">{companion.companionSoulEmoji.bagPassive?.description}</span>
            </div>
          )}
          {soulItems.length === 0 ? (
            <div className="text-xs text-slate-400 italic mb-3">No soul emojis in your bag.</div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto mb-3">
              {soulItems.map(it => (
                <button
                  key={it.id}
                  className="w-full text-left px-3 py-2 rounded-lg border bg-amber-500/15 border-amber-500/30 text-amber-200 hover:bg-amber-500/25 text-xs transition-colors cursor-pointer"
                  onClick={() => handleGiftSoul(it)}
                >
                  <div className="font-semibold">{it.emoji} {it.name}</div>
                  {it.bagPassive?.description && (
                    <div className="text-amber-400/70 text-[10px] mt-0.5">{it.bagPassive.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            className="w-full py-2 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-xs font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={() => setSection('main')}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // Main panel
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-card border ${borderColor} rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4`}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="text-4xl leading-none">{companion.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-cyan-300">{companion.name}</span>
              {companion.isFavoriteCompanion && <span className="text-yellow-400 text-base">⭐</span>}
              {companion.companionSoulEmoji && (
                <span title={`Soul: ${companion.companionSoulEmoji.name}`} className="text-sm">
                  {companion.companionSoulEmoji.emoji}
                </span>
              )}
            </div>
            {/* HP bar */}
            <div className="flex items-center gap-1.5 mt-1">
              <div className="flex-1 h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">{companion.hp}/{companion.maxHp}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              ATK {companion.attack} · DEF {companion.defense} · SPD {companion.speed}
            </div>
          </div>
        </div>

        {/* Combat AI behavior */}
        <div className="mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Combat Behavior</div>
          <div className="grid grid-cols-2 gap-1">
            {BEHAVIOR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                title={opt.desc}
                className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-left transition-colors ${
                  behavior === opt.value
                    ? 'bg-cyan-500/25 border-cyan-400/60 text-cyan-200'
                    : 'bg-slate-700/30 border-slate-600/30 text-slate-400 hover:bg-slate-600/30'
                }`}
                onClick={() => handleBehavior(opt.value)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-1.5">
          <button
            className={`w-full py-2 rounded-lg border text-xs font-semibold transition-colors text-left px-3 ${
              companion.isFavoriteCompanion
                ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-200 hover:bg-yellow-500/30'
                : 'bg-slate-600/20 border-slate-500/30 text-slate-300 hover:bg-slate-600/30'
            }`}
            onClick={toggleFavorite}
          >
            {companion.isFavoriteCompanion ? '⭐ Remove Favorite' : '⭐ Set as Favorite Companion'}
          </button>

          <button
            className="w-full py-2 px-3 rounded-lg border bg-green-500/15 border-green-500/30 text-green-300 text-xs font-semibold hover:bg-green-500/25 transition-colors text-left"
            onClick={() => setSection('heal')}
          >
            💊 Heal {companion.name}
            {healItems.length > 0
              ? <span className="text-green-400/70 ml-1">({healItems.length} item{healItems.length !== 1 ? 's' : ''} available)</span>
              : <span className="text-slate-500 ml-1">(none in bag)</span>
            }
          </button>

          <button
            className="w-full py-2 px-3 rounded-lg border bg-violet-500/15 border-violet-500/30 text-violet-300 text-xs font-semibold hover:bg-violet-500/25 transition-colors text-left"
            onClick={() => setSection('give')}
          >
            🎁 Give Emoji for +Stats
            {soulItems.length > 0
              ? <span className="text-violet-400/70 ml-1">({soulItems.length} available)</span>
              : <span className="text-slate-500 ml-1">(none in bag)</span>
            }
          </button>

          <button
            className="w-full py-2 px-3 rounded-lg border bg-amber-500/15 border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 transition-colors text-left"
            onClick={() => setSection('soul')}
          >
            🌟 Gift Soul Emoji Passive
            {companion.companionSoulEmoji
              ? <span className="text-amber-400/70 ml-1">(current: {companion.companionSoulEmoji.emoji})</span>
              : <span className="text-slate-500 ml-1">(none set)</span>
            }
          </button>

          <button
            className="w-full py-2 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-xs font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            Farewell 👋
          </button>
        </div>
      </div>
    </div>
  );
}

interface BearDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  bearId: string;
  stage: 'neutral' | 'friendly';
  offerId: string | null;
  onClose: () => void;
}

export function BearInteractionDialog({ gameState, setGameState, bearId, stage, offerId, onClose }: BearDialogProps) {
  const bear = gameState.enemies.find(e => e.id === bearId);
  if (!bear) return null;

  const offerItem = offerId
    ? gameState.player.inventory.find(i => i.id === offerId && !i.consumed) ?? null
    : null;

  const handleFeed = () => {
    if (!offerItem) return;
    setGameState(prev => {
      if (!prev) return prev;
      const itemIdx = prev.player.inventory.findIndex(i => i.id === offerItem.id && !i.consumed);
      if (itemIdx === -1) return prev;
      const newInventory = prev.player.inventory.filter((_, idx) => idx !== itemIdx);

      if (stage === 'neutral') {
        return {
          ...prev,
          player: { ...prev.player, inventory: newInventory },
          enemies: prev.enemies.map(e =>
            e.id === bearId ? { ...e, tag: 'Friendly' as const, engaged: false } : e
          ),
          logs: [{ id: Math.random().toString(), text: `🐻 You offer ${offerItem.emoji} ${offerItem.name} — the Bear sniffs it and mellows. It's Friendly now!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
        };
      } else {
        const recruited = Math.random() < 0.5;
        return {
          ...prev,
          player: { ...prev.player, inventory: newInventory },
          enemies: prev.enemies.map(e =>
            e.id === bearId
              ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: recruited }
              : e
          ),
          logs: [
            {
              id: Math.random().toString(),
              text: recruited
                ? `🐻 You offer ${offerItem.emoji} ${offerItem.name} — the Bear huffs happily and lumbers after you! Recruited as a companion!`
                : `🐻 You offer ${offerItem.emoji} ${offerItem.name} — the Bear gnaws contentedly. It'll stay here and guard the area. You're safe around it.`,
              turn: prev.turn,
            },
            ...prev.logs,
          ].slice(0, 24),
        };
      }
    });
    onClose();
  };

  const handleAttack = () => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        enemies: prev.enemies.map(e =>
          e.id === bearId ? { ...e, tag: 'Hostile' as const, engaged: true } : e
        ),
        logs: [{ id: Math.random().toString(), text: `🐻 The Bear ROARS — it's hostile now!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-amber-700/50 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{bear.emoji}</div>
          <div className="text-sm font-bold text-amber-400 mb-1">{bear.name}</div>
          <div className="text-xs text-amber-600/80 font-semibold mb-2 uppercase tracking-wide">
            {stage === 'neutral' ? 'Neutral' : 'Friendly'}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed italic">
            {stage === 'neutral'
              ? '"Hrumph... *sniff* *sniff*..."'
              : '"*WUFF* ...more?"'}
          </div>
          {stage === 'friendly' && (
            <div className="mt-2 text-xs text-amber-400/70 leading-snug">
              50% chance to recruit as a companion — or it stays and guards the area.
            </div>
          )}
        </div>
        <div className="space-y-2">
          <button
            className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
              offerItem
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30 cursor-pointer'
                : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
            }`}
            onClick={handleFeed}
            disabled={!offerItem}
          >
            {offerItem
              ? `${stage === 'neutral' ? 'Feed' : 'Offer'} ${offerItem.emoji} ${offerItem.name}`
              : 'No food in inventory'}
          </button>
          {stage === 'neutral' && (
            <button
              className="w-full py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-colors"
              onClick={handleAttack}
            >
              ⚔️ Attack — turns it hostile
            </button>
          )}
          <button
            className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            Back away slowly 🤫
          </button>
        </div>
      </div>
    </div>
  );
}
