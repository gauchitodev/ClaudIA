import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import * as fs from "node:fs";
import * as fsPromesas from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";

// What the bot keeps on globalThis, by what it is. A name that isn't on this list doesn't pass the lint, so a new one
// is a decision and not a habit. One module's state goes in a variable of that module: a plugin's has to be here to
// outlive the plugin being reloaded (load-functions.js imports it as a new module), but a lib/ module's doesn't, since
// a reloaded plugin gets the lib/ module it imports as it was. The globals used bare are another such list, below.
export const EN_GLOBALTHIS = {
  // Settings, from config.toml (globals.js).
  configuracion: [
    ...["authFile", "baileys", "botVersion", "canalConfig", "cerebrasApiKey", "discordUrl", "geminiApiKey"],
    ...["groqApiKey", "numberBot", "nvidiaApiKey", "openrouterApiKey", "prefix", "tarjetaGrupo", "tenorApiKey"],
    ...["textoFaggi", "txt"],
  ],
  // The process: the WhatsApp connection, the plugins, how the bot is doing, and its owners (.addowner adds one).
  proceso: [
    ...["avisoArranqueEnviado", "botConectado", "canal", "client", "horaCaida", "horaConexion", "modeloActivo"],
    ...["owners", "plugins", "watchPluginsIniciado"],
  ],
  // A plugin's state, which outlives a reload of the plugin (autoIaCooldown is shared with lib/vistazos.js).
  estadoDePlugins: [
    ...["autoIaAvisoFalla", "autoIaCooldown", "avisoATodos", "avisoUbicacionCooldown", "blGroupListCache", "esperaIa"],
    ...["listaNegraMostrada", "resumenCooldown", "vistazoAdminCooldown"],
  ],
};
const PERMITIDOS = Object.values(EN_GLOBALTHIS).flat().join("|");

// What only lib/identidad.js asks the database: who is who (a number's LID, a LID's number, the owners). The rest of
// the bot asks lib/identidad.js, so the same question gets the same answer everywhere: answered here and there, a
// number that changed hands got a different one in each place. The tests look into the database freely.
export const SOLO_IDENTIDAD = ["lidDeNumero", "jidDeLid", "idsDeOwners", "esOwner", "numerosDeOwners"];
const PREGUNTALE_A_IDENTIDAD = "Who is who is lib/identidad.js's to ask the database (SOLO_IDENTIDAD, eslint.config.js): ask lib/identidad.js instead (lidDe, idsDe, esOwnerDe, idsDeOwners).";

// What lib/identidad.js and lib/parejas.js resolve by guessing: whom a message names, by the group and the database
// alone. The plugins go through the versions that ask WhatsApp (lidMencionadoActual, destinatarioActual and the rest):
// one that guessed, in a group that lists people by number alone, landed on whoever had the number before.
export const ADIVINAN = ["lidMencionado", "lidsMencionados", "deQuienEs", "destinatario", "dosPersonas", "lidDeDigitos"];
const PREGUNTALE_A_WHATSAPP = "A plugin resolves whom a message names with the versions that ask WhatsApp (lidMencionadoActual, lidsMencionadosActual, deQuienEsActual, destinatarioActual, dosPersonasActual): the ones that guess (ADIVINAN, eslint.config.js) land on whoever had the number before.";

// What no-restricted-syntax looks for in the bot's code. A global off the list, and the ways around the import rules
// below, which see static imports only: a file through import() or through a call that isn't a method's (require, or
// createRequire's, kept in a variable or not, called straight or through call, apply or Reflect.apply), with its name
// whole in the path as a string, a template or a sum, and a path written with %-escapes. A method's call, as
// fs.readFileSync, reads the file and is no way into it, and so is a function of fs, path or url imported by name, as
// this code imports them (readFileSync, join): taken for one, it didn't pass. And a row's LID or number read off
// getUser, which is lidDeNumero or jidDeLid by another name: off the call, with a fallback (|| {}, ?? {}) or a ternary,
// destructured from it, or with getUser renamed, which hid the other two. lib/identidad.js does that. Another function
// named getUser counts as the database's (none is), and a path put together elsewhere, or a row kept in a variable, is
// out of the lint's sight.
const GLOBAL_NO_LISTADO = {
  selector: `MemberExpression[object.name=/^(globalThis|global)$/]:not([property.name=/^(${PERMITIDOS})$/])`,
  message: "A global that isn't on EN_GLOBALTHIS (eslint.config.js): one module's state goes in a variable of that module; a global that has to be, goes on the list.",
};
// A file as a path names it: at its end, with the extension or without it, as require takes it.
const RUTA_DE_LA_BASE = "/(^|\\/)database-functions(\\.js)?$/";
const RUTA_DE_LOS_QUE_ADIVINAN = "/(^|\\/)lib\\/(identidad|parejas)(\\.js)?$/";
// The functions of fs, path and url, as this code imports them by name: with the file, they read it or name it.
const LEEN_O_NOMBRAN = [...new Set([fs, fsPromesas, path, url].flatMap((modulo) => Object.keys(modulo)))].filter((nombre) => /^[a-z]\w*$/i.test(nombre) && nombre !== "default").join("|");
// A call that isn't a method's nor one of those, straight or through call or apply (Reflect.apply's among them).
const LLAMADAS = [
  `CallExpression[callee.type!='MemberExpression']:not([callee.name=/^(${LEEN_O_NOMBRAN})$/])`,
  `CallExpression[callee.property.name=/^(call|apply)$/][callee.object.type!='MemberExpression']:not([callee.object.name=/^(${LEEN_O_NOMBRAN})$/])`,
];
// The path among the arguments of those calls, as a string, a template or part of a sum, or so in the array apply
// takes.
const entreLosArgumentos = (llamada, r) => [
  `${llamada} > Literal.arguments[value=${r}]`,
  `${llamada} > BinaryExpression.arguments Literal[value=${r}]`,
  `${llamada} > TemplateLiteral.arguments > TemplateElement[value.raw=${r}]`,
  `${llamada} > ArrayExpression.arguments > Literal[value=${r}]`,
  `${llamada} > ArrayExpression.arguments > BinaryExpression Literal[value=${r}]`,
  `${llamada} > ArrayExpression.arguments > TemplateLiteral > TemplateElement[value.raw=${r}]`,
];
// A file through import() or one of those calls, with what each one tells.
const aEscondidas = (r, porImport, porLlamada) => [
  { selector: `ImportExpression Literal[value=${r}], ImportExpression TemplateElement[value.raw=${r}]`, message: porImport },
  { selector: LLAMADAS.flatMap((llamada) => entreLosArgumentos(llamada, r)).join(", "), message: porLlamada },
];
const BASE_A_ESCONDIDAS = aEscondidas(
  RUTA_DE_LA_BASE,
  "database-functions.js goes in a static import: through import() the lint can't tell whether it asks who is who, which is lib/identidad.js's (SOLO_IDENTIDAD, eslint.config.js).",
  "database-functions.js goes in a static import: through require the lint can't tell whether it asks who is who, which is lib/identidad.js's (SOLO_IDENTIDAD, eslint.config.js).",
);
const ADIVINAN_A_ESCONDIDAS = aEscondidas(
  RUTA_DE_LOS_QUE_ADIVINAN,
  "A plugin takes lib/identidad.js and lib/parejas.js in a static import: through import() the lint can't tell whether it guesses whom a message names (ADIVINAN, eslint.config.js).",
  "A plugin takes lib/identidad.js and lib/parejas.js in a static import: through require the lint can't tell whether it guesses whom a message names (ADIVINAN, eslint.config.js).",
);
const RUTA_CON_ESCAPES = {
  selector: ":matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression) > Literal.source[value=/%[0-9A-Fa-f]{2}/]",
  message: "A path with %-escapes hides which file it is (database%2Dfunctions.js is database-functions.js, and got past the import rules): write it plainly.",
};
// getUser's row, as the code writes it in this field: the call, with a fallback (getUser(x) || {}, ?? {}), or as either
// side of a ternary.
const FILA = (campo) => ["callee", "left.callee", "consequent.callee", "alternate.callee"].map((camino) => `[${campo}.${camino}.name='getUser']`);
const LID_O_JID = "/^(lid|jid)$/";
const IDENTIDAD_DE_UNA_FILA = [
  {
    selector: `MemberExpression:matches(${FILA("object").join(", ")}):matches([property.name=${LID_O_JID}], [property.value=${LID_O_JID}])`,
    message: `getUser(…).lid and .jid are lidDeNumero and jidDeLid by another name. ${PREGUNTALE_A_IDENTIDAD}`,
  },
  {
    selector: `:matches(${[...FILA("init").map((f) => `VariableDeclarator${f}`), ...FILA("right").map((f) => `AssignmentExpression${f}`)].join(", ")}) > ObjectPattern > Property:matches([key.name=${LID_O_JID}], [key.value=${LID_O_JID}])`,
    message: `A lid or a jid destructured from getUser(…) is lidDeNumero or jidDeLid by another name. ${PREGUNTALE_A_IDENTIDAD}`,
  },
  {
    selector: [
      `ImportDeclaration[source.value=${RUTA_DE_LA_BASE}] > ImportSpecifier:matches([imported.name='getUser'], [imported.value='getUser'])[local.name!='getUser']`,
      "ExportSpecifier:matches([local.name='getUser'], [local.value='getUser']):not([exported.name='getUser'])",
      "VariableDeclarator[init.type='Identifier'][init.name='getUser']",
      "AssignmentExpression[right.type='Identifier'][right.name='getUser']",
    ].join(", "),
    message: `getUser goes by its name: renamed (on import, handed on, or kept in another variable), the lint doesn't see a row's lid or jid read off it, which is lidDeNumero or jidDeLid by another name. ${PREGUNTALE_A_IDENTIDAD}`,
  },
];
// The versions that guess aren't handed on, under their name or another: a plugin that took them from another module
// went around the rule that keeps them out of the plugins.
const QUE_ADIVINAN = `/^(${ADIVINAN.join("|")})$/`;
const ADIVINAN_DE_MANO_EN_MANO = {
  selector: `ExportSpecifier:matches([local.name=${QUE_ADIVINAN}], [local.value=${QUE_ADIVINAN}]), ExportAllDeclaration[source.value=${RUTA_DE_LOS_QUE_ADIVINAN}], ExportAllDeclaration[source.value=/^\\.\\/(identidad|parejas)\\.js$/]`,
  message: `The versions that guess whom a message names (ADIVINAN, eslint.config.js) aren't handed on: a plugin could take them from here. ${PREGUNTALE_A_WHATSAPP}`,
};
const DEL_CODIGO = [GLOBAL_NO_LISTADO, ...BASE_A_ESCONDIDAS, ...IDENTIDAD_DE_UNA_FILA, ADIVINAN_DE_MANO_EN_MANO, RUTA_CON_ESCAPES];
const DE_LA_BASE = { regex: "(^|/)database-functions\\.js$", importNames: SOLO_IDENTIDAD, message: PREGUNTALE_A_IDENTIDAD };
const DE_LOS_QUE_ADIVINAN = { regex: "(^|/)lib/(identidad|parejas)\\.js$", importNames: ADIVINAN, message: PREGUNTALE_A_WHATSAPP };

export default defineConfig([
  // Folders the bot generates while running (no source code in them).
  { ignores: ["database/", "tmp/", "botSession*/"] },

  js.configs.recommended,

  {
    languageOptions: {
      globals: {
        ...globals.node,
        // Bot globals: defined in globals.js and main.js, and used bare by the rest of the code.
        authFile: "readonly",
        baileys: "readonly",
        botVersion: "readonly",
        client: "readonly",
        numberBot: "readonly",
        owners: "readonly",
        plugins: "readonly",
        prefix: "readonly",
        txt: "readonly",
      },
    },
    rules: {
      // Plugins destructure many arguments they don't always use, and the empty catches are deliberate.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Always strict equality; "== null" is allowed because it covers null and undefined at once.
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Modern syntax: const when never reassigned, template strings instead of concatenation, shorthand properties.
      "prefer-const": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      // The texts the bot sends carry odd (zero-width) spaces on purpose, for WhatsApp formatting.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
    },
  },

  // The bot's code keeps on globalThis only what EN_GLOBALTHIS lists, and doesn't go around the import rules below;
  // the tests set globals up and look into the database freely. A second no-restricted-syntax for the same files
  // replaces the first, so each set of files gets its whole list: lib/identidad.js asks the database, and the plugins
  // don't guess whom a message names either.
  { ignores: ["test/**", "lib/identidad.js"], rules: { "no-restricted-syntax": ["error", ...DEL_CODIGO] } },
  { files: ["lib/identidad.js"], rules: { "no-restricted-syntax": ["error", GLOBAL_NO_LISTADO, ...BASE_A_ESCONDIDAS, RUTA_CON_ESCAPES] } },
  { files: ["plugins/**"], rules: { "no-restricted-syntax": ["error", ...DEL_CODIGO, ...ADIVINAN_A_ESCONDIDAS] } },

  // Who is who goes to the database only from lib/identidad.js, and the plugins take only the versions that ask
  // WhatsApp, whichever way the import is written: by name, the whole module (import * as), or handed on (export …
  // from). The same rule for the plugins again, with both lists.
  { ignores: ["test/**", "lib/identidad.js"], rules: { "no-restricted-imports": ["error", { patterns: [DE_LA_BASE] }] } },
  { files: ["plugins/**"], rules: { "no-restricted-imports": ["error", { patterns: [DE_LA_BASE, DE_LOS_QUE_ADIVINAN] }] } },

  // The tests look into the database bare (db.prepare…): prepararBase (test/helpers.mjs) publishes it for them. The
  // code imports it from database-functions.js.
  { files: ["test/**"], languageOptions: { globals: { db: "readonly" } } },
]);
