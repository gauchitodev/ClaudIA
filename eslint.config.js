import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

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
        db: "readonly",
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
]);
