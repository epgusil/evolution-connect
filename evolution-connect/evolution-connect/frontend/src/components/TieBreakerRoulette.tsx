import { useEffect, useState } from "react";

/**
 * Animación de "ruleta" para mostrar el desempate. El ganador YA lo decidió
 * el servidor (winnerId es la fuente de verdad) — esta animación solo hace
 * unas cuantas vueltas "de suspenso" y siempre aterriza exactamente en ese
 * ganador, para que todas las pantallas (jugadores y admin) muestren el
 * mismo resultado aunque la animación en sí no esté perfectamente
 * sincronizada entre dispositivos.
 */
export default function TieBreakerRoulette({
  candidates,
  winnerId,
  onDone,
}: {
  candidates: { id: string; name: string }[];
  winnerId: string | null;
  onDone: () => void;
}) {
  const [spinning, setSpinning] = useState(true);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const length = candidates.length;
    if (length === 0) {
      setSpinning(false);
      setTimeout(onDone, 800);
      return;
    }

    const winnerIndex = Math.max(
      0,
      candidates.findIndex((c) => c.id === winnerId)
    );
    const baseTicks = 24 + Math.floor(Math.random() * 10);
    const remainder = baseTicks % length;
    const adjustment = (winnerIndex - remainder + length) % length;
    const totalTicks = baseTicks + adjustment;

    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
      setHighlighted(ticks % length);
      if (ticks >= totalTicks) {
        clearInterval(interval);
        setSpinning(false);
        setTimeout(onDone, 2200);
      }
    }, 130);
    return () => clearInterval(interval);
  }, [candidates, winnerId, onDone]);

  return (
    <div>
      <span className="eyebrow">¡Empate! Sorteando ganador</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {candidates.map((c, i) => (
          <div
            key={c.id}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              fontWeight: 700,
              background: i === highlighted ? "rgba(0,207,255,0.25)" : "rgba(255,255,255,0.05)",
              border: i === highlighted ? "1.5px solid var(--color-accent)" : "1.5px solid transparent",
              transform: i === highlighted && spinning ? "scale(1.03)" : "scale(1)",
              transition: "all 0.1s ease",
            }}
          >
            {c.name}
          </div>
        ))}
      </div>
      {!spinning && <p style={{ marginTop: 16, color: "var(--color-success)" }}>¡Tenemos ganador!</p>}
    </div>
  );
}
