
```markdown
# EmojiRL

_A cute & casual roguelike where emoji are the tilesets **and** the core gameplay mechanic :)_

Your emoji collection *is* your soul. Collect, equip, and strategically store emojis that grant powers, passives, and stats as you descend through procedurally generated floors.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm serve
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Tech Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS** + shadcn/ui components
- **wouter** for client-side routing
- Fully client-side (no backend required)
- Persistence via `localStorage`

## Key Features

- **Emoji as Core Identity** — Emojis are not just visual. They function as equipment, passive bonuses (when kept in your bag), and active abilities.
- **4 Equipment Slots** — Body, Main Hand, Off Hand, and Accessory. Strategic inventory management is central to gameplay.
- **4 Unique Classes**:
  - 🧙 **Wizard** — Ranged autobattler with powerful area abilities
  - 🥷 **Ninja** — High mobility and stealth mechanics
  - 🧝 **Ranger** — Ranged specialist with ammo and survival mechanics
  - 🤠 **Cowboy** — Unarmed brawler who dual-wields guns when found
- **Line of Sight (FOV)** — Raycasted fog of war with memory of explored areas.
- **Mood System** — Your emotional state affects gameplay.
- **Enemy Personalities** — Traits like `cowardly`, `berserker`, `packHunter`, and `silent` create varied combat encounters.
- **Autoexplore** — Press `O` or numpad `+` to let the game explore for you.
- **Zodiac Temple** (WIP) — Choose a zodiac sign at a special floor for unique passives and flavor.

## Project Structure

```
EmojiRL/
├── src/
│   ├── components/          # UI components
│   ├── game/                # Core game systems
│   │   ├── classes.ts
│   │   ├── combat.ts
│   │   ├── enemies.ts
│   │   ├── emojis.ts
│   │   ├── mapgen.ts
│   │   ├── moods.ts
│   │   └── types.ts
│   ├── pages/
│   │   ├── game.tsx         # Main game (large file)
│   │   └── how-to-play.tsx
│   ├── App.tsx
│   └── main.tsx
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── vercel.json
```

## Controls

- **Movement**: Arrow keys / WASD / numpad
- **Wait / Rest**: `.` or `z`
- **Autoexplore**: `O` or numpad `+`
- **Inventory / Equipment**: `b`
- **How to Play**: Accessible from the main menu

## Current Status

This is an early but playable version of EmojiRL. Core roguelike systems (combat, equipment, inventory passives, LOS, procedural generation) are implemented. More content (enemies, emojis, classes, floors) is being added iteratively.

## Gotchas

- The game is fully client-side. All progress is saved in `localStorage`.
- `game.tsx` is currently the largest file — use search/grep when navigating.
- Equipment bonuses are applied at combat time via `applyEquipmentAndPassives()`.
- Bag passives are recalculated on every render through `computeBagPassives()`.

## Deployment

This project is configured for easy static deployment (Vercel, Netlify, etc.). The included `vercel.json` handles SPA routing.

## License

EmojiRL is licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later). See [LICENSE](LICENSE).

You may use, modify, and share this game under the GPL. Derivatives and redistributions must remain under the same license and include corresponding source. The base game includes four character classes; additional classes or content may be offered separately in the future.
