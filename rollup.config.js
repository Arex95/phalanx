import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.mjs',
      format: 'esm',
    },
  ],
  external: [
    'vue',
    'axios',
    'jwt-decode',
    '@tanstack/vue-query',
  ],
  plugins: [typescript()],
};
