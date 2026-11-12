/**
 * Verifies every colour pair the UI actually renders against WCAG 2.1:
 * 4.5:1 for text, 3:1 for UI boundaries, focus rings and chart series.
 *
 * Tokens are read straight out of src/index.css, so this fails if the palette drifts.
 * Run with `npm run check:contrast`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '../src/index.css'), 'utf8');

const TEXT_MIN = 4.5;
const UI_MIN = 3;

function parseTheme(block) {
  const tokens = {};
  for (const match of block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return tokens;
}

function extractBlock(startPattern) {
  const start = CSS.indexOf(startPattern);
  if (start === -1) throw new Error(`Could not find ${startPattern} in index.css`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('\n  }', open);
  return CSS.slice(open, close === -1 ? undefined : close);
}

const THEMES = {
  light: parseTheme(extractBlock(':root {')),
  dark: parseTheme(extractBlock('.dark {')),
};

const hex = (hsl) => hslToRgb(...hsl).map((v) => Math.round(v * 255));

const toHex = (rgb) =>
  `#${rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance([r, g, b]) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

function blend(top, bottom, alpha) {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha));
}

// --- pair specs -----------------------------------------------------------------
const solid = (token) => ({ token });
/** A colour drawn at `alpha` over another token - e.g. `bg-warning/12` on a card. */
const tinted = (token, alpha, over) => ({ token, alpha, over });
/** A foreground colour drawn at `alpha` over whatever surface it lands on. */
const faded = (token, alpha) => ({ token, alpha, fade: true });

function resolveSpec(spec, tokens, surface) {
  const base = tokens[spec.token];
  if (!base) throw new Error(`Unknown token --${spec.token}`);
  if (spec.alpha === undefined) return hex(base);
  const under = spec.fade ? surface : hex(tokens[spec.over]);
  return blend(hex(base), under, spec.alpha);
}

function check(theme, { fg, bg }) {
  const tokens = THEMES[theme];
  const bgRgb = resolveSpec(bg, tokens, null);
  const fgRgb = resolveSpec(fg, tokens, bgRgb);
  return contrast(fgRgb, bgRgb);
}

// Inputs paint `bg-background/50` on top of a card.
const INPUT_SURFACE = tinted('background', 0.5, 'card');

const PAIRS = [
  // Body text
  { label: 'body text on canvas', fg: solid('foreground'), bg: solid('background'), min: TEXT_MIN },
  { label: 'body text on card', fg: solid('foreground'), bg: solid('card'), min: TEXT_MIN },
  { label: 'body text on muted', fg: solid('foreground'), bg: solid('muted'), min: TEXT_MIN },
  { label: 'body text on accent', fg: solid('foreground'), bg: solid('accent'), min: TEXT_MIN },
  { label: 'body text on popover', fg: solid('popover-foreground'), bg: solid('popover'), min: TEXT_MIN },
  { label: 'form label (foreground/80) on card', fg: faded('foreground', 0.8), bg: solid('card'), min: TEXT_MIN },

  // Secondary text
  { label: 'muted text on canvas', fg: solid('muted-foreground'), bg: solid('background'), min: TEXT_MIN },
  { label: 'muted text on card', fg: solid('muted-foreground'), bg: solid('card'), min: TEXT_MIN },
  { label: 'muted text on muted', fg: solid('muted-foreground'), bg: solid('muted'), min: TEXT_MIN },
  { label: 'muted text on accent', fg: solid('muted-foreground'), bg: solid('accent'), min: TEXT_MIN },
  { label: 'toast description on popover', fg: solid('muted-foreground'), bg: solid('popover'), min: TEXT_MIN },

  // Primary
  { label: 'primary ink on canvas', fg: solid('primary'), bg: solid('background'), min: TEXT_MIN },
  { label: 'primary ink on card', fg: solid('primary'), bg: solid('card'), min: TEXT_MIN },
  { label: 'primary ink on accent', fg: solid('primary'), bg: solid('accent'), min: TEXT_MIN },
  { label: 'primary ink on primary/10 badge', fg: solid('primary'), bg: tinted('primary', 0.1, 'card'), min: TEXT_MIN },
  { label: 'primary label on primary fill', fg: solid('primary-foreground'), bg: solid('primary'), min: TEXT_MIN },
  { label: 'primary label on primary hover (90%)', fg: solid('primary-foreground'), bg: tinted('primary', 0.9, 'background'), min: TEXT_MIN },
  { label: 'secondary label on secondary fill', fg: solid('secondary-foreground'), bg: solid('secondary'), min: TEXT_MIN },
  { label: 'accent text on accent fill', fg: solid('accent-foreground'), bg: solid('accent'), min: TEXT_MIN },

  // Destructive
  { label: 'danger ink on canvas', fg: solid('destructive'), bg: solid('background'), min: TEXT_MIN },
  { label: 'danger ink on card', fg: solid('destructive'), bg: solid('card'), min: TEXT_MIN },
  { label: 'danger ink on danger/10 badge', fg: solid('destructive'), bg: tinted('destructive', 0.1, 'card'), min: TEXT_MIN },
  { label: 'danger label on danger fill', fg: solid('destructive-foreground'), bg: solid('destructive'), min: TEXT_MIN },

  // Warning
  { label: 'warning ink on canvas', fg: solid('warning'), bg: solid('background'), min: TEXT_MIN },
  { label: 'warning ink on card', fg: solid('warning'), bg: solid('card'), min: TEXT_MIN },
  { label: 'warning ink on warning/12 badge', fg: solid('warning'), bg: tinted('warning', 0.12, 'card'), min: TEXT_MIN },
  { label: 'warning ink on warning/15 chip', fg: solid('warning'), bg: tinted('warning', 0.15, 'card'), min: TEXT_MIN },
  { label: 'warning ink on muted', fg: solid('warning'), bg: solid('muted'), min: TEXT_MIN },
  { label: 'warning label on warning fill', fg: solid('warning-foreground'), bg: solid('warning'), min: TEXT_MIN },

  // Success
  { label: 'success ink on canvas', fg: solid('success'), bg: solid('background'), min: TEXT_MIN },
  { label: 'success ink on card', fg: solid('success'), bg: solid('card'), min: TEXT_MIN },
  { label: 'success ink on success/12 badge', fg: solid('success'), bg: tinted('success', 0.12, 'card'), min: TEXT_MIN },
  { label: 'success label on success fill', fg: solid('success-foreground'), bg: solid('success'), min: TEXT_MIN },

  // Info
  { label: 'info ink on canvas', fg: solid('info'), bg: solid('background'), min: TEXT_MIN },
  { label: 'info ink on card', fg: solid('info'), bg: solid('card'), min: TEXT_MIN },
  { label: 'info ink on info/12 badge', fg: solid('info'), bg: tinted('info', 0.12, 'card'), min: TEXT_MIN },
  { label: 'info label on info fill', fg: solid('info-foreground'), bg: solid('info'), min: TEXT_MIN },

  // Controls and focus
  { label: 'input border on card', fg: solid('border-strong'), bg: solid('card'), min: UI_MIN },
  { label: 'input border on canvas', fg: solid('border-strong'), bg: solid('background'), min: UI_MIN },
  { label: 'input border on input surface', fg: solid('border-strong'), bg: INPUT_SURFACE, min: UI_MIN },
  { label: 'focus ring on canvas', fg: solid('ring'), bg: solid('background'), min: UI_MIN },
  { label: 'focus ring on card', fg: solid('ring'), bg: solid('card'), min: UI_MIN },
  { label: 'focus ring on input surface', fg: solid('ring'), bg: INPUT_SURFACE, min: UI_MIN },

  // Chart series (1.4.11 non-text contrast)
  { label: 'chart-1 on card', fg: solid('chart-1'), bg: solid('card'), min: UI_MIN },
  { label: 'chart-2 on card', fg: solid('chart-2'), bg: solid('card'), min: UI_MIN },
  { label: 'chart-3 on card', fg: solid('chart-3'), bg: solid('card'), min: UI_MIN },
  { label: 'chart-4 on card', fg: solid('chart-4'), bg: solid('card'), min: UI_MIN },
  { label: 'chart-5 on card', fg: solid('chart-5'), bg: solid('card'), min: UI_MIN },
  { label: 'chart axis labels (muted) on card', fg: solid('muted-foreground'), bg: solid('card'), min: TEXT_MIN },
];

let failures = 0;

for (const theme of Object.keys(THEMES)) {
  console.log(`\n${theme.toUpperCase()}\n${'-'.repeat(96)}`);
  console.log(`${'pair'.padEnd(44)}${'fg'.padEnd(10)}${'bg'.padEnd(10)}${'ratio'.padEnd(9)}result`);
  for (const pair of PAIRS) {
    const ratio = check(theme, pair);
    const ok = ratio >= pair.min;
    if (!ok) failures += 1;
    const fgHex = toHex(resolveSpec(pair.fg, THEMES[theme], hex(THEMES[theme].card)));
    const bgHex = toHex(resolveSpec(pair.bg, THEMES[theme], null));
    console.log(
      `${pair.label.padEnd(44)}${fgHex.padEnd(10)}${bgHex.padEnd(10)}${ratio.toFixed(2).padEnd(9)}${
        ok ? `pass (>= ${pair.min})` : `FAIL (needs ${pair.min})`
      }`
    );
  }
}

console.log(`\n${failures === 0 ? 'All pairs pass.' : `${failures} pair(s) below the required ratio.`}`);
process.exit(failures === 0 ? 0 : 1);
