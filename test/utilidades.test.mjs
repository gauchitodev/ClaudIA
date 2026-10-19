import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, Rec, C, B, Av, CC, Mem, E, LT;
before(async () => {
  ({ F } = await prepararBase("utilidades"));
  Rec = await import("../lib/recordatorios.js");
  C = await import("../lib/cumpleanos.js");
  B = await import("../lib/backup.js");
  Av = await import("../lib/avisos.js");
  CC = await import("../lib/contexto-chat.js");
  Mem = await import("../lib/memoria-grupo.js");
  E = await import("../lib/economia.js");
  LT = await import("../lib/limpieza-tmp.js");
});

test("recordatorios", async () => {
  const H = 3600e3;
  const r1 = Rec.crearRecordatorio(G, "u", ["en", "2h", "sacar", "la", "pizza"]);
  assert.match(r1.mensaje, /sacar la pizza/);
  assert.ok(Rec.crearRecordatorio(G, "u", ["mañana", "9:00", "pagar", "la", "luz"]).ok);
  assert.ok(Rec.crearRecordatorio(G, "u", ["en", "2", "h", "y", "esto"]).ok);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "2h"]).error, /¿Qué te recuerdo/);
  assert.match(Rec.crearRecordatorio(G, "u", ["sacar", "la", "pizza"]).error, /¿Cuándo/);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "90d", "x"]).error, /60 días/);
  for (let i = 0; i < 7; i++) Rec.crearRecordatorio(G, "u", ["en", "1h", `x${i}`]);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "1h", "otro"]).error, /Ya tenés 10/);
  assert.match(Rec.textoRecordatorios("u"), /#1 · /);
  assert.ok(Rec.olvidarRecordatorio("u", 1).ok && !Rec.olvidarRecordatorio("u", 1).ok && !Rec.olvidarRecordatorio("otro", 2).ok);
  await Rec.ejecutarRecordatorio(globalThis.client, { chat: G, usuario: "598@lid", datos: { texto: "sacar la pizza" } });
  assert.match(ultimoEnviado().msg.text, /@598, me pediste que te recuerde: \*sacar la pizza\*/);
  void H;
});

test("cumpleaños", async () => {
  assert.match(C.registrarCumple(G, "a", "").error, /Anotá tu cumple/);
  assert.ok(C.registrarCumple(G, "a", "14/03").ok);
  assert.match(C.registrarCumple(G, "a", "").mensaje, /14 de marzo/);
  assert.ok(C.registrarCumple(G, "b", "29-02").ok);
  assert.ok(!C.registrarCumple(G, "d", "31/04").ok && !C.registrarCumple(G, "d", "hola").ok);
  assert.equal(C.diasHasta(2, 9, new Date(2026, 8, 2)), 0);
  assert.equal(C.diasHasta(1, 9, new Date(2026, 8, 2)), 364);
  assert.equal(C.textoCumples(G).mentions.length, 2);
  assert.ok(C.registrarCumple(G, "b", "borrar").ok);
  const hoy = new Date();
  C.registrarCumple(G, "598@lid", `${hoy.getDate()}/${hoy.getMonth() + 1}`);
  C.CUMPLE.HORA_SALUDO = 0;
  const antes = globalThis.enviados.length;
  await C.chequearCumpleanos();
  await C.chequearCumpleanos();
  assert.equal(globalThis.enviados.length, antes + 1);
  assert.match(ultimoEnviado().msg.text, /@598/);
});

test("cumpleaños del 29/02: en los años sin 29 se festeja el 28", async () => {
  // They were only greeted in leap years, and .cumples said "¡es hoy!" on 1 March.
  assert.equal(C.diasHasta(29, 2, new Date(2027, 1, 28)), 0, "2027 no tiene 29 de febrero");
  assert.equal(C.diasHasta(29, 2, new Date(2027, 2, 1)), 365, "el 1/3 ya falta para el de 2028");
  assert.equal(C.diasHasta(29, 2, new Date(2028, 1, 28)), 1, "2028 sí lo tiene");
  const Z = "bisiesto@g.us";
  assert.ok(C.registrarCumple(Z, "2902@lid", "29/02").ok);
  C.CUMPLE.HORA_SALUDO = 0;
  const saludos = async (fecha) => {
    const antes = globalThis.enviados.length;
    await C.chequearCumpleanos(fecha);
    return globalThis.enviados.slice(antes).filter((e) => e.chat === Z).length;
  };
  assert.equal(await saludos(new Date(2027, 1, 28, 12)), 1, "2027: el 28");
  assert.equal(await saludos(new Date(2028, 1, 28, 12)), 0, "2028: el 28 todavía no");
  assert.equal(await saludos(new Date(2028, 1, 29, 12)), 1, "2028: el 29");
});

test("backup con la copia real de SQLite, rotación y envío semanal", async () => {
  const archivo = await B.hacerBackup();
  assert.ok(fs.existsSync(archivo) && !fs.existsSync(`${archivo}.tmp`));
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(B.BACKUP.CARPETA, `database-2020-01-0${i % 10}.db`), "viejo");
  await B.hacerBackup();
  assert.equal(fs.readdirSync(B.BACKUP.CARPETA).filter((f) => f.endsWith(".db")).length, 7);
  assert.equal(B.ultimoBackup().archivo, archivo);
  assert.equal(B.tamano(2.5 * 1024 * 1024), "2.5 MB");
  B.BACKUP.HORA = 0;
  const antes = globalThis.enviados.length;
  await B.chequearBackupProgramado();
  await B.chequearBackupProgramado();
  assert.equal(globalThis.enviados.length, antes + 1, "una copia semanal al owner");
  assert.equal(Av.jidOwner(), "59899111222@s.whatsapp.net");
  assert.equal(await Av.avisarOwner("hola", "k", 60e3), true);
  assert.equal(await Av.avisarOwner("hola", "k", 60e3), false);
});

test("memoria corta y memoria del grupo", () => {
  for (let i = 0; i < 250; i++) CC.recordarMensaje("c", `u${i}`, `mensaje ${i}`);
  assert.equal(globalThis.contextoChat.get("c").length, 200);
  assert.equal(CC.textoContexto("c", false).split("\n").length, 14);
  assert.match(Mem.recordar(G, "u", "que Fulano siempre llega tarde").mensaje, /Anotado \(#1\): Fulano siempre llega tarde/);
  assert.match(Mem.recordar(G, "u", "x").error, /¿Qué tengo que recordar/);
  assert.match(Mem.recordar(G, "u", "que la contraseña del wifi es 1234").error, /no lo guardo/);
  assert.match(Mem.textoMemoria(G), /#1 · Fulano siempre llega tarde/);
  assert.match(Mem.textoParaPrompt(G), /"Fulano siempre llega tarde"/);
  assert.match(Mem.borrar(G, "otro", 1, false).error, /otra persona/);
  assert.ok(Mem.borrar(G, "otro", 1, true).ok, "un admin borra lo de otro");
  assert.equal(Mem.textoParaPrompt(G), "");
});

test("economía", () => {
  F.ganarCoins(G, "a", 100, "reaccion_recibida");
  F.gastarCoins(G, "a", 30, "casino_ruleta");
  F.ganarCoins(G, "b", 40, "racha_dia");
  const e = E.resumenEconomia(G, 7);
  assert.equal(e.total, 110);
  assert.equal(e.personas, 2);
  assert.equal(e.entradas, 140);
  assert.equal(e.salidas, 30);
  assert.ok(e.rubros.some((r) => r.nombre === "Reacciones" && r.entradas === 100));
  assert.ok(e.rubros.some((r) => r.nombre === "Ruleta" && r.salidas === 30));
  const t = E.textoEconomia(G, 7);
  assert.match(t.texto, /En circulación: \*110 UruCoins\* entre 2 personas/);
  assert.match(t.texto, /📈/);
  assert.deepEqual(t.mentions, [], "el panel nombra sin etiquetar");
  assert.match(t.texto, /Saldos más altos:\*\n1\. (a|b) — /);
});

test("economía: los movimientos de los laburos tienen rubro propio", () => {
  F.moverCoins(G, "laburante@lid", 9, "sueldo_laburo");
  F.moverCoins(G, "laburante@lid", -20, "cambio_laburo");
  const rubros = E.resumenEconomia(G, 7).rubros;
  const nombres = rubros.map((r) => r.nombre);
  assert.ok(nombres.includes("Sueldos de laburos") && nombres.includes("Cambios de laburo"), nombres.join(", "));
  assert.ok(!nombres.includes("Otros"), "antes caían en Otros");
  assert.equal(rubros.find((r) => r.nombre === "Sueldos de laburos").entradas, 9);
  assert.equal(rubros.find((r) => r.nombre === "Cambios de laburo").salidas, 20);
  assert.match(E.textoEconomia(G).texto, /• Sueldos de laburos: \+9 \/ −0 \(1 mov\.\)/);
});

test("limpieza de tmp: borra lo abandonado y no le saca el archivo a una descarga en curso", () => {
  const dir = "tmp-prueba";
  fs.mkdirSync(dir, { recursive: true });
  const ahora = Date.now();
  const crear = (nombre, edadMs) => {
    const ruta = path.join(dir, nombre);
    fs.writeFileSync(ruta, "x");
    const seg = (ahora - edadMs) / 1000;
    fs.utimesSync(ruta, seg, seg);
    return ruta;
  };
  const viejo = crear("quedo-colgado.mp4", 60 * 60 * 1000);
  // yt-dlp has a 4 min timeout per attempt and up to 3 attempts: ten minutes in, it may still be downloading.
  const enCurso = crear("bajando.mp4", 10 * 60 * 1000);
  const recien = crear("sticker.webp", 0);

  assert.equal(LT.limpiarTmp(dir, ahora), 1);
  assert.ok(!fs.existsSync(viejo), "lo abandonado se borra");
  assert.ok(fs.existsSync(enCurso), "una descarga de 10 minutos sigue viva");
  assert.ok(fs.existsSync(recien), "lo recién creado sigue vivo");

  // Half an hour later there is nothing in progress left to protect.
  assert.equal(LT.limpiarTmp(dir, ahora + 30 * 60 * 1000), 2);
  assert.equal(fs.readdirSync(dir).length, 0);
  // A folder that doesn't exist doesn't break the cleanup.
  assert.equal(LT.limpiarTmp("tmp-que-no-existe", ahora), 0);
});

// Mentioning Claudia is talking to her, and plugins/_auto-ia.js answers it with the group's context
// (test/auto-ia.test.mjs). Her number used to be a command of .ia, which answered without it.
test("IA por mención: el número del bot no es un comando de .ia", async () => {
  const previo = globalThis.client;
  globalThis.client = { user: { lid: "59899111222@lid" } };
  const P = (await import("../plugins/tools-ia.js")).default;
  assert.deepEqual(P.cmd, ["gemini", "ia", "bot"]);
  globalThis.client = previo;
});

test("el .s no manda nada cuando la descarga del archivo viene vacía, y el log dice por qué", async () => {
  const P = (await import("../plugins/sticker.js")).default;
  const enviados = [];
  const client = { sendText: async (c, t) => enviados.push(t), sendFile: async () => enviados.push("archivo") };
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  try {
    // A quoted message claiming to be an image but whose download() the serializer deleted: wa-socket.js does that
    // when the message has no mediaMessage, and with the plugin's optional chaining it silently returned undefined.
    await P.run({ chat: G, sender: "u@lid", message: {}, quoted: { msg: { mimetype: "image/jpeg" } } }, { client, isOwner: false });
  } finally {
    console.error = original;
  }
  assert.deepEqual(enviados, [], "no se le pasa basura a sendFile");
  assert.match(errores.join("\n"), /la descarga del archivo vino vacía/);
  assert.match(errores.join("\n"), /NO es problema de ffmpeg/, "el log tiene que descartar ffmpeg explícitamente");
});


// ---------- how late a message arrived (the 60-second filter in handle-message) ----------
// The age used to be measured when the message got processed. A batch goes one message at a time and every reply
// waits its turn in the queue, so the last command of a busy batch could pass the 60 s mark while waiting and be dropped
// without a word.

test("atraso: se mide contra la llegada, no contra cuándo se procesa", async () => {
  const { atrasoDeLlegada } = await import("../lib/tiempo.js");
  const enviado = 1_800_000_000; // seconds, like messageTimestamp
  const llegada = enviado * 1000 + 2000; // it reached the bot 2 s after it was sent
  const m = { messageTimestamp: enviado, _llegada: llegada };
  // Processed 90 s later, after the rest of its batch: its age is still the 2 s it took to arrive.
  assert.equal(atrasoDeLlegada(m, llegada + 90_000), 2);
  assert.equal(atrasoDeLlegada({ messageTimestamp: enviado }, llegada + 90_000), 92, "sin marca de llegada mide contra ahora, como antes");

  // What the filter is for: a message delivered late, because the bot was offline, is still stale.
  assert.ok(atrasoDeLlegada({ messageTimestamp: enviado, _llegada: (enviado + 300) * 1000 }) > 60);
  // The timestamp may come as a protobuf Long, and a message with none isn't dropped.
  assert.equal(atrasoDeLlegada({ messageTimestamp: { toNumber: () => enviado }, _llegada: llegada }), 2);
  assert.equal(atrasoDeLlegada({ _llegada: llegada }), 0);
});

test("atraso: main.js marca la llegada de cada tanda y handle-message filtra con ella", async () => {
  const { fileURLToPath } = await import("url");
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const main = fs.readFileSync(path.join(raiz, "main.js"), "utf8");
  const bloque = main.slice(main.indexOf('client.ev.on("messages.upsert"'), main.indexOf('client.ev.on("group-participants.update"'));
  assert.ok(bloque.length > 100, "no se encontró el handler de messages.upsert: el escaneo no está andando");
  assert.match(bloque, /const llegada = Date\.now\(\);[\s\S]*m\._llegada = llegada;/, "main.js dejó de marcar cuándo llegó la tanda");
  const handle = fs.readFileSync(path.join(raiz, "handle-message.js"), "utf8");
  assert.match(handle, /if \(atrasoDeLlegada\(m\) > 60\) return;/, "handle-message dejó de filtrar por el atraso de llegada");
});

test("consistencia: ningún plugin deja archivos multimedia en la raíz del repo", async () => {
  // .toimg wrote its temporary .webp and .jpg next to the code: a conversion cut short left someone's sticker there,
  // one "git add ." away from a commit, since .gitignore only covers tmp/ and database/. A merge that brings back an
  // old copy of a plugin would bring that back without anything failing.
  const { fileURLToPath } = await import("url");
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const archivos = ["plugins", "lib"].flatMap((c) => fs.readdirSync(path.join(raiz, c)).filter((f) => f.endsWith(".js")).map((f) => path.join(c, f)));
  assert.ok(archivos.length > 100, `se encontraron muy pocos archivos (${archivos.length}): el escaneo no está andando`);
  const enLaRaiz = [];
  for (const archivo of archivos) {
    fs.readFileSync(path.join(raiz, archivo), "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/["'`]\.\/[^"'`/\s]+\.(jpe?g|png|webp|gif|mp3|mp4|ogg|opus|wav|m4a|webm)["'`]/i.test(linea)) enLaRaiz.push(`${archivo}:${i + 1}`);
      });
  }
  assert.deepEqual(enLaRaiz, [], `los temporales van en ./tmp/, que el .gitignore tapa:\n${enLaRaiz.join("\n")}`);
});

// ---------- tanda 5d: files and the owner's commands ----------

// A link that didn't answer with the file went out as a ".bin" with the error page inside, and a failed sticker as an
// empty ".bin". sendFile throws now (lib/wa-socket.js); its whole run is checked with Baileys mocked out in the audit.
test("sendFile: un 404, un archivo vacío o el error de un sticker no salen como .bin", async () => {
  const { motivoSinArchivo } = await import("../lib/wa-socket.js");
  assert.equal(motivoSinArchivo({ res: { ok: false, status: 404 }, data: Buffer.from("<html>404</html>") }), "no se pudo bajar el archivo (HTTP 404)");
  assert.equal(motivoSinArchivo({ data: Buffer.alloc(0) }), "no hay archivo para mandar");
  assert.equal(motivoSinArchivo({ res: { ok: true, status: 200 }, data: Buffer.from([0xff, 0xd8, 0xff]) }), null);
  const fuente = fs.readFileSync(new URL("../lib/wa-socket.js", import.meta.url), "utf8");
  assert.match(fuente, /sendFile: \{\s*async value\([^)]*\) \{[\s\S]{0,400}if \(path instanceof Error\) throw path;[\s\S]{0,200}const motivo = motivoSinArchivo\(type\);/);
});

test("con imagen: si la imagen no llega, manda el texto igual, y sin imagen ni la intenta", async () => {
  const { mandarConImagen } = await import("../lib/con-imagen.js");
  const archivos = [];
  const textos = [];
  const client = { sendFile: async (chat, archivo) => (archivos.push(archivo), Promise.reject(new Error("no se pudo bajar el archivo (HTTP 404)"))), sendText: async (chat, t) => (textos.push(t), { key: { id: "H" } }) };
  const errorReal = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await mandarConImagen(client, G, "https://telegra.ph/file/x.jpg", "*♈ ARIES ♈*\nHoy te va bien.", null, "horoscopo"), { key: { id: "H" } });
    await mandarConImagen(client, G, null, "sin imagen", null);
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual(textos, ["*♈ ARIES ♈*\nHoy te va bien.", "sin imagen"]);
  assert.deepEqual(archivos, ["https://telegra.ph/file/x.jpg"]);
});

// A picture from the internet that doesn't come down: since sendFile throws, .pelicula, .serie and .ig lost their text
// with it, and .getpp and .gpu went quiet. Now the text goes alone, or they say they couldn't.
test("una imagen que no baja: .pelicula e .ig mandan el texto igual, y .getpp y .gpu lo avisan", async () => {
  globalThis.txt = (await import("../lib/strings.js")).default;
  const Cine = (await import("../plugins/recomendar-cine.js")).default;
  const Ig = (await import("../plugins/insta-usuario.js")).default;
  const FotoGrupo = (await import("../plugins/get-pp-group.js")).default;
  const FotoPersona = (await import("../plugins/get-pp-user.js")).default;
  const fetchReal = globalThis.fetch;
  const errorReal = console.error;
  let recomendacion = { name: "Una de terror", genres: "Terror", vote: 6, date: "1999-01-01", overview: "Da miedo.", urlImage: "/poster.jpg" };
  globalThis.fetch = async () => ({ json: async () => ({ success: true, recommendation: recomendacion }) });
  console.error = () => {};
  const archivos = [];
  const textos = [];
  const client = {
    sendFile: async (chat, archivo) => (archivos.push(archivo), Promise.reject(new Error("no se pudo bajar el archivo (HTTP 404)"))),
    sendText: async (chat, t) => (textos.push(t), { key: { id: "T" } }),
    profilePictureUrl: async () => "https://pps.whatsapp.net/foto.jpg",
  };
  const m = { chat: G, sender: "555@lid", react: async () => {}, mentionedJid: ["111@lid"], quoted: null };
  try {
    await Cine.run(m, { client, text: "terror", usedPrefix: ".", command: "pelicula" });
    recomendacion = { ...recomendacion, name: "Otra sin póster", urlImage: null };
    await Cine.run(m, { client, text: "terror", usedPrefix: ".", command: "pelicula" });
    await Ig.run(m, { client, text: "@claudia.bot" });
    await FotoGrupo.run(m, { client });
    await FotoPersona.run(m, { client, text: "@111", usedPrefix: ".", command: "gpu", participants: [{ id: "111@lid" }] });
  } finally {
    globalThis.fetch = fetchReal;
    console.error = errorReal;
  }
  assert.equal(textos.length, 5, JSON.stringify(textos));
  assert.match(textos[0], /Una de terror/);
  assert.match(textos[1], /Otra sin póster/);
  assert.match(textos[2], /instagram\.com\/claudia\.bot/);
  assert.equal(textos[3], "No pude bajar la foto del grupo; probá de nuevo en un rato.");
  assert.equal(textos[4], "No pude bajar esa foto de perfil; probá de nuevo en un rato.");
  assert.equal(archivos.length, 4, "sin póster, ni lo intenta");
});

test(".emojimix: un sticker que no se pudo armar no sale como archivo, y si no sale ninguno lo dice", async () => {
  const P = (await import("../plugins/sticker-emoji-mix.js")).default;
  const fetchReal = globalThis.fetch;
  const errorReal = console.error;
  globalThis.tenorApiKey = "clave";
  globalThis.fetch = async (url) => (String(url).includes("tenor.googleapis.com") ? { ok: true, status: 200, json: async () => ({ results: [{ url: "http://127.0.0.1:9/a.png" }, { url: "http://127.0.0.1:9/b.png" }] }) } : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  console.error = () => {};
  const archivos = [];
  const textos = [];
  try {
    const client = { sendFile: async (chat, archivo) => archivos.push(archivo), sendText: async (chat, t) => textos.push(t) };
    await P.run({ chat: G }, { client, text: "😀+🥲", args: ["😀+🥲"], usedPrefix: ".", command: "emojimix" });
  } finally {
    globalThis.fetch = fetchReal;
    console.error = errorReal;
    globalThis.tenorApiKey = "";
  }
  assert.deepEqual(archivos, []);
  assert.deepEqual(textos, ["No pude armar el sticker de esa mezcla, probá de nuevo en un rato."]);
});

// .addowner rewrote config.toml with toml.stringify: every comment explaining the settings was gone.
test(".addowner y .removeowner cambian solo la línea de owners de config.toml", async () => {
  const P = await import("../plugins/owner-add-owner.js");
  const ejemplo = fs.readFileSync(new URL("../config.example.toml", import.meta.url), "utf8").replace('owners = [""]', 'owners = ["59899111222"]');
  fs.writeFileSync("config.toml", ejemplo);
  const ownersAntes = globalThis.owners;
  try {
    const correr = (command, text) => P.default.run({ chat: "59899111222@s.whatsapp.net", sender: "59899111222@s.whatsapp.net", mentionedJid: [], quoted: null }, { client: globalThis.client, text, usedPrefix: ".", command, participants: [] });
    await correr("addowner", "+598 99 333 444");
    const despues = fs.readFileSync("config.toml", "utf8");
    assert.equal(despues, ejemplo.replace('owners = ["59899111222"]', 'owners = ["59899111222", "59899333444"]'), "todo lo demás, comentarios incluidos, queda igual");
    assert.deepEqual(globalThis.owners, ["59899111222", "59899333444"]);
    await correr("removeowner", "+598 99 333 444");
    assert.equal(fs.readFileSync("config.toml", "utf8"), ejemplo);
    assert.ok(!fs.existsSync("config.toml.tmp"), "el archivo de paso no queda");
  } finally {
    globalThis.owners = ownersAntes;
    fs.rmSync("config.toml", { force: true });
  }
  assert.equal(P.conOwners("# x\nowners = [\n  \"1\",\n]\n", ["1", "2"]), '# x\nowners = ["1", "2"]\n', "una lista en varias líneas");
  assert.equal(P.conOwners("numberBot = \"\"\n", ["5"]), 'owners = ["5"]\nnumberBot = ""\n', "sin la clave, la agrega arriba");
  assert.equal(P.conOwners("[tabla]\nowners = [\"1\"]\n", ["1", "2"]), null, "si no queda bien, no toca nada");
});

// .info says the code is open, under the MIT license, and links to it.
test(".info: el código es abierto, con el link al repo", async () => {
  const Info = (await import("../plugins/info-bot.js")).default;
  const textos = [];
  await Info.run({ chat: G }, { client: { sendText: async (chat, t) => textos.push(t) } });
  assert.match(textos[0], /🔗 https:\/\/github\.com\/gauchitodev\/ClaudIA$/);
  assert.match(textos[0], /El código es abierto, con licencia MIT/);
  assert.doesNotMatch(textos[0], /privad|pedime acceso/i);
});

// The same text to every group every 1.5 s, the ones with .banchat included: a burst like that is what WhatsApp's spam
// filter looks for.
test(".avisartodos: saltea los grupos con .banchat y espacia los envíos", async () => {
  const { default: P, AVISO_TODOS, _dep } = await import("../plugins/avisar-todos.js");
  for (const g of ["uno@g.us", "dos@g.us", "baneado@g.us"]) F.initDataDB({ chat: g, sender: "111@lid", senderJid: "" });
  F.updateChat("baneado@g.us", { isBanned: 1 });
  const esperas = [];
  const esperarReal = _dep.esperar;
  const azarReal = _dep.azar;
  _dep.esperar = async (ms) => esperas.push(ms);
  _dep.azar = () => 0.5;
  const enviados = [];
  try {
    const client = { groupFetchAllParticipating: async () => ({ "uno@g.us": {}, "baneado@g.us": {}, "dos@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
    await P.run({ chat: "59899111222@s.whatsapp.net" }, { client, text: "Hoy arranca el ranking 🏆", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    _dep.azar = azarReal;
  }
  assert.match(enviados[0][1], /^📣 Lo mando a 2 grupo\(s\), de a uno y espaciado: tarda unos 30 s\. Salteo 1 con \.banchat\. Para cortarlo: \.avisartodos cancelar\.$/);
  assert.deepEqual(enviados.slice(1, 3), [["uno@g.us", "Hoy arranca el ranking 🏆"], ["dos@g.us", "Hoy arranca el ranking 🏆"]]);
  assert.equal(enviados[3][1], "✅ Mensaje enviado a 2 grupo(s).");
  assert.deepEqual(esperas, [(AVISO_TODOS.ESPERA_MIN_MS + AVISO_TODOS.ESPERA_MAX_MS) / 2], "una espera entre grupo y grupo, de 20 a 40 s");
});

// Spaced out like that, a notice to fifty groups takes some 25 minutes: one with a typo couldn't be stopped, and a second
// one sent meanwhile went out alongside it.
test(".avisartodos: .avisartodos cancelar lo corta, aun en medio de una espera, y no sale otro mientras tanto", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  // Each wait between groups lasts until the notice is cut.
  let esperando = 0;
  _dep.esperar = (ms, valor, { signal } = {}) =>
    new Promise((resolve, reject) => {
      esperando++;
      signal?.addEventListener("abort", () => reject(new Error("cortado")), { once: true });
    });
  const enviados = [];
  const client = { groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
  const correr = (text) => P.run({ chat: DUENO }, { client, text, isOwner: true });
  const alDueno = () => enviados.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  const aLosGrupos = () => enviados.filter(([chat]) => chat !== DUENO);
  try {
    const aviso = correr("Mañana no hay ranking");
    for (let i = 0; i < 100 && !esperando; i++) await new Promise((r) => setImmediate(r));
    assert.equal(esperando, 1, "mandó al primer grupo y espera para el segundo");

    const otro = correr("Otro aviso"); // awaited after the check: a second notice that did start would wait forever here
    for (let i = 0; i < 100 && alDueno().length < 2; i++) await new Promise((r) => setImmediate(r));
    assert.equal(alDueno().at(-1), "📣 Ya estoy mandando un aviso: va por 1 de 3 grupo(s). Esperá a que termine o cortalo con .avisartodos cancelar.");
    await otro;
    await correr("");
    assert.match(alDueno().at(-1), /va por 1 de 3 grupo\(s\)/, "sin texto, dice cómo va");

    await correr("cancelar");
    await aviso;
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 1 de 3 grupo(s).");
    assert.deepEqual(aLosGrupos(), [["a@g.us", "Mañana no hay ranking"]], "ni el resto, ni el otro aviso");

    await correr("cancelar");
    assert.equal(alDueno().at(-1), "No hay ningún aviso saliendo.");
    _dep.esperar = async () => {};
    await correr("Ahora sí");
    assert.equal(alDueno().at(-1), "✅ Mensaje enviado a 3 grupo(s).", "cortado el anterior, sale uno nuevo");
  } finally {
    _dep.esperar = esperarReal;
  }
});
