import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

export default defineConfig([
  // Carpetas que genera el bot al correr (no tienen código fuente).
  { ignores: ["database/", "tmp/", "botSession*/"] },

  js.configs.recommended,

  {
    languageOptions: {
      globals: {
        ...globals.node,
        // Globales del bot: se definen en globals.js y main.js y el resto del código los usa a secas.
        authFile: "readonly",
        baileys: "readonly",
        botVersion: "readonly",
        client: "readonly",
        db: "readonly",
        deliriusApi: "readonly",
        numberBot: "readonly",
        owners: "readonly",
        plugins: "readonly",
        prefix: "readonly",
        txt: "readonly",
      },
    },
    rules: {
      // Los plugins destructuran muchos argumentos que no siempre usan, y los catch vacíos son a propósito.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Igualdad estricta siempre; "== null" se deja porque cubre null y undefined a la vez.
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Sintaxis actual: const cuando no se reasigna, template strings en vez de concatenar, propiedades abreviadas.
      "prefer-const": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      // Los textos que manda el bot llevan espacios raros (zero-width) a propósito, para el formato de WhatsApp.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
    },
  },
]);
