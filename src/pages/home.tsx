import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CHARACTER_CLASSES, getClassDef } from "../game/classes";
import { getScores, clearScores, LeaderboardEntry } from "../game/leaderboard";
import { hasSave, clearSave } from "../game/save";

const VESSELS = ["🧙", "🥷", "🧝", "🤠"] as const;
const VESSEL_KEY = "emojirl_vessel";

function loadVessel(): string {
  return localStorage.getItem(VESSEL_KEY) ?? "🧙";
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const [selected, setSelected] = useState<string>(loadVessel);
  const [scores, setScores] = useState<LeaderboardEntry[]>(getScores);
  const [savedRun, setSavedRun] = useState<boolean>(hasSave);

  function select(v: string) {
    setSelected(v);
    localStorage.setItem(VESSEL_KEY, v);
  }

  function handleClearScores() {
    clearScores();
    setScores([]);
  }

  const cls = getClassDef(selected);

  return (
    <div className="min-h-screen w-full flex flex-col">
      <div
        role="status"
        className="w-full shrink-0 px-4 py-3 bg-amber-950/90 border-b border-amber-600/50 text-amber-100 text-sm leading-snug text-center"
      >
        <span className="font-semibold text-amber-200">2026/07/21:</span>{" "}
        Development on EmojiRL is currently suspended/on hiatus. Please direct all concerns/comments/requests for the dev to get off his lazyass &amp; finish working on the game @{" "}
        <a
          href="https://github.com/choy551/emojirl"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-300 underline underline-offset-2 hover:text-amber-100 font-medium break-all"
        >
          https://github.com/choy551/emojirl
        </a>
      </div>

      <div className="flex flex-col items-center py-12 px-4 flex-1 w-full">
      <div className="text-center max-w-md w-full space-y-8">
        <div>
          <h1 className="text-6xl font-black mb-4 text-primary tracking-tighter drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">EmojiRL</h1>
          <p className="text-muted-foreground text-lg">Your emoji collection IS your soul.</p>
        </div>

        <div className="space-y-4">
          {savedRun && (
            <Link href="/game">
              <Button size="lg" className="w-full text-lg h-14 font-bold bg-secondary text-secondary-foreground hover:opacity-90 shadow-[0_0_15px_rgba(168,85,247,0.25)] transition-all">
                ▶ Continue Run
              </Button>
            </Link>
          )}
          <Link href="/game">
            <Button
              size="lg"
              className="w-full text-xl h-16 font-bold shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all"
              onClick={() => { clearSave(); setSavedRun(false); }}
            >
              {savedRun ? "New Descent" : "Start Descent"}
            </Button>
          </Link>
          <Link href="/how-to-play">
            <Button variant="outline" size="lg" className="w-full text-lg h-14 border-secondary/50 text-secondary hover:bg-secondary/10">
              How to Play
            </Button>
          </Link>
        </div>

        <div className="pt-8 border-t border-border/50 text-left space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Choose your vessel</h2>

          <div className="flex justify-center gap-4 text-4xl">
            {VESSELS.map((v) => (
              <button
                key={v}
                onClick={() => select(v)}
                className={`p-2 rounded-lg transition-all cursor-pointer ${
                  selected === v
                    ? "border-2 border-primary bg-primary/10 scale-110 shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                    : "border border-border opacity-50 hover:opacity-80 hover:border-primary/50"
                }`}
                aria-label={`Select ${CHARACTER_CLASSES[v]?.name ?? v}`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3 text-left animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{selected}</span>
              <div>
                <div className="font-bold text-foreground">{cls.name}</div>
                <div className="text-xs text-muted-foreground">{cls.tagline}</div>
              </div>
              <div className="ml-auto text-right text-xs text-muted-foreground space-y-0.5">
                <div>❤️ {cls.baseStats.hp} HP</div>
                <div>⚔️ {cls.baseStats.attack} ATK</div>
                <div>🛡 {cls.baseStats.defense} DEF</div>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 space-y-2">
              {cls.passives.map((p) => (
                <div key={p.label} className="text-xs">
                  <span className="font-semibold text-primary">{p.label}:</span>{" "}
                  <span className="text-muted-foreground">{p.detail}</span>
                </div>
              ))}
              {cls.active && (
                <div className="text-xs">
                  <span className="font-semibold text-violet-400">⚡ {cls.active.label}</span>
                  <span className="text-violet-400/60 text-[10px] ml-1">(active · X / T→1)</span>
                  {": "}
                  <span className="text-muted-foreground">{cls.active.detail}</span>
                </div>
              )}
            </div>

            {cls.startingAmmo > 0 && (
              <div className="text-xs text-amber-400/80 border-t border-border/50 pt-2">
                🏹 Starts with {cls.startingAmmo} ammo · pick up 🏹 Quiver drops from enemies
              </div>
            )}
          </div>
        </div>

        {/* High Scores */}
        <div className="pt-8 border-t border-border/50 text-left space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">High Scores</h2>
            {scores.length > 0 && (
              <button
                onClick={handleClearScores}
                className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
              >
                Reset scores
              </button>
            )}
          </div>

          {scores.length === 0 ? (
            <p className="text-xs text-muted-foreground/40 italic text-center py-3">
              No runs yet — descend and make your mark.
            </p>
          ) : (
            <div className="space-y-2">
              {scores.map((entry, i) => (
                <div
                  key={entry.timestamp}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                    i === 0
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-card/40"
                  }`}
                >
                  <span className="text-base w-5 text-center">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                  </span>
                  <span className="text-xl">{entry.characterClass}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground leading-tight">{entry.className}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <span>Floor {entry.floor}</span>
                      {(entry.maxPressure ?? 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-orange-950/50 text-orange-400 border border-orange-700/40"
                          title={`Dungeon pressure was +${entry.maxPressure} at time of death`}
                        >
                          🔥 +{entry.maxPressure}
                        </span>
                      )}
                      <span>· Lv {entry.level} · {entry.xp} XP</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground/50 shrink-0">{formatDate(entry.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
