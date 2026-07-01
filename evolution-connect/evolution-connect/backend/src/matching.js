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
 * No es un solver exacto (NP-difícil para tamaños grandes), pero para
 * grupos de ~15-25 personas y 3 rondas da resultados muy buenos en la
 * práctica: cada jugador termina conociendo un conjunto casi totalmente
 * distinto de personas en cada ronda.
 * ---------------------------------------------------------
 */

const TARGET_GROUP_SIZE = 20; // tamaño de grupo objetivo, según especificación

const COLOR_PALETTE = [
  { name: "Azul Eléctrico", hex: "#00CFFF" },
  { name: "Violeta Cuántico", hex: "#5A00FF" },
  { name: "Magenta Neón", hex: "#FF00C8" },
  { name: "Verde Matrix", hex: "#00FF7F" },
  { name: "Naranja Pulso", hex: "#FF8C00" },
  { name: "Rojo Plasma", hex: "#FF3B3B" },
  { name: "Cian Digital", hex: "#00FFE5" },
  { name: "Rosa Holográfico", hex: "#FF6FD8" },
  { name: "Amarillo Circuito", hex: "#FFD700" },
  { name: "Índigo Nebulosa", hex: "#3D5AFE" },
  { name: "Turquesa Sintético", hex: "#1DE9B6" },
  { name: "Lima Digital", hex: "#C6FF00" },
  { name: "Coral Futurista", hex: "#FF7043" },
  { name: "Púrpura Galáctico", hex: "#AA00FF" },
  { name: "Menta Holográfica", hex: "#64FFDA" },
  { name: "Ámbar Tecnológico", hex: "#FFAB00" },
];

function colorForIndex(index) {
  const base = COLOR_PALETTE[index % COLOR_PALETTE.length];
  const cycle = Math.floor(index / COLOR_PALETTE.length);
  return cycle === 0
    ? base
    : { name: `${base.name} ${cycle + 1}`, hex: base.hex };
}

/** Calcula cuántos grupos y de qué tamaño, dado el total de jugadores. */
function computeGroupCapacities(totalPlayers) {
  if (totalPlayers <= 0) return [];

  let numGroups = Math.round(totalPlayers / TARGET_GROUP_SIZE);
  // Nunca menos de 2 grupos si hay al menos 4 jugadores (si no, no hay "mezcla").
  if (totalPlayers >= 4) numGroups = Math.max(2, numGroups);
  numGroups = Math.max(1, Math.min(numGroups, totalPlayers));

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
  TARGET_GROUP_SIZE,
};
