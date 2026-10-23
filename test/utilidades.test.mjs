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

// A config edited by hand can start with an empty owner (config.example.toml comes with owners = [""]): the notices and
// the weekly backup went to nobody.
test("avisos al owner: van al primer owner con número, aunque el primero esté vacío", async () => {
  const ownersReal = globalThis.owners;
  try {
    globalThis.owners = ["", " ", "+598 99 333 444", "59899111222"];
    assert.equal(Av.jidOwner(), "59899333444@s.whatsapp.net");
    globalThis.enviados = [];
    assert.equal(await Av.avisarOwner("hola", "primero-vacio"), true);
    assert.equal(globalThis.enviados.at(-1).chat, "59899333444@s.whatsapp.net");
    globalThis.owners = [""];
    assert.equal(Av.jidOwner(), null);
  } finally {
    globalThis.owners = ownersReal;
  }
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
  // "a" and "b" have no name on record: "alguien", never the digits of their id.
  assert.match(t.texto, /Saldos más altos:\*\n1\. alguien — 70\n2\. alguien — 40/);
});

// These two in groups of their own: in G, run first, they changed the totals "economía" checks.
test("economía: los movimientos de los laburos tienen rubro propio", () => {
  const chat = "economia-laburos@g.us";
  F.moverCoins(chat, "laburante@lid", 9, "sueldo_laburo");
  F.moverCoins(chat, "laburante@lid", -20, "cambio_laburo");
  const rubros = E.resumenEconomia(chat, 7).rubros;
  const nombres = rubros.map((r) => r.nombre);
  assert.ok(nombres.includes("Sueldos de laburos") && nombres.includes("Cambios de laburo"), nombres.join(", "));
  assert.ok(!nombres.includes("Otros"), "antes caían en Otros");
  assert.equal(rubros.find((r) => r.nombre === "Sueldos de laburos").entradas, 9);
  assert.equal(rubros.find((r) => r.nombre === "Cambios de laburo").salidas, 20);
  assert.match(E.textoEconomia(chat).texto, /• Sueldos de laburos: \+9 \/ −0 \(1 mov\.\)/);
});

test("economía: el premio por volver después de .inactivos tiene rubro propio", () => {
  const chat = "economia-regreso@g.us";
  F.ganarCoins(chat, "volvio@lid", 10, "regreso_inactivo");
  const nombres = E.resumenEconomia(chat, 7).rubros.map((r) => r.nombre);
  assert.ok(nombres.includes("Volver después de .inactivos"), nombres.join(", "));
  assert.match(E.textoEconomia(chat).texto, /• Volver después de \.inactivos: \+10 \/ −0 \(1 mov\.\)/);
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
  assert.match(handle, /if \(atrasoDeLlegada\(m\) > 60\) return anotarPresencia\(m\);/, "handle-message dejó de filtrar por el atraso de llegada");
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
  const clientReal = globalThis.client;
  _dep.esperar = async (ms) => esperas.push(ms);
  _dep.azar = () => 0.5;
  const enviados = [];
  try {
    const client = { groupFetchAllParticipating: async () => ({ "uno@g.us": {}, "baneado@g.us": {}, "dos@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
    globalThis.client = client; // what it sends goes through the socket of the moment
    await P.run({ chat: "59899111222@s.whatsapp.net" }, { client, text: "Hoy arranca el ranking 🏆", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    _dep.azar = azarReal;
    globalThis.client = clientReal;
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
  const clientReal = globalThis.client;
  // Each wait between groups lasts until the notice is cut.
  let esperando = 0;
  _dep.esperar = (ms, valor, { signal } = {}) =>
    new Promise((resolve, reject) => {
      esperando++;
      signal?.addEventListener("abort", () => reject(new Error("cortado")), { once: true });
    });
  const enviados = [];
  const client = { groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
  globalThis.client = client;
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
    globalThis.client = clientReal;
  }
});

const vuelta = () => new Promise((r) => setImmediate(r));
async function hasta(condicion) {
  for (let i = 0; i < 200 && !condicion(); i++) await vuelta();
  assert.ok(condicion(), "no llegó a pasar");
}
// A wait between groups that lasts until the notice is cut; like the real one, cut already, it doesn't even start.
const esperaHastaCortar = (ms, valor, { signal } = {}) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cortado"));
    signal?.addEventListener("abort", () => reject(new Error("cortado")), { once: true });
  });

// The cancel answers right away, even while a group send is on its way, which can't be called back; and the corrected
// notice can go out right after, without waiting for that send to finish.
test(".avisartodos: cancelar contesta en el momento, aunque un envío esté saliendo, y deja mandar el corregido", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  const enviados = [];
  let soltar = null;
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }),
    sendText: (chat, t) => {
      enviados.push([chat, t]);
      // The second group's send takes its time: its queue is busy, or it's a big group.
      return chat === "b@g.us" && t === "Con un error" ? new Promise((r) => (soltar = r)) : Promise.resolve();
    },
  };
  globalThis.client = client;
  const correr = (text) => P.run({ chat: DUENO }, { client, text, isOwner: true });
  const alDueno = () => enviados.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  const grupos = (texto) => enviados.filter(([, t]) => t === texto).map(([chat]) => chat);
  try {
    _dep.esperar = async () => {};
    const conError = correr("Con un error");
    await hasta(() => soltar);
    await correr("cancelar");
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 1 de 3 grupo(s), más el que estaba saliendo.");

    // The corrected one's waits last until it's cut.
    _dep.esperar = esperaHastaCortar;
    const corregido = correr("El corregido");
    await hasta(() => grupos("El corregido").length === 1);
    soltar();
    await conError;
    assert.deepEqual(grupos("Con un error"), ["a@g.us", "b@g.us"], "el cortado no sigue");
    assert.ok(globalThis.avisoATodos, "y al terminar no le saca el lugar al corregido");
    await correr("cancelar");
    await corregido;
    assert.deepEqual(alDueno().filter((t) => t.startsWith("⏹️")), ["⏹️ Corté el aviso: llegó a 1 de 3 grupo(s), más el que estaba saliendo.", "⏹️ Corté el aviso: llegó a 1 de 3 grupo(s)."], "una respuesta por cada corte");
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
});

// After a reconnection the socket that took the command is closed, and whatever goes through it fails: the rest goes
// through the new one (globalThis.client, which main.js replaces).
test(".avisartodos: si el bot se reconecta a mitad del aviso, sigue por la conexión nueva", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  const enviados = [];
  const socket = (nombre) => {
    const s = { abierto: true, groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }) };
    s.sendText = async (chat, t) => {
      if (!s.abierto) throw new Error("Connection Closed");
      enviados.push(`${nombre} → ${chat}: ${t}`);
      // Right after the first group, the connection drops and main.js makes a new socket.
      if (chat === "a@g.us") {
        s.abierto = false;
        globalThis.client = nuevo;
      }
    };
    return s;
  };
  const viejo = socket("viejo");
  const nuevo = socket("nuevo");
  globalThis.client = viejo;
  _dep.esperar = async () => {};
  try {
    await P.run({ chat: DUENO }, { client: viejo, text: "Mañana no hay ranking", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
  assert.deepEqual(enviados.slice(1), ["viejo → a@g.us: Mañana no hay ranking", "nuevo → b@g.us: Mañana no hay ranking", "nuevo → c@g.us: Mañana no hay ranking", `nuevo → ${DUENO}: ✅ Mensaje enviado a 3 grupo(s).`]);
});

// While main.js reconnects (5 s later, then 10 s...), each group whose turn came failed and was lost, and the end said
// "(2 fallaron)" without saying which. It waits for the connection, gives what fails one more go at the end, and names
// the groups it couldn't reach even so.
test(".avisartodos: sin conexión espera a que vuelva, y dice a qué grupos no llegó", async () => {
  const { default: P, AVISO_TODOS, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const enviados = [];
  const esperas = [];
  let vuelveEn = 0; // waits until the connection is back
  _dep.esperar = async (ms) => {
    esperas.push(ms);
    if (vuelveEn && --vuelveEn === 0) globalThis.botConectado = true;
  };
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" }, "d@g.us": { subject: "Laburo" } }),
    sendText: async (chat, t) => {
      if (!globalThis.botConectado) throw cerrada();
      if (chat === "c@g.us") throw rechazada(403, "forbidden"); // a group where it never goes out: the bot isn't in it
      enviados.push([chat, t]);
      // Right after the first group the connection drops, and it's back two waits later.
      if (chat === "a@g.us") [globalThis.botConectado, vuelveEn] = [false, 2];
    },
  };
  globalThis.client = client;
  console.error = () => {};
  try {
    await P.run({ chat: DUENO }, { client, text: "Mañana no hay ranking", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
    globalThis.botConectado = true;
  }
  assert.deepEqual(enviados.slice(1).map(([chat]) => chat), ["a@g.us", "b@g.us", "d@g.us", DUENO], "el de mientras estuvo caída sale al volver");
  assert.ok(esperas.includes(AVISO_TODOS.REVISAR_CONEXION_MS), "esperó a la conexión");
  assert.equal(enviados.at(-1)[1], "✅ Mensaje enviado a 3 grupo(s). No salió en 1, ni probando de nuevo: Fútbol.");
});

// What Baileys throws when the socket is closed: before writing anything (lib/Socket/socket.js, sendRawMessage).
const cerrada = () => Object.assign(new Error("Connection Closed"), { output: { statusCode: 428 } });
// What it throws when WhatsApp answers one of the questions it asks before writing the message with an error (the
// group's devices, its metadata): a Boom whose data is WhatsApp's code (assertNodeErrorFree, WABinary/generic-utils.js).
const rechazada = (codigo, texto) => Object.assign(new Error(texto), { isBoom: true, data: codigo, output: { statusCode: 500 } });

// The second go is for what surely didn't go out: Baileys' Connection Closed, the socket's close code (a number) if it
// closed while Baileys asked the group's devices, an error WhatsApp answered with. A Timed Out (408) may come with the
// message already sent, since Baileys races the write against a timer, and trying it again sent it twice. That one is
// told apart, not repeated. The close code used to be taken for it: the group was left without the notice.
test(".avisartodos: vuelve a probar lo que seguro no salió, y lo que no sabe si llegó no lo repite", async () => {
  const { default: P, AVISO_TODOS, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const intentos = {};
  const esperas = [];
  const errores = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" }, "d@g.us": { subject: "Laburo" }, "e@g.us": { subject: "Barrio" } }),
    sendText: async (chat, t) => {
      if (chat !== DUENO) intentos[chat] = (intentos[chat] || 0) + 1;
      if (chat === "a@g.us" && intentos[chat] === 1) throw cerrada(); // the first time only
      if (chat === "b@g.us") throw Object.assign(new Error("Timed Out"), { output: { statusCode: 408 } });
      if (chat === "d@g.us" && intentos[chat] === 1) return Promise.reject(1006); // the first time only
      if (chat === "e@g.us") throw rechazada(403, "forbidden");
      return { chat, t };
    },
  };
  const finales = [];
  const enviarFinal = client.sendText;
  client.sendText = async (chat, t, ...resto) => {
    if (chat === DUENO) finales.push(t);
    return enviarFinal(chat, t, ...resto);
  };
  globalThis.client = client;
  _dep.esperar = async (ms) => esperas.push(ms);
  console.error = (...partes) => errores.push(partes.join(" "));
  try {
    await P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.deepEqual(intentos, { "a@g.us": 2, "b@g.us": 1, "c@g.us": 1, "d@g.us": 2, "e@g.us": 2 }, "Amigos y Laburo salen al segundo intento, Barrio prueba dos veces; Familia, una sola vez");
  assert.equal(esperas.length, 7, "una espera antes de cada grupo después del primero, y otra antes de cada segundo intento");
  assert.equal(finales.at(-1), "✅ Mensaje enviado a 3 grupo(s). No salió en 1, ni probando de nuevo: Barrio. No sé si llegó a 1 (falló mientras salía), y no lo repetí para no mandarlo dos veces: Familia.");
  assert.ok(errores.includes("[avisar-todos] falló en d@g.us: 1006"), "el log dice el código de cierre");
  assert.ok(AVISO_TODOS.REVISAR_CONEXION_MS > 0);
});

// Cut with a group that didn't take it yet: the owner hears which one, by name.
test(".avisartodos: cortado con un grupo que falló, dice cuál", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const al = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" } }),
    sendText: async (chat, t) => {
      al.push([chat, t]);
      if (chat === "a@g.us") throw cerrada();
    },
  };
  globalThis.client = client;
  _dep.esperar = esperaHastaCortar;
  console.error = () => {};
  try {
    const corre = P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    await hasta(() => al.some(([chat]) => chat === "a@g.us"));
    await P.run({ chat: DUENO }, { client, text: "cancelar", isOwner: true });
    await corre;
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.equal(al.filter(([chat]) => chat === DUENO).at(-1)[1], "⏹️ Corté el aviso: llegó a 0 de 2 grupo(s) (no salió en Amigos).");
});

// How it goes, and how far a cut one got, during the second go: the group on its way isn't one it didn't reach. And the
// summary waits for the connection to tell the owner.
test(".avisartodos: durante el segundo intento dice cómo va, y si lo cortan no cuenta como no salido al que estaba saliendo", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const al = [];
  let soltar = null;
  let intentosB = 0;
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" } }),
    sendText: (chat, t) => {
      al.push([chat, t]);
      if (chat === "b@g.us" && ++intentosB === 1) return Promise.reject(cerrada());
      if (chat === "b@g.us") return new Promise((r) => (soltar = r)); // the second go takes its time
      return Promise.resolve();
    },
  };
  const alDueno = () => al.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  globalThis.client = client;
  _dep.esperar = async () => {};
  console.error = () => {};
  try {
    const corre = P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    await hasta(() => soltar);
    await P.run({ chat: DUENO }, { client, text: "", isOwner: true });
    assert.equal(alDueno().at(-1), "📣 Ya estoy mandando un aviso: va por 3 de 3 grupo(s), y vuelve a probar con el que falló. Esperá a que termine o cortalo con .avisartodos cancelar.");
    await P.run({ chat: DUENO }, { client, text: "cancelar", isOwner: true });
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 2 de 3 grupo(s), más el que estaba saliendo.");
    soltar();
    await corre;
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }

  // The summary, once the connection is back.
  const finales = [];
  let vuelveEn = 0;
  const conCaida = {
    groupFetchAllParticipating: async () => ({ "a@g.us": {} }),
    sendText: async (chat, t) => {
      if (chat === DUENO && !globalThis.botConectado) throw cerrada();
      if (chat === DUENO) finales.push(t);
      if (chat === "a@g.us") [globalThis.botConectado, vuelveEn] = [false, 2]; // it drops right after the last group
    },
  };
  globalThis.client = conCaida;
  _dep.esperar = async () => {
    if (vuelveEn && --vuelveEn === 0) globalThis.botConectado = true;
  };
  try {
    await P.run({ chat: DUENO }, { client: conCaida, text: "Chau", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
    globalThis.botConectado = true;
  }
  assert.equal(finales.at(-1), "✅ Mensaje enviado a 1 grupo(s).", "esperó a la conexión para avisar");
});

// What it can't tell whether it got there counts in how it goes and in how far a cut one got; and a group that fails
// like that on the second go is told about too, though it was going to be tried again.
test(".avisartodos: lo que no sabe si llegó cuenta en cómo va, en hasta dónde llegó y en el segundo intento", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const vencido = () => Object.assign(new Error("Timed Out"), { output: { statusCode: 408 } });
  const al = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" } }),
    sendText: async (chat, t) => {
      al.push([chat, t]);
      if (chat === "a@g.us") throw vencido();
    },
  };
  const alDueno = () => al.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  globalThis.client = client;
  _dep.esperar = esperaHastaCortar;
  console.error = () => {};
  try {
    const corre = P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    await hasta(() => al.some(([chat]) => chat === "a@g.us"));
    await P.run({ chat: DUENO }, { client, text: "", isOwner: true });
    assert.equal(alDueno().at(-1), "📣 Ya estoy mandando un aviso: va por 1 de 3 grupo(s). Esperá a que termine o cortalo con .avisartodos cancelar.");
    await P.run({ chat: DUENO }, { client, text: "cancelar", isOwner: true });
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 0 de 3 grupo(s) (no sé si llegó a Amigos).");
    await corre;
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }

  // Closed the first time (it surely didn't go out) and failed while going out the second: it may have got there.
  const finales = [];
  let intentosA = 0;
  const otra = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" } }),
    sendText: async (chat, t) => {
      if (chat === DUENO) finales.push(t);
      if (chat === "a@g.us" && ++intentosA === 1) throw cerrada();
      if (chat === "a@g.us") throw vencido();
    },
  };
  globalThis.client = otra;
  _dep.esperar = async () => {};
  console.error = () => {};
  try {
    await P.run({ chat: DUENO }, { client: otra, text: "Hola", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.equal(intentosA, 2);
  assert.equal(finales.at(-1), "✅ Mensaje enviado a 1 grupo(s). No sé si llegó a 1 (falló mientras salía), y no lo repetí para no mandarlo dos veces: Amigos.");
});

// If the connection dropped right as "📣 Lo mando a…" went out, the notice ended there: no group got it, and nobody
// told the owner.
test(".avisartodos: si no sale el aviso de que arranca, a los grupos les llega igual", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const enviados = [];
  const errores = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {} }),
    sendText: async (chat, t) => {
      if (t.startsWith("📣")) return Promise.reject(1006); // the socket's close code, as Baileys rejects with it
      enviados.push([chat, t]);
    },
  };
  globalThis.client = client;
  _dep.esperar = async () => {};
  console.error = (...partes) => errores.push(partes.join(" "));
  try {
    await P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.deepEqual(enviados, [["a@g.us", "Hola"], ["b@g.us", "Hola"], [DUENO, "✅ Mensaje enviado a 2 grupo(s)."]]);
  assert.deepEqual(errores, ["[avisar-todos] no salió el aviso de que arranca: 1006"], "el log dice el código, no undefined");
});

// With two owners, the one who cuts it hears it from the cancel, and the one who started it, at the end. And cut while
// the list of groups was coming, it doesn't go to any.
test(".avisartodos: cortado desde otro chat, les avisa a los dos; cortado antes de arrancar, no sale", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const [A, B] = ["59899111222@s.whatsapp.net", "59899333444@s.whatsapp.net"];
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  const enviados = [];
  let lista = async () => ({ "a@g.us": {}, "b@g.us": {} });
  const client = { groupFetchAllParticipating: () => lista(), sendText: async (chat, t) => enviados.push([chat, t]) };
  globalThis.client = client;
  const a = (chat) => enviados.filter(([c]) => c === chat).map(([, t]) => t);
  _dep.esperar = esperaHastaCortar;
  try {
    const deA = P.run({ chat: A }, { client, text: "Hola", isOwner: true });
    await hasta(() => a("a@g.us").length === 1);
    await P.run({ chat: B }, { client, text: "cancelar", isOwner: true });
    assert.deepEqual(a(B), ["⏹️ Corté el aviso: llegó a 1 de 2 grupo(s)."]);
    await deA;
    assert.equal(a(A).at(-1), "⏹️ Cortaron el aviso desde otro chat: llegó a 1 de 2 grupo(s).");

    enviados.length = 0;
    let soltarLista;
    lista = () => new Promise((r) => (soltarLista = () => r({ "a@g.us": {}, "b@g.us": {} })));
    const otro = P.run({ chat: A }, { client, text: "Hola de nuevo", isOwner: true });
    await hasta(() => soltarLista);
    await P.run({ chat: A }, { client, text: "cancelar", isOwner: true });
    soltarLista();
    await otro;
    assert.deepEqual(enviados, [[A, "⏹️ Corté el aviso: no salió a ningún grupo."]], "ni el 📣 de que arranca");
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
});
