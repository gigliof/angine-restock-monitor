import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".wwebjs_auth/**",
      ".wwebjs_cache/**",
      "monitor.log",
      "monitor.log.*",
      "state.json",
      ".states.json",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-control-regex": "off",
      // Opinionated ESLint 10 defaults that conflict with this codebase's
      // intentional patterns; leaving the existing code as-is.
      "preserve-caught-error": "off",
      "no-useless-assignment": "off",
    },
  },
  // Puppeteer page.evaluate() callbacks execute in the browser context,
  // so they need the browser globals (document, window, ...).
  {
    files: ["lib/cart.js", "tests/cart.test.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
];
