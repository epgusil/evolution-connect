/**
 * matching.js
 * ---------------------------------------------------------
 * Algoritmo de formación de grupos ("social golfer problem" simplificado).
 *
 * Objetivo: en cada ronda, repartir a los jugadores en grupos balanceados
 * (diferencia máxima de 1 persona entre el grupo más grande y el más chico)
 * minimizando, de forma greedy, el número de personas que ya se conocieron
 * en rondas anteriores dentro del mismo grupo.
 *
 * No es un solver exacto (NP-difícil para tamaños grandes), pero da
 * resultados muy buenos en la práctica: cada jugador termina conociendo un
 * conjunto casi totalmente distinto de personas en cada ronda.
 * ---------------------------------------------------------
 */

// Siempre hay 10 "salas" de color fijas (no depende de la cantidad de
// jugadores). Cada sala necesita un mínimo de 2 personas para tener sentido
// (que haya con quién conocerse), así que se necesitan al menos 20
// jugadores para llenar las 10 a la vez.
const TARGET_NUM_GROUPS = 10;
const MIN_PLAYERS_PER_GROUP = 2;

const COLOR_PALETTE = [
  { name: "Azul Conexión", hex: "#00CFFF" },
  { name: "Morado Cuántico", hex: "#5A00FF" },
  { name: "Magenta Innovador", hex: "#FF00C8" },
  { name: "Verde Evolutivo", hex: "#00FF7F" },
  { name: "Naranja Dinámico", hex: "#FF8C00" },
  { name: "Rojo Disruptivo", hex: "#FF3B3B" },
  { name: "Cian Digital", hex: "#00FFE5" },
  { name: "Amarillo Visionario", hex: "#FFD700" },
  { name: "Índigo Inteligente", hex: "#3D5AFE" },
  { name: "Rosa Colaborativo", hex: "#FF6FD8" },
];

function colorForIndex(index) {
  // Con el límite fijo de 10 grupos, index nunca debería salirse del
  // tamaño de la paleta, pero se deja esta protección por si acaso.
  const base = COLOR_PALETTE[index % COLOR_PALETTE.length];
  const cycle = Math.floor(index / COLOR_PALETTE.length);
  return cycle === 0
    ? base
    : { name: `${base.name} ${cycle + 1}`, hex: base.hex };
}

/**
 * Calcula cuántos grupos y de qué tamaño, dado el total de jugadores.
 *
 * - Con 20 jugadores o más: siempre exactamente 10 grupos (las 10 salas
 *   de color), repartidos lo más parejo posible.
 * - Con menos de 20: se reduce el número de grupos (nunca por debajo de 2
 *   personas por grupo), manteniendo el reparto lo más parejo posible.
 *   Ejemplos: 4 jugadores -> 2 grupos de 2. 9 jugadores -> 1 grupo de 3 y
 *   3 grupos de 2 (4 grupos en total).
 */
function computeGroupCapacities(totalPlayers) {
  if (totalPlayers <= 0) return [];
  if (totalPlayers === 1) return [1]; // caso degenerado: un solo jugador

  const maxGroupsByMinSize = Math.floor(totalPlayers / MIN_PLAYERS_PER_GROUP);
  const numGroups = Math.max(1, Math.min(TARGET_NUM_GROUPS, maxGroupsByMinSize));

  const base = Math.floor(totalPlayers / numGroups);
  const remainder = totalPlayers - base * numGroups;

  const capacities = [];
  for (let i = 0; i < numGroups; i++) {
    capacities.push(base + (i < remainder ? 1 : 0));
  }
  return capacities;
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Genera los grupos de una nueva ronda.
 * @param {string[]} playerIds - IDs de jugadores activos.
 * @param {Map<string, Map<string, number>>} meetCounts - historial de encuentros.
 * @returns {{groups: Array<{colorIndex:number, color:object, memberIds:string[]}>, capacities:number[]}}
 */
function generateRound(playerIds, meetCounts) {
  const capacities = computeGroupCapacities(playerIds.length);
  const groups = capacities.map((cap, idx) => ({
    colorIndex: idx,
    color: colorForIndex(idx),
    capacity: cap,
    memberIds: [],
  }));

  const order = shuffle(playerIds);

  for (const pid of order) {
    let bestGroups = [];
    let bestCost = Infinity;
    const myMeets = meetCounts.get(pid);

    for (const g of groups) {
      if (g.memberIds.length >= g.capacity) continue;
      let cost = 0;
      if (myMeets) {
        for (const otherId of g.memberIds) {
          cost += myMeets.get(otherId) || 0;
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestGroups = [g];
      } else if (cost === bestCost) {
        bestGroups.push(g);
      }
    }

    const chosen = bestGroups[Math.floor(Math.random() * bestGroups.length)];
    if (chosen) chosen.memberIds.push(pid);
  }

  // Actualiza el historial de encuentros con los pares formados en esta ronda.
  for (const g of groups) {
    for (let i = 0; i < g.memberIds.length; i++) {
      for (let j = i + 1; j < g.memberIds.length; j++) {
        const a = g.memberIds[i];
        const b = g.memberIds[j];
        bumpMeetCount(meetCounts, a, b);
        bumpMeetCount(meetCounts, b, a);
      }
    }
  }

  return { groups, capacities };
}

function bumpMeetCount(meetCounts, a, b) {
  if (!meetCounts.has(a)) meetCounts.set(a, new Map());
  const inner = meetCounts.get(a);
  inner.set(b, (inner.get(b) || 0) + 1);
}

module.exports = {
  generateRound,
  computeGroupCapacities,
  TARGET_NUM_GROUPS,
  MIN_PLAYERS_PER_GROUP,
};
