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
  // A lib/ module's own state. A variable of the module would do, though lib/tacto.js reads the games' without
  // importing them; each one leaves the list when its module moves it.
  estadoDeLib: [
    ...["avisoJuegosCerrados", "bateriaBajaAvisada", "bateriaLecturaAnterior", "bateriaNoAlcanzaAvisada", "carreras"],
    ...["clarosCache", "colaDescargas", "contextoChat", "contextoChatRecorte", "decisionesVistazo", "duelos"],
    ...["fallosDescarga", "fuentesPorChat", "geminiEnPausa", "horarioGrupoReintento", "ingresosGrupo"],
    ...["manosBlackjack", "mesasRuleta", "partidasMines", "peleas", "rafagasVistazo", "rondasTrivia", "triviaConIa"],
    ...["ultimaRafaga", "ultimoAvisoOwner", "vistazosEnCurso", "vistazosIniciados"],
  ],
};
const PERMITIDOS = Object.values(EN_GLOBALTHIS).flat().join("|");

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
      ],
    },
  },

  // The tests look into the database bare (db.prepare…): prepararBase (test/helpers.mjs) publishes it for them. The
  // code imports it from database-functions.js.
  { files: ["test/**"], languageOptions: { globals: { db: "readonly" } } },
]);
