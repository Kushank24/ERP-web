"use client";

import { useRef, useState } from "react";

export type RoundOffMode = "none" | "down" | "up";

/**
 * Signed delta that rounds `baseTotal` to a whole rupee in the given
 * direction — the same arithmetic the server applies (see
 * backend/app/rounding.py). Exported so a caller can update its own totals
 * optimistically, before the save comes back.
 */
export function roundOffDelta(baseTotal: number, mode: RoundOffMode): number {
  const base = Math.round(baseTotal * 100) / 100;
  if (mode === "down") return Math.round((Math.floor(base) - base) * 100) / 100;
  if (mode === "up") return Math.round((Math.ceil(base) - base) * 100) / 100;
  return 0;
}

/**
 * Round-off buttons for a document's grand total.
 *
 * `baseTotal` is the grand total *before* any round-off, so the figures on the
 * buttons are computed the same way the server derives the stored delta.
 * Only the direction is sent — the server recomputes the delta itself, so the
 * two can never drift apart.
 *
 * The click is optimistic: the button goes active and the caller moves its own
 * total immediately, while the PATCH runs in the background. A click during an
 * in-flight save is remembered and sent once that save returns, so rapid
 * clicking can't leave the server on a direction the user abandoned — only one
 * request is ever in flight, and the last direction clicked always wins.
 */
export function RoundOffControl({
  baseTotal,
  mode,
  onApply,
  currency = "₹",
}: {
  baseTotal: number;
  mode: RoundOffMode;
  onApply: (mode: RoundOffMode) => Promise<void>;
  currency?: string;
}) {
  // What the user last clicked, shown until the caller's own state catches up.
  const [optimistic, setOptimistic] = useState<RoundOffMode | null>(null);
  const inFlight = useRef(false);
  const queued = useRef<RoundOffMode | null>(null);

  const base = Math.round(baseTotal * 100) / 100;
  const down = Math.floor(base);
  const up = Math.ceil(base);
  const alreadyWhole = down === up;
  const shown = optimistic ?? mode;

  async function run(next: RoundOffMode) {
    inFlight.current = true;
    try {
      await onApply(next);
    } finally {
      inFlight.current = false;
      const follow = queued.current;
      queued.current = null;
      if (follow !== null && follow !== next) {
        await run(follow);
      } else {
        setOptimistic(null);
      }
    }
  }

  function apply(next: RoundOffMode) {
    setOptimistic(next);
    if (inFlight.current) {
      queued.current = next;
      return;
    }
    void run(next);
  }

  // Nothing to round and nothing applied — don't clutter the summary.
  if (alreadyWhole && shown === "none") return null;

  const btn = "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors";
  const idle = "border-surface-border text-slate-400 hover:border-slate-400 hover:text-white";
  const active = "border-accent bg-accent/10 text-accent";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1.5">
      <span className="mr-auto text-[10px] uppercase tracking-wider text-slate-600">
        Round off
      </span>
      {!alreadyWhole && (
        <>
          <button
            type="button"
            onClick={() => apply(shown === "down" ? "none" : "down")}
            className={`${btn} ${shown === "down" ? active : idle}`}
            title={`Round the grand total down to ${currency}${down.toFixed(2)}`}
          >
            ↓ {currency}
            {down.toFixed(2)}
          </button>
          <button
            type="button"
            onClick={() => apply(shown === "up" ? "none" : "up")}
            className={`${btn} ${shown === "up" ? active : idle}`}
            title={`Round the grand total up to ${currency}${up.toFixed(2)}`}
          >
            ↑ {currency}
            {up.toFixed(2)}
          </button>
        </>
      )}
      {shown !== "none" && (
        <button
          type="button"
          onClick={() => apply("none")}
          className={`${btn} ${idle}`}
          title="Remove the round-off"
        >
          Clear
        </button>
      )}
    </div>
  );
}
