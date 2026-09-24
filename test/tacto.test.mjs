import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";

// Claudia's tact (lib/tacto.js): the rules, checked before any AI call, that decide whether a glance reads the chat,
// whether she may write or only react, and how much. They're pure functions over a snapshot of the chat, built here by
// hand at a fixed hour.

let I, T, J;
before(async () => {
  await prepararBase("tacto");
  I = await import("../lib/iniciativa.js");
  T = await import("../lib/tacto.js");
  J = await import("../lib/mensajes-de-juego.js");
});

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const AHORA = new Date(2026, 8, 24, 15, 0).getTime();
const msj = (quien, texto, haceMin) => ({ nombre: quien, usuario: `${quien}@lid`, texto, esBot: false, fecha: AHORA - haceMin * MIN, id: `${quien}-${haceMin}` });
const charla = () => [msj("ana", "che, ¿vieron el partido?", 20), msj("beto", "sí, un desastre", 18), msj("carla", "yo me dormí", 15), msj("ana", "jaja típico", 10), msj("beto", "mañana hay otro", 2)];
const intervencion = (tipo, haceMin, extra = {}) => ({ tipo, fecha: AHORA - haceMin * MIN, respondida: 0, reaccionada: 0, texto: "algo", objetivoId: null, ...extra });

function situacion(cambios = {}) {
  return {
    ahora: AHORA,
    fila: { iniciativa: 1, charla: 1, isBanned: 0, adminMode: 0, horarioGrupo: "", grupoCerradoPorHorario: 0 },
    estado: { silencioHasta: 0, silencioMotivo: "" },
    nuevos: charla(),
    previos: [],
    propiasHoy: [],
    promedio: { personas: 3, total: 30 },
    juegoAbierto: false,
    llamadasHoy: 0,
    vistazosHoy: 0,
    hayApiKey: true,
    forzado: false,
    prueba: false,
    ...cambios,
  };
}

test("tacto: con todo en orden mira, puede escribir y reaccionar a dos", () => {
  assert.deepEqual(T.puedeMirar(situacion()), { ok: true });
  assert.deepEqual(T.permisoTexto(situacion()), { ok: true });
  assert.deepEqual(T.permisoReacciones(situacion()), { max: 2, motivo: "" });
});

test("tacto: de noche, con el grupo cerrado o callada no mira", () => {
  const noche = new Date(2026, 8, 24, 23, 30).getTime();
  assert.equal(T.puedeMirar(situacion({ ahora: noche })).motivo, "es de noche");
  assert.equal(T.puedeMirar(situacion({ ahora: noche, forzado: true })).ok, true, ".vistazo se saltea el horario");
  assert.equal(T.puedeMirar(situacion({ ahora: new Date(2026, 8, 24, 8, 59).getTime() })).motivo, "es de noche", "se despierta a las 9");

  assert.equal(T.puedeMirar(situacion({ fila: { iniciativa: 1, charla: 1, horarioGrupo: "08:00-14:00" } })).motivo, "el grupo está cerrado por horario");
  assert.equal(T.puedeMirar(situacion({ fila: { iniciativa: 1, charla: 1, horarioGrupo: "20:00-02:00" } })).ok, false, "una franja que cruza la medianoche también cuenta");
  assert.equal(T.puedeMirar(situacion({ fila: { iniciativa: 1, charla: 1, grupoCerradoPorHorario: 1 } })).ok, false);

  const callada = T.puedeMirar(situacion({ estado: { silencioHasta: AHORA + HORA, silencioMotivo: "le pidieron que se calle" } }));
  assert.equal(callada.motivo, "está callada (le pidieron que se calle)");
  assert.equal(T.puedeMirar(situacion({ fila: { iniciativa: 1, charla: 0 } })).motivo, "la charla está apagada (.charla)");
  assert.equal(T.puedeMirar(situacion({ fila: { iniciativa: 0, charla: 1 } })).motivo, "la iniciativa está apagada");
  assert.equal(T.puedeMirar(situacion({ fila: { iniciativa: 0, charla: 1 }, prueba: true })).ok, true, ".vistazo prueba anda con la iniciativa apagada");
  assert.equal(T.puedeMirar(situacion({ hayApiKey: false })).ok, false);
});

test("tacto: sin nada nuevo marca como leído sin llamar a nadie; con topes, no mira", () => {
  assert.deepEqual(T.puedeMirar(situacion({ nuevos: [] })), { ok: false, motivo: "no hay nada nuevo", marcarLeido: true });
  const soloElla = [{ ...msj("claudia", "jaja", 5), esBot: true }];
  assert.equal(T.puedeMirar(situacion({ nuevos: soloElla })).motivo, "no hay nada nuevo", "lo que dijo ella no es nuevo para ella");
  assert.equal(T.puedeMirar(situacion({ llamadasHoy: 60 })).ok, false, "tope global de llamadas");
  assert.equal(T.puedeMirar(situacion({ vistazosHoy: 12 })).ok, false, "tope de vistazos del día");
  assert.equal(T.puedeMirar(situacion({ vistazosHoy: 12, forzado: true })).ok, true);
});

test("tacto: un tema serio la deja afuera un par de horas, con o sin tildes", () => {
  for (const serio of ["Se murió la abuela de Juan", "Q.E.P.D. querido", "está internado desde ayer", "mañana es el velorio", "mis condolencias", "lo llevaron al CTI", "tuvo un accidente"]) {
    assert.ok(T.hayTemaSerio([msj("ana", serio, 1)]), `"${serio}" es serio`);
  }
  for (const liviano of ["me muero de risa", "qué calor hace", "la hospitalidad de Ana", "internet anda mal", "claudia sos una genia"]) {
    assert.equal(T.hayTemaSerio([msj("ana", liviano, 1)]), null, `"${liviano}" no es serio`);
  }
  assert.equal(T.hayTemaSerio([{ ...msj("claudia", "qepd", 1), esBot: true }]), null, "lo que dijo ella no cuenta");

  const r = T.puedeMirar(situacion({ nuevos: [...charla(), msj("carla", "Falleció el tío de Beto 😢", 1)] }));
  assert.equal(r.ok, false);
  assert.equal(r.marcarLeido, true, "lo lee y lo deja pasar");
  assert.equal(r.pausaMs, 2 * HORA);
});

test("tacto: con un juego abierto no mira", () => {
  const C1 = "juego1@g.us";
  assert.equal(T.hayJuegoAbierto(C1, AHORA), false);
  J.marcarMensajeDeJuego("ACERTIJO-9", C1, AHORA - 2 * MIN);
  assert.equal(T.hayJuegoAbierto(C1, AHORA), true, "un acertijo de hace dos minutos");
  assert.equal(T.hayJuegoAbierto(C1, AHORA + 4 * MIN), false, "pasados cinco minutos ya no");

  const C2 = "juego2@g.us";
  globalThis.rondasTrivia = globalThis.rondasTrivia || new Map();
  globalThis.rondasTrivia.set(C2, { tipo: "trivia" });
  assert.equal(T.hayJuegoAbierto(C2, AHORA), true, "una trivia abierta");
  globalThis.rondasTrivia.delete(C2);
  globalThis.peleas = new Map([[`${C2}|111@lid`, {}]]);
  assert.equal(T.hayJuegoAbierto(C2, AHORA), true, "una pelea por turnos");
  globalThis.peleas.clear();

  assert.equal(T.puedeMirar(situacion({ juegoAbierto: true })).motivo, "hay un juego abierto");
});

test("tacto: escribir tiene sus reglas; reaccionar, sus topes", () => {
  const no = (cambios) => T.permisoTexto(situacion(cambios)).motivo;
  const respondida = { respondida: 1 };
  assert.equal(no({ propiasHoy: [intervencion("comentario", 200, respondida), intervencion("respuesta", 150, respondida), intervencion("comentario", 90, respondida)], promedio: { personas: 1, total: 50 } }), "hoy ya escribió todo lo que escribe por su cuenta");
  assert.equal(no({ propiasHoy: [intervencion("comentario", 90)] }), "nadie le dio bola a lo último que dijo");
  assert.equal(T.permisoTexto(situacion({ propiasHoy: [intervencion("comentario", 90, { reaccionada: 1 })] })).ok, true, "una reacción también es darle bola");
  const mucha = Array.from({ length: 10 }, (_, i) => intervencion("charla", 200 - i));
  assert.equal(no({ propiasHoy: mucha }), "hoy ya habló más que el promedio del grupo", "10 mensajes suyos contra 10 por persona");
  assert.equal(no({ nuevos: charla().slice(0, 3) }), "hay muy poco nuevo como para meterse");
  assert.equal(T.permisoTexto(situacion({ nuevos: charla().slice(0, 4) })).ok, true, "con cuatro mensajes nuevos ya puede");
  assert.equal(no({ nuevos: charla().map((e) => ({ ...e, fecha: e.fecha - HORA })) }), "el grupo está quieto", "lo último es de hace una hora");
  assert.equal(no({ propiasHoy: [intervencion("charla", 5)] }), "habló hace muy poco");
  const manoAMano = Array.from({ length: 8 }, (_, i) => msj(i % 2 ? "ana" : "beto", `mensaje ${i}`, 10 - i));
  assert.equal(no({ nuevos: manoAMano }), "dos están charlando mano a mano");
  assert.equal(T.permisoTexto(situacion({ nuevos: [...manoAMano.slice(0, 7), msj("carla", "yo opino", 1)] })).ok, true, "con una tercera persona ya es charla del grupo");

  const reacciones = Array.from({ length: 7 }, (_, i) => intervencion("reaccion", 100 - i));
  assert.equal(T.permisoReacciones(situacion({ propiasHoy: reacciones })).max, 1);
  assert.equal(T.permisoReacciones(situacion({ propiasHoy: [...reacciones, intervencion("reaccion", 1)] })).max, 0);
  assert.equal(T.permisoReacciones(situacion({ nuevos: charla().map((e) => ({ ...e, fecha: e.fecha - 4 * HORA })) })).max, 0, "nada de reaccionar a lo de hace horas");
});

test("tacto: la nombran, la callan", () => {
  const nombra = (t) => I.NOMBRA_A_CLAUDIA.test(I.normalizar(t));
  const callate = (t) => I.CALLATE.test(I.normalizar(t));
  assert.ok(nombra("Claudia, ¿qué opinás?") && nombra("jaja el bot") && !nombra("claudiana"));
  for (const t of ["Cállate Claudia", "claudia shhh", "nadie te preguntó bot", "qué pesada claudia", "bot cerrá el pico", "basta claudia"]) assert.ok(callate(t), t);
  for (const t of ["claudia sos una genia", "claudia qué opinás"]) assert.ok(!callate(t), t);
});
