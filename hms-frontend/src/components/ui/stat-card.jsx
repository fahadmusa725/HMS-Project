import React, { useId } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tones only choose the icon-tile ink. Every tone is a token pair that already passes
 * `npm run check:contrast`: bright teal on its 10% tile, status inks on their 10% tints.
 */
const TONES = {
  bright: 'bg-primary-bright/10 text-primary-bright',
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
};

const SPARK_STROKES = {
  bright: 'hsl(var(--primary-bright))',
  primary: 'hsl(var(--primary))',
  info: 'hsl(var(--info))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
};

const TREND_TONES = {
  good: 'bg-success/10 text-success',
  bad: 'bg-destructive/10 text-destructive',
  neutral: 'bg-primary/10 text-primary',
};

/** Tiny inline SVG sparkline - no chart library, so stat cards never pull recharts into a page. */
function Sparkline({ values = [], tone = 'bright' }) {
  const gradientId = `spark-${useId().replace(/:/g, '')}`;
  const nums = values.map((n) => Number(n) || 0);
  const stroke = SPARK_STROKES[tone] || SPARK_STROKES.bright;

  if (nums.length < 2 || nums.every((n) => n === 0)) {
    return (
      <svg viewBox="0 0 88 32" className="h-8 w-[88px] shrink-0" aria-hidden="true">
        <line
          x1="2"
          y1="28"
          x2="86"
          y2="28"
          stroke="hsl(var(--border-strong))"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.45"
        />
      </svg>
    );
  }

  const width = 88;
  const height = 32;
  const pad = 2;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = max - min || 1;
  const points = nums.map((value, index) => {
    const x = pad + (index / (nums.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width - pad},${height} L${pad},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-[88px] shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendPill({ trend }) {
  if (!trend?.direction) return null;
  const Icon = trend.direction === 'down' ? ArrowDownRight : trend.direction === 'flat' ? Minus : ArrowUpRight;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
          TREND_TONES[trend.tone] || TREND_TONES.neutral
        )}
      >
        <Icon className="h-3 w-3" />
        {trend.label}
      </span>
      {trend.caption && <span className="truncate text-muted-foreground">{trend.caption}</span>}
    </span>
  );
}

/**
 * Dense dashboard tile: icon circle, value, trend vs the previous period and a sparkline.
 * `trend` is `{ direction: 'up' | 'down' | 'flat', tone: 'good' | 'bad' | 'neutral', label, caption }`.
 */
export function StatCard({ label, value, icon: Icon, sub, trend, data, tone = 'bright', loading = false, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 shadow-soft-sm', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <div className="mt-1.5 truncate text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
              {value}
            </div>
          )}
        </div>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONES[tone] || TONES.bright)}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          {loading ? (
            <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
          ) : (
            <>
              <TrendPill trend={trend} />
              {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
            </>
          )}
        </div>
        {!loading && <Sparkline values={data} tone={tone} />}
      </div>
    </div>
  );
}
