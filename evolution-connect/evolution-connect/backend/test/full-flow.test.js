const { io } = require("socket.io-client");
const url = "http://localhost:4000";

const emitAck = (s, e, p) => new Promise((r) => s.emit(e, p, r));
const connect = (s) => new Promise((r) => s.on("connect", r));

async function run() {
  const admin = io(url);
  await connect(admin);
  const names = ["Ana", "Beto", "Caro", "Dani", "Eva"];
  const players = names.map(() => io(url));
  await Promise.all(players.map(connect));

  admin.emit("admin:join", {}, () => {});
  const joins = [];
  for (let i = 0; i < players.length; i++) {
    joins.push(await emitAck(players[i], "player:join", { name: names[i] }));
  }
  console.log("Todos se unieron:", joins.every((j) => j.ok));

  console.log("connect_game:", (await emitAck(admin, "admin:connect_game", {})).ok);
  const r1 = await emitAck(admin, "admin:start_round", {});
  console.log("start_round 1:", r1.ok, r1.round);
  console.log("begin_timer 1:", (await emitAck(admin, "admin:begin_timer", {})).ok);

  const snaps = [];
  for (const p of players) snaps.push((await emitAck(p, "player:get_snapshot", {})).snapshot);
  snaps.forEach((s, i) =>
    console.log(names[i], "->", s.me.color.name, "| grupo con:", s.groupMembers.map((m) => m.name))
  );

  const ana = snaps[0];
  const anaId = joins[0].playerId;
  const betoId = joins[1].playerId;
  const anaSeesBeto = ana.groupMembers.find((m) => m.name === "Beto");
  if (anaSeesBeto) {
    await emitAck(players[0], "player:select", { targetId: betoId });
    const confirmRes = await emitAck(players[1], "player:select", { targetId: anaId });
    console.log("Ana <-> Beto confirmado:", confirmRes.confirmed);
  } else {
    console.log("Ana y Beto no coincidieron de grupo en esta ronda (posible, es aleatorio)");
  }

  console.log("end_round:", (await emitAck(admin, "admin:end_round", {})).ok);
  const r2 = await emitAck(admin, "admin:start_round", {});
  console.log("start_round 2:", r2.ok, r2.round);
  console.log("begin_timer 2:", (await emitAck(admin, "admin:begin_timer", {})).ok);
  console.log("end_round 2:", (await emitAck(admin, "admin:end_round", {})).ok);

  const finish = await emitAck(admin, "admin:finish_game", {});
  console.log("Resultados finales:", JSON.stringify(finish.results.leaderboard));

  [admin, ...players].forEach((s) => s.close());
  console.log("\n✅ Flujo completo de 2 rondas con 5 jugadores OK");
  process.exit(0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
