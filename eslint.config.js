import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";

export default defineConfig([
  { ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", "**/.vitepress/cache/**"] },
  { files: ["**/*.{js,mjs,cjs,ts,vue}"] },
  { files: ["**/*.{js,mjs,cjs,ts,vue}"], languageOptions: { globals: globals.browser } },
  { files: ["**/*.{js,mjs,cjs,ts,vue}"], plugins: { js }, extends: ["js/recommended"] },
  tseslint.configs.recommended,
  pluginVue.configs["flat/essential"],
  { files: ["**/*.vue"], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  // Build tooling runs in Node, not the browser: `process`, `console` and
  // friends are legitimate there. Without this, linting anything outside
  // `src/` reports `'process' is not defined` — which is why it went
  // unnoticed for so long: the lint command only ever covered `src/`.
  {
    files: ["scripts/**/*.{js,mjs,cjs}", "*.config.{js,mjs,cjs,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
]);
