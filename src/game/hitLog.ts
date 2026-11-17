export interface HitComponent {
  name: string;
  damage: number;
  crit?: boolean;
  /** Override the shared target when a swing hits someone else. */
  target?: string;
  /** Existing one-hit log, used only when this is the only component. */
  solo?: string;
}

/** One line for two or more hits. A lone hit keeps its old log, via `solo`. */
export function formatHitBreakdown(parts: HitComponent[], target = ''): string | null {
  const hits = parts.filter(part => part.damage > 0);
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0].solo ?? null;
  const who = (part: HitComponent) => part.target ?? target;
  const same = hits.every(part => who(part) === who(hits[0]));
  const bit = (part: HitComponent) => `${part.name} ${part.damage}${part.crit ? ' crit' : ''}`;
  if (same) {
    const total = hits.reduce((sum, part) => sum + part.damage, 0);
    return `${hits.map(bit).join(' + ')} = ${total} to ${who(hits[0])}`;
  }
  return hits.map(part => `${bit(part)} to ${who(part)}`).join(' + ');
}
