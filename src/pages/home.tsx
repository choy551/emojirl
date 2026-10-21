import { useEffect, useState } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClassDef } from "../game/classes";
import { getScores, clearScores, LeaderboardEntry } from "../game/leaderboard";
import { hasSave, clearSave } from "../game/save";
import { acknowledgeVoidUnlock, voidUnlockPending } from "../game/voidMeta";
import { VOID_UNLOCK_TEXT } from "../game/voidDamage";
import { classSelectEntries, isClassUnlocked, resolveVesselChoice, vesselGridCells, type VesselGridCell } from "../game/classSelect";
import { districtPickerLine, normalizeCity } from "../game/emojiCity";
import { loadMeta } from "../game/meta";
import { WIZARD } from "../game/prestigeConstants";

const GRID_PLACE: Record<string, string> = {
  "1-1": "col-start-1 row-start-1",
  "1-2": "col-start-1 row-start-2",
  "2-1": "col-start-2 row-start-1",
  "2-2": "col-start-2 row-start-2",
  "3-1": "col-start-3 row-start-1",
  "3-2": "col-start-3 row-start-2",
  "4-1": "col-start-4 row-start-1",
  "4-2": "col-start-4 row-start-2",
  "5-both": "col-start-5 row-start-1 row-span-2 self-center",
};

function gridPlace(cell: VesselGridCell): string {
  return GRID_PLACE[`${cell.column}-${cell.row}`] ?? "";
}

function tooltipSide(column: VesselGridCell["column"]): string {
  if (column <= 2) return "left-0";
  if (column >= 4) return "right-0";
  return "left-1/2 -translate-x-1/2";
}
const VESSEL_KEY = "emojirl_vessel";
const ANNOUNCE_DISMISS_KEY = "emojirl_announce_dismissed_2026-09-10";

function loadVessel(): string {
  const saved = localStorage.getItem(VESSEL_KEY) ?? WIZARD;
  return isClassUnlocked(saved) ? saved : WIZARD;
}

function loadAnnounceDismissed(): boolean {
  return localStorage.getItem(ANNOUNCE_DISMISS_KEY) === "1";
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const [selected, setSelected] = useState<string>(loadVessel);
  const [scores, setScores] = useState<LeaderboardEntry[]>(getScores);
  const [savedRun, setSavedRun] = useState<boolean>(hasSave);
  const [announceDismissed, setAnnounceDismissed] = useState(loadAnnounceDismissed);
  const [voidBanner, setVoidBanner] = useState(voidUnlockPending);
  const [pinnedHint, setPinnedHint] = useState<string | null>(null);
  const vessels = classSelectEntries();

  useEffect(() => {
    if (voidBanner) acknowledgeVoidUnlock();
  }, [voidBanner]);

  function dismissAnnounce() {
    setAnnounceDismissed(true);
    localStorage.setItem(ANNOUNCE_DISMISS_KEY, "1");
  }

  function select(v: string) {
    const choice = resolveVesselChoice(selected, v);
    if (choice.showHint) {
      setPinnedHint(prev => prev === v ? null : v);
      return;
    }
    setPinnedHint(null);
    setSelected(choice.selected);
    localStorage.setItem(VESSEL_KEY, choice.selected);
  }

  function handleClearScores() {
    clearScores();
    setScores([]);
  }

  const cls = getClassDef(selected);
  const cityForDistricts = normalizeCity(loadMeta().city);
  const districtLine = districtPickerLine(selected, cityForDistricts);

  return (
    <div className="min-h-screen w-full flex flex-col">
      {voidBanner && (
        <div
          role="status"
          className="relative w-full shrink-0 px-4 py-3 pr-11 bg-violet-950/90 border-b border-violet-500/50 text-violet-100 text-sm leading-snug text-center"
        >
          {VOID_UNLOCK_TEXT}
          <button
            type="button"
            onClick={() => setVoidBanner(false)}
            aria-label="Dismiss Void unlock"
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-violet-200/80 hover:bg-violet-800/70 hover:text-violet-50 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {!announceDismissed && (
        <div
          role="status"
          className="relative w-full shrink-0 px-4 py-3 pr-11 bg-amber-950/90 border-b border-amber-600/50 text-amber-100 text-sm leading-snug text-center"
        >
          <span className="font-semibold text-amber-200">2026-9-10:</span>{" "}
          Work on EmojiRL has been resumed once more! Visit{" "}
          <a
            href="https://github.com/choy551/emojirl"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline underline-offset-2 hover:text-amber-100 font-medium break-all"
          >
            https://github.com/choy551/emojirl
          </a>
          {" "}for changelogs/comments/concerns/suggestions
          <button
            type="button"
            onClick={dismissAnnounce}
            aria-label="Dismiss announcement"
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-amber-200/80 hover:bg-amber-800/70 hover:text-amber-50 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

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
          <Link href="/city">
            <Button variant="outline" size="lg" className="w-full text-lg h-14 border-primary/40 text-primary hover:bg-primary/10" data-testid="open-emojicb">
              🏙️ EmojiCB
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

          <div
            className="relative z-10 mx-auto grid w-full max-w-[18rem] grid-cols-5 grid-rows-2 justify-items-center gap-x-1 gap-y-1.5 sm:max-w-sm sm:gap-x-2 sm:gap-y-2"
            role="group"
            aria-label="Choose your vessel"
          >
            {vesselGridCells().map((cell) => {
              const v = vessels.find((entry) => entry.emoji === cell.emoji);
              if (!v) return null;
              const hintOpen = !v.unlocked && pinnedHint === v.emoji;
              return (
                <button
                  key={v.emoji}
                  type="button"
                  onClick={() => select(v.emoji)}
                  aria-disabled={!v.unlocked}
                  aria-label={v.unlocked ? `Select ${v.name}` : `${v.name} locked`}
                  title={districtPickerLine(v.emoji, cityForDistricts) ?? undefined}
                  className={`group relative flex aspect-square w-full max-w-11 items-center justify-center rounded-lg text-2xl leading-none transition-all sm:max-w-14 sm:text-3xl ${gridPlace(cell)} ${
                    hintOpen ? "z-30" : "z-10 hover:z-30"
                  } ${
                    !v.unlocked
                      ? "border border-border grayscale opacity-40 cursor-help"
                      : selected === v.emoji
                        ? "border-2 border-primary bg-primary/10 shadow-[0_0_12px_rgba(168,85,247,0.4)] cursor-pointer sm:scale-110"
                        : "border border-border opacity-50 hover:opacity-80 hover:border-primary/50 cursor-pointer"
                  }`}
                >
                  {v.emoji}
                  {!v.unlocked && v.hint && (
                    <span
                      role="tooltip"
                      className={`absolute top-full z-20 mt-1.5 w-max max-w-[9.5rem] rounded-md border border-border bg-popover px-2 py-1.5 text-left text-[11px] font-normal normal-case leading-snug text-popover-foreground shadow-lg ${tooltipSide(cell.column)} ${
                        hintOpen ? "block" : "hidden group-hover:block"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {v.hint}
                      {hintOpen && (
                        <button
                          type="button"
                          className="mt-1 block text-[10px] font-semibold text-primary"
                          onClick={(e) => { e.stopPropagation(); setPinnedHint(null); }}
                        >
                          Dismiss
                        </button>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
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

            {districtLine && (
              <div className="text-xs text-primary border-t border-border/50 pt-2" data-testid="vessel-district">
                🏙️ {districtLine}
              </div>
            )}

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
                      {entry.won && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-950/50 text-amber-300 border border-amber-600/40"
                          title="Won the game on D:27"
                        >
                          🏆 Win
                        </span>
                      )}
                      {(entry.maxPressure ?? 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-orange-950/50 text-orange-400 border border-orange-700/40"
                          title={`Dungeon pressure was +${entry.maxPressure} at the end of the run`}
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
