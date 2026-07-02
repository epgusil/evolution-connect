const { io } = require("socket.io-client");
const url = "http://localhost:4000";

const emitAck = (s, e, p) => new Promise((r) => s.emit(e, p, r));
const connect = (s) => new Promise((r) => s.on("connect", r));

async function run() {
  console.log("[debug] iniciando script");
  const admin = io(url);
  admin.on("connect_error", (e) => console.log("[debug] admin connect_error", e.message));
  await connect(admin);
  console.log("[debug] admin conectado");
  const names = ["Ana", "Xiomara", "Daniela", "Lucia"];
  const players = names.map(() => io(url));
  await Promise.all(players.map(connect));

  admin.emit("admin:join", {}, () => {});
  console.log("[debug] admin joined");
  const joins = [];
  for (let i = 0; i < players.length; i++) {
    joins.push(await emitAck(players[i], "player:join", { name: names[i] }));
    console.log("[debug] joined", names[i], joins[i].ok);
  }

  console.log("[debug] connect_game ->", (await emitAck(admin, "admin:connect_game", {})));
  console.log("[debug] start_round 1 ->", (await emitAck(admin, "admin:start_round", {})));
  console.log("[debug] begin_timer 1 ->", (await emitAck(admin, "admin:begin_timer", {})));
  console.log("[debug] end_round 1 ->", (await emitAck(admin, "admin:end_round", {})));

  console.log("--- Simulando que 'Lucia' pierde señal un momento (fondo de la app / WiFi del evento) ---");
  players[3].disconnect(); // Lucia se desconecta brevemente, como pasaría con el WiFi del evento
  await new Promise((r) => setTimeout(r, 300));

  console.log("Admin inicia ronda 2 justo en ese momento...");
  const r2 = await emitAck(admin, "admin:start_round", {});
  console.log("start_round 2:", r2.ok, "ronda:", r2.round);
  await emitAck(admin, "admin:begin_timer", {});

  // Lucia se reconecta (WiFi vuelve)
  players[3].connect();
  await connect(players[3]);
  const rejoin = await emitAck(players[3], "player:rejoin", { playerId: joins[3].playerId });
  console.log("Lucia se reconecta, rejoin.ok =", rejoin.ok);

  console.log("\nIntentando pedir snapshot a cada jugador tras la reconexión de Lucia:");
  for (let i = 0; i < players.length; i++) {
    try {
      const res = await Promise.race([
        emitAck(players[i], "player:get_snapshot", {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT / sin respuesta")), 1500)),
      ]);
      console.log(
        ` - ${names[i]}: ok=${res.ok}`,
        res.ok ? `color=${res.snapshot.me.color?.name} compañeros=[${res.snapshot.groupMembers.map((m) => m.name)}]` : res.error
      );
    } catch (e) {
      console.log(` - ${names[i]}: ❌ ${e.message}  <-- ¡esta persona quedó "sacada" de la sesión!`);
    }
  }

  [admin, ...players].forEach((s) => s.close());
  process.exit(0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
