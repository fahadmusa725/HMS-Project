import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Building2, CalendarRange } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

/**
 * Imported through React.lazy from HospitalOverview, so recharts stays in a dynamic
 * chunk that only downloads when the overview charts scroll into the first paint.
 */
const CHART_TOOLTIP = {
  backgroundColor: 'hsl(var(--popover))',
  borderColor: 'hsl(var(--border))',
  borderRadius: '0.75rem',
  fontSize: '12px',
  color: 'hsl(var(--popover-foreground))',
};

const DONUT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
];

function dayLabel(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fullDayLabel(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default function OverviewCharts({ patients = [], appointments = [], departments = [], loading = false }) {
  const [range, setRange] = useState(30);

  const visitsByDate = useMemo(
    () => new Map(appointments.map((row) => [row.date, row.count])),
    [appointments]
  );

  const chartData = useMemo(
    () =>
      patients.slice(-range).map((row) => ({
        date: row.date,
        patients: row.count,
        visits: visitsByDate.get(row.date) || 0,
      })),
    [patients, visitsByDate, range]
  );

  const donutData = useMemo(() => {
    const top = departments.slice(0, 5);
    const other = departments.slice(5).reduce((sum, row) => sum + row.count, 0);
    return other > 0 ? [...top, { name: 'Other', count: other }] : top;
  }, [departments]);

  const visitTotal = donutData.reduce((sum, row) => sum + row.count, 0);
  const hasChartActivity = chartData.some((row) => row.patients > 0 || row.visits > 0);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[292px] animate-pulse rounded-xl border border-border bg-card lg:col-span-2" />
        <div className="h-[292px] animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-4 shadow-soft-sm sm:p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">Patient overview</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">New registrations against OPD visits per day</p>
          </div>
          <div className="flex items-center rounded-lg border border-border bg-muted/60 p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  range === option.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-bright" aria-hidden="true" />
            New patients
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-chart-2" aria-hidden="true" />
            OPD visits
          </span>
        </div>

        {hasChartActivity ? (
          <div className="mt-2 h-[210px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="overviewPatients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="overviewVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dayLabel}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  minTickGap={24}
                  tickMargin={8}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  allowDecimals={false}
                  width={34}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  cursor={{ stroke: 'hsl(var(--border-strong))', strokeWidth: 1 }}
                  labelFormatter={fullDayLabel}
                  formatter={(value, name) => [`${value}`, name]}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  name="OPD visits"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={1.75}
                  fill="url(#overviewVisits)"
                />
                <Area
                  type="monotone"
                  dataKey="patients"
                  name="New patients"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2.25}
                  fill="url(#overviewPatients)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={CalendarRange}
            title="No patient activity in this window"
            description="New registrations and OPD visits will plot here as soon as the front desk records them."
            className="mt-3 border-0 bg-transparent py-12"
          />
        )}
      </section>

      <section className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-soft-sm sm:p-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Departments</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Share of OPD visits, last 30 days</p>
        </div>

        {visitTotal > 0 ? (
          <>
            <div className="relative mx-auto mt-2 h-[168px] w-full max-w-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={entry.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value, name) => [`${value} visits`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold leading-none text-foreground tabular-nums">{visitTotal}</span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">visits</span>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {donutData.map((entry, index) => (
                <li key={entry.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-foreground">{entry.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {entry.count} - {Math.round((entry.count / visitTotal) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={Building2}
            title="No departmental visits yet"
            description="Book an appointment and the department split will fill in automatically."
            className="mt-3 flex-1 border-0 bg-transparent"
          />
        )}
      </section>
    </div>
  );
}
