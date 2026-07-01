import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { socket, emitAck } from "../lib/socket";
import type { AdminSnapshot, LeaderboardEntry } from "../lib/types";
import ParticleField from "../components/ParticleField";
import { useCountdown, formatMMSS } from "../lib/useCountdown";

export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    function requestSnapshot() {
      emitAck<{ ok: boolean; snapshot: AdminSnapshot }>("admin:join").then(
        (res) => res.ok && setSnapshot(res.snapshot)
      );
    }
    socket.on("connect", requestSnapshot);
    socket.on("admin_snapshot", (s: AdminSnapshot) => setSnapshot(s));
    socket.on("leaderboard_updated", (lb: LeaderboardEntry[]) =>
      setSnapshot((prev) => (prev ? { ...prev, leaderboard: lb } : prev))
    );
    if (socket.connected) requestSnapshot();

    return () => {
      socket.off("connect", requestSnapshot);
      socket.off("admin_snapshot");
      socket.off("leaderboard_updated");
    };
  }, []);

  const run = useCallback(async (event: string) => {
    setBusy(true);
    const res = await emitAck<{ ok: boolean; error?: string }>(event);
    setBusy(false);
    if (!res.ok) {
      console.error(event, res.error);
      alert("No se pudo completar la acción: " + (res.error ?? "error desconocido"));
    }
  }, []);

  if (!snapshot) {
    return (
      <div className="screen">
        <ParticleField />
        <p className="eyebrow">Conectando con el servidor…</p>
      </div>
    );
  }

  return (
    <div className="screen" style={{ justifyContent: "flex-start", paddingTop: 40 }}>
      <ParticleField />
      <AdminHeader
        sessionId={snapshot.sessionId}
        onResetClick={() => setConfirmReset(true)}
      />

      {snapshot.status === "lobby" && (
        <LobbyView snapshot={snapshot} busy={busy} onConnect={() => run("admin:connect_game")} />
      )}
      {snapshot.status === "instructions" && (
        <InstructionsView busy={busy} onStartRound={() => run("admin:start_round")} />
      )}
      {snapshot.status === "color_assignment" && (
        <ColorAssignmentView
          snapshot={snapshot}
          busy={busy}
          onBeginTimer={() => run("admin:begin_timer")}
        />
      )}
      {snapshot.status === "round_active" && (
        <LiveMonitorView snapshot={snapshot} busy={busy} onEndRound={() => run("admin:end_round")} />
      )}
      {snapshot.status === "between_rounds" && (
        <BetweenRoundsView
          snapshot={snapshot}
          busy={busy}
          onNextRound={() => run("admin:start_round")}
          onFinishGame={() => run("admin:finish_game")}
        />
      )}
      {snapshot.status === "finished" && <FinalResultsView snapshot={snapshot} />}

      {confirmReset && (
        <ConfirmResetModal
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            run("admin:reset_game");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AdminHeader({
  sessionId,
  onResetClick,
}: {
  sessionId: string;
  onResetClick: () => void;
}) {
  return (
    <header
      style={{
        width: "100%",
        maxWidth: 1040,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="eyebrow">Panel de administración</span>
        <h1
          className="display-title"
          style={{ fontSize: "clamp(28px, 4vw, 40px)" }}
        >
          Evolution Connect
        </h1>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span className="pill">
          <span className="glow-dot" /> Sesión {sessionId}
        </span>
        <button className="btn btn-ghost" style={{ padding: "10px 20px" }} onClick={onResetClick}>
          Reiniciar juego
        </button>
      </div>
    </header>
  );
}

function ConfirmResetModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,6,26,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div className="glass-card" style={{ maxWidth: 420, textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>¿Reiniciar todo?</h2>
        <p style={{ color: "var(--color-text-dim)" }}>
          Esto borrará a todos los jugadores, colores, rondas y conexiones. Se generará una
          nueva sesión y un nuevo código QR. No se puede deshacer.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Sí, reiniciar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LobbyView({
  snapshot,
  busy,
  onConnect,
}: {
  snapshot: AdminSnapshot;
  busy: boolean;
  onConnect: () => void;
}) {
  const joinUrl = `${window.location.origin}/play?s=${snapshot.sessionId}`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 380px) 1fr",
        gap: 28,
        width: "100%",
        maxWidth: 1040,
        alignItems: "stretch",
      }}
    >
      <div className="glass-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <span className="eyebrow">Escanea para unirte</span>
        <div style={{ background: "#fff", padding: 16, borderRadius: 16 }}>
          <QRCodeSVG value={joinUrl} size={220} />
        </div>
        <p style={{ wordBreak: "break-all", textAlign: "center", color: "var(--color-text-dim)", fontSize: 13 }}>
          {joinUrl}
        </p>
      </div>

      <div className="glass-card" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="eyebrow">Participantes conectados</span>
          <span
            className="display-title"
            style={{ fontSize: 44 }}
          >
            {snapshot.players.filter((p) => p.connected).length}
          </span>
        </div>

        <div
          style={{
            flex: 1,
            marginTop: 16,
            maxHeight: 320,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {snapshot.players.length === 0 && (
            <p style={{ color: "var(--color-text-faint)" }}>
              Esperando a que los participantes escaneen el código QR…
            </p>
          )}
          {snapshot.players.map((p) => (
            <div
              key={p.id}
              className="pill"
              style={{ justifyContent: "space-between", width: "100%" }}
            >
              <span>{p.name}</span>
              {!p.connected && <span style={{ color: "var(--color-warning)" }}>desconectado</span>}
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: 24, alignSelf: "flex-end" }}
          disabled={busy || snapshot.players.length === 0}
          onClick={onConnect}
        >
          Connect →
        </button>
      </div>
    </div>
  );
}

function InstructionsView({ busy, onStartRound }: { busy: boolean; onStartRound: () => void }) {
  const items = [
    "A cada jugador se le asignó un color",
    "Levanta tu celular",
    "Busca a las personas de tu mismo color",
    "Tendrás 5 minutos por ronda",
    "Cuando conozcas a alguien ambos deberán confirmarlo",
  ];
  return (
    <div className="glass-card" style={{ maxWidth: 640, width: "100%" }}>
      <span className="eyebrow">Instrucciones para los jugadores</span>
      <ol style={{ fontSize: 19, lineHeight: 1.8, color: "var(--color-text)", paddingLeft: 22 }}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <button className="btn btn-primary" disabled={busy} onClick={onStartRound} style={{ marginTop: 12 }}>
        Iniciar ronda 1
      </button>
    </div>
  );
}

function ColorAssignmentView({
  snapshot,
  busy,
  onBeginTimer,
}: {
  snapshot: AdminSnapshot;
  busy: boolean;
  onBeginTimer: () => void;
}) {
  const groupCounts = new Map<string, { color: string; count: number }>();
  for (const p of snapshot.players) {
    if (!p.color) continue;
    const key = p.color.name;
    const entry = groupCounts.get(key) ?? { color: p.color.hex, count: 0 };
    entry.count += 1;
    groupCounts.set(key, entry);
  }

  return (
    <div className="glass-card" style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
      <span className="eyebrow">Ronda {snapshot.currentRound} de {snapshot.totalRounds}</span>
      <h2 className="display-title" style={{ fontSize: "clamp(26px,4vw,38px)" }}>
        Grupos formados — busquen su color
      </h2>
      <p style={{ color: "var(--color-text-dim)" }}>
        Dales unos segundos a los participantes para encontrar físicamente a las personas
        de su mismo color antes de iniciar el cronómetro.
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "center",
          margin: "24px 0",
        }}
      >
        {[...groupCounts.entries()].map(([name, { color, count }]) => (
          <div
            key={name}
            className="pill"
            style={{ borderColor: color, gap: 10 }}
          >
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
            {name} · {count}
          </div>
        ))}
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={onBeginTimer}>
        Iniciar cronómetro (5 min)
      </button>
    </div>
  );
}

function LiveMonitorView({
  snapshot,
  busy,
  onEndRound,
}: {
  snapshot: AdminSnapshot;
  busy: boolean;
  onEndRound: () => void;
}) {
  const secondsLeft = useCountdown(snapshot.roundEndsAt);

  return (
    <div style={{ width: "100%", maxWidth: 1040, display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        className="glass-card"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}
      >
        <div>
          <span className="eyebrow">Ronda {snapshot.currentRound} de {snapshot.totalRounds} — en vivo</span>
          <div className="display-title" style={{ fontSize: 56 }}>
            {secondsLeft !== null ? formatMMSS(secondsLeft) : "--:--"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <Stat label="Conexiones totales" value={snapshot.totalConnections} />
          <Stat label="Jugadores activos" value={snapshot.players.filter((p) => p.connected).length} />
        </div>
        <button className="btn btn-danger" disabled={busy} onClick={onEndRound}>
          Terminar ronda
        </button>
      </div>

      <Leaderboard entries={snapshot.leaderboard} />
    </div>
  );
}

function BetweenRoundsView({
  snapshot,
  busy,
  onNextRound,
  onFinishGame,
}: {
  snapshot: AdminSnapshot;
  busy: boolean;
  onNextRound: () => void;
  onFinishGame: () => void;
}) {
  const isLastRound = snapshot.currentRound >= snapshot.totalRounds;
  return (
    <div style={{ width: "100%", maxWidth: 1040, display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="glass-card" style={{ textAlign: "center" }}>
        <span className="eyebrow">
          Ronda {snapshot.currentRound} de {snapshot.totalRounds} completada
        </span>
        <h2 className="display-title" style={{ fontSize: "clamp(26px,4vw,38px)" }}>
          {isLastRound ? "Todas las rondas terminaron" : "Preparando la siguiente ronda"}
        </h2>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={isLastRound ? onFinishGame : onNextRound}
          style={{ marginTop: 8 }}
        >
          {isLastRound ? "Ver resultados finales" : `Iniciar ronda ${snapshot.currentRound + 1}`}
        </button>
      </div>
      <Leaderboard entries={snapshot.leaderboard} />
    </div>
  );
}

function FinalResultsView({ snapshot }: { snapshot: AdminSnapshot }) {
  const top = snapshot.leaderboard[0];
  return (
    <div style={{ width: "100%", maxWidth: 1040, display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="glass-card" style={{ textAlign: "center" }}>
        <span className="eyebrow">Resultados finales</span>
        <h2 className="display-title" style={{ fontSize: "clamp(32px,5vw,52px)" }}>
          🏆 {top ? top.name : "Sin ganador"}
        </h2>
        <p style={{ color: "var(--color-text-dim)", fontSize: 18 }}>
          {top ? `${top.score} conexiones confirmadas` : "Nadie confirmó conexiones"}
        </p>
        <p style={{ color: "var(--color-text-dim)" }}>
          Total de conexiones generadas en el evento: <strong>{snapshot.totalConnections}</strong>
        </p>
      </div>
      <Leaderboard entries={snapshot.leaderboard} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="glass-card">
      <span className="eyebrow">Leaderboard</span>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
        {entries.length === 0 && (
          <p style={{ color: "var(--color-text-faint)" }}>Aún no hay conexiones confirmadas.</p>
        )}
        {entries.map((e, i) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 16px",
              borderRadius: 12,
              background: i === 0 && e.score > 0 ? "rgba(0,255,127,0.12)" : "rgba(255,255,255,0.04)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                width: 28,
                color: i === 0 && e.score > 0 ? "var(--color-success)" : "var(--color-text-faint)",
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1, fontWeight: 600 }}>
              {e.name} {!e.connected && <span style={{ color: "var(--color-warning)", fontSize: 12 }}>(desconectado)</span>}
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{e.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
