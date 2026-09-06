/**
 * Typechecks every TypeScript example in docs/ against the built types.
 *
 * Exists because six pages shipped an example using a `keys` shape that does
 * not compile: markdown passes a VitePress build no matter what the code says.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const DOCS = 'docs';
const OUT = '.docs-typecheck';

function walk(dir) {
    return readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        if (e === '.vitepress' || e === 'node_modules') return [];
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
    });
}

/** ```ts / ```typescript blocks, with their starting line. */
function blocks(file) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const found = [];
    let open = null;
    lines.forEach((line, i) => {
        if (open === null) {
            if (/^```(ts|typescript)\s*$/.test(line.trim())) open = { start: i + 2, body: [] };
        } else if (line.trim() === '```') {
            found.push({ ...open, code: open.body.join('\n') });
            open = null;
        } else {
            open.body.push(line);
        }
    });
    return found;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// A page is a narrative: block three uses what block one defined. Compiling
// each block alone reports "Cannot find name" for every one of those, and a
// real type error hides in that noise. One file per page, blocks in order.
//
// The prelude declares what the docs legitimately reference without defining:
// the reader's own router, toast and i18n. Without it every example that shows
// integration looks broken.
const PRELUDE = `
declare const router: { push: (to: unknown) => void; beforeEach: (g: (to: any) => unknown) => void };
declare const toast: { add: (o: unknown) => void; error: (m: string) => void };
declare const confirm: { require: (o: unknown) => void };
declare const i18n: { t: (k: string) => string; global: { t: (k: string) => string } };
declare const auth: { can: (p: string) => boolean };
declare const queryClient: { invalidateQueries: (o: unknown) => void; refetchQueries: () => void };
declare const useRoute: () => { params: Record<string, string> };
declare const activeBranch: { value?: { uuid: string } };
declare const form: Record<string, string>;
declare const openStream: any;

declare const filters: Record<string, unknown>;
declare const data: Record<string, unknown>;
declare const id: string;
declare const file: File;
declare const from: string, to: string, tenantId: string, userId: string, range: { from: string; to: string };
declare const selected: { value: string[] };
declare const canRead: boolean;
declare const handle: (e: unknown) => void;
declare const url: string;
declare const myFetcher: any;
declare const anotherAxiosInstance: any, anotherInstance: any;
declare const WorkTypeModel: any, User: any, UserDTO: any;
declare function fetchEventSource(url: string, opts: unknown): Promise<void>;
declare function reportToSentry(e: unknown): void;
declare function showFieldErrors(i: unknown): void;
declare function fieldsFromValidationIssues(e: unknown): unknown;
declare function useAuth(): { can: (p: string) => boolean };
declare function useQueryClient(): typeof queryClient;
declare function watch(s: unknown, cb: (v: any) => void): void;
declare function onUnmounted(cb: () => void): void;
declare function computed<T>(f: () => T): { value: T };
`;

const cases = [];
for (const file of walk(DOCS)) {
    const bs = blocks(file).filter((b) => !(/^[+-]/m.test(b.code) && /^-/m.test(b.code)));
    if (!bs.length) continue;
    const name = `${relative(DOCS, file).replace(/[/.]/g, '_')}.ts`;
    const parts = [PRELUDE];
    bs.forEach((b) => parts.push(`// @block ${b.start}\n${b.code}`));
    writeFileSync(join(OUT, name), parts.join('\n\n'));
    cases.push({ file, name, blocks: bs });
}

// `import.meta.env` is Vite's, and Vite is not a dependency of this library.
// Declared here rather than pulled in, so the check has no new dependency.
writeFileSync(
    join(OUT, 'env.d.ts'),
    'interface ImportMetaEnv { readonly [key: string]: string }\n' +
        'interface ImportMeta { readonly env: ImportMetaEnv }\n'
);

writeFileSync(
    join(OUT, 'tsconfig.json'),
    JSON.stringify({
        compilerOptions: {
            target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
            strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true,
            baseUrl: '..', paths: { '@arex95/phalanx': ['dist/index.d.ts'] }
        },
        include: ['*.ts', 'env.d.ts']
    }, null, 2)
);

console.log(`Extracted ${cases.length} TypeScript examples from ${new Set(cases.map((c) => c.file)).size} pages`);

function run() {
    try {
        execSync(`npx tsc -p ${OUT}/tsconfig.json`, { stdio: 'pipe' });
        return '';
    } catch (e) {
        return e.stdout?.toString() ?? '';
    }
}

// Two passes. TypeScript stops before semantic analysis when the program has
// syntax errors, so a single fragment that does not parse on its own — an
// options snippet, a list of signatures — blinds the check for every other
// file. Pass one finds those and drops them; pass two is the real check.
const syntaxCodes = /TS1\d{3}/;
const fragments = new Set();
for (const line of run().split('\n')) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+)/);
    if (m && syntaxCodes.test(m[2])) fragments.add(m[1].split('/').pop());
}
for (const name of fragments) {
    rmSync(join(OUT, name), { force: true });
}
console.log(`Skipped ${fragments.size} fragment(s) that do not parse standalone\n`);

const out = run();

if (!out.trim()) {
    console.log('All examples typecheck.');
    process.exit(0);
}

// A diagnostic with no file prefix is a project-level failure — a bad option, a
// missing type package — and it aborts compilation before a single example is
// checked. Reporting "0 errors" on that is the failure mode this script exists
// to prevent, so it is fatal rather than ignored.
const projectErrors = out
    .split('\n')
    .filter((l) => /error TS\d+/.test(l) && !/^.+?\(\d+,\d+\): error/.test(l));
if (projectErrors.length) {
    console.error('The check could not run:\n');
    projectErrors.slice(0, 5).forEach((l) => console.error(`  ${l}`));
    process.exit(2);
}

const byFile = new Map();
for (const line of out.split('\n')) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (!m) continue;
    const c = cases.find((x) => m[1].endsWith(x.name));
    if (!c) continue;
    const src = readFileSync(join(OUT, c.name), 'utf8').split('\n');
    let origin = '?';
    for (let i = Number(m[2]) - 1; i >= 0; i--) {
        const tag = src[i]?.match(/^\/\/ @block (\d+)$/);
        if (tag) { origin = tag[1]; break; }
    }
    const key = `${c.file}:${origin}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(`${m[4]} ${m[5]}`);
}

// Two kinds of diagnostic, and only one is a defect.
//
// A page is a narrative: a later block uses what an earlier one defined, and
// examples legitimately reference things the reader supplies — a `suspend`
// mutation, a `logout` call. Those surface as TS2304 and are not errors in the
// documentation.
//
// A shape that does not match the published types is. `keys: { all, one }`
// shipped in six pages against a `BaseModelKeys` requiring five different
// fields, and no build caught it because markdown does not compile.
const MISMATCH = /^TS(2322|2353|2339|2551|2554|2345|2305|2724|2740|2741|2769)\b/;

// Known blind spot, so nobody reads a green run as more than it is: when an
// example's service is not defined on the page, TypeScript infers `any` and the
// types derived from it — the custom queries and mutations — stop constraining
// anything. A misspelled custom method passes. The same goes for `keys`, whose
// return type carries an index signature by design.

const defects = [];
const context = [];
for (const [where, errors] of byFile) {
    const real = [...new Set(errors)].filter((e) => MISMATCH.test(e));
    (real.length ? defects : context).push([where, real.length ? real : [...new Set(errors)]]);
}

if (defects.length) {
    console.log('Examples that do not match the published API:\n');
    for (const [where, errors] of defects) {
        console.log(`  ${where}`);
        errors.slice(0, 3).forEach((e) => console.log(`      ${e.slice(0, 130)}`));
    }
    console.log('');
}

console.log(
    `${defects.length} example(s) contradict the API` +
        `, ${context.length} reference names defined elsewhere on the page (not checked).`
);
process.exit(defects.length ? 1 : 0);
