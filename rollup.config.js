import typescript from '@rollup/plugin-typescript'

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.mjs",
      format: "esm",
    },
  ],
  external: [
    "vue",
    "axios",
    "ofetch",
    "@vueuse/core",
    "jwt-decode",
    "uuid",
    "@tanstack/vue-query",
  ],
  plugins: [typescript()],
};