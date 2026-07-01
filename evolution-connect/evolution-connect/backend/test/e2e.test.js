const { io } = require("socket.io-client");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const gs = require("./src/gameState");
const { registerSocketHandlers } = require("./src/socketHandlers");

const app = express();
const server = http.createServer(app);
const ioServer = new Server(server, { cors: { origin: "*" } });
registerSocketHandlers(ioServer);

server.listen(0, async () => {
  const port = server.address().port;
  const url = `http://localhost:${port}`;

  const admin = io(url);
  const p1 = io(url);
  const p2 = io(url);
  const p3 = io(url);

  await new Promise((r) => admin.on("connect", r));
  await new Promise((r) => p1.on("connect", r));
  await new Promise((r) => p2.on("connect", r));
  await new Promise((r) => p3.on("connect", r));

  const emitAck = (socket, event, payload) =>
    new Promise((resolve) => socket.emit(event, payload, resolve));

  admin.emit("admin:join", {}, () => {});

  const j1 = await emitAck(p1, "player:join", { name: "Ana" });
  const j2 = await emitAck(p2, "player:join", { name: "Beto" });
  const j3 = await emitAck(p3, "player:join", { name: "Ana" }); // nombre duplicado
  console.log("Join Ana:", j1.ok);
  console.log("Join Beto:", j2.ok);
  console.log("Join Ana duplicado (debe fallar):", j3.ok === false, j3.error);

  const connectRes = await emitAck(admin, "admin:connect_game", {});
  console.log("Admin connect_game:", connectRes.ok);

  const startRes = await emitAck(admin, "admin:start_round", {});
  console.log("Admin start_round:", startRes.ok, "ronda:", startRes.round);

  const beginRes = await emitAck(admin, "admin:begin_timer", {});
  console.log("Admin begin_timer:", beginRes.ok);

  const snap1 = await emitAck(p1, "player:get_snapshot", {});
  console.log(
    "Ana ve color:",
    snap1.snapshot.me.color?.name,
    "| compañeros de grupo:",
    snap1.snapshot.groupMembers.map((m) => m.name)
  );

  const betoId = snap1.snapshot.groupMembers.find((m) => m.name === "Beto")?.id;

  // Ana selecciona a Beto (pending)
  const sel1 = await emitAck(p1, "player:select", { targetId: betoId });
  console.log("Ana selecciona a Beto -> confirmed:", sel1.confirmed, "(debe ser false)");

  // Beto selecciona a Ana (mutuo -> confirmado)
  const anaId = j1.playerId;
  const sel2 = await emitAck(p2, "player:select", { targetId: anaId });
  console.log("Beto selecciona a Ana -> confirmed:", sel2.confirmed, "(debe ser true)");

  const finishRes = await emitAck(admin, "admin:finish_game", {});
  console.log(
    "Resultados finales -> ganador(es):",
    finishRes.results.winners.map((w) => `${w.name} (${w.score} pts)`),
    "| total conexiones:",
    finishRes.results.totalConnections
  );

  admin.close();
  p1.close();
  p2.close();
  p3.close();
  server.close();
  console.log("\n✅ Prueba E2E completada sin errores.");
  process.exit(0);
});
