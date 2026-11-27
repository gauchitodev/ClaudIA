// Draws an example front page of the Sunday paper (lib/pueblo-diario.js, lib/tapa.js) from a made-up town, in a
// database of its own in a temporary folder (the bot's isn't touched): node scripts/tapa-ejemplo.mjs [where.png]
// With ILUSTRAR=1 and a geminiApiKey in the config.toml of the folder it's run from, it asks Gemini for the picture
// as the bot would (that spends one of the month's, in that temporary database only).
import fs from "fs";
import os from "os";
import path from "path";
import { db, loadDatabase, initDataDB, updateChat, moverCoins } from "../database-functions.js";
import * as P from "../lib/pueblo.js";
import * as D from "../lib/pueblo-diario.js";
import { configuracion, cargarConfiguracion } from "../lib/configuracion.js";

const destino = path.resolve(process.argv[2] || "tapa-ejemplo.png");
const raiz = process.cwd();
if (process.env.ILUSTRAR === "1") {
  cargarConfiguracion();
  configuracion.pueblo = { ...configuracion.pueblo, ilustraciones: true };
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-tapa-"));
process.chdir(dir);
// Opened where it's run from: the temporary folder.
loadDatabase();

const chat = "ejemplo@g.us";
const gente = { ana: ["300000000000001@lid", "Ana"], beto: ["300000000000002@lid", "Beto"], carla: ["300000000000003@lid", "Carla"], dani: ["300000000000004@lid", "Dani"] };
for (const [id, nombre] of Object.values(gente)) initDataDB({ chat, sender: id, senderJid: "", pushName: nombre });
P.nacer(chat, "Villa Porfía");
updateChat(chat, { pueblo: 1 });
const [ana, beto, carla, dani] = Object.values(gente).map(([id]) => id);
const ahora = Date.now();
db.prepare(`INSERT INTO pueblo_eventos (chat, clave, desde, hasta, estado) VALUES (?, 'temporal', ?, ?, 'activo')`).run(chat, ahora - 3600e3, ahora + 86400e3);
P.registrarHecho(chat, "evento", { clave: "temporal", nombre: "Temporal", emoji: "⛈️" });
P.registrarHecho(chat, "empresa_fundada", { usuario: ana, nombre: "Fletes Ana", tipo: "camionero" });
P.registrarHecho(chat, "espia_descubierto", { usuario: beto, emoji: "🦊", denunciante: carla });
P.registrarHecho(chat, "coima", { usuario: dani });
P.registrarHecho(chat, "coima", { usuario: beto });
P.registrarHecho(chat, "apodo", { usuario: dani, apodo: "el Coimero de la Ruta 5" });
P.registrarHecho(chat, "cumplio_encargo", { usuario: carla, titulo: "Un sobre urgente a Rivera", premio: 240 });
moverCoins(chat, dani, 1000, "test_carga");
moverCoins(chat, dani, -640, "casino_ruleta");

const r = await D.publicarDiario(chat, Date.now(), { conIlustracion: process.env.ILUSTRAR === "1" });
fs.writeFileSync(destino, r.imagen);
process.chdir(raiz);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${destino}${r.ilustrada ? " (con la ilustración de Gemini)" : ""}\n\n${r.texto}`);
