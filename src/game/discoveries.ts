const EMOJI_KEY = 'emojirl_seen_emojis';
const ENEMY_KEY = 'emojirl_seen_enemies';
const KILL_COUNT_KEY = 'emojirl_kill_counts';

/** Normalize composed emoji (e.g. 🐦‍⬛) so storage and lookups stay consistent. */
export function normalizeEmojiKey(emoji: string): string {
  return emoji.normalize('NFC');
}

export function markEmojiSeen(emoji: string): void {
  try {
    const key = normalizeEmojiKey(emoji);
    const seen = new Set<string>(JSON.parse(localStorage.getItem(EMOJI_KEY) ?? '[]').map(normalizeEmojiKey));
    if (!seen.has(key)) {
      seen.add(key);
      localStorage.setItem(EMOJI_KEY, JSON.stringify([...seen]));
    }
  } catch { /* ignore quota/parse errors */ }
}

export function markEnemySeen(emoji: string): void {
  try {
    const key = normalizeEmojiKey(emoji);
    const seen = new Set<string>(JSON.parse(localStorage.getItem(ENEMY_KEY) ?? '[]').map(normalizeEmojiKey));
    if (!seen.has(key)) {
      seen.add(key);
      localStorage.setItem(ENEMY_KEY, JSON.stringify([...seen]));
    }
  } catch { /* ignore quota/parse errors */ }
}

export function getSeenEmojis(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(EMOJI_KEY) ?? '[]').map(normalizeEmojiKey));
  }
  catch { return new Set(); }
}

export function getSeenEnemies(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(ENEMY_KEY) ?? '[]').map(normalizeEmojiKey));
  }
  catch { return new Set(); }
}

export function markEnemyKilled(emoji: string): void {
  try {
    const key = normalizeEmojiKey(emoji);
    const counts: Record<string, number> = JSON.parse(localStorage.getItem(KILL_COUNT_KEY) ?? '{}');
    const migrated: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) migrated[normalizeEmojiKey(k)] = v;
    migrated[key] = (migrated[key] ?? 0) + 1;
    localStorage.setItem(KILL_COUNT_KEY, JSON.stringify(migrated));
  } catch { /* ignore quota/parse errors */ }
}

export function getEnemyKillCounts(): Record<string, number> {
  try {
    const counts: Record<string, number> = JSON.parse(localStorage.getItem(KILL_COUNT_KEY) ?? '{}');
    const migrated: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) migrated[normalizeEmojiKey(k)] = v;
    return migrated;
  }
  catch { return {}; }
}
