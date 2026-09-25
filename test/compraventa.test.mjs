import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, C, Reg, HG, Pf, Hook, Cmd, Cal;
const DIA = 24 * 3600e3;
before(async () => {
  ({ F } = await prepararBase("compraventa"));
  C = await import("../lib/compraventa.js");
  Reg = await import("../lib/reglas.js");
  HG = await import("../lib/horario-grupo.js");
  Pf = await import("../lib/perfil.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  Cmd = (await import("../plugins/compraventa.js")).default;
  Cal = (await import("../plugins/calificar.js")).default;
  for (const n of [111, 222, 333, 444, 555]) F.initDataDB({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net` });
});
let k = 0;
const msg = (sender, text, quoted = null) => ({ chat: G, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted });
// A quoted message as lib/wa-socket.js builds it: its id, who sent it and its text (the caption, if it's a photo).
const cita = (sender, text, extra = {}) => ({ id: `Q${++k}`, sender, text, fromMe: false, isBaileys: false, ...extra });
const cliente = () => globalThis.client;
const ultimo = () => ultimoEnviado().msg.text;
const correr = (sender, command, text = "", { quoted = null, ...extra } = {}) =>
  Cmd.run(msg(sender, text, quoted), { client: cliente(), command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isMod: false, ...extra });

test("compraventa: detección de hashtag y precio", () => {
  assert.deepEqual(C.detectarPublicacion("#vendo bici rodado 26 $ 4.000 Pocitos"), { tipo: "vendo", texto: "bici rodado 26 $ 4.000 Pocitos" });
  assert.deepEqual(C.detectarPublicacion("Hola! #busco heladera chica"), { tipo: "compro", texto: "Hola! heladera chica" });
  assert.equal(C.detectarPublicacion("vendo sin numeral"), null);
  assert.equal(C.detectarPublicacion("#vendox"), null);
  assert.equal(C.detectarPrecio("bici $ 4.000 Pocitos"), "$ 4.000");
  assert.equal(C.detectarPrecio("celular USD 200 usado"), "USD 200");
  assert.equal(C.detectarPrecio("mesa 1500 pesos"), "1500 pesos");
  assert.equal(C.detectarPrecio("tele u$s 350"), "u$s 350");
  assert.equal(C.detectarPrecio("ropero de pino, $ 3.000, Malvín"), "$ 3.000", "la coma de la oración no es parte del precio");
  assert.equal(C.detectarPrecio("regalo perro"), "");
});

test("compraventa: publicar por hashtag, catálogo, búsqueda, detalle y alertas", async () => {
  await correr("333@lid", "avisame", "heladera");
  assert.match(ultimo(), /te menciono cuando alguien publique algo con "heladera"/);
  await Hook.before(msg("111@lid", "#vendo bici rodado 26 $ 4.000 Pocitos"), { client: cliente() });
  assert.match(ultimo(), /🏷️ \*Vendo #1\* registrada\. Precio: \$ 4\.000\./);
  const p1 = F.getPublicacion(G, 1);
  assert.deepEqual([p1.tipo, p1.texto, p1.precio, p1.estado, p1.usuario], ["vendo", "bici rodado 26 $ 4.000 Pocitos", "$ 4.000", "activa", "111@lid"]);
  await Hook.before(msg("222@lid", "#compro heladera chica que ande"), { client: cliente() });
  const enviados = globalThis.enviados;
  assert.match(enviados[enviados.length - 2].msg.text, /🔎 \*Compro #2\* registrada\./);
  assert.match(ultimo(), /🔔 @333: apareció algo que buscabas\. Compro #2: heladera chica que ande/);
  assert.deepEqual(ultimoEnviado().msg.mentions, ["333@lid"]);
  await Hook.before(msg("111@lid", "#vendo mesa de luz"), { client: cliente() });
  assert.match(ultimo(), /Vendo #3\* registrada\. Se ve con \.vendo[\s\S]*no le pusiste precio/);
  await Hook.before(msg("111@lid", "che, alguien sabe algo?"), { client: cliente() });
  assert.match(ultimo(), /no le pusiste precio/, "sin hashtag no pasa nada");
  await correr("111@lid", "vendo");
  assert.match(ultimo(), /🏷️ \*EN VENTA\* \(2\)\n\*#3\* mesa de luz — 111\n\*#1\* bici rodado 26 \$ 4\.000 Pocitos — 111/);
  assert.deepEqual(ultimoEnviado().msg.mentions, [], "el listado nombra, no etiqueta");
  await correr("111@lid", "compro");
  assert.match(ultimo(), /🔎 \*SE BUSCA\* \(1\)\n\*#2\* heladera chica que ande — 222/);
  await correr("111@lid", "catalogo");
  assert.match(ultimo(), /EN VENTA[\s\S]*SE BUSCA/);
  await correr("111@lid", "buscar", "Bici");
  assert.match(ultimo(), /Resultados para "Bici"\* \(1\)\n🏷️ \*#1\* bici/);
  await correr("111@lid", "buscar", "lavarropas");
  assert.match(ultimo(), /Nada activo con "lavarropas"\. Con \.avisame lavarropas/);
  await correr("111@lid", "catalogo", "1");
  assert.match(ultimo(), /🏷️ \*Vendo #1\* · activa\nbici rodado 26 \$ 4\.000 Pocitos\nPrecio: \$ 4\.000 · Publicó @111 hace/);
  await correr("111@lid", "catalogo", "99");
  assert.match(ultimo(), /No hay ninguna publicación #99/);
  await correr("222@lid", "vendo", "silla de oficina $ 2.500");
  assert.match(ultimo(), /Vendo #4\* registrada\. Precio: \$ 2\.500/);
  await correr("222@lid", "mias");
  assert.match(ultimo(), /Tus publicaciones activas\* \(2\)/);
  await correr("333@lid", "avisame");
  assert.match(ultimo(), /Tus alertas: heladera\./);
  await correr("333@lid", "avisame", "quitar heladera");
  assert.match(ultimo(), /saqué la alerta "heladera"/);
  await correr("333@lid", "avisame", "ab");
  assert.match(ultimo(), /al menos 3 letras/);
  for (const w of ["uno", "dos", "tres", "cuatro", "cinco"]) await correr("333@lid", "avisame", w);
  await correr("333@lid", "avisame", "seis");
  assert.match(ultimo(), /Ya tenés 5 alertas/);
});

test("compraventa: estados, permisos y vencimiento", async () => {
  await correr("222@lid", "vendido", "1");
  assert.match(ultimo(), /La #1 no es tuya/);
  await correr("222@lid", "vendido", "1", { isMod: true });
  assert.match(ultimo(), /la #1 quedó como concretada/);
  assert.equal(F.getPublicacion(G, 1).estado, "vendida");
  await correr("111@lid", "reservado", "1");
  assert.match(ultimo(), /ya está ✅ concretada\. Con \.sigue 1 la volvés a activar/);
  await correr("111@lid", "sigue", "1");
  assert.equal(F.getPublicacion(G, 1).estado, "activa");
  await correr("111@lid", "reservado", "1");
  assert.equal(F.getPublicacion(G, 1).estado, "reservada");
  await correr("111@lid", "vendo");
  assert.match(ultimo(), /🔒 \*#1\*/);
  await correr("111@lid", "baja", "3");
  assert.equal(F.getPublicacion(G, 3).estado, "cerrada");
  await correr("111@lid", "baja", "x");
  assert.match(ultimo(), /¿Cuál\? Respondé a la publicación y escribí \.baja, o poné el número/);
  const ahora = Date.now();
  F.actualizarPublicacion(G, 4, { actualizada: ahora - 8 * DIA });
  assert.equal(await C.chequearPublicaciones(ahora), 1);
  assert.match(ultimo(), /❓ @222, ¿sigue en pie tu vendo #4 \(silla de oficina \$ 2\.500\)\?/);
  assert.ok(F.getPublicacion(G, 4).aviso > 0);
  assert.equal(await C.chequearPublicaciones(ahora + DIA), 0, "todavía no venció el plazo para contestar");
  assert.equal(await C.chequearPublicaciones(ahora + 3 * DIA), 1);
  assert.equal(F.getPublicacion(G, 4).estado, "vencida");
  assert.match(ultimo(), /⌛ Di de baja la #4 de @222 por falta de respuesta/);
  await correr("222@lid", "sigue", "4");
  assert.deepEqual([F.getPublicacion(G, 4).estado, F.getPublicacion(G, 4).aviso], ["activa", 0]);
  for (let i = 0; i < 10; i++) await correr("333@lid", "vendo", `cosa ${i} $ 100`);
  await correr("333@lid", "vendo", "una más $ 100");
  assert.match(ultimo(), /Ya tenés 10 publicaciones activas/);
});

test("compraventa: calificaciones y reputación", async () => {
  const cal = (sender, text) => Cal.run(msg(sender, text), { client: cliente(), command: "calificar", args: text.split(/\s+/), text });
  await cal("222@lid", "@111 5 buen vendedor, rápido");
  assert.match(ultimo(), /⭐⭐⭐⭐⭐ Calificaste a @111: "buen vendedor, rápido"\. Ahora tiene 5,0 de 5 \(1 calificación\)\./);
  await cal("333@lid", "@111 4");
  assert.match(ultimo(), /Ahora tiene 4,5 de 5 \(2 calificaciones\)/);
  await cal("333@lid", "@111 2 me arrepentí");
  assert.match(ultimo(), /Actualicé tu calificación de este mes para @111/);
  assert.deepEqual(F.reputacionDe("111@lid"), { promedio: 3.5, cantidad: 2 });
  await cal("111@lid", "@111 5");
  assert.match(ultimo(), /A vos mismo no/);
  await cal("111@lid", "@222 9");
  assert.match(ultimo(), /van de 1 a 5/);
  await cal("111@lid", "5 sin mencion");
  assert.match(ultimo(), /¿A quién\?/);
  await cal("111@lid", "@999 5");
  assert.match(ultimo(), /No conozco a esa persona/);
  await Cal.run(msg("222@lid", "@111"), { client: cliente(), command: "reputacion", args: ["@111"], text: "@111" });
  assert.match(ultimo(), /⭐ Reputación de @111: \*3,5 de 5 \(2 calificaciones\)\*\n⭐⭐ "me arrepentí" — @333\n⭐⭐⭐⭐⭐ "buen vendedor, rápido" — @222/);
  await Cal.run(msg("333@lid", ""), { client: cliente(), command: "reputacion", args: [], text: "" });
  assert.match(ultimo(), /Tu reputación: todavía sin calificaciones/);
  assert.match(Pf.textoPerfil(G, "111@lid", F.getUser("111@lid")).texto, /⭐ Reputación: 3,5 de 5 \(2 calificaciones\)\n🏷️ 1 publicación activa/);
});

test("compraventa: reglas y plantilla", async () => {
  const Reglas = (await import("../plugins/grupo-reglas.js")).default;
  const run = (sender, command, text, isAdmin) => Reglas.run(msg(sender, text), { client: cliente(), command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isAdmin });
  globalThis.txt = { onlyAdmin: "solo admins" };
  await run("111@lid", "reglas", "", false);
  assert.match(ultimo(), /no tiene reglas cargadas/);
  await run("111@lid", "reglas", "set no se aceptan reventas", false);
  assert.equal(ultimo(), "solo admins");
  await run("111@lid", "reglas", "set 1. Publicá con precio y zona\n2. Nada de reventas", true);
  assert.match(ultimo(), /reglas cargadas/);
  await run("222@lid", "reglas", "", false);
  assert.match(ultimo(), /📋 \*Reglas del grupo\*\n\n1\. Publicá con precio y zona\n2\. Nada de reventas/);
  const aviso = Reg.avisoReglasParaNuevos(G, ["444@lid", { id: "555@s.whatsapp.net" }]);
  assert.match(aviso.texto, /Bienvenid@s @444 @555[\s\S]*1\. Publicá con precio y zona/);
  assert.deepEqual(aviso.mentions, ["444@lid", "555@s.whatsapp.net"]);
  await run("111@lid", "plantilla", "", false);
  assert.match(ultimo(), /📝 \*Para publicar, este formato:\*\n#vendo qué es · precio · zona/);
  await run("111@lid", "plantilla", "set #vendo artículo | precio | barrio | foto", true);
  await run("111@lid", "plantilla", "", false);
  assert.match(ultimo(), /#vendo artículo \| precio \| barrio \| foto/);
  await run("111@lid", "reglas", "borrar", true);
  assert.equal(Reg.avisoReglasParaNuevos(G, ["444@lid"]), null);
  await run("111@lid", "reglas", "", false);
  assert.match(ultimo(), /no tiene reglas cargadas/);
});

test("compraventa: el horario del grupo cierra y abre solo", async () => {
  const cambios = [];
  const cliente2 = { ...cliente(), groupSettingUpdate: async (jid, estado) => cambios.push([jid, estado]) };
  const HGp = (await import("../plugins/grupo-horario.js")).default;
  const en = (h, min = 0) => new Date(2026, 8, 5, h, min);
  await HGp.run(msg("111@lid", ""), { client: cliente2, text: "" });
  assert.match(ultimo(), /no tiene horario/);
  await HGp.run(msg("111@lid", "a la noche"), { client: cliente2, text: "a la noche" });
  assert.match(ultimo(), /No entendí el horario/);
  assert.ok(HG.fijarHorarioGrupo(G, "8:00-22:00").ok);
  assert.equal(F.getChat(G).horarioGrupo, "08:00-22:00");
  assert.equal(await HG.chequearHorariosGrupo(en(23), cliente2), 1);
  assert.deepEqual(cambios, [[G, "announcement"]]);
  assert.equal(F.getChat(G).grupoCerradoPorHorario, 1);
  assert.match(ultimo(), /🌙 Grupo cerrado hasta las 08:00/);
  assert.equal(await HG.chequearHorariosGrupo(en(23, 30), cliente2), 0, "no repite el cierre");
  assert.equal(await HG.chequearHorariosGrupo(en(9), cliente2), 1);
  assert.deepEqual(cambios.at(-1), [G, "not_announcement"]);
  assert.match(ultimo(), /☀️ Grupo abierto\. Horario: de 08:00 a 22:00/);
  assert.equal(F.getChat(G).grupoCerradoPorHorario, 0);
  assert.equal(await HG.chequearHorariosGrupo(en(12), cliente2), 0);
  await HG.chequearHorariosGrupo(en(2), cliente2);
  assert.equal(F.getChat(G).grupoCerradoPorHorario, 1);
  await HG.quitarHorarioGrupo(G, cliente2);
  assert.deepEqual(cambios.at(-1), [G, "not_announcement"]);
  assert.deepEqual([F.getChat(G).horarioGrupo, F.getChat(G).grupoCerradoPorHorario], ["", 0]);
  assert.match(HG.textoHorarioGrupo(G), /no tiene horario/);
});

test("compraventa: los admins corrigen calificaciones maliciosas", async () => {
  const run = (sender, text, extra = {}) => Cal.run(msg(sender, text), { client: cliente(), command: "calificaciones", args: text.trim() ? text.trim().split(/\s+/) : [], text, isAdmin: false, isOwner: false, ...extra });
  // 111 has two ratings from this group (from 222 and 333); a third one made in another group
  const otra = F.guardarCalificacion("otro@g.us", "444@lid", "111@lid", 1, "estafador", 0);
  assert.equal(otra.actualizada, false);
  await run("222@lid", "@111");
  const lista = ultimo();
  assert.match(lista, /⭐ Calificaciones de @111 \(3, promedio 2,7 de 5 \(3 calificaciones\)\):/);
  assert.match(lista, /\*#3\* ⭐ "estafador" — @444 · hace .* · en otro grupo/);
  assert.match(lista, /\*#2\* ⭐⭐ "me arrepentí" — @333/);
  assert.match(lista, /Admins: \.calificaciones borrar N/);
  // an ordinary person can't delete someone else's
  await run("222@lid", "borrar 2");
  assert.match(ultimo(), /Solo un admin del grupo, quien la hizo, o el owner puede borrar/);
  // an admin of this group can't touch one made in another group
  await run("222@lid", "borrar 3", { isAdmin: true });
  assert.match(ultimo(), /La #3 se hizo en otro grupo/);
  // ... but can edit and delete the ones from here
  await run("222@lid", "editar 2 4 se arregló", { isAdmin: true });
  assert.match(ultimo(), /✏️ La calificación #2 de @333 a @111 quedó en ⭐⭐⭐⭐ "se arregló"\. @111 ahora tiene 3,3 de 5/);
  assert.deepEqual([F.getCalificacion(2).estrellas, F.getCalificacion(2).comentario], [4, "se arregló"]);
  await run("222@lid", "editar 2 9", { isAdmin: true });
  assert.match(ultimo(), /van de 1 a 5/);
  await run("222@lid", "borrar 99", { isAdmin: true });
  assert.match(ultimo(), /No hay ninguna calificación #99/);
  await run("222@lid", "borrar x", { isAdmin: true });
  assert.match(ultimo(), /¿Cuál\? Poné el número/);
  // the owner can handle one from another group
  await run("222@lid", "borrar 3", { isOwner: true });
  assert.match(ultimo(), /🗑️ Borré la calificación #3 \(⭐ de @444 a @111\)\. @111 ahora tiene 4,5 de 5 \(2 calificaciones\)/);
  assert.equal(F.getCalificacion(3), null);
  // whoever made it can delete their own
  await run("333@lid", "borrar 2");
  assert.match(ultimo(), /Borré la calificación #2/);
  await run("333@lid", "borrar 1");
  assert.match(ultimo(), /Solo un admin del grupo/);
  await run("111@lid", "");
  assert.match(ultimo(), /⭐ Tus calificaciones \(1, promedio 5,0 de 5/);
});

test("compraventa: publicar respondiendo a un mensaje", async () => {
  // The case that started all this: a photo with the description in its caption, and its owner posts it by replying.
  const foto = cita("444@lid", "ropero de pino, $ 3.000, Malvín");
  await correr("444@lid", "vendo", "", { quoted: foto });
  const suyas = F.publicacionesDe(G, "444@lid");
  assert.equal(suyas.length, 1);
  assert.equal(suyas[0].texto, "ropero de pino, $ 3.000, Malvín");
  assert.equal(suyas[0].precio, "$ 3.000");
  assert.equal(suyas[0].messageId, foto.id, "la publicación apunta a la foto, no al mensaje del comando");

  // a mod posts someone else's photo: it's filed under their name, and the hashtag isn't repeated in the text
  await correr("111@lid", "vendo", "", { quoted: cita("555@lid", "#vendo heladera Consul, $ 6.000"), isMod: true });
  const de555 = F.publicacionesDe(G, "555@lid");
  assert.equal(de555.length, 1);
  assert.equal(de555[0].texto, "heladera Consul, $ 6.000");
  assert.match(ultimo(), /Queda a nombre de @555/);

  // an ordinary person can't post someone else's
  await correr("222@lid", "vendo", "", { quoted: cita("555@lid", "mesa ratona $ 900") });
  assert.match(ultimo(), /solo quien lo mandó, o un moderador/);
  assert.equal(F.publicacionesDe(G, "555@lid").length, 1, "no se creó nada");

  // a photo with no description can't be posted
  await correr("444@lid", "vendo", "", { quoted: cita("444@lid", "") });
  assert.match(ultimo(), /no tiene descripción/);

  // replying to one of the bot's messages does NOT post: it shows the catalogue, which is what the person expected
  await correr("444@lid", "vendo", "", { quoted: cita("bot@lid", "🏷️ *EN VENTA* (4)", { fromMe: true }) });
  assert.match(ultimo(), /EN VENTA/);

  // the same message isn't posted twice (it already went through the #vendo hook, or through another mod)
  await correr("444@lid", "vendo", "", { quoted: foto });
  assert.match(ultimo(), /ya es la publicación/);

  // .vender, the way people say it, does the same as .vendo
  await correr("666@lid", "vender", "", { quoted: cita("666@lid", "silla de pino $ 500") });
  const de666 = F.publicacionesDe(G, "666@lid");
  assert.equal(de666.length, 1);
  assert.equal(de666[0].tipo, "vendo", "se publica como venta, no con un tipo nuevo");
  assert.equal(de666[0].texto, "silla de pino $ 500");

  // .compro too
  await correr("555@lid", "compro", "", { quoted: cita("555@lid", "monitor 24 pulgadas") });
  assert.equal(F.publicacionesDe(G, "555@lid").find((p) => p.tipo === "compro")?.texto, "monitor 24 pulgadas");

  // regression: replying to nothing and with no text still gives the catalogue
  await correr("444@lid", "vendo");
  assert.match(ultimo(), /EN VENTA/);

  // regression: replying AND with text, it posts yours under your name (as always)
  await correr("111@lid", "vendo", "silla gamer $ 5.000", { quoted: cita("555@lid", "cualquier cosa") });
  assert.ok(
    F.publicacionesDe(G, "111@lid").some((p) => p.texto === "silla gamer $ 5.000"),
    "el texto tipeado manda sobre el citado",
  );
});

test("compraventa: cerrar respondiendo a la publicación", async () => {
  const foto = cita("444@lid", "bicicleta playera $ 2.000");
  await correr("444@lid", "vendo", "", { quoted: foto });
  const numero = F.publicacionesDe(G, "444@lid").find((p) => p.texto.startsWith("bicicleta")).numero;

  // replying to the original message, without giving the number
  await correr("444@lid", "vendido", "", { quoted: foto });
  assert.match(ultimo(), new RegExp(`la #${numero} quedó como concretada`));
  assert.equal(F.getPublicacion(G, numero).estado, "vendida");

  // replying to the bot's confirmation, which is what people actually answer
  const otra = cita("444@lid", "monopatín eléctrico $ 8.000");
  await correr("444@lid", "vendo", "", { quoted: otra });
  const n2 = F.publicacionesDe(G, "444@lid").find((p) => p.texto.startsWith("monopatín")).numero;
  const confirmacion = F.getPublicacion(G, n2).mensajeBot;
  assert.ok(confirmacion, "se guardó el id del mensaje de confirmación");
  await correr("444@lid", "baja", "", { quoted: cita("bot@lid", "…", { id: confirmacion, fromMe: true }) });
  assert.equal(F.getPublicacion(G, n2).estado, "cerrada");

  // regression: with the number it still works the same
  await correr("444@lid", "sigue", String(n2));
  assert.equal(F.getPublicacion(G, n2).estado, "activa");

  // replying to just any message isn't enough
  await correr("444@lid", "vendido", "", { quoted: cita("222@lid", "qué lindo día") });
  assert.match(ultimo(), /¿Cuál\? Respondé a la publicación/);

  // ni responder nada
  await correr("444@lid", "vendido");
  assert.match(ultimo(), /¿Cuál\? Respondé a la publicación/);
});

test("compraventa: .catalogo lista todo y muestra el detalle de una", async () => {
  await correr("111@lid", "catalogo");
  assert.match(ultimo(), /EN VENTA[\s\S]*SE BUSCA/);
  assert.match(ultimo(), /Detalle: \.catalogo N/, "el pie ya no nombra .publicacion");
  await correr("111@lid", "catalogo", "1");
  assert.match(ultimo(), /\*Vendo #1\*/);
  await correr("111@lid", "catalogo", "99");
  assert.match(ultimo(), /No hay ninguna publicación #99/);
  await correr("111@lid", "catalogo", "bici");
  assert.match(ultimo(), /EN VENTA/, "lo que no es un número muestra el catálogo entero");
});

test("compraventa: quedaron solo los comandos que se usan, más .vender como alias de .vendo", () => {
  assert.deepEqual(Cmd.cmd, ["vendo", "vender", "compro", "catalogo", "catálogo", "buscar", "vendido", "baja", "reservado", "sigue", "mias", "avisame"]);
  // The tests call Cmd.run with the command directly, never through plugin.cmd: without this check, half of
  // plugin.cmd could be deleted and the suite would stay green.
  for (const viejo of ["busco", "publicaciones", "publicacion", "publicación", "conseguido", "mispublicaciones", "alertas"]) {
    assert.ok(!Cmd.cmd.includes(viejo), `.${viejo} sigue declarado`);
  }
});
