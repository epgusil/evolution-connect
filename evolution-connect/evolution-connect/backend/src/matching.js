/** Calcula cuántos grupos y de qué tamaño, dado el total de jugadores. */
function computeGroupCapacities(totalPlayers) {
  if (totalPlayers <= 0) return [];

  let numGroups = Math.round(totalPlayers / TARGET_GROUP_SIZE);
  // Siempre intentamos al menos 2 grupos para que haya "mezcla"...
  numGroups = Math.max(2, numGroups);
  // ...pero NUNCA más grupos de los que permite tener al menos 2
  // personas por grupo. Esto evita el bug de grupos de 1 persona
  // (ej. antes: 3 jugadores -> antes daba [3] bien, pero con 4 y
  // uno "fantasma" fuera del conteo, terminaba en grupos como [3,1]).
  const maxGroupsWithAtLeastTwo = Math.max(1, Math.floor(totalPlayers / 2));
  numGroups = Math.max(1, Math.min(numGroups, maxGroupsWithAtLeastTwo));

  const base = Math.floor(totalPlayers / numGroups);
  const remainder = totalPlayers - base * numGroups;

  const capacities = [];
  for (let i = 0; i < numGroups; i++) {
    capacities.push(base + (i < remainder ? 1 : 0));
  }
  return capacities;
}
