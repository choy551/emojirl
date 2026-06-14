import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Lock } from "lucide-react";
import { EMOJI_POWERS } from "../game/emojis";
import { ENEMY_TYPES } from "../game/enemies";
import { CHARACTER_CLASSES } from "../game/classes";
import {
  getSeenEmojis,
  getSeenEnemies,
  getEnemyKillCounts,
} from "../game/discoveries";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-xs font-mono text-foreground">
      {children}
    </kbd>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  );
}

export default function HowToPlay({
  onBack,
  killCounts,
}: {
  onBack?: () => void;
  killCounts?: Record<string, number>;
}) {
  const [seenEmojis, setSeenEmojis] = useState<Set<string>>(new Set());
  const [seenEnemies, setSeenEnemies] = useState<Set<string>>(new Set());
  const [allTimeKills, setAllTimeKills] = useState<Record<string, number>>({});
  const [, setLocation] = useLocation();

  useEffect(() => {
    setSeenEmojis(getSeenEmojis());
    setSeenEnemies(getSeenEnemies());
    if (!killCounts) setAllTimeKills(getEnemyKillCounts());
  }, [killCounts]);

  const displayKills = killCounts ?? allTimeKills;
  const killsLabel = killCounts ? "this run" : "all time";

  // Esc acts as a back button. When used in-game (onBack provided), the
  // parent game handles Esc itself — skip here to avoid double-fire.
  useEffect(() => {
    if (onBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLocation("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, setLocation]);

  const seenEmojiCount = EMOJI_POWERS.filter((e) =>
    seenEmojis.has(e.emoji),
  ).length;
  const seenEnemyCount = ENEMY_TYPES.filter((e) =>
    seenEnemies.has(e.emoji),
  ).length;

  return (
    <div className="min-h-screen w-full max-w-2xl mx-auto p-6 space-y-10 pb-16">
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack ? (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="w-6 h-6" />
          </Button>
        ) : (
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-6 h-6" />
            </Button>
          </Link>
        )}
        <h1 className="text-3xl font-bold text-primary">RTFM 📖</h1>
      </div>

      {/* Basics */}
      <Section title="The Basics">
        <p className="text-muted-foreground leading-relaxed">
          Descend through procedurally generated dungeon floors. Pick up emoji
          powers to boost your stats. If your emoji bag empties completely, you
          take 1 damage every turn (scaling to your current floor depth, so 5
          damage at floor 5!) until you find an emoji — so always keep at least
          one! Bump into enemies to attack. Reach the stairs{" "}
          <span className="text-lg">🔽</span> to descend deeper.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Your <strong className="text-foreground">Mood</strong> affects combat
          — a happy adventurer hits harder, dodges more, and lands crits. Taking
          damage, fleeing, and losing items all hurt your mood. Finding items,
          defeating enemies, and levelling up lift it.
        </p>
      </Section>

      {/* Stats */}
      <Section title="Stats Explained">
        <div className="space-y-2 text-sm">
          {[
            {
              label: "❤️ HP",
              color: "text-red-400",
              desc: "Hit Points — reach 0 and it's over. Healed by food, shrines, campfires, and resting. The 🍺 bar can temporarily boost you above your max HP (overheal); the excess decays by 1 per 5 turns.",
            },
            {
              label: "⚔️ ATK",
              color: "text-orange-400",
              desc: "Attack — your base melee damage. Final hit = ATK × mood modifier − enemy DEF (minimum 1). Crits double the pre-defence damage. Surprise attacks deal ×1.6 ATK. Some classes get multi-hit combos at higher ATK.",
            },
            {
              label: "🛡️ DEF",
              color: "text-sky-400",
              desc: "Defence — reduces incoming damage. Formula: damage taken = max(1, enemy ATK − ⌊DEF ÷ 2⌋). DEF is halved before subtracting, so every 2 points removes 1 damage. There is no hard cap.",
            },
            {
              label: "💨 SPD",
              color: "text-green-400",
              desc: "Speed — if an enemy's speed exceeds yours, it strikes twice per turn (the extra hit follows a normal damage roll). Also widens enemy detection range slightly. Matching or exceeding enemy speed prevents double-hits.",
            },
            {
              label: "🎯 EVA",
              color: "text-violet-400",
              desc: (
                <>
                  Evasion — percentage chance to dodge an incoming attack entirely.{" "}
                  <strong className="text-foreground">Cap: 75% for Ninja 🥷, 50% for all other classes.</strong>{" "}
                  Ninja EVA also scales with level (+1% per level, up to +25%) and spikes at low HP (base jumps from 25% → 45% below 40% HP). Mood and gear can push any class toward the cap.
                </>
              ),
            },
            {
              label: "🍀 LCK",
              color: "text-yellow-400",
              desc: "Luck — directly adds to your crit chance. Base crit = 5% + LCK + mood bonus. A lucky character lands critical hits that deal double damage much more often. Also subtly improves loot quality.",
            },
            {
              label: "🔮 MP",
              color: "text-blue-400",
              desc: "Mana Points — Wizard 🧙 only. Spells cost MP; it regenerates by 1 every 2 turns. Running dry prevents spellcasting until it refills.",
            },
          ].map(({ label, color, desc }) => (
            <div
              key={label}
              className="bg-card/50 border border-border/40 rounded-lg px-3 py-2.5 flex gap-3"
            >
              <span className={`font-bold shrink-0 w-16 ${color}`}>{label}</span>
              <span className="text-muted-foreground leading-relaxed">{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Controls */}
      <Section title="Controls">
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Movement
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <Kbd>←</Kbd>
                <Kbd>→</Kbd>
                <span className="text-muted-foreground">or</span>
                <Kbd>W</Kbd>
                <Kbd>A</Kbd>
                <Kbd>S</Kbd>
                <Kbd>D</Kbd>
                <span className="text-muted-foreground">
                  — move (4 directions)
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Kbd>Numpad 1–9</Kbd>
                <span className="text-muted-foreground">
                  — move (8 directions, including diagonals)
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Kbd>Z</Kbd>
                <span className="text-muted-foreground">or</span>
                <Kbd>Numpad 5</Kbd>
                <span className="text-muted-foreground">
                  — wait 1 turn / rest (heals +1 HP; +2 near campfire or restaurant). Click your own tile to wait.
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Items &amp; Bag
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Kbd>H</Kbd>
                <span className="text-muted-foreground">
                  — use heal consumable (apple, potion, etc.)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>1</Kbd>–<Kbd>9</Kbd>
                <span className="text-muted-foreground">
                  — activate emoji soul or use hotbar item (1–9)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>B</Kbd>
                <span className="text-muted-foreground">
                  — open full Bag (Hotbar / Equipment / Bank tabs). Inside: arrows/WASD/numpad to navigate, Tab to switch tabs, Enter/Space to act or assign, 1–9 to quick-assign selected to hotbar.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>F</Kbd>
                <span className="text-muted-foreground">
                  — cook raw food at a nearby campfire (turns into stronger cooked version)
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Tactics &amp; Class Abilities
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Kbd>T</Kbd>
                <span className="text-muted-foreground">
                  — open tactics menu (class-specific abilities &amp; modes). Use number keys 1–4 inside the menu:
                </span>
              </div>
              <div className="ml-4 text-xs text-muted-foreground space-y-0.5">
                • <strong>Wizard 🧙</strong>: 1 nearest / 2 furthest / 3 manual / 4 hold-fire (Arcane Barrage tactics)<br />
                • <strong>Ninja 🥷</strong>: 1 enter Blink target mode / 2–3 stealth modes / 4 toggle auto-stealth<br />
                • <strong>Ranger 🧝</strong>: 1 ranged / 2 melee / 3 flee (Trailblaze)<br />
                • <strong>Cowboy 🤠</strong>: 1 yeehaw tactics (special flavor/ability)
              </div>
              <div className="flex items-center gap-2">
                <Kbd>X</Kbd>
                <span className="text-muted-foreground">
                  — Ninja only: activate Blink Strike (teleport &amp; 2× strike, 8t cooldown). Instakilling resets the cooldown to 0 — chain up to 3 instakills in a row for instant resets, then each further instakill gives a reduced 3t cooldown instead. Regular kills reduce to 7t; missing gives full 8t. The instakill chain (2/3 or 3/3) fades back to 0 after 10 turns out of combat.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Tab</Kbd>
                <Kbd>Shift+Tab</Kbd>
                <span className="text-muted-foreground">
                  — cycle ranged attack target (Wizard / Ranger / Cowboy dual pistols) or inspect nearest enemy. Also used for navigation/cycling inside menus and bank.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>I</Kbd>
                <span className="text-muted-foreground">
                  — (with Tab) inspect nearest visible enemy or cycle targets
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Exploration & Info
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Kbd>O</Kbd>
                <span className="text-muted-foreground">or</span>
                <Kbd>Numpad +</Kbd>
                <span className="text-muted-foreground">
                  — toggle autoexplore
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>R</Kbd>
                <span className="text-muted-foreground">
                  — toggle auto-rest (heals passively until full HP)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Tab</Kbd>
                <span className="text-muted-foreground">or</span>
                <Kbd>I</Kbd>
                <span className="text-muted-foreground">
                  — inspect nearest enemy (keyboard)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Shift+Tab</Kbd>
                <span className="text-muted-foreground">
                  — cycle to previous enemy / target (also nav in bank modal)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>/</Kbd>
                <span className="text-muted-foreground">or</span>
                <Kbd>Numpad /</Kbd>
                <span className="text-muted-foreground">
                  — toggle combat log
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <span className="text-muted-foreground">
                  — close menus, cancel modes (inspect, blink target, direction pick, etc.), or open pause menu
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>C</Kbd>
                <span className="text-muted-foreground">
                  — close adjacent open door
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            <strong>Special modes:</strong> When using bombs, guns, boomerang, rope, or freeze (from hotbar 1–9 or tactics), you enter direction-pick mode — use any movement keys (arrows/WASD/numpad) to fire in that direction. Esc cancels.
          </div>

          <div className="text-xs text-muted-foreground mt-1">
            <strong>Companions (recruited adventurers):</strong> Bump into them (move into their tile) to swap places — very useful in 1×1 hallways to avoid blocking/soft-locks. They follow you, fight hostiles, and can be commanded somewhat via the bag.
          </div>
        </div>
      </Section>

      {/* Tiles */}
      <Section title="Tiles">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { icon: "⬛", label: "Wall", desc: "Solid — cannot pass through" },
            { icon: "⬜", label: "Floor", desc: "Walkable open ground" },
            {
              icon: "🕳️",
              label: "Stairs Down",
              desc: "Descend to the next floor",
            },
            {
              icon: "🛕",
              label: "Shrine",
              desc: "Heals HP and raises max HP when stepped on (scales with floor depth). One use per shrine.",
            },
            { icon: "🏪", label: "Shop", desc: "Buy emojis, equipment, and ammo with 💰 gold. Sell anything from your bag or bank for gold too. Autoexplore stops here automatically." },
            { icon: "🏪🔥", label: "Restaurant", desc: "A food-only shop. Buy and cook food, rest for +2 extra HP nearby, and sell cooked food for 250% value. You can sell up to 5 cooked dishes — the kitchen closes after that (no more selling or cooking there), but the +2 HP/turn rest bonus remains. Warning: the food smell draws nearby enemies (+2 aggro range). Autoexplore stops here." },
            { icon: "🍺", label: "Bar", desc: "Spend 15 XP for an instant HP restore from the innkeeper. Won't work if you're already at full health or have fewer than 15 XP." },
            {
              icon: "🔥",
              label: "Campfire",
              desc: "Found in forest rooms. Stand nearby and press F to cook raw food into powerful cooked versions. Resting nearby heals +2 extra HP per turn.",
            },
            { icon: "📦", label: "Ammo Cache", desc: "Special shop tile (📦). Re-interact (z/Enter/Space on the tile) for class-specific ammo resupply before bosses." },
          ].map((t) => (
            <div
              key={t.label}
              className="flex items-start gap-2 bg-card/50 rounded-lg p-2 border border-border/40"
            >
              <span className="text-2xl shrink-0">{t.icon}</span>
              <div>
                <div className="font-bold">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          <strong>Dungeon Pressure:</strong> Increases on deeper floors — nearby enemies get permanent stat bonuses (watch for on-screen warnings). <strong>Vaults &amp; special rooms:</strong> Use rope (from hotbar or tactics) to safely enter. Treasure vaults offer big rewards (risk of traps); monster dens are extra dangerous. Autoexplore stops at shops, restaurants, and bars.
        </div>
      </Section>

      {/* Classes */}
      <Section title="Classes">
        <div className="space-y-3">
          {Object.entries(CHARACTER_CLASSES).map(([emoji, cls]) => (
            <div
              key={emoji}
              className="bg-card/50 border border-border/50 rounded-xl p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{emoji}</span>
                <div>
                  <div className="font-bold">{cls.name}</div>
                  <div className="text-xs text-muted-foreground italic">
                    {cls.tagline}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs mb-3">
                {[
                  { label: "HP", value: cls.baseStats.hp },
                  { label: "ATK", value: cls.baseStats.attack },
                  { label: "DEF", value: cls.baseStats.defense },
                  { label: "SPD", value: cls.baseStats.speed },
                  { label: "EVA", value: `${cls.baseStats.evasion}%` },
                  { label: "LCK", value: cls.baseStats.luck },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex justify-between bg-secondary/20 px-2 py-1 rounded"
                  >
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-bold">{s.value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {cls.passives.map((p) => (
                  <div key={p.label} className="flex gap-2 text-xs">
                    <span className="text-primary shrink-0 font-bold">◆</span>
                    <div>
                      <span className="font-semibold text-foreground">
                        {p.label}:{" "}
                      </span>
                      <span className="text-muted-foreground">{p.detail}</span>
                    </div>
                  </div>
                ))}
                {cls.active && (
                  <div className="flex gap-2 text-xs">
                    <span className="text-violet-400 shrink-0 font-bold">⚡</span>
                    <div>
                      <span className="font-semibold text-violet-300">
                        {cls.active.label}{" "}
                      </span>
                      <span className="text-violet-400/60 text-[10px]">(active · X / T→1)</span>
                      <span className="text-muted-foreground">: {cls.active.detail}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Emoji Powers */}
      <Section
        title={`Emoji Powers — ${seenEmojiCount} / ${EMOJI_POWERS.length} discovered`}
      >
        <p className="text-xs text-muted-foreground">
          Pick up soul emojis to permanently boost your stats. Discover them by
          finding them in the dungeon.
        </p>
        <div className="space-y-2">
          {EMOJI_POWERS.map((power) => {
            const seen = seenEmojis.has(power.emoji);
            return (
              <div
                key={power.emoji}
                className={`flex items-start gap-3 rounded-lg p-2 border transition-colors ${seen ? "bg-card/60 border-border/50" : "bg-card/20 border-border/20 opacity-60"}`}
              >
                <span
                  className={`text-2xl shrink-0 mt-0.5 ${seen ? "" : "grayscale"}`}
                >
                  {power.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  {seen ? (
                    <>
                      <div className="font-semibold text-sm">{power.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {power.description}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground/50 italic">
                        Not yet encountered
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Stacking Emojis */}
      <Section title="Stacking Emojis">
        <p className="text-xs text-muted-foreground mb-3">
          Most bag passives are{" "}
          <strong className="text-foreground">non-stackable</strong> — carrying
          a second copy auto-routes it to your bank with a{" "}
          <em>"Extra → Bank (already carried)"</em> notice. But several emojis are
          designed to <strong className="text-foreground">stack</strong>: each
          extra copy in your bag (up to a per-emoji cap) makes the passive effect stronger.
        </p>
        <div className="space-y-2">
          {[
            {
              emoji: "❤️",
              name: "Heart",
              effect: "Vampiric",
              detail:
                "+1 HP restored on melee hit per copy (cap 5). Five hearts = +5 HP healed per hit.",
              color: "text-rose-400",
            },
            {
              emoji: "🦋",
              name: "Butterfly",
              effect: "Dodge Heal",
              detail:
                "+1 HP restored on successful dodge per copy (cap 5). Two butterflies = +2 HP per dodge.",
              color: "text-purple-400",
            },
            {
              emoji: "🗡️",
              name: "Dagger",
              effect: "Ninja Combo",
              detail:
                "25% base chance of a bonus ¼-power strike; +15% per copy (cap 4 → 80% max). Two daggers ≈ 40% chance.",
              color: "text-slate-300",
            },
            {
              emoji: "🌊",
              name: "Wave",
              effect: "Combat Regen",
              detail:
                "+1 HP per turn (even during combat) per copy (cap 5). Two waves = +2 HP regen every enemy turn.",
              color: "text-cyan-400",
            },
            {
              emoji: "🛡️",
              name: "Shield",
              effect: "Shield Wall",
              detail:
                "−1 incoming damage per copy (min 1). Three shields = −3 damage every hit.",
              color: "text-blue-400",
            },
            {
              emoji: "🍄",
              name: "Mushroom",
              effect: "Heal on Kill",
              detail:
                "+1 HP restored per enemy killed, per copy. Three mushrooms = +3 HP per kill.",
              color: "text-emerald-400",
            },
            {
              emoji: "🍀",
              name: "Clover",
              effect: "Bonus Loot",
              detail:
                "Enemy drop chance rises by +15% per copy (base 55%, capped at 95%). Two clovers ≈ 85% drops.",
              color: "text-lime-400",
            },
            {
              emoji: "💊",
              name: "Pill",
              effect: "Regeneration",
              detail:
                "Regen interval shrinks by 1 turn per copy: 1 pill = every 5 turns, 2 = every 4, 3 = every 3, up to every turn.",
              color: "text-teal-400",
            },
            {
              emoji: "💎",
              name: "Diamond",
              effect: "Thorns",
              detail:
                "Reflects 1 damage back per copy when an enemy hits you. Two diamonds = 2 thorns damage per melee hit.",
              color: "text-cyan-400",
            },
          ].map((s) => (
            <div
              key={s.emoji}
              className="flex items-start gap-3 bg-card/50 rounded-lg p-3 border border-border/40"
            >
              <span className="text-2xl shrink-0">{s.emoji}</span>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded bg-secondary/40 ${s.color}`}
                  >
                    {s.effect}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {s.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Visual cues for emoji counts in your hotbar, bag, and sidebar:
        </p>
        <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc list-inside">
          <li>
            <span className="text-emerald-400 font-bold">Green ×N</span> — This is a{" "}
            <strong>stackable</strong> passive emoji. Multiple copies in your bag each
            provide extra/compounding benefit. The number shows how many are currently
            active (up to the emoji’s cap).
          </li>
          <li>
            <span className="text-sky-400 font-bold">Blue +N</span> (or xN) next to a
            hotbar emoji — You have a <strong>non-stackable</strong> copy in your hotbar
            plus one or more extras in the Bank. You can safely consume/eat the hotbar
            version for its one-time stat boost; the bank copy will remain to provide
            the passive bag effect.
          </li>
        </ul>
      </Section>

      {/* Enemies */}
      <Section
        title={`Bestiary — ${seenEnemyCount} / ${ENEMY_TYPES.length} encountered`}
      >
        <p className="text-xs text-muted-foreground">
          Enemies are revealed when you fight them. Hover or inspect enemies
          in-game to see their stats.
        </p>

        {/* Trait badge legend */}
        <div className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Enemy Traits
          </div>

          {/* Mob Tag System */}
          <div className="mb-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Mob Tags</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                <span className="text-base">⚔️</span>
                <div>
                  <div className="font-semibold text-red-300 text-xs">Hostile</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Hunts you on sight. Default for most enemies.</div>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-teal-500/10 border border-teal-500/20 rounded-lg p-2.5">
                <span className="text-base">🤝</span>
                <div>
                  <div className="font-semibold text-teal-300 text-xs">Neutral</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Won't attack unless provoked — but fights back if you hit first.</div>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-pink-500/10 border border-pink-500/20 rounded-lg p-2.5">
                <span className="text-base">💗</span>
                <div>
                  <div className="font-semibold text-pink-300 text-xs">Friendly</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Never attacks. Bump into them to interact.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              {
                badge: "🔥",
                color: "bg-red-500/15 border-red-500/30 text-red-300",
                label: "Berserker",
                desc: "Red tint. Attacks twice per turn — kill it fast.",
              },
              {
                badge: "🔗",
                color: "bg-green-500/15 border-green-500/30 text-green-300",
                label: "Pack Hunter",
                desc: "Green tint. Gains +1 ATK per nearby ally — split them up.",
              },
              {
                badge: "🔇",
                color: "bg-slate-500/15 border-slate-500/30 text-slate-300",
                label: "Silent",
                desc: "Top-left badge. Won't call allies for help when it spots you.",
              },
              {
                badge: "🟦",
                color: "bg-blue-500/15 border-blue-500/30 text-blue-300",
                label: "Cowardly",
                desc: "Blue tile tint, no badge. Flees when HP drops below 30%.",
              },
              {
                badge: "✨",
                color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
                label: "God-blessed",
                desc: "Gold tint + ✨ badge. Instakill immunity: any hit that would kill it instead drops it to 1 HP, triggers an auto-hit counter for 150% damage, and inspires nearby allies to deal 125% damage on their next attack. Kill everything else first.",
              },
              {
                badge: "👻",
                color: "bg-purple-500/15 border-purple-500/30 text-purple-300",
                label: "Ghostly",
                desc: "Every attack — hit or miss — drains 1 mood point from you. Even dodging a ghost wears you down over time.",
              },
              {
                badge: "🧑‍🔬",
                color: "bg-green-500/15 border-green-500/30 text-green-300",
                label: "Healer",
                desc: "Heals injured allies in LOS every 3 turns instead of attacking. Always flees. Kill the healer first.",
              },
              {
                badge: "🌊",
                color: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
                label: "Water Aggro",
                desc: "Neutral — ignores you until you step near or onto water, then turns hostile. Avoid water tiles near Mermen.",
              },
              {
                badge: "🐒",
                color: "bg-amber-500/15 border-amber-500/30 text-amber-300",
                label: "Thief",
                desc: "Neutral — but steals a soul emoji from your bag each turn you stand adjacent. Provoke it and it fights back with your own stolen power. Kill it to reclaim your emojis.",
              },
              {
                badge: "🏹",
                color: "bg-orange-500/15 border-orange-500/30 text-orange-300",
                label: "Ranged",
                desc: "Can attack from a distance if it has line of sight (supports any direction, not just up/down/left/right).",
              },
              {
                badge: "✨",
                color: "bg-violet-500/15 border-violet-500/30 text-violet-300",
                label: "Echo",
                desc: "Violet tint + ✨ ECHO badge. A faded echo of a past boss — diminished but still deadly. Appears on deeper floors (5+) as a rare surprise encounter. Stat card and combat log will warn you when you spot one.",
              },
            ].map((t) => (
              <div key={t.label} className="flex items-start gap-2">
                <span
                  className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${t.color}`}
                >
                  <span>{t.badge}</span>
                  <span className="font-semibold">{t.label}</span>
                </span>
                <span className="text-xs text-muted-foreground leading-tight pt-0.5">
                  {t.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {ENEMY_TYPES.map((enemy) => {
            const seen = seenEnemies.has(enemy.emoji);
            return (
              <div
                key={enemy.emoji}
                className={`flex items-center gap-3 rounded-lg p-2.5 border transition-colors ${seen ? "bg-card/60 border-border/50" : "bg-card/20 border-border/20 opacity-60"}`}
              >
                <span
                  className={`text-2xl shrink-0 ${seen ? "" : "grayscale"}`}
                >
                  {enemy.emoji}
                </span>
                {seen ? (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {enemy.name}
                      </span>
                      {(displayKills[enemy.emoji] ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground/70 tabular-nums">
                          ⚔️ {displayKills[enemy.emoji]} defeated{" "}
                          <span className="opacity-50">({killsLabel})</span>
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>❤️ {enemy.hp} HP</span>
                      <span>⚔️ {enemy.attack} ATK</span>
                      <span>🛡️ {enemy.defense} DEF</span>
                      <span>💨 {enemy.speed} SPD</span>
                    </div>
                    {(("silent" in enemy && enemy.silent) ||
                      ("packHunter" in enemy && enemy.packHunter) ||
                      ("berserker" in enemy && enemy.berserker) ||
                      ("cowardly" in enemy && enemy.cowardly) ||
                      ("godBlessed" in enemy && enemy.godBlessed) ||
                      ("ghostly" in enemy && enemy.ghostly) ||
                      ("madScientist" in enemy && enemy.madScientist) ||
                      ("waterAggro" in enemy && enemy.waterAggro) ||
                      ("monkey" in enemy && enemy.monkey) ||
                      ("ranged" in enemy && enemy.ranged) ||
                      ("tag" in enemy && (enemy.tag === 'Neutral' || enemy.tag === 'Friendly'))) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {"berserker" in enemy && enemy.berserker && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/25">
                            <span>🔥</span>
                            <span className="font-semibold text-red-300">
                              Berserker
                            </span>
                            <span className="text-muted-foreground">
                              — attacks twice
                            </span>
                          </span>
                        )}
                        {"cowardly" in enemy && enemy.cowardly && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/25">
                            <span>🏃</span>
                            <span className="font-semibold text-yellow-300">
                              Cowardly
                            </span>
                            <span className="text-muted-foreground">
                              — flees when low HP
                            </span>
                          </span>
                        )}
                        {"packHunter" in enemy && enemy.packHunter && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25">
                            <span>🐺</span>
                            <span className="font-semibold text-purple-300">
                              Pack Hunter
                            </span>
                            <span className="text-muted-foreground">
                              — stronger with allies
                            </span>
                          </span>
                        )}
                        {"silent" in enemy && enemy.silent && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-500/15 border border-slate-500/25">
                            <span>🤫</span>
                            <span className="font-semibold text-slate-300">
                              Silent
                            </span>
                            <span className="text-muted-foreground">
                              — never calls for backup
                            </span>
                          </span>
                        )}
                        {"godBlessed" in enemy && enemy.godBlessed && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/25">
                            <span>✨</span>
                            <span className="font-semibold text-yellow-300">
                              God-blessed
                            </span>
                            <span className="text-muted-foreground">
                              — instakill immunity
                            </span>
                          </span>
                        )}
                        {"tag" in enemy && enemy.tag === 'Neutral' && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/25">
                            <span>🤝</span>
                            <span className="font-semibold text-teal-300">
                              Neutral
                            </span>
                            <span className="text-muted-foreground">
                              — won't attack unless provoked
                            </span>
                          </span>
                        )}
                        {"tag" in enemy && enemy.tag === 'Friendly' && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/25">
                            <span>💗</span>
                            <span className="font-semibold text-pink-300">
                              Friendly
                            </span>
                            <span className="text-muted-foreground">
                              — bump to interact
                            </span>
                          </span>
                        )}
                        {"ghostly" in enemy && enemy.ghostly && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25">
                            <span>👻</span>
                            <span className="font-semibold text-purple-300">
                              Ghostly
                            </span>
                            <span className="text-muted-foreground">
                              — drains mood each attack
                            </span>
                          </span>
                        )}
                        {"madScientist" in enemy && enemy.madScientist && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/25">
                            <span>🧑‍🔬</span>
                            <span className="font-semibold text-green-300">
                              Healer
                            </span>
                            <span className="text-muted-foreground">
                              — heals allies, always flees
                            </span>
                          </span>
                        )}
                        {"waterAggro" in enemy && enemy.waterAggro && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/25">
                            <span>🌊</span>
                            <span className="font-semibold text-cyan-300">
                              Water Aggro
                            </span>
                            <span className="text-muted-foreground">
                              — hostile near water tiles
                            </span>
                          </span>
                        )}
                        {"monkey" in enemy && enemy.monkey && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25">
                            <span>🐒</span>
                            <span className="font-semibold text-amber-300">
                              Thief
                            </span>
                            <span className="text-muted-foreground">
                              — steals your soul emojis
                            </span>
                          </span>
                        )}
                        {"ranged" in enemy && enemy.ranged && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25">
                            <span>🏹</span>
                            <span className="font-semibold text-orange-300">
                              Ranged
                            </span>
                            <span className="text-muted-foreground">
                              — shoots from any LOS
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground/50 italic">
                      Not yet encountered
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Mood */}
      <Section title="Mood System">
        <p className="text-xs text-muted-foreground mb-3">
          Your mood shifts constantly and directly affects combat performance.
        </p>
        <div className="space-y-1.5 text-sm">
          {[
            {
              emoji: "😄",
              name: "Very Happy",
              effect: "+crit chance, +damage, +evasion",
            },
            { emoji: "🙂", name: "Happy", effect: "Slight combat bonus" },
            { emoji: "😐", name: "Neutral", effect: "No bonus or penalty" },
            {
              emoji: "😠",
              name: "Angry",
              effect: "Slightly reduced performance",
            },
            {
              emoji: "😢",
              name: "Sad",
              effect: "Reduced hit chance and damage",
            },
            { emoji: "😨", name: "Scared", effect: "May flee from combat" },
            {
              emoji: "💀",
              name: "Desperate",
              effect: "High flee chance, severely reduced stats",
            },
          ].map((m) => (
            <div
              key={m.name}
              className="flex items-center gap-3 bg-card/30 rounded-lg px-3 py-1.5 border border-border/30"
            >
              <span className="text-xl shrink-0">{m.emoji}</span>
              <div className="flex-1">
                <span className="font-semibold">{m.name}</span>
                <span className="text-muted-foreground text-xs ml-2">
                  — {m.effect}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
