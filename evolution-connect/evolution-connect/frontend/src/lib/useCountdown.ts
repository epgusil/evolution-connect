import { useEffect, useState } from "react";

/**
 * Devuelve los segundos restantes hasta `endsAt` (timestamp epoch ms).
 * Se recalcula cada segundo. Si endsAt es null, devuelve null.
 */
export function useCountdown(endsAt: number | null): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return secondsLeft;
}

export function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
