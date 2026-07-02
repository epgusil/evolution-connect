# Evolution Connect — USIL Evolution

Juego de networking en tiempo real para el evento USIL Evolution. Los participantes
escanean un QR, reciben un color, se buscan físicamente y confirman las personas que
conocieron durante cada ronda.

## Estructura del proyecto

```
evolution-connect/
├── backend/     Servidor Express + Socket.IO (estado 100% en memoria)
└── frontend/    App React + TypeScript + Vite (panel admin + vista jugador)
```

## Desarrollo local

### 1. Backend

```bash
cd backend
npm install
npm run dev        # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

El frontend en desarrollo ya apunta a `http://localhost:4000` (ver `.env.development`).

- Panel de administración: `http://localhost:5173/admin`
- Unirse como jugador: `http://localhost:5173/play`

### Pruebas del backend

```bash
cd backend
node test/e2e.test.js
node test/full-flow.test.js
```

## Despliegue en producción

Ver la guía paso a paso completa en la conversación con Claude, o en resumen:

1. Sube este proyecto a un repositorio de GitHub.
2. Backend → desplegar en **Render** (Web Service, always-on, soporta WebSockets).
3. Frontend → desplegar en **Vercel** (build estático de Vite).
4. Configura `FRONTEND_URL` en Render con la URL de Vercel.
5. Configura `VITE_BACKEND_URL` en Vercel con la URL de Render.

⚠️ Este proyecto **no puede** desplegarse en GitHub Pages porque el backend
necesita WebSockets y estado en memoria persistente entre conexiones — algo que
un hosting puramente estático no soporta.

## Historial de fixes importantes

- **[Fix] El desempate ahora lo decide el servidor una sola vez.** Antes, la
  "ruleta" de desempate era pura animación local: cada celular giraba con su
  propio número aleatorio y decidía por su cuenta si su dueño había ganado.
  Si dos personas empataban, ambas podían terminar viendo "¡Eres el ganador!"
  al mismo tiempo. Ahora el servidor sortea un único ganador
  (`resolvedWinnerId`) apenas se finaliza el juego, y todos los celulares —
  incluida la ruleta animada — muestran ese mismo resultado (ver
  `computeFinalResults` en `backend/src/gameState.js` y `TieBreakerRoulette`
  en `frontend/src/pages/PlayerPage.tsx`).

- **[Fix] Desconexiones momentáneas ya no descuadran los grupos ni sacan a nadie
  de la sesión.** Antes, si un jugador perdía señal un instante justo cuando el
  admin iniciaba una nueva ronda (muy común en el WiFi de un evento), se le
  excluía silenciosamente del cálculo de grupos: los tamaños de grupo quedaban
  desbalanceados (p. ej. un grupo de 3 y uno de 1) y, si su índice de grupo
  anterior no encajaba con la nueva ronda, el servidor podía fallar al armar su
  pantalla ("lo sacaba" de la sesión). Ahora la formación de grupos siempre
  considera a todos los que se unieron a la sesión, sin importar si su
  conexión parpadeó un momento, y el servidor nunca revienta por un estado
  inconsistente (ver `backend/src/gameState.js`).

## Notas técnicas

- **Sin base de datos**: todo el estado (jugadores, grupos, conexiones) vive en la
  memoria del proceso del backend. Si el backend se reinicia, el juego se resetea.
- **Una sola sesión activa a la vez**, tal como pide la especificación.
- **Algoritmo de grupos**: heurística greedy que minimiza encuentros repetidos entre
  rondas (`backend/src/matching.js`), ver comentarios en el archivo para el detalle.
