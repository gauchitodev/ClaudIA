import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clienteFalso, ultimoEnviado } from "./helpers.mjs";
import { descargar, bajarYEnviar, textoDescarga, esTikTok, esInstagram, YTDLP, _dep } from "../lib/ytdlp.js";

YTDLP.PAUSA_MS = 1;
_dep.esperar = async () => {};

// a fake yt-dlp: it creates the file it was asked for with -o and answers with the after_move line.
const ytDlpFalso = ({ fallosAntes = 0, ext = "mp4", salida = "", stderrPesado = false } = {}) => {
  let llamadas = 0;
  const fn = async (bin, args) => {
    llamadas++;
    fn.args = args;
    if (stderrPesado) return { stdout: "[download] File is larger than max-filesize (70000000 bytes > 62914560 bytes). Aborting.\n", stderr: "" };
    if (llamadas <= fallosAntes) throw Object.assign(new Error("Command failed"), { stderr: "ERROR: [TikTok] 1: Unable to extract universal data for rehydration" });
    const plantilla = args[args.indexOf("-o") + 1];
    const archivo = plantilla.replace("%(ext)s", ext);
    fs.writeFileSync(archivo, "contenido");
    return { stdout: `[info] bajando\n${salida}tiktok\tUn título\t80\t${archivo}\n`, stderr: "" };
  };
  fn.llamadas = () => llamadas;
  return fn;
};

test("ytdlp: reconoce links de TikTok e Instagram", () => {
  assert.ok(esTikTok("https://www.tiktok.com/@tiktok/video/7681414892942839071"));
  assert.ok(esTikTok("https://vm.tiktok.com/ZMabc123/"));
  assert.ok(!esTikTok("https://tiktok.com"));
  assert.ok(!esTikTok("https://youtube.com/watch?v=x"));
  assert.ok(esInstagram("https://www.instagram.com/reel/C7Cv2zGtqGh/"));
  assert.ok(esInstagram("https://instagram.com/p/C2pNWpEoFmB/?igsh=abc"));
  assert.ok(!esInstagram("https://www.instagram.com/instagram/"));
});

test("ytdlp: descarga, parsea la metadata y reintenta cuando TikTok falla", async () => {
  _dep.ejecutar = ytDlpFalso({ fallosAntes: 2 });
  const r = await descargar("https://www.tiktok.com/@tiktok/video/1");
  assert.equal(_dep.ejecutar.llamadas(), 3);
  assert.deepEqual({ autor: r.autor, titulo: r.titulo, duracion: r.duracion }, { autor: "tiktok", titulo: "Un título", duracion: 80 });
  assert.ok(fs.existsSync(r.archivo));
  fs.unlinkSync(r.archivo);
  // TikTok goes through the mobile API, with the temp file in tmp/ and the size cap
  const args = _dep.ejecutar.args;
  assert.ok(args.includes("--extractor-args") && args.includes(`tiktok:api_hostname=${YTDLP.TIKTOK_API}`));
  assert.ok(args.includes("--max-filesize") && args.includes(`${YTDLP.MAX_MB}M`));
  assert.ok(args.includes("--no-quiet") && args.includes("--no-progress"), "sin --no-quiet no se ve el aviso de max-filesize");
  assert.match(args[args.indexOf("-o") + 1], /^tmp\/dl-\d+-\w+\.%\(ext\)s$/);

  // Instagram doesn't carry TikTok's arguments
  _dep.ejecutar = ytDlpFalso();
  const r2 = await descargar("https://www.instagram.com/reel/abc/");
  fs.unlinkSync(r2.archivo);
  assert.ok(!_dep.ejecutar.args.includes("--extractor-args"));

  // it gives up after the configured attempts
  _dep.ejecutar = ytDlpFalso({ fallosAntes: 99 });
  await assert.rejects(() => descargar("https://www.tiktok.com/@a/video/2"), /Command failed/);
  assert.equal(_dep.ejecutar.llamadas(), YTDLP.INTENTOS);

  // un archivo demasiado pesado no se reintenta
  _dep.ejecutar = ytDlpFalso({ stderrPesado: true });
  await assert.rejects(() => descargar("https://www.tiktok.com/@a/video/3"), /pesa más de/);
  assert.equal(_dep.ejecutar.llamadas(), 1);
});

test("ytdlp: manda video o imagen con el título, limpia el temporal y avisa si falla", async () => {
  const client = clienteFalso();
  const m = { chat: "grupo@g.us", sender: "a@lid", reacciones: [], react(e) { this.reacciones.push(e); } };

  _dep.ejecutar = ytDlpFalso();
  assert.equal(await bajarYEnviar({ client, m, url: "https://www.tiktok.com/@a/video/1", textoExito: "✅ Listo", textoError: "falló" }), true);
  let u = ultimoEnviado();
  assert.ok(u.msg.video, "manda un video");
  assert.equal(u.msg.caption, "✅ Listo\n*Un título*\n👤 tiktok");
  assert.equal(m.reacciones.at(-1), "✅");
  assert.equal(fs.readdirSync("tmp").filter((f) => f.startsWith("dl-")).length, 0, "no deja temporales");

  _dep.ejecutar = ytDlpFalso({ ext: "jpg" });
  await bajarYEnviar({ client, m, url: "https://www.instagram.com/p/x/", textoExito: "✅", textoError: "falló" });
  assert.ok(ultimoEnviado().msg.image, "una foto va como imagen");

  _dep.ejecutar = ytDlpFalso({ fallosAntes: 99 });
  assert.equal(await bajarYEnviar({ client, m, url: "https://www.tiktok.com/@a/video/2", textoExito: "✅", textoError: "❌ no pude" }), false);
  u = ultimoEnviado();
  assert.equal(u.msg.text, "❌ no pude");
  assert.equal(m.reacciones.at(-1), "❌");

  _dep.ejecutar = ytDlpFalso({ stderrPesado: true });
  await bajarYEnviar({ client, m, url: "https://www.tiktok.com/@a/video/3", textoExito: "✅", textoError: "❌ no pude" });
  assert.match(ultimoEnviado().msg.text, /pesa más de 60 MB/);

  assert.equal(textoDescarga("ok", { titulo: "x".repeat(200), autor: "" }), `ok\n*${"x".repeat(119)}…*`);
});

test("ytdlp: se actualiza una vez por día a la hora configurada", async () => {
  const { chequearActualizacionYtDlp, actualizarYtDlp } = await import("../lib/ytdlp.js");
  let corridas = 0;
  // there is no bin/yt-dlp in CI (it's in .gitignore): with no binary nothing is attempted, and the test doesn't depend on it existing
  _dep.existe = () => false;
  assert.equal(await actualizarYtDlp(), null);
  _dep.existe = () => true;
  _dep.ejecutar = async (bin, args) => {
    corridas++;
    assert.deepEqual(args, ["-U"]);
    return { stdout: "yt-dlp is up to date (stable@2026.08.19)\n", stderr: "" };
  };
  const dia = new Date(2026, 8, 7, YTDLP.HORA_ACTUALIZACION, 10);
  assert.equal(await chequearActualizacionYtDlp(new Date(2026, 8, 7, YTDLP.HORA_ACTUALIZACION - 1, 59)), false, "todavía no es la hora");
  assert.equal(await chequearActualizacionYtDlp(dia), true);
  assert.equal(await chequearActualizacionYtDlp(new Date(2026, 8, 7, YTDLP.HORA_ACTUALIZACION, 40)), false, "ya corrió hoy");
  assert.equal(await chequearActualizacionYtDlp(new Date(2026, 8, 8, YTDLP.HORA_ACTUALIZACION, 2)), true, "al otro día vuelve");
  assert.equal(corridas, 2);
});

test("consistencia: dl-youtube le pasa los argumentos a yt-dlp sin shell", () => {
  // With exec, the command line goes through a shell, which reads $(...) and quotes inside the link as syntax. A merge
  // that brings back an old copy of the plugin would bring that back without anything failing.
  const fuente = fs.readFileSync(new URL("../plugins/dl-youtube.js", import.meta.url), "utf8");
  const importa = fuente.match(/import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/);
  assert.ok(importa, "no se encontró el import de child_process: el escaneo no está andando");
  const nombres = importa[1].split(",").map((n) => n.trim()).filter(Boolean);
  assert.deepEqual(nombres, ["execFile"], "dl-youtube tiene que llamar a yt-dlp con execFile y una lista de argumentos");
});
