import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

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

// What no-restricted-syntax looks for in the bot's code. A global off the list, and the ways around the import rule
// below, which sees static imports only: database-functions.js through import() or through a call that isn't a
// method's (require, or createRequire's, kept in a variable or not), with its name whole in the path as a string, a
// template or a sum. A method's call, as fs.readFileSync, reads the file, and is no way into it: taken for one, it
// didn't pass. And a row's LID or number read off getUser, which is lidDeNumero or jidDeLid by another name: off the
// call, destructured from it, or with getUser renamed on import, which hid the other two. lib/identidad.js does that.
// A path put together elsewhere, or a row kept in a variable, is out of the lint's sight.
const GLOBAL_NO_LISTADO = {
  selector: `MemberExpression[object.name=/^(globalThis|global)$/]:not([property.name=/^(${PERMITIDOS})$/])`,
  message: "A global that isn't on EN_GLOBALTHIS (eslint.config.js): one module's state goes in a variable of that module; a global that has to be, goes on the list.",
};
const RUTA_DE_LA_BASE = "/(^|\\/)database-functions\\.js$/";
const LLAMADA = "CallExpression[callee.type!='MemberExpression']";
const BASE_A_ESCONDIDAS = [
  {
    selector: `ImportExpression Literal[value=${RUTA_DE_LA_BASE}], ImportExpression TemplateElement[value.raw=${RUTA_DE_LA_BASE}]`,
    message: "database-functions.js goes in a static import: through import() the lint can't tell whether it asks who is who, which is lib/identidad.js's (SOLO_IDENTIDAD, eslint.config.js).",
  },
  {
    selector: [`${LLAMADA} > Literal.arguments[value=${RUTA_DE_LA_BASE}]`, `${LLAMADA} > BinaryExpression.arguments Literal[value=${RUTA_DE_LA_BASE}]`, `${LLAMADA} > TemplateLiteral.arguments > TemplateElement[value.raw=${RUTA_DE_LA_BASE}]`].join(", "),
    message: "database-functions.js goes in a static import: through require the lint can't tell whether it asks who is who, which is lib/identidad.js's (SOLO_IDENTIDAD, eslint.config.js).",
  },
];
const IDENTIDAD_DE_UNA_FILA = [
  {
    selector: "MemberExpression[object.type='CallExpression'][object.callee.name='getUser']:matches([property.name=/^(lid|jid)$/], [property.value=/^(lid|jid)$/])",
    message: `getUser(…).lid and .jid are lidDeNumero and jidDeLid by another name. ${PREGUNTALE_A_IDENTIDAD}`,
  },
  {
    selector: ":matches(VariableDeclarator[init.callee.name='getUser'], VariableDeclarator[init.left.callee.name='getUser'], AssignmentExpression[right.callee.name='getUser'], AssignmentExpression[right.left.callee.name='getUser']) > ObjectPattern > Property[key.name=/^(lid|jid)$/]",
    message: `A lid or a jid destructured from getUser(…) is lidDeNumero or jidDeLid by another name. ${PREGUNTALE_A_IDENTIDAD}`,
  },
  {
    selector: "ImportSpecifier[imported.name='getUser'][local.name!='getUser']",
    message: `getUser goes by its name: renamed, the lint doesn't see a row's lid or jid read off it, which is lidDeNumero or jidDeLid by another name. ${PREGUNTALE_A_IDENTIDAD}`,
  },
];

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

  // The bot's code keeps on globalThis only what EN_GLOBALTHIS lists, and doesn't go around the import rule below; the
  // tests set globals up and look into the database freely. One list for each set of files: a second
  // no-restricted-syntax for the same files would replace the first.
  {
    ignores: ["test/**", "lib/identidad.js"],
    rules: { "no-restricted-syntax": ["error", GLOBAL_NO_LISTADO, ...BASE_A_ESCONDIDAS, ...IDENTIDAD_DE_UNA_FILA] },
  },
  { files: ["lib/identidad.js"], rules: { "no-restricted-syntax": ["error", GLOBAL_NO_LISTADO, ...BASE_A_ESCONDIDAS] } },

  // Who is who goes to the database only from lib/identidad.js, whichever way the import is written: by name, the whole
  // module (import * as), or handed on (export … from).
  {
    ignores: ["test/**", "lib/identidad.js"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "(^|/)database-functions\\.js$", importNames: SOLO_IDENTIDAD, message: PREGUNTALE_A_IDENTIDAD }] }],
    },
  },

  // The tests look into the database bare (db.prepare…): prepararBase (test/helpers.mjs) publishes it for them. The
  // code imports it from database-functions.js.
  { files: ["test/**"], languageOptions: { globals: { db: "readonly" } } },
]);
