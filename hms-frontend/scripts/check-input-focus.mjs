/**
 * Guards the two ways typing used to lose focus in this app:
 *
 * 1. Modal's focus effect must depend on `isOpen` alone. Callers pass an inline arrow for
 *    `onClose`, so any other dependency re-runs the effect (focus restore + re-focus) on every
 *    parent render - i.e. after every keystroke - and the caret lands on the close button.
 *    The handler is read through a ref instead, and focusing in is skipped when focus is
 *    already inside the dialog.
 * 2. No component may be defined inside another component's render. A new function identity
 *    per render remounts its inputs and drops focus (and the caret) mid-word.
 *
 * Run with `npm run check:focus`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const MODAL = resolve(SRC, 'components/ui/modal.jsx');

const failures = [];

// --- 1. modal focus contract ------------------------------------------------------
const modal = readFileSync(MODAL, 'utf8');
const modalLabel = relative(SRC, MODAL).replace(/\\/g, '/');

const effects = [...modal.matchAll(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n {2}\}, \[([^\]]*)\]\);/g)].map(
  ([, body, deps]) => ({ body, deps: deps.trim() })
);
const focusEffects = effects.filter(({ body }) => /document\.activeElement|\.focus\(/.test(body));

if (!focusEffects.some(({ deps }) => deps === 'isOpen')) {
  failures.push(`${modalLabel}: the focus effect must depend on isOpen alone, found [${focusEffects.map((e) => e.deps).join(' | ')}]`);
}
if (focusEffects.some(({ deps }) => deps !== 'isOpen')) {
  failures.push(
    `${modalLabel}: a focus effect depends on props the caller re-creates inline (${focusEffects
      .map((e) => `[${e.deps}]`)
      .join(' | ')}) - it re-runs on every keystroke`
  );
}
if (!/onCloseRef\.current/.test(modal)) {
  failures.push(`${modalLabel}: Escape/close must call onClose through a ref, not straight from the effect`);
}
if (!/contains\(document\.activeElement\)/.test(modal)) {
  failures.push(`${modalLabel}: focusing in must be skipped when focus is already inside the dialog`);
}

// --- 2. no components defined inside a component ----------------------------------
const NESTED_FUNCTION = /^\s{2,}function\s+[A-Z]\w*\s*\(/;
const NESTED_CONST = /^\s{2,}const\s+[A-Z]\w*\s*=\s*(?:\(|memo\(|forwardRef\()/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const jsxFiles = walk(SRC).filter((file) => file.endsWith('.jsx'));
const modalHosts = [];
let inlineOnClose = 0;

for (const file of jsxFiles) {
  const source = readFileSync(file, 'utf8');
  const label = relative(SRC, file).replace(/\\/g, '/');

  source.split('\n').forEach((line, index) => {
    if (NESTED_FUNCTION.test(line) || NESTED_CONST.test(line)) {
      failures.push(`${label}:${index + 1}: component defined inside a component - ${line.trim()}`);
    }
  });

  const uses = (source.match(/<Modal\b/g) || []).length;
  if (uses > 0) modalHosts.push({ label, uses });
  inlineOnClose += (source.match(/onClose=\{\(\)\s*=>/g) || []).length;
}

// --- report -----------------------------------------------------------------------
console.log(`Modal hosts: ${modalHosts.length} files / ${modalHosts.reduce((n, f) => n + f.uses, 0)} dialogs`);
for (const { label, uses } of modalHosts) console.log(`  ${label} (${uses})`);
console.log(`Inline onClose props: ${inlineOnClose} - safe only because the focus effect ignores them.`);

if (failures.length > 0) {
  console.log('\nFAIL');
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}

console.log('\nAll checks pass: the modal focus effect is open-only and no component is defined inline.');
