const { nanoid } = require("nanoid");
const { generateRound } = require("./matching");

const TOTAL_ROUNDS = 3;
const ROUND_DURATION_SECONDS = 5 * 60; // 5 minutos

// Tiempo de gracia: si alguien se desconecta (pantalla bloqueada, cambio
// de red, app en segundo plano, etc.) y vuelve a conectarse dentro de
// esta ventana, se le sigue tratando como "presente" para efectos de
// armar los grupos de la siguiente ronda.
const RECONNECT_GRACE_MS = 300 * 1000; // 5 sminutos

const STATUS = {
  LOBBY: "lobby",
  INSTRUCTIONS: "instructions",
  COLOR_ASSIGNMENT: "color_assignment",
  ROUND_ACTIVE: "round_active",
  BETWEEN_ROUNDS: "between_rounds",
  FINISHED: "finished",
};

function createFreshState() {
  return {
    sessionId: nanoid(8),
    status: STATUS.LOBBY,
    createdAt: Date.now(),
    totalRounds: TOTAL_ROUNDS,
    roundDurationSeconds: ROUND_DURATION_SECONDS,
    currentRound: 0,
    players: new Map(),
    meetCounts: new Map(),
    confirmedConnections: new Set(),
    roundHistory: [],
    roundEndsAt: null,
    roundTimer: null,
    tieBreakerCandidates: [],
  };
}

let state = createFreshState();

function resetGame() {
  if (state.roundTimer) clearTimeout(state.roundTimer);
  state = createFreshState();
  return state;
}

function getState() {
  return state;
}

function connKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function addPlayer({ name, socketId }) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("EMPTY_NAME");

  const nameTaken = [...state.players.values()].some(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase() && p.connected
  );
  if (nameTaken) throw new Error("DUPLICATE_NAME");

  const id = nanoid(10);
  const player = {
    id,
    name: trimmed,
    socketId,
    connected: true,
    disconnectedAt: null, // 👈 nuevo
    joinedAt: Date.now(),
    color: null,
    groupIndex: null,
    score: 0,
    pendingSentTo: new Set(),
    pendingReceivedFrom: new Set(),
    connectedIds: new Set(),
  };
  state.players.set(id, player);
  return player;
}

function getPlayer(id) {
  return state.players.get(id);
}

function findPlayerBySocket(socketId) {
  return [...state.players.values()].find((p) => p.socketId === socketId);
}

function markDisconnected(socketId) {
  const player = findPlayerBySocket(socketId);
  if (player) {
    player.connected = false;
    player.disconnectedAt = Date.now(); // 👈 nuevo
  }
  return player;
}

/** Reconecta a un jugador que ya existía (player:rejoin). */
function reconnectPlayer(playerId, socketId) {
  const player = state.players.get(playerId);
  if (!player) return null;
  player.socketId = socketId;
  player.connected = true;
  player.disconnectedAt = null; // 👈 limpia la marca de desconexión
  return player;
}

function serializePlayerPublic(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    groupIndex: p.groupIndex,
    score: p.score,
    connected: p.connected,
  };
}

function serializeLeaderboard() {
  return [...state.players.values()]
    .map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected }))
    .sort((a, b) => b.score - a.score);
}

function serializeAdminSnapshot() {
  return {
    sessionId: state.sessionId,
    status: state.status,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    roundDurationSeconds: state.roundDurationSeconds,
    roundEndsAt: state.roundEndsAt,
    players: [...state.players.values()].map(serializePlayerPublic),
    leaderboard: serializeLeaderboard(),
    totalConnections: state.confirmedConnections.size,
  };
}

function serializePlayerSnapshot(playerId) {
  const p = state.players.get(playerId);
  if (!p) return null;

  // Blindaje: solo intenta leer el grupo si la ronda y el índice
  // realmente existen. Antes esto podía tronar (y tumbar el socket)
  // si groupIndex quedaba desalineado con la ronda actual.
  const currentRoundGroups = state.roundHistory[state.currentRound - 1]?.groups;
  const myGroup =
    p.groupIndex !== null && currentRoundGroups
      ? currentRoundGroups[p.groupIndex]
      : null;

  const groupMembers = myGroup
    ? myGroup.memberIds
        .filter((id) => id !== p.id)
        .map((id) => {
          const other = state.players.get(id);
          const key = connKey(p.id, id);
          let buttonState = "default";
          if (state.confirmedConnections.has(key)) buttonState = "confirmed";
          else if (p.pendingSentTo.has(id)) buttonState = "pending_sent";
          else if (p.pendingReceivedFrom.has(id)) buttonState = "pending_received";
          return {
            id,
            name: other ? other.name : "??",
            buttonState,
          };
        })
    : [];

  return {
    sessionId: state.sessionId,
    status: state.status,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    roundEndsAt: state.roundEndsAt,
    me: {
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
    },
    groupMembers,
  };
}

/** Genera y asigna la siguiente ronda de grupos. */
function startNextRound() {
  state.currentRound += 1;
  const now = Date.now();

  // Se considera "activo" para efectos de armar grupos a quien:
  //  - está conectado ahora mismo, o
  //  - se desconectó hace muy poco (dentro del período de gracia),
  //    porque muy probablemente es un corte momentáneo de celular
  //    y va a reconectarse en segundos.
  const activePlayerIds = [...state.players.values()]
    .filter(
      (p) =>
        p.connected ||
        (p.disconnectedAt !== null && now - p.disconnectedAt < RECONNECT_GRACE_MS)
    )
    .map((p) => p.id);

  const { groups } = generateRound(activePlayerIds, state.meetCounts);

  groups.forEach((g, groupIndex) => {
    g.memberIds.forEach((pid) => {
      const player = state.players.get(pid);
      player.color = g.color;
      player.groupIndex = groupIndex;
      player.pendingSentTo.clear();
      player.pendingReceivedFrom.clear();
    });
  });

  state.roundHistory.push({ round: state.currentRound, groups });
  state.status = STATUS.COLOR_ASSIGNMENT;
  return groups;
}

function beginRoundTimer(onExpire) {
  state.status = STATUS.ROUND_ACTIVE;
  state.roundEndsAt = Date.now() + state.roundDurationSeconds * 1000;
  if (state.roundTimer) clearTimeout(state.roundTimer);
  state.roundTimer = setTimeout(() => {
    endRound();
    onExpire();
  }, state.roundDurationSeconds * 1000);
}

function endRound() {
  if (state.roundTimer) clearTimeout(state.roundTimer);
  state.roundTimer = null;
  state.roundEndsAt = null;
  state.status = STATUS.BETWEEN_ROUNDS;
}

function selectPlayer(fromId, toId) {
  const from = state.players.get(fromId);
  const to = state.players.get(toId);
  if (!from || !to) throw new Error("PLAYER_NOT_FOUND");
  if (fromId === toId) throw new Error("SELF_SELECT");
  if (from.groupIndex === null || from.groupIndex !== to.groupIndex) {
    throw new Error("NOT_SAME_GROUP");
  }

  const key = connKey(fromId, toId);
  if (state.confirmedConnections.has(key)) {
    return { alreadyConfirmed: true, confirmed: false };
  }

  from.pendingSentTo.add(toId);
  to.pendingReceivedFrom.add(fromId);

  const mutual = to.pendingSentTo.has(fromId);
  if (mutual) {
    state.confirmedConnections.add(key);
    from.connectedIds.add(toId);
    to.connectedIds.add(fromId);
    from.score += 1;
    to.score += 1;
    from.pendingSentTo.delete(toId);
    from.pendingReceivedFrom.delete(toId);
    to.pendingSentTo.delete(fromId);
    to.pendingReceivedFrom.delete(fromId);
    return { confirmed: true, from, to };
  }

  return { confirmed: false, from, to };
}

function computeFinalResults() {
  const leaderboard = serializeLeaderboard();
  const topScore = leaderboard[0]?.score ?? 0;
  const winners = leaderboard.filter((p) => p.score === topScore && topScore > 0);
  state.status = STATUS.FINISHED;
  state.tieBreakerCandidates = winners;
  return {
    leaderboard,
    winners,
    needsTieBreaker: winners.length > 1,
    totalConnections: state.confirmedConnections.size,
  };
}

module.exports = {
  STATUS,
  getState,
  resetGame,
  addPlayer,
  getPlayer,
  findPlayerBySocket,
  markDisconnected,
  reconnectPlayer, // 👈 nuevo export
  serializePlayerPublic,
  serializeLeaderboard,
  serializeAdminSnapshot,
  serializePlayerSnapshot,
  startNextRound,
  beginRoundTimer,
  endRound,
  selectPlayer,
  computeFinalResults,
};
