import { EmojiItem } from '../game/types';
import { hasBagPassive, getStackableCumulativeLabel } from '../game/passives';
import { soulHelpText } from '../game/emojis';

interface ActivePassivesPanelProps {
  bagSlots: (EmojiItem | null)[];
}

export function ActivePassivesPanel({ bagSlots }: ActivePassivesPanelProps) {
  const passiveItems = bagSlots.filter((item): item is EmojiItem => !!(item && hasBagPassive(item)));
  if (passiveItems.length === 0) return null;
  let totalAtk = 0, totalDef = 0, totalSpd = 0, totalEva = 0, totalLck = 0, totalVis = 0;
  for (const item of passiveItems) {
    const p = item.bagPassive!;
    totalAtk += p.attackBonus   ?? 0;
    totalDef += p.defenseBonus  ?? 0;
    totalSpd += p.speedBonus    ?? 0;
    totalEva += p.evasionBonus  ?? 0;
    totalLck += p.luckBonus     ?? 0;
    totalVis += p.losBonus      ?? 0;
  }
  const statBonuses: string[] = [];
  if (totalAtk) statBonuses.push(`+${totalAtk} ATK`);
  if (totalDef) statBonuses.push(`+${totalDef} DEF`);
  if (totalSpd) statBonuses.push(`+${totalSpd} SPD`);
  if (totalEva) statBonuses.push(`+${totalEva} EVA`);
  if (totalLck) statBonuses.push(`+${totalLck} LCK`);
  if (totalVis !== 0) statBonuses.push(`${totalVis > 0 ? '+' : ''}${totalVis} VIS`);
  return (
    <div className="mt-3 bg-black/30 rounded-lg p-2.5 space-y-1.5 border border-green-900/40">
      <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_3px_rgba(74,222,128,0.8)] shrink-0" />
        Active Passives
      </div>
      {passiveItems.map(item => {
        const cumulative = getStackableCumulativeLabel(item);
        const n = item.stackCount ?? 1;
        const p = item.bagPassive!;
        const help = soulHelpText(item);
        const statParts: string[] = [];
        if (p.attackBonus)              statParts.push(`+${p.attackBonus} ATK`);
        if (p.defenseBonus)             statParts.push(`+${p.defenseBonus} DEF`);
        if (p.speedBonus)               statParts.push(`+${p.speedBonus} SPD`);
        if (p.evasionBonus)             statParts.push(`+${p.evasionBonus} EVA`);
        if (p.luckBonus)                statParts.push(`+${p.luckBonus} LCK`);
        if (p.losBonus && p.losBonus > 0) statParts.push(`+${p.losBonus} VIS`);
        if (p.losBonus && p.losBonus < 0) statParts.push(`${p.losBonus} VIS`);
        const passiveDesc = help.bagPassiveDescription ?? p.description;
        const effectLabel = cumulative
          ? (n > 1 ? `×${n} — ${cumulative}` : cumulative)
          : statParts.length > 0
            ? `${passiveDesc} [${statParts.join(', ')}]`
            : passiveDesc;
        return (
          <div key={item.id} className="flex items-start gap-1.5 text-[11px]">
            <span className="text-base leading-none shrink-0 mt-px">{item.emoji}</span>
            <span className="text-muted-foreground/70 leading-tight">{effectLabel}</span>
          </div>
        );
      })}
      {statBonuses.length > 0 && (
        <div className="pt-1.5 border-t border-border/20 flex flex-wrap gap-1">
          {statBonuses.map(b => (
            <span key={b} className="text-[10px] text-emerald-400/80 font-semibold bg-emerald-900/20 border border-emerald-800/30 px-1.5 py-0.5 rounded">{b}</span>
          ))}
        </div>
      )}
    </div>
  );
}
