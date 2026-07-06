/**
 * socketHandlers.js
 * ---------------------------------------------------------
 * Registra todos los eventos de Socket.IO. Dos "salas" lógicas:
 *  - "admins": pantallas de administración/monitor.
 *  - "players": todos los jugadores conectados.
 * ---------------------------------------------------------
 */

const gs = require("./gameState");

const ADMIN_ROOM = "admins";
const PLAYERS_ROOM = "players";

// Con cientos de jugadores tocando botones al mismo tiempo, reconstruir y
// retransmitir la lista completa de jugadores en CADA clic satura al
// servidor (cada snapshot serializa a todos los jugadores + el leaderboard).
// Para las acciones de alta frecuencia (clics de jugadores) agrupamos varias
// actualizaciones en una sola retransmisión cada ~200ms. El admin sigue
// viendo el conteo actualizarse casi en tiempo real (200ms es imperceptible),
// pero el servidor deja de rehacer ese trabajo miles de veces por segundo.
let snapshotBroadcastTimer = null;
function broadcastAdminSnapshotThrottled(io) {
  if (snapshotBroadcastTimer) return;
  snapshotBroadcastTimer = setTimeout(() => {
    snapshotBroadcastTimer = null;
    io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
  }, 200);
}

// Para acciones que el ADMIN dispara directamente (start_round, end_round,
// etc.) sí tiene sentido retransmitir de inmediato: son poco frecuentes
// (unas cuantas veces por evento) y el admin espera ver el cambio al toque.
function broadcastAdminSnapshotImmediate(io) {
  if (snapshotBroadcastTimer) {
    clearTimeout(snapshotBroadcastTimer);
    snapshotBroadcastTimer = null;
  }
  io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
}

// Para "leaderboard_updated" (se dispara cada vez que se confirma una
// conexión mutua) aplicamos el mismo criterio: agrupar ráfagas de
// confirmaciones simultáneas en una sola retransmisión.
let leaderboardBroadcastTimer = null;
function broadcastLeaderboardThrottled(io) {
  if (leaderboardBroadcastTimer) return;
  leaderboardBroadcastTimer = setTimeout(() => {
    leaderboardBroadcastTimer = null;
    io.to(ADMIN_ROOM).emit("leaderboard_updated", gs.serializeLeaderboard());
  }, 200);
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    // ---------- ADMIN ----------
    socket.on("admin:join", (_payload, ack) => {
      socket.join(ADMIN_ROOM);
      ack?.({ ok: true, snapshot: gs.serializeAdminSnapshot() });
    });

    socket.on("admin:reset_game", (_payload, ack) => {
      gs.resetGame();
      io.to(PLAYERS_ROOM).emit("game_reset");
      broadcastAdminSnapshotImmediate(io);
      ack?.({ ok: true, snapshot: gs.serializeAdminSnapshot() });
    });

    // Admin presiona "CONNECT": pasa del lobby a la pantalla de instrucciones
    socket.on("admin:connect_game", (_payload, ack) => {
      const state = gs.getState();
      if (state.status !== gs.STATUS.LOBBY) {
        return ack?.({ ok: false, error: "INVALID_STATE" });
      }
      state.status = gs.STATUS.INSTRUCTIONS;
      io.to(PLAYERS_ROOM).emit("game_connected");
      broadcastAdminSnapshotImmediate(io);
      ack?.({ ok: true });
    });

    // Admin presiona "START ROUND": genera colores + arranca timer
    socket.on("admin:start_round", (_payload, ack) => {
      const state = gs.getState();
      if (
        state.status !== gs.STATUS.INSTRUCTIONS &&
        state.status !== gs.STATUS.BETWEEN_ROUNDS
      ) {
        return ack?.({ ok: false, error: "INVALID_STATE" });
      }
      if (state.players.size === 0) {
        return ack?.({ ok: false, error: "NO_PLAYERS" });
      }

      gs.startNextRound();

      // Enviar a cada jugador su color/grupo individualmente
      for (const player of state.players.values()) {
        if (!player.connected) continue;
        io.to(player.socketId).emit("round_generated", {
          round: state.currentRound,
          totalRounds: state.totalRounds,
          color: player.color,
        });
      }
      broadcastAdminSnapshotImmediate(io);
      ack?.({ ok: true, round: state.currentRound });
    });

    // Admin confirma que arranca el cronómetro de la ronda (tras mostrar colores)
    socket.on("admin:begin_timer", (_payload, ack) => {
      const state = gs.getState();
      if (state.status !== gs.STATUS.COLOR_ASSIGNMENT) {
        return ack?.({ ok: false, error: "INVALID_STATE" });
      }
      gs.beginRoundTimer(() => {
        io.to(PLAYERS_ROOM).emit("round_ended", {
          round: state.currentRound,
        });
        broadcastAdminSnapshotImmediate(io);
      });
      io.to(PLAYERS_ROOM).emit("round_started", {
        round: state.currentRound,
        roundEndsAt: state.roundEndsAt,
      });
      broadcastAdminSnapshotImmediate(io);
      ack?.({ ok: true });
    });

    // Admin corta la ronda manualmente antes de tiempo
    socket.on("admin:end_round", (_payload, ack) => {
      const state = gs.getState();
      if (state.status !== gs.STATUS.ROUND_ACTIVE) {
        return ack?.({ ok: false, error: "INVALID_STATE" });
      }
      gs.endRound();
      io.to(PLAYERS_ROOM).emit("round_ended", { round: state.currentRound });
      broadcastAdminSnapshotImmediate(io);
      ack?.({ ok: true });
    });

    // Admin finaliza el juego tras la última ronda
    socket.on("admin:finish_game", (_payload, ack) => {
      const state = gs.getState();
      const results = gs.computeFinalResults();
      io.to(PLAYERS_ROOM).emit("game_finished", results);
      broadcastAdminSnapshotImmediate(io);
      ack?.({ ok: true, results });
    });

    // ---------- PLAYER ----------
    socket.on("player:join", ({ name } = {}, ack) => {
      try {
        const player = gs.addPlayer({ name, socketId: socket.id });
        socket.join(PLAYERS_ROOM);
        socket.data.playerId = player.id;

        broadcastAdminSnapshotThrottled(io);
        ack?.({ ok: true, playerId: player.id, status: gs.getState().status });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Reconexión: el jugador vuelve a entrar con un playerId que ya tenía
    socket.on("player:rejoin", ({ playerId } = {}, ack) => {
      const player = gs.getPlayer(playerId);
      if (!player) return ack?.({ ok: false, error: "PLAYER_NOT_FOUND" });
      player.socketId = socket.id;
      player.connected = true;
      socket.join(PLAYERS_ROOM);
      socket.data.playerId = player.id;
      broadcastAdminSnapshotThrottled(io);
      ack?.({
        ok: true,
        playerId: player.id,
        snapshot: gs.serializePlayerSnapshot(player.id),
      });
    });

    socket.on("player:get_snapshot", (_payload, ack) => {
      const playerId = socket.data.playerId;
      if (!playerId) return ack?.({ ok: false, error: "NOT_JOINED" });
      ack?.({ ok: true, snapshot: gs.serializePlayerSnapshot(playerId) });
    });

    // Jugador A selecciona/confirma a Jugador B
    socket.on("player:select", ({ targetId } = {}, ack) => {
      const fromId = socket.data.playerId;
      if (!fromId) return ack?.({ ok: false, error: "NOT_JOINED" });

      try {
        const result = gs.selectPlayer(fromId, targetId);
        const state = gs.getState();
        const from = state.players.get(fromId);
        const to = state.players.get(targetId);

        if (result.confirmed) {
          io.to(from.socketId).emit("connection_confirmed", {
            withId: to.id,
            withName: to.name,
            myScore: from.score,
          });
          io.to(to.socketId).emit("connection_confirmed", {
            withId: from.id,
            withName: from.name,
            myScore: to.score,
          });
          broadcastLeaderboardThrottled(io);
        } else if (!result.alreadyConfirmed) {
          io.to(to.socketId).emit("connection_pending", {
            fromId: from.id,
            fromName: from.name,
          });
        }
        broadcastAdminSnapshotThrottled(io);
        ack?.({ ok: true, confirmed: !!result.confirmed });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("disconnect", () => {
      const player = gs.markDisconnected(socket.id);
      if (player) {
        broadcastAdminSnapshotThrottled(io);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
