import { RARITY_LABEL, RARITY_TEXT_CLASS, rarityOfItem, type DropIdentity } from '../game/dropTable';

export function RarityLabel({ item, className = '' }: { item: DropIdentity; className?: string }) {
  const rarity = rarityOfItem(item);
  if (!rarity) return null;
  return (
    <span className={`font-semibold uppercase tracking-wide ${RARITY_TEXT_CLASS[rarity]} ${className}`}>
      {RARITY_LABEL[rarity]}
    </span>
  );
}
