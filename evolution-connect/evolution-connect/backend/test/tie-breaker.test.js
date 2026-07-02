const { io } = require("socket.io-client");
const url = "http://localhost:4000";

const emitAck = (s, e, p) => new Promise((r) => s.emit(e, p, r));
const connect = (s) => new Promise((r) => s.on("connect", r));

async function run() {
  const admin = io(url);
  await connect(admin);
  const names = ["Adrian", "Jaime"];
  const players = names.map(() => io(url));
  await Promise.all(players.map(connect));

  admin.emit("admin:join", {}, () => {});
  const joins = [];
  for (let i = 0; i < players.length; i++) {
    joins.push(await emitAck(players[i], "player:join", { name: names[i] }));
  }

  await emitAck(admin, "admin:connect_game", {});
  await emitAck(admin, "admin:start_round", {});
  await emitAck(admin, "admin:begin_timer", {});

  // Adrian y Jaime se confirman mutuamente -> ambos quedan con 1 punto (empate)
  const adrianId = joins[0].playerId;
  const jaimeId = joins[1].playerId;
  await emitAck(players[0], "player:select", { targetId: jaimeId });
  const confirmRes = await emitAck(players[1], "player:select", { targetId: adrianId });
  console.log("Conexión confirmada:", confirmRes.confirmed);

  await emitAck(admin, "admin:end_round", {});
  const finish = await emitAck(admin, "admin:finish_game", {});
  console.log("resolvedWinnerId (servidor):", finish.results.resolvedWinnerId);
  console.log("winners (empatados):", finish.results.winners.map((w) => w.name));

  // Cada jugador consulta si ÉL es el ganador, usando la misma lógica que el frontend
  for (let i = 0; i < players.length; i++) {
    const myId = joins[i].playerId;
    const iAmWinner = finish.results.resolvedWinnerId === myId;
    console.log(`${names[i]} ve "soy el ganador" = ${iAmWinner}`);
  }

  const winnersFlaggedTrue = names.filter(
    (_, i) => finish.results.resolvedWinnerId === joins[i].playerId
  );
  console.log(
    winnersFlaggedTrue.length === 1
      ? `\n✅ Correcto: solo ${winnersFlaggedTrue[0]} ve el mensaje de ganador.`
      : `\n❌ ERROR: ${winnersFlaggedTrue.length} personas ven el mensaje de ganador.`
  );

  [admin, ...players].forEach((s) => s.close());
  process.exit(0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
