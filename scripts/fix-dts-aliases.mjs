// Post-build: rewrite TypeScript path aliases (e.g. `@/types/Fetcher`,
// `@config/global/x`) in the emitted `.d.ts` declaration files to relative
// paths. Rollup resolves these aliases when bundling the runtime (`index.mjs`),
// but `@rollup/plugin-typescript` emits per-file declarations that keep the
// alias imports verbatim. Since no `tsconfig`/`paths` is published, consumers
// cannot resolve them — their typechecker errors (or silently degrades the
// types to `any` under `skipLibCheck`). This restores full typings with zero
// extra build dependencies.

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');

// The real list of internal aliases, read from tsconfig.json rather than
// guessed — a blanket "starts with @" match once rewrote `@tanstack/vue-query`
// (a real scoped npm package, added as a peer dependency) into a broken
// relative path, because it also starts with `@`. Scoped external packages
// are exactly as common in this ecosystem as internal aliases; matching on
// the character that happens to start both is not a safe heuristic.
const { compilerOptions } = JSON.parse(readFileSync(join(rootDir, 'tsconfig.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const aliasPrefixes = Object.keys(compilerOptions.paths ?? {}).map((key) => key.replace(/\*$/, ''));

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

// Only real module specifiers: the `from`/`import` that precedes the string is
// part of the match. A bare `/(["'])(@[^"']*)\1/` would also match an alias
// that merely *appears* quoted as a literal string type.
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(@[^"']*)\2/g;

/**
 * Byte ranges covered by `/* … *\/` comments. Anchoring on `from`/`import` is
 * not enough on its own: a JSDoc `@example` block routinely contains a
 * complete, literal `import … from '@scope/pkg'` line as *documentation*.
 * `fetchers/axios.ts` has exactly that, and it produced a false hit the first
 * time this file was checked. Comment text must never be rewritten (it would
 * corrupt the docs a consumer sees in their editor) nor validated as if it
 * were a real dependency.
 */
function blockCommentRanges(content) {
  const ranges = [];
  const re = /\/\*[\s\S]*?\*\//g;
  for (const m of content.matchAll(re)) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

const inRanges = (ranges, offset) => ranges.some(([a, b]) => offset >= a && offset < b);

function isInternalAlias(spec) {
  return aliasPrefixes.some((prefix) => spec.startsWith(prefix));
}

let filesChanged = 0;
let importsRewritten = 0;

for (const file of collectDts(distDir)) {
  const original = readFileSync(file, 'utf8');
  const comments = blockCommentRanges(original);
  const updated = original.replace(SPEC_RE, (match, lead, quote, spec, offset) => {
    if (inRanges(comments, offset)) return match;
    if (!isInternalAlias(spec)) return match;
    importsRewritten++;
    return `${lead}${quote}${toRelative(file, spec)}${quote}`;
  });
  if (updated !== original) {
    writeFileSync(file, updated);
    filesChanged++;
  }
}

// Post-condition: EVERY module specifier in the emitted declarations must
// actually resolve for a consumer.
//
// This script silently degrading its own output is not hypothetical: an
// earlier version matched any `@`-prefixed string and mangled the real
// `@tanstack/vue-query` import into a broken relative path, which downgraded
// every consumer's types to `any` with the build still green.
//
// Deliberately independent of `isInternalAlias` and of `SPEC_RE`'s alias
// notion: a check that reuses the predicate it is verifying shares that
// predicate's blind spots and can never catch a bug inside it. (Learned the
// hard way — the first version of this block did exactly that, and a
// sabotage test of `isInternalAlias` passed straight through it.) Instead it
// asserts the end property, from the two sources of truth a consumer really
// has: the files on disk, and the declared dependencies.
const ANY_SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g;
const declaredDeps = new Set([
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.dependencies ?? {}),
]);

const unresolved = [];
for (const file of collectDts(distDir)) {
  const content = readFileSync(file, 'utf8');
  const comments = blockCommentRanges(content);
  for (const m of content.matchAll(ANY_SPEC_RE)) {
    const spec = m[2];
    if (inRanges(comments, m.index)) continue;
    if (spec.startsWith('.')) {
      // Relative: the target declaration must exist on disk.
      const target = join(dirname(file), spec);
      if (!existsSync(`${target}.d.ts`) && !existsSync(join(target, 'index.d.ts'))) {
        unresolved.push(`${relative(rootDir, file)} → ${spec} (no such declaration)`);
      }
    } else {
      // Bare: must be a declared dependency the consumer will have installed.
      // `pkg/sub/path` counts as the `pkg` (or `@scope/pkg`) it belongs to.
      const parts = spec.split('/');
      const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (!declaredDeps.has(name)) {
        unresolved.push(`${relative(rootDir, file)} → ${spec} (not a declared dependency)`);
      }
    }
  }
}

if (unresolved.length > 0) {
  console.error(
    `[fix-dts-aliases] FAILED: ${unresolved.length} module specifier(s) in the emitted ` +
      `declarations do not resolve. Consumers would silently get \`any\`:\n  ` +
      unresolved.join('\n  ')
  );
  process.exit(1);
}

console.log(
  `[fix-dts-aliases] rewrote ${importsRewritten} alias import(s) across ${filesChanged} file(s); ` +
    `0 unresolved aliases remain.`
);
