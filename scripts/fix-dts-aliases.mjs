// Post-build: rewrite TypeScript path aliases (e.g. `@/types/Fetcher`,
// `@config/global/x`) in the emitted `.d.ts` declaration files to relative
// paths. Rollup resolves these aliases when bundling the runtime (`index.mjs`),
// but `@rollup/plugin-typescript` emits per-file declarations that keep the
// alias imports verbatim. Since no `tsconfig`/`paths` is published, consumers
// cannot resolve them — their typechecker errors (or silently degrades the
// types to `any` under `skipLibCheck`). This restores full typings with zero
// extra build dependencies.

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Recursively collect every `.d.ts` file under `dir`. */
function collectDts(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectDts(full));
    } else if (entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Map an alias specifier to its absolute path inside `dist`.
 * Aliases mirror `tsconfig.json` paths, all rooted at `src/*` → `dist/*`:
 *   `@/types/Fetcher`     → dist/types/Fetcher
 *   `@config/global/x`    → dist/config/global/x
 */
function aliasToDistPath(spec) {
  const sub = spec.startsWith('@/') ? spec.slice(2) : spec.slice(1);
  return join(distDir, sub);
}

function toRelative(fromFile, spec) {
  let rel = relative(dirname(fromFile), aliasToDistPath(spec)).replace(/\\/g, '/');
  if (!rel.startsWith('.')) {
    rel = './' + rel;
  }
  return rel;
}

const SPEC_RE = /(["'])(@[^"']*)\1/g;

let filesChanged = 0;
let importsRewritten = 0;

for (const file of collectDts(distDir)) {
  const original = readFileSync(file, 'utf8');
  const updated = original.replace(SPEC_RE, (match, quote, spec) => {
    importsRewritten++;
    return `${quote}${toRelative(file, spec)}${quote}`;
  });
  if (updated !== original) {
    writeFileSync(file, updated);
    filesChanged++;
  }
}

console.log(
  `[fix-dts-aliases] rewrote ${importsRewritten} alias import(s) across ${filesChanged} file(s).`
);
