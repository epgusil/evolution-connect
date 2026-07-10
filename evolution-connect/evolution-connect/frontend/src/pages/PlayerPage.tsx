import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, emitAck } from "../lib/socket";
import type { FinalResults, GroupMember, PlayerSnapshot } from "../lib/types";
import ParticleField from "../components/ParticleField";
import { useCountdown, formatMMSS } from "../lib/useCountdown";
import { getRoundQuestions } from "../lib/questionBank";
import TieBreakerRoulette from "../components/TieBreakerRoulette";

const STORAGE_KEY = "evolution_connect_player_id";

type Toast = { id: number; text: string; tone: "info" | "success" };

export default function PlayerPage() {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [finalResults, setFinalResults] = useState<FinalResults | null>(null);
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const refreshSnapshot = useCallback(() => {
    emitAck<{ ok: boolean; snapshot: PlayerSnapshot }>("player:get_snapshot").then(
      (res) => res.ok && setSnapshot(res.snapshot)
    );
  }, []);

  // Intento de reconexión automática si ya había un playerId guardado
  useEffect(() => {
    function tryRejoin() {
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (!savedId) return;
      emitAck<{ ok: boolean; snapshot?: PlayerSnapshot }>("player:rejoin", {
        playerId: savedId,
      }).then((res) => {
        if (res.ok && res.snapshot) {
          setSnapshot(res.snapshot);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      });
    }

    socket.on("connect", tryRejoin);
    if (socket.connected) tryRejoin();

    socket.on("game_connected", refreshSnapshot);
    socket.on("round_generated", refreshSnapshot);
    socket.on("round_started", refreshSnapshot);
    socket.on("round_ended", refreshSnapshot);
    socket.on("connection_pending", (data: { fromName: string }) => {
      pushToast(`${data.fromName} te seleccionó. ¡Confírmalo!`, "info");
      refreshSnapshot();
    });
    socket.on("connection_confirmed", (data: { withName: string }) => {
      pushToast(`Conexión confirmada con ${data.withName} 🎉`, "success");
      refreshSnapshot();
    });
    socket.on("game_finished", (results: FinalResults) => setFinalResults(results));
    socket.on("game_reset", () => {
      localStorage.removeItem(STORAGE_KEY);
      setSnapshot(null);
      setFinalResults(null);
    });

    return () => {
      socket.off("connect", tryRejoin);
      socket.off("game_connected", refreshSnapshot);
      socket.off("round_generated", refreshSnapshot);
      socket.off("round_started", refreshSnapshot);
      socket.off("round_ended", refreshSnapshot);
      socket.off("connection_pending");
      socket.off("connection_confirmed");
      socket.off("game_finished");
      socket.off("game_reset");
    };
  }, [pushToast, refreshSnapshot]);

  const handleJoin = async () => {
    if (!name.trim()) {
      setJoinError("Escribe tu nombre completo.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    const res = await emitAck<{ ok: boolean; playerId?: string; error?: string }>(
      "player:join",
      { name }
    );
    setJoining(false);
    if (!res.ok) {
      setJoinError(
        res.error === "DUPLICATE_NAME"
          ? "Ese nombre ya está en uso. Prueba con tu nombre y apellido."
          : "No se pudo unir. Intenta de nuevo."
      );
      return;
    }
    if (res.playerId) localStorage.setItem(STORAGE_KEY, res.playerId);
    refreshSnapshot();
  };

  const handleSelect = async (targetId: string) => {
    const res = await emitAck<{ ok: boolean; error?: string }>("player:select", { targetId });
    if (!res.ok) console.warn("select error", res.error);
    refreshSnapshot();
  };

  return (
    <div className="screen">
      <ParticleField />
      <ToastStack toasts={toasts} />

      {!snapshot && (
        <JoinView
          name={name}
          setName={setName}
          onJoin={handleJoin}
          joining={joining}
          error={joinError}
        />
      )}

      {snapshot && !finalResults && snapshot.status !== "finished" && (
        <>
          {(snapshot.status === "lobby" || snapshot.status === "instructions") && (
            <WaitingView
              message="Estás adentro, en un momento iniciaremos el juego."
              myName={snapshot.me.name}
            />
          )}
          {snapshot.status === "color_assignment" && <ColorView snapshot={snapshot} />}
          {snapshot.status === "round_active" && (
            <RoundView snapshot={snapshot} onSelect={handleSelect} />
          )}
          {snapshot.status === "between_rounds" && (
            <WaitingView message="Espera mientras se prepara la siguiente ronda." myName={snapshot.me.name} score={snapshot.me.score} />
          )}
        </>
      )}

      {finalResults && snapshot && <FinalResultsPlayerView results={finalResults} myId={snapshot.me.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(92vw, 420px)",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-card"
          style={{
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 600,
            borderColor: t.tone === "success" ? "var(--color-success)" : "var(--color-accent)",
            textAlign: "center",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function JoinView({
  name,
  setName,
  onJoin,
  joining,
  error,
}: {
  name: string;
  setName: (v: string) => void;
  onJoin: () => void;
  joining: boolean;
  error: string | null;
}) {
  return (
    <div className="glass-card" style={{ width: "min(92vw, 420px)", textAlign: "center" }}>
      <span className="eyebrow">USIL Evolution</span>
      <img
        src="/evolution-connect-logo.png"
        alt="Evolution Connect"
        style={{ maxWidth: 260, width: "100%", height: "auto", margin: "8px 0 4px" }}
      />
      <p style={{ color: "var(--color-text-dim)", marginBottom: 24 }}>
        Ingresa tus nombres y apellidos completos para realizar la dinámica.
      </p>
      <input
        className="text-input"
        placeholder="EJM: JUAN JOSE ELERA CHAVEZ"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onJoin()}
        autoFocus
      />
      {error && <p style={{ color: "var(--color-warning)", fontSize: 14, marginTop: 10 }}>{error}</p>}
      <button
        className="btn btn-primary"
        style={{ marginTop: 20, width: "100%" }}
        onClick={onJoin}
        disabled={joining}
      >
        {joining ? "Uniendo…" : "Unirme"}
      </button>
    </div>
  );
}

function WaitingView({ message, myName, score }: { message: string; myName: string; score?: number }) {
  return (
    <div className="glass-card" style={{ width: "min(92vw, 420px)", textAlign: "center" }}>
      <div
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 20px",
          borderRadius: "50%",
          border: "3px solid var(--color-accent)",
          borderTopColor: "transparent",
          animation: "spin-slow 1.4s linear infinite",
        }}
      />
      <p className="eyebrow">Hola, {myName}</p>
      <p style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.5 }}>{message}</p>
      {typeof score === "number" && (
        <p style={{ color: "var(--color-text-dim)", marginTop: 12 }}>
          Conexiones confirmadas hasta ahora: <strong style={{ color: "var(--color-success)" }}>{score}</strong>
        </p>
      )}
    </div>
  );
}

function ColorView({ snapshot }: { snapshot: PlayerSnapshot }) {
  const color = snapshot.me.color;
  return (
    <div className="glass-card" style={{ width: "min(92vw, 440px)", textAlign: "center" }}>
      <span className="eyebrow">
        Ronda {snapshot.currentRound} de {snapshot.totalRounds}
      </span>
      <p style={{ margin: "18px 0 8px", fontWeight: 600 }}>Tu color asignado es</p>
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          margin: "0 auto 18px",
          background: color?.hex ?? "#666",
          boxShadow: `0 0 60px ${color?.hex ?? "#666"}`,
          animation: "float-y 3s ease-in-out infinite",
        }}
      />
      <h2 className="display-title" style={{ fontSize: 30 }}>
        {color?.name ?? "—"}
      </h2>
      <p style={{ color: "var(--color-text-dim)", marginTop: 16, fontSize: 17, lineHeight: 1.6 }}>
        Levanta tu celular y busca a las personas con este mismo color. Cuando el
        administrador inicie el cronómetro, tendrás 5 minutos para conocerlas.
      </p>
    </div>
  );
}

function RoundView({
  snapshot,
  onSelect,
}: {
  snapshot: PlayerSnapshot;
  onSelect: (id: string) => void;
}) {
  const secondsLeft = useCountdown(snapshot.roundEndsAt);
  const color = snapshot.me.color;
  const urgent = secondsLeft !== null && secondsLeft <= 30;

  const [search, setSearch] = useState("");
  const suggestedQuestions = useMemo(
    () => getRoundQuestions(snapshot.currentRound),
    [snapshot.currentRound]
  );
  const visibleMembers = [...snapshot.groupMembers]
    .filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  return (
    <div style={{ width: "min(94vw, 480px)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="glass-card" style={{ textAlign: "center", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: color?.hex ?? "#666" }} />
          <span style={{ fontWeight: 700 }}>{color?.name}</span>
        </div>
        <div
          className="display-title"
          style={{
            fontSize: 52,
            marginTop: 8,
            color: urgent ? "var(--color-warning)" : undefined,
            WebkitTextFillColor: urgent ? "var(--color-warning)" : undefined,
          }}
        >
          {secondsLeft !== null ? formatMMSS(secondsLeft) : "--:--"}
        </div>
        <p style={{ color: "var(--color-text-dim)", fontSize: 13, marginTop: 4 }}>
          Tus conexiones confirmadas: <strong style={{ color: "var(--color-success)" }}>{snapshot.me.score}</strong>
        </p>
      </div>
      <div className="glass-card">
        <span className="eyebrow">💡 Preguntas para romper el hielo</span>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestedQuestions.map((q, i) => (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--glass-border)",
                fontSize: 14,
                color: "var(--color-text-dim)",
              }}
            >
              {q}
            </div>
          ))}
        </div>
      </div>
      <div className="glass-card">
        <span className="eyebrow">Tu grupo — toca a quien conozcas</span>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1.5px solid var(--glass-border)",
            borderRadius: 14,
            padding: "10px 14px",
          }}
        >
          <span style={{ fontSize: 16, opacity: 0.75 }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text)",
              fontFamily: "var(--font-body)",
              fontSize: 15,
            }}
          />
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {snapshot.groupMembers.length === 0 && (
            <p style={{ color: "var(--color-text-faint)" }}>No hay más personas en tu grupo.</p>
          )}
          {snapshot.groupMembers.length > 0 && visibleMembers.length === 0 && (
            <p style={{ color: "var(--color-text-faint)" }}>Nadie coincide con "{search}".</p>
          )}
          {visibleMembers.map((m) => (
            <PlayerButton key={m.id} member={m} onSelect={() => onSelect(m.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayerButton({ member, onSelect }: { member: GroupMember; onSelect: () => void }) {
  const styles: Record<GroupMember["buttonState"], React.CSSProperties> = {
    default: {
      background: "rgba(255,255,255,0.06)",
      borderColor: "var(--glass-border)",
      color: "var(--color-text)",
    },
    pending_sent: {
      background: "rgba(255,140,0,0.12)",
      borderColor: "var(--color-warning)",
      color: "var(--color-warning)",
    },
    pending_received: {
      background: "rgba(255,140,0,0.22)",
      borderColor: "var(--color-warning)",
      color: "#ffffff",
      animation: "pulse-ring 1.6s infinite",
    },
    confirmed: {
      background: "rgba(0,255,127,0.14)",
      borderColor: "var(--color-success)",
      color: "var(--color-success)",
    },
  };

  const labels: Record<GroupMember["buttonState"], string> = {
    default: "Toca para confirmar",
    pending_sent: "Esperando confirmación…",
    pending_received: "¡Te seleccionó! Toca para confirmar",
    confirmed: "Conexión confirmada ✓",
  };

  const disabled = member.buttonState === "pending_sent" || member.buttonState === "confirmed";

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        padding: "14px 18px",
        borderRadius: 14,
        border: "1.5px solid",
        fontFamily: "var(--font-body)",
        fontSize: 16,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.15s ease",
        ...styles[member.buttonState],
      }}
    >
      <span>{member.name}</span>
      <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>{labels[member.buttonState]}</span>
    </button>
  );
}

function FinalResultsPlayerView({ results, myId }: { results: FinalResults; myId: string }) {
  const [showRoulette, setShowRoulette] = useState(results.needsTieBreaker);
  const myEntry = results.leaderboard.find((e) => e.id === myId);
  const myRank = results.leaderboard.findIndex((e) => e.id === myId) + 1;
  // El ganador es el que decidió el servidor (resolvedWinnerId), NUNCA una
  // decisión local: si dos o más empataron, solo uno de ellos es el ganador
  // real y todos los celulares deben coincidir en quién es.
  const iAmWinner = results.resolvedWinnerId === myId;

  return (
    <div className="glass-card" style={{ width: "min(92vw, 460px)", textAlign: "center" }}>
      {showRoulette ? (
        <TieBreakerRoulette
          candidates={results.winners}
          winnerId={results.resolvedWinnerId}
          onDone={() => setShowRoulette(false)}
        />
      ) : (
        <>
          <span className="eyebrow">Resultados finales</span>
          {iAmWinner ? (
            <h2 className="display-title" style={{ fontSize: 36, margin: "12px 0" }}>
              🏆 ¡Eres el ganador!
            </h2>
          ) : (
            <h2 className="display-title" style={{ fontSize: 30, margin: "12px 0" }}>
              Quedaste en el puesto #{myRank || "—"}
            </h2>
          )}
          <p style={{ color: "var(--color-text-dim)", fontSize: 18 }}>
            Conexiones confirmadas: <strong style={{ color: "var(--color-success)" }}>{myEntry?.score ?? 0}</strong>
          </p>
          <div style={{ marginTop: 24, textAlign: "left", display: "flex", flexDirection: "column", gap: 8 }}>
            {results.leaderboard.slice(0, 5).map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: e.id === myId ? "rgba(0,207,255,0.15)" : "rgba(255,255,255,0.04)",
                }}
              >
                <span>
                  {i + 1}. {e.name}
                </span>
                <span style={{ fontWeight: 700 }}>{e.score}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TieBreakerRoulette({
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

    // El ganador ya lo decidió el servidor (winnerId). Esta animación solo
    // hace unas cuantas vueltas "de suspenso" y siempre aterriza exactamente
    // en ese ganador, para que todos los celulares muestren el mismo
    // resultado final aunque la animación en sí no esté perfectamente
    // sincronizada entre dispositivos.
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
