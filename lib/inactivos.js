// Inactive members. .inactivos tags who hasn't written in a while and warns them; whoever writes again within the
// grace period is spared and paid (COINS.REGRESO), and .k inactivos removes, after asking, the warned who stayed quiet.
// Never on the list: the bot, its owners, WhatsApp admins, the bot's admins and mods, and whoever came in recently.
import { presenciaDelGrupo, ultimoDiaConversacion, marcarAvisoInactivo, quitarAvisoInactivo, registrarMensajeGrupo, getUser, esOwner, rolGrupo, ganarCoins } from "../database-functions.js";
import { idsDeParticipante, esParticipante, expulsar } from "./identidad.js";
import { nombreDe } from "./menciones.js";
import { COINS, monedasActivas } from "./urucoins.js";
import { DIA_MS } from "./tiempo.js";
import { setTimeout as esperar } from "node:timers/promises";

export const INACTIVOS = {
  DIAS: 15, // days without writing to count as inactive (".inactivos 30" changes it for that call)
  PLAZO_DIAS: 3, // days a warned person has to write before .k inactivos can remove them
  POR_TANDA: 20, // most removals per .k inactivos: many in a row is what gets a bot flagged by WhatsApp
  PAUSA_MS: 3000, // between removals
};

// Groups where .k inactivos is removing right now: a second confirmation meanwhile would remove the same people.
const sacando = new Set();

// What's known of each participant, by all of their ids: their last sign of life (the last message of any kind; before
// presencia_grupo existed, the last day with conversation, taken at its end, or the first time the bot saw them write
// there), when they came in and when they were warned. In ms, 0 when unknown. Protected people are left out.
function estadosDelGrupo(chat, participants, client) {
  const porId = new Map(presenciaDelGrupo(chat).map((r) => [r.usuario, r]));
  const dias = new Map(ultimoDiaConversacion(chat).map((r) => [r.usuario, new Date(`${r.fecha}T23:59:59`).getTime()]));
  const yo = { lid: client?.user?.lid, jid: client?.user?.jid };

  const estados = [];
  for (const p of participants || []) {
    if (p.admin || esParticipante(p, yo)) continue;
    const ids = idsDeParticipante(p);
    if (ids.some((id) => esOwner(id) || rolGrupo(chat, id))) continue;

    const fila = ids.map((id) => getUser(id)).find(Boolean);
    const enGrupo = fila?.inGroup?.[chat];
    let ultimo = enGrupo?.messageCount > 0 ? enGrupo.desde || 0 : 0;
    let ingreso = 0;
    let avisado = 0;
    for (const id of ids) {
      const r = porId.get(id);
      ultimo = Math.max(ultimo, r?.ultimo_mensaje || 0, dias.get(id) || 0);
      ingreso = Math.max(ingreso, r?.ingreso || 0);
      avisado = Math.max(avisado, r?.avisado || 0);
    }
    estados.push({ participante: p, ids, ultimo, ingreso, avisado, mensajes: enGrupo?.messageCount || 0 });
  }
  return estados;
}

// Who hasn't written in `dias` days and didn't come in during them, the longest silent first.
export function inactivosDe(chat, participants, client, { dias = INACTIVOS.DIAS, ahora = Date.now() } = {}) {
  const corte = ahora - dias * DIA_MS;
  return estadosDelGrupo(chat, participants, client)
    .filter((e) => e.ultimo <= corte && e.ingreso <= corte)
    .sort((a, b) => a.ultimo - b.ultimo);
}

// Who .k inactivos may remove: warned PLAZO_DIAS ago or more and silent since. Writing lifts the warning, but the
// silence is checked here too, in case the message came under an id the warning doesn't have.
export function paraSacar(chat, participants, client, ahora = Date.now()) {
  const plazo = ahora - INACTIVOS.PLAZO_DIAS * DIA_MS;
  const avisados = estadosDelGrupo(chat, participants, client).filter((e) => e.avisado && e.ultimo < e.avisado);
  return { listos: avisados.filter((e) => e.avisado <= plazo), enPlazo: avisados.filter((e) => e.avisado > plazo) };
}

const hace = (e, ahora) => {
  if (!e.ultimo) return e.mensajes > 0 ? "sin mensajes registrados" : "nunca escribió";
  const dias = Math.floor((ahora - e.ultimo) / DIA_MS);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
};

// .inactivos [días]: tags them and warns them. Returns { texto, mentions }.
export function avisarInactivos(chat, participants, client, { dias = INACTIVOS.DIAS, ahora = Date.now() } = {}) {
  const lista = inactivosDe(chat, participants, client, { dias, ahora });
  if (lista.length === 0) return { texto: `No hay inactivos: todos escribieron en los últimos ${dias} días (o entraron hace menos).`, mentions: [] };

  for (const e of lista) marcarAvisoInactivo(chat, e.ids, ahora);
  const premio = monedasActivas(chat) ? ` y se lleva 🪙 ${COINS.REGRESO}` : "";
  const readMore = String.fromCharCode(8206).repeat(4001);
  const lineas = lista.map((e) => `@${e.participante.id.split("@")[0]} — ${hace(e, ahora)}`);
  const texto =
    `📢 *Inactivos (${lista.length})*: no escriben hace ${dias} días o más.\n` +
    `Tienen ${INACTIVOS.PLAZO_DIAS} días para mandar un mensaje: el que vuelva se salva${premio}. A los que sigan callados los puede sacar un admin con .k inactivos.\n` +
    `${readMore}\n\n${lineas.join("\n")}`;
  // The id the group lists them under, so the mention works.
  return { texto, mentions: lista.map((e) => e.participante.id) };
}

// .k inactivos: without "confirmar" it only says who would go. Removes POR_TANDA at most, one at a time.
export async function sacarInactivos(client, m, participants, { confirmar = false, ahora = Date.now() } = {}) {
  const { listos, enPlazo } = paraSacar(m.chat, participants, client, ahora);
  if (listos.length === 0) {
    const espera = enPlazo.length ? ` Hay ${enPlazo.length} avisados que todavía están en plazo.` : "";
    return client.sendText(m.chat, `No hay a quién sacar: nadie fue avisado con .inactivos hace ${INACTIVOS.PLAZO_DIAS} días o más y siguió callado.${espera}`, m);
  }

  // Named, not mentioned: the preview would tag them all once more.
  const nombre = (e) => nombreDe(e.ids.find((id) => getUser(id)) || e.participante.id);
  if (!confirmar) {
    const lineas = listos.map((e) => `• ${nombre(e)} — ${hace(e, ahora)}`);
    const tanda = listos.length > INACTIVOS.POR_TANDA ? `\n\nSaco de a ${INACTIVOS.POR_TANDA} por vez.` : "";
    return client.sendText(m.chat, `☠️ *Saldrían ${listos.length}*: avisados hace ${INACTIVOS.PLAZO_DIAS} días o más y siguen sin escribir.\n\n${lineas.join("\n")}${tanda}\n\nPara sacarlos: *.k inactivos confirmar*`, m);
  }

  if (sacando.has(m.chat)) return client.sendText(m.chat, "Ya los estoy sacando, esperá a que termine.", m);
  sacando.add(m.chat);
  try {
    const tanda = listos.slice(0, INACTIVOS.POR_TANDA);
    let sacados = 0;
    for (const [i, e] of tanda.entries()) {
      if (i > 0) await esperar(INACTIVOS.PAUSA_MS);
      const { ok } = await expulsar(client, m.chat, e.participante.id);
      if (ok) {
        sacados++;
        quitarAvisoInactivo(m.chat, e.ids);
      }
    }
    const fallas = tanda.length - sacados;
    const resto = listos.length - tanda.length;
    return client.sendText(m.chat, `🧹 Saqué a ${sacados} inactivos.${fallas ? ` A ${fallas} no pude.` : ""}${resto ? ` Quedan ${resto}: repetí .k inactivos confirmar.` : ""}`, m);
  } finally {
    sacando.delete(m.chat);
  }
}

// On every group message: stamps it and, if .inactivos had warned them, they're spared and paid.
export async function registrarPresencia(client, m) {
  if (m.fromMe || !m.sender) return;
  const avisado = registrarMensajeGrupo(m.chat, [m.sender, m.senderJid].filter(Boolean));
  if (!avisado) return;
  const premio = monedasActivas(m.chat) ? COINS.REGRESO : 0;
  if (premio) ganarCoins(m.chat, m.sender, premio, "regreso_inactivo");
  await client.sendText(m.chat, `🎉 Volvió @${m.sender.split("@")[0]}: sale de la lista de inactivos${premio ? ` y se lleva 🪙 ${premio}` : ""}.`, m, { mentions: [m.sender] });
}
