/**
 * gameState.js
 * ---------------------------------------------------------
 * Estado del juego, 100% en memoria (sin base de datos).
 * Existe una única sesión activa a la vez, tal como lo pide la
 * especificación ("Single active session at a time").
 * ---------------------------------------------------------
 */

const { nanoid } = require("nanoid");
const { generateRound } = require("./matching");

const TOTAL_ROUNDS = 3;
const ROUND_DURATION_SECONDS = 5 * 60; // 5 minutos

const STATUS = {
  LOBBY: "lobby", // esperando jugadores, admin ve QR
  INSTRUCTIONS: "instructions", // admin presionó CONNECT, se muestran instrucciones
  COLOR_ASSIGNMENT: "color_assignment", // jugadores ven su color antes de que arranque el timer
  ROUND_ACTIVE: "round_active", // timer corriendo, jugadores confirman conexiones
  BETWEEN_ROUNDS: "between_rounds", // ronda terminó, esperando siguiente
  FINISHED: "finished", // juego terminado, mostrando resultados
};

function createFreshState() {
  return {
    sessionId: nanoid(8),
    status: STATUS.LOBBY,
    createdAt: Date.now(),
    totalRounds: TOTAL_ROUNDS,
    roundDurationSeconds: ROUND_DURATION_SECONDS,
    currentRound: 0,
    players: new Map(), // id -> player
    meetCounts: new Map(), // id -> Map(otherId -> count)
    confirmedConnections: new Set(), // "idA|idB" (idA < idB)
    roundHistory: [], // [{round, groups: [{color, memberIds}]}]
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
    joinedAt: Date.now(),
    color: null,
    groupIndex: null,
    score: 0,
    pendingSentTo: new Set(), // yo seleccioné a X, falta que X me confirme
    pendingReceivedFrom: new Set(), // X me seleccionó, falta que yo confirme
    connectedIds: new Set(), // conexiones confirmadas (mutuas)
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
  if (player) player.connected = false;
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

function getCurrentGroupForPlayer(p) {
  if (p.groupIndex === null) return null;
  const roundEntry = state.roundHistory[state.currentRound - 1];
  if (!roundEntry) return null;
  const group = roundEntry.groups[p.groupIndex];
  // Defensa extra: si por cualquier motivo el índice de grupo de este
  // jugador no corresponde a la ronda actual (no debería pasar, pero un
  // jugador jamás debe ver el servidor fallar por esto), simplemente no
  // se le muestran compañeros en vez de lanzar un error.
  if (!group) return null;
  return group;
}

function serializePlayerSnapshot(playerId) {
  const p = state.players.get(playerId);
  if (!p) return null;

  const group = getCurrentGroupForPlayer(p);
  const groupMembers = group
    ? group.memberIds
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

/**
 * Genera y asigna la siguiente ronda de grupos.
 *
 * IMPORTANTE: se incluye a TODOS los jugadores que alguna vez se unieron a la
 * sesión, no solo a los que están conectados en este instante. En un evento
 * en vivo con WiFi compartido es normal que un celular pierda señal un par
 * de segundos (pantalla bloqueada, mala señal, etc.). Si a esos jugadores se
 * les excluyera de la ronda, el tamaño y número de grupos cambiaría de forma
 * impredecible entre rondas (grupos desbalanceados, alguien "solo" en un
 * grupo) y su pantalla quedaría desincronizada al reconectarse. Un jugador
 * solo debería salir del conteo si el admin reinicia el juego.
 */
function startNextRound() {
  state.currentRound += 1;
  const activePlayerIds = [...state.players.values()].map((p) => p.id);

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

/**
 * Registra que `fromId` seleccionó a `toId`.
 * Devuelve { confirmed: boolean } indicando si con esta acción
 * se completó una conexión mutua.
 */
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

  const mutual = to.pendingSentTo.has(fromId); // to ya había seleccionado a from antes
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
