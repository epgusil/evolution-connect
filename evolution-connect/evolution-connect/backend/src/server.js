const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const gs = require("./gameState");
const { registerSocketHandlers } = require("./socketHandlers");

const PORT = process.env.PORT || 4000;
// URL del frontend desplegado (Vercel/Netlify). Se puede pasar varias separadas por coma.
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map((s) => s.trim());

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "evolution-connect-backend" });
});

app.get("/health", (_req, res) => {
  const state = gs.getState();
  res.json({
    status: "ok",
    sessionId: state.sessionId,
    gameStatus: state.status,
    players: state.players.size,
  });
});

// Info pública de la sesión activa, útil para que el frontend arme la URL del QR
app.get("/api/session", (_req, res) => {
  const state = gs.getState();
  res.json({ sessionId: state.sessionId, status: state.status });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
  pingInterval: 10000,
  pingTimeout: 15000,
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Evolution Connect backend escuchando en puerto ${PORT}`);
});
