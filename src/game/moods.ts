import { MoodType } from './types';

export const COWBOY_MOOD_FLOOR = 40;

export const MOODS: Record<MoodType, { emoji: string; name: string; description: string }> = {
  happy:      { emoji: '😊', name: 'Gleeful Killer',   description: '+20% damage, 10% chance to attack twice' },
  very_happy: { emoji: '😄', name: 'Euphoric Warrior',  description: '+30% damage, +10% dodge' },
  sad:        { emoji: '😢', name: 'Tearful Fighter',   description: '-20% accuracy, 15% flee chance' },
  crying:     { emoji: '😭', name: 'Weeping Wreck',     description: '-30% accuracy, 25% flee, +10% defense' },
  angry:      { emoji: '😡', name: 'Rage Mode',         description: '+40% damage, take 10% more damage' },
  scared:     { emoji: '😨', name: 'Terrified',         description: '-10% attack, +20% dodge' },
  confident:  { emoji: '💪', name: 'Determined',        description: '+10% all stats' },
  desperate:  { emoji: '🥺', name: 'Last Stand',        description: 'At ≤2 HP: +50% damage' },
  neutral:    { emoji: '😐', name: 'Composed',           description: 'No modifiers' },
  excited:    { emoji: '🤩', name: 'Hyped',             description: '+15% crit, +10% speed' },
  confused:   { emoji: '😵', name: 'Disoriented',       description: '10% chance to move wrong way' },
  in_love:    { emoji: '😍', name: 'Lovestruck',        description: '5% chance to not attack' },
};

export function getMood(
  moodValue: number,
  hp: number,
  maxHp: number,
  inventorySize: number,
  isCowboy = false,
  moodFloorBonus = 0,
): MoodType {
  const hpRatio = maxHp > 0 ? hp / maxHp : 1;

  if (!isCowboy) {
    // Below 20% HP: desperate or crying depending on mood
    if (hpRatio <= 0.2) {
      return moodValue < -20 ? 'crying' : 'desperate';
    }
  }

  // HP ratio shifts the effective mood value:
  //  - below 50% HP: up to -40 pressure at near-death
  //  - above 50% HP: up to +15 bonus at full health
  const hpMoodShift = hpRatio < 0.5
    ? -40 * (1 - hpRatio / 0.5)   // -40 at 0%, 0 at 50%
    : +15 * ((hpRatio - 0.5) / 0.5); // 0 at 50%, +15 at 100%

  let effective = moodValue + hpMoodShift;

  if (isCowboy) {
    // Cowboy mood floor: never drops below Happy threshold
    effective = Math.max(COWBOY_MOOD_FLOOR + Math.max(0, moodFloorBonus), effective);
  } else {
    if (inventorySize === 0 && hpRatio < 0.5) return 'scared';
  }

  if (inventorySize >= 10 && effective > 20) return 'confident';

  if (effective >= 80) return 'very_happy';
  if (effective >= 40) return 'happy';
  if (effective >= 15) return 'excited';
  if (effective <= -80) return 'crying';
  if (effective <= -40) return 'sad';
  if (effective <= -15) return 'angry';

  return 'neutral';
}
