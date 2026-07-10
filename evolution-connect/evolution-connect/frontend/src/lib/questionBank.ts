// Las 2 primeras preguntas son siempre iguales, en todas las rondas.
export const STATIC_QUESTIONS: string[] = [
  "¿Cómo te llamas?",
  "¿A qué te dedicas?",
];

// Banco de preguntas más lúdicas — de aquí se sortean 2 por ronda.
const LUDIC_QUESTION_BANK: string[] = [
  "Si pudieras tener una habilidad sobrenatural, ¿cuál sería?",
  "¿Cuál es el viaje más loco o inesperado que has hecho?",
  "¿Qué película o serie podrías ver mil veces sin cansarte?",
  "Si ganaras la lotería mañana, ¿qué es lo primero que harías?",
  "¿Cuál es tu comida favorita de todos los tiempos?",
  "¿Qué talento oculto tienes que casi nadie conoce?",
  "Si pudieras cenar con cualquier persona, viva o no, ¿quién sería?",
  "¿Cuál fue tu primer trabajo o 'chamba'?",
  "¿Qué canción no puede faltar en tu playlist?",
  "Si tu vida fuera una película, ¿qué género sería?",
  "¿Cuál es el mejor consejo que te han dado?",
  "¿Qué harías con un día completamente libre, sin responsabilidades?",
  "¿Cuál es tu súper poder ideal para el trabajo?",
  "¿Qué destino tienes pendiente en tu lista de viajes?",
  "¿Cuál fue la última serie/libro que te voló la cabeza?",
];

/**
 * PRNG determinístico simple (mulberry32), sembrado con un número.
 * Con la misma semilla siempre da la misma secuencia — así todos los
 * jugadores de una misma ronda ven exactamente las mismas 2 preguntas
 * lúdicas, sin necesidad de coordinarlo desde el backend.
 */
function seededRandom(seed: number) {
  let t = seed + 0x6d2b79f5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Devuelve las 4 preguntas sugeridas para una ronda dada:
 * las 2 estáticas + 2 aleatorias (deterministas por ronda) del banco lúdico.
 */
export function getRoundQuestions(round: number): string[] {
  const rand = seededRandom(round * 9301 + 49297);
  const pool = [...LUDIC_QUESTION_BANK];
  const picked: string[] = [];
  for (let i = 0; i < 2 && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return [...STATIC_QUESTIONS, ...picked];
}
