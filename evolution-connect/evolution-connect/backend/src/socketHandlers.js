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
      io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
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
      io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
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
      io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
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
        io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
      });
      io.to(PLAYERS_ROOM).emit("round_started", {
        round: state.currentRound,
        roundEndsAt: state.roundEndsAt,
      });
      io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
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
      io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
      ack?.({ ok: true });
    });

    // Admin finaliza el juego tras la última ronda
    socket.on("admin:finish_game", (_payload, ack) => {
      const state = gs.getState();
      const results = gs.computeFinalResults();
      io.to(PLAYERS_ROOM).emit("game_finished", results);
      io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
      ack?.({ ok: true, results });
    });

    // ---------- PLAYER ----------
    socket.on("player:join", ({ name } = {}, ack) => {
      try {
        const player = gs.addPlayer({ name, socketId: socket.id });
        socket.join(PLAYERS_ROOM);
        socket.data.playerId = player.id;

        io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
        ack?.({ ok: true, playerId: player.id, status: gs.getState().status });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

// Reconexión: el jugador vuelve a entrar con un playerId que ya tenía
    socket.on("player:rejoin", ({ playerId } = {}, ack) => {
      try {
        const player = gs.reconnectPlayer(playerId, socket.id);
        if (!player) return ack?.({ ok: false, error: "PLAYER_NOT_FOUND" });

        socket.join(PLAYERS_ROOM);
        socket.data.playerId = player.id;
        io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
        ack?.({
          ok: true,
          playerId: player.id,
          snapshot: gs.serializePlayerSnapshot(player.id),
        });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
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
          io.to(ADMIN_ROOM).emit("leaderboard_updated", gs.serializeLeaderboard());
        } else if (!result.alreadyConfirmed) {
          io.to(to.socketId).emit("connection_pending", {
            fromId: from.id,
            fromName: from.name,
          });
        }
        io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
        ack?.({ ok: true, confirmed: !!result.confirmed });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("disconnect", () => {
      const player = gs.markDisconnected(socket.id);
      if (player) {
        io.to(ADMIN_ROOM).emit("admin_snapshot", gs.serializeAdminSnapshot());
      }
    });
  });
}

module.exports = { registerSocketHandlers };
