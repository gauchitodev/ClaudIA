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
    ...["autoIaAvisoFalla", "autoIaCooldown", "avisoATodos", "blGroupListCache", "esperaIa", "listaNegraMostrada"],
    ...["resumenCooldown", "vistazoAdminCooldown"],
  ],
};
const PERMITIDOS = Object.values(EN_GLOBALTHIS).flat().join("|");

// What only lib/identidad.js asks the database: who is who (a number's LID, a LID's number, the owners). The rest of
// the bot asks lib/identidad.js, so the same question gets the same answer everywhere: answered here and there, a
// number that changed hands got a different one in each place. The tests look into the database freely.
export const SOLO_IDENTIDAD = ["lidDeNumero", "jidDeLid", "idsDeOwners", "esOwner", "numerosDeOwners"];
const PREGUNTALE_A_IDENTIDAD = "Who is who is lib/identidad.js's to ask the database (SOLO_IDENTIDAD, eslint.config.js): ask lib/identidad.js instead (lidDe, idsDe, esOwnerDe, idsDeOwners).";

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

  // The bot's code keeps on globalThis only what EN_GLOBALTHIS lists; the tests set globals up and look into them
  // freely.
  {
    ignores: ["test/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `MemberExpression[object.name=/^(globalThis|global)$/]:not([property.name=/^(${PERMITIDOS})$/])`,
          message: "A global that isn't on EN_GLOBALTHIS (eslint.config.js): one module's state goes in a variable of that module; a global that has to be, goes on the list.",
        },
        // Here and not in a block of its own: a second no-restricted-syntax for the same files would replace this one.
        {
          selector: "ImportExpression[source.value=/(^|\\/)database-functions\\.js$/]",
          message: "database-functions.js goes in a static import: through import() the lint can't tell whether it asks who is who, which is lib/identidad.js's (SOLO_IDENTIDAD, eslint.config.js).",
        },
      ],
    },
  },

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
