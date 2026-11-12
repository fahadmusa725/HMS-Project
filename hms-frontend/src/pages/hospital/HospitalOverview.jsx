import React, { Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bed,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Clock,
  Clock3,
  Pill,
  Receipt,
  RefreshCw,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils';

const OverviewCharts = React.lazy(() => import('@/components/hospital/OverviewCharts'));

// Order the OPD queue moves through during the day, and how each stage reads on the dashboard.
const QUEUE_STAGES = [
  { key: 'scheduled', label: 'Not arrived yet' },
  { key: 'checked_in', label: 'Waiting' },
  { key: 'in_consultation', label: 'With doctor' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Cancelled / no-show' },
];

const QUICK_ACTIONS = [
  {
    to: '/dashboard/patients?new=1',
    title: 'Add patient',
    desc: 'Register a new record',
    Icon: UserPlus,
    tile: 'bg-primary-bright/10 text-primary-bright',
  },
  {
    to: '/dashboard/appointments?book=1',
    title: 'Book appointment',
    desc: 'Assign an OPD token',
    Icon: CalendarPlus,
    tile: 'bg-info/10 text-info',
  },
  {
    to: '/dashboard/appointments',
    title: 'Walk-in later',
    desc: 'Add a same-day walk-in',
    Icon: Clock3,
    tile: 'bg-warning/10 text-warning',
  },
  {
    to: '/dashboard/reports',
    title: 'Reports',
    desc: 'Revenue and operations',
    Icon: BarChart3,
    tile: 'bg-success/10 text-success',
  },
];

const ROLE_LABELS = {
  hospital_admin: 'Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  nurse: 'Nurse',
  lab_technician: 'Lab',
  pharmacist: 'Pharmacist',
  accountant: 'Accounts',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function daysUntil(date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function timeAgo(date) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Consecutive "YYYY-MM-DD" keys ending at the hospital's today, so gaps plot as zero. */
function eachDay(endDate, count) {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

function fillSeries(rows = [], endDate, count, mapper) {
  const byDate = new Map(rows.map((row) => [row._id, row]));
  return eachDay(endDate, count).map((date) => {
    const row = byDate.get(date) || {};
    return { date, ...mapper(row) };
  });
}

const sumOf = (rows, key = 'count') => rows.reduce((total, row) => total + (row[key] || 0), 0);

function trendFor(current, previous, caption, positiveTone = 'good') {
  if (current === previous) {
    return current === 0 ? null : { direction: 'flat', tone: 'neutral', label: '0%', caption };
  }
  if (previous === 0) return { direction: 'up', tone: positiveTone, label: 'new', caption };
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    direction: pct > 0 ? 'up' : 'down',
    tone: pct > 0 ? positiveTone : positiveTone === 'good' ? 'bad' : 'neutral',
    label: `${Math.abs(pct)}%`,
    caption,
  };
}

/** One query per endpoint; each section renders on its own as its data arrives. */
function useDashboardData() {
  const get = (url, params) => api.get(url, { params }).then((r) => r.data);
  return {
    summary: useQuery({
      queryKey: ['dashboard-summary', 30],
      queryFn: () => get('/api/reports/dashboard', { days: 30 }),
      staleTime: 60 * 1000,
    }),
    queue: useQuery({
      queryKey: ['opd-queue', 'dashboard-today'],
      queryFn: () => get('/api/appointments/queue'),
      staleTime: 0,
    }),
    lowStock: useQuery({ queryKey: ['dashboard-low-stock'], queryFn: () => get('/api/pharmacy/medicines', { lowStock: 'true' }) }),
    activity: useQuery({ queryKey: ['dashboard-activity'], queryFn: () => get('/api/audit-logs', { limit: 8 }) }),
  };
}

function ChartsFallback() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="h-[292px] animate-pulse rounded-xl border border-border bg-card lg:col-span-2" />
      <div className="h-[292px] animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

function SectionError({ label }) {
  return (
    <div className="p-4 flex items-center gap-2 text-xs text-destructive">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      Couldn&rsquo;t load {label}.
    </div>
  );
}

export default function HospitalOverview() {
  const { user } = useAuthStore();
  const { summary, queue, lowStock, activity } = useDashboardData();

  const queries = [summary, queue, lowStock, activity];
  const isRefreshing = queries.some((q) => q.isRefetching);
  const refreshAll = () => queries.forEach((q) => q.refetch());

  const totals = summary.data?.totals;
  const windowDays = summary.data?.windowDays || 30;

  const series = useMemo(() => {
    const data = summary.data;
    if (!data?.today) return null;
    const count = data.windowDays * 2;
    return {
      patients: fillSeries(data.series?.patients, data.today, count, (row) => ({ count: row.count || 0 })),
      appointments: fillSeries(data.series?.appointments, data.today, count, (row) => ({ count: row.count || 0 })),
      admissions: fillSeries(data.series?.admissions, data.today, count, (row) => ({ count: row.count || 0 })),
      revenue: fillSeries(data.series?.revenue, data.today, count, (row) => ({
        collected: row.collected || 0,
        invoiced: row.invoiced || 0,
      })),
    };
  }, [summary.data]);

  const windowSlice = (rows) => (rows || []).slice(-windowDays);
  const previousSlice = (rows) => (rows || []).slice(-windowDays * 2, -windowDays);

  const newPatients = series ? sumOf(windowSlice(series.patients)) : 0;
  const previousNewPatients = series ? sumOf(previousSlice(series.patients)) : 0;
  const admissionsInWindow = series ? sumOf(windowSlice(series.admissions)) : 0;
  const previousAdmissions = series ? sumOf(previousSlice(series.admissions)) : 0;
  const collectedInWindow = series ? sumOf(windowSlice(series.revenue), 'collected') : 0;
  const previousCollected = series ? sumOf(previousSlice(series.revenue), 'collected') : 0;
  const appointmentsTodaySeries = series ? series.appointments[series.appointments.length - 1]?.count || 0 : 0;
  const appointmentsLastWeek = series ? series.appointments[series.appointments.length - 8]?.count || 0 : 0;

  const queueList = Array.isArray(queue.data) ? queue.data : [];
  const stageCounts = queueList.reduce((acc, appointment) => {
    const key =
      appointment.status === 'cancelled' || appointment.status === 'no_show' ? 'missed' : appointment.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const unpaidFees = queueList.filter((appointment) => appointment.bill && appointment.bill.paymentStatus !== 'paid').length;

  const lowStockList = Array.isArray(lowStock.data) ? lowStock.data : [];
  const logs = activity.data?.logs || [];

  // Subscription notice: only when on trial or suspended.
  const trialDaysLeft =
    user?.hospitalStatus === 'trial' && user?.trialEndDate ? daysUntil(user.trialEndDate) : null;

  const alerts = [];
  if (user?.hospitalStatus === 'suspended') {
    alerts.push({
      key: 'suspended',
      tone: 'destructive',
      text: 'This hospital account is suspended. Contact the platform administrator.',
    });
  } else if (trialDaysLeft !== null) {
    alerts.push({
      key: 'trial',
      tone: trialDaysLeft <= 3 ? 'warning' : 'muted',
      text:
        trialDaysLeft > 0
          ? `Free trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left (ends ${new Date(user.trialEndDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}).`
          : 'Free trial has ended. Contact the platform administrator to activate your account.',
    });
  }
  if (lowStockList.length > 0) {
    const names = lowStockList.slice(0, 3).map((medicine) => `${medicine.name} (${medicine.stock})`).join(', ');
    alerts.push({
      key: 'stock',
      tone: 'warning',
      icon: Pill,
      text: `${lowStockList.length} medicine${lowStockList.length === 1 ? ' is' : 's are'} low on stock: ${names}${lowStockList.length > 3 ? '…' : ''}`,
      link: { to: '/dashboard/pharmacy', label: 'Restock' },
    });
  }
  if (unpaidFees > 0) {
    alerts.push({
      key: 'fees',
      tone: 'muted',
      icon: Receipt,
      text: `${unpaidFees} of today's OPD consultation fee${unpaidFees === 1 ? ' is' : 's are'} still unpaid.`,
      link: { to: '/dashboard/billing', label: 'Billing' },
    });
  }

  const toneClass = {
    warning: 'border-warning/30 bg-warning/10 text-warning',
    destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
    muted: 'border-border bg-muted/40 text-foreground',
  };

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const outstanding = totals?.outstanding || 0;
  const collectedPercent = totals?.invoiced > 0 ? Math.round((totals.collected / totals.invoiced) * 100) : 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            {greeting()}, {user?.name?.split(' ')[0] || 'Admin'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {user?.hospitalName || 'Your hospital'} · {todayLabel}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAll}
          disabled={isRefreshing}
          className="h-9 self-start px-3 text-xs text-muted-foreground hover:text-foreground sm:self-auto"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {QUICK_ACTIONS.map(({ to, title, desc, Icon, tile }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft-sm transition-colors hover:border-primary-bright/40 hover:bg-primary-bright/[0.04]"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tile}`}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">
                {title}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered patients"
          value={(totals?.patients ?? 0).toLocaleString()}
          icon={Users}
          tone="bright"
          loading={summary.isLoading}
          sub={`${newPatients} new in ${windowDays} days`}
          trend={trendFor(newPatients, previousNewPatients, `vs prev ${windowDays}d`)}
          data={series ? windowSlice(series.patients).map((row) => row.count) : []}
        />
        <StatCard
          label="Appointments today"
          value={(totals?.appointmentsToday ?? 0).toLocaleString()}
          icon={Calendar}
          tone="info"
          loading={summary.isLoading}
          sub={queue.isLoading ? 'Queue loading' : `${stageCounts.completed || 0} completed of ${queueList.length} in queue`}
          trend={trendFor(appointmentsTodaySeries, appointmentsLastWeek, 'vs same day last week')}
          data={series ? series.appointments.slice(-14).map((row) => row.count) : []}
        />
        <StatCard
          label="Bed occupancy"
          value={`${totals?.bedOccupancyPercent ?? 0}%`}
          icon={Bed}
          tone="primary"
          loading={summary.isLoading}
          sub={`${totals?.occupiedBeds ?? 0}/${totals?.totalBeds ?? 0} beds · ${totals?.admissions ?? 0} admitted`}
          trend={trendFor(admissionsInWindow, previousAdmissions, `admissions vs prev ${windowDays}d`)}
          data={series ? windowSlice(series.admissions).map((row) => row.count) : []}
        />
        <StatCard
          label="Outstanding balance"
          value={formatCurrency(outstanding)}
          icon={Wallet}
          tone={outstanding > 0 ? 'warning' : 'success'}
          loading={summary.isLoading}
          sub={`${collectedPercent}% collected · ${formatCurrency(totals?.collected ?? 0)} total`}
          trend={trendFor(collectedInWindow, previousCollected, `collections vs prev ${windowDays}d`)}
          data={series ? windowSlice(series.revenue).map((row) => row.collected) : []}
        />
      </div>

      <Suspense fallback={<ChartsFallback />}>
        <OverviewCharts
          patients={series?.patients || []}
          appointments={series?.appointments || []}
          departments={summary.data?.departments || []}
          loading={summary.isLoading}
        />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-soft-sm">
            <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
              <div>
                <h3 className="text-sm font-bold text-foreground">OPD queue</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Today&rsquo;s flow across the front desk</p>
              </div>
              <Link
                to="/dashboard/appointments"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
              >
                Open queue <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {queue.isError ? (
              <SectionError label="today's queue" />
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-5">
                {QUEUE_STAGES.map((stage) => (
                  <div key={stage.key} className="bg-card px-4 py-3 sm:px-5">
                    <div
                      className={`text-xl font-extrabold tabular-nums ${
                        stage.key === 'in_consultation' && stageCounts[stage.key] ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {queue.isLoading ? '—' : stageCounts[stage.key] || 0}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{stage.label}</div>
                  </div>
                ))}
              </div>
            )}
            {!queue.isLoading && !queue.isError && queueList.length === 0 && (
              <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
                <Calendar className="h-4 w-4 text-primary-bright" />
                No OPD appointments booked for today yet.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-soft-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Needs attention</h3>
              {alerts.length > 0 && (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                  {alerts.length} open
                </span>
              )}
            </div>
            {lowStock.isLoading ? (
              <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
            ) : alerts.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success/10 px-3 py-2.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                All clear. No low-stock medicines or unpaid fees for today.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map(({ key, tone, text, link, icon: Icon = AlertCircle }) => (
                  <div
                    key={key}
                    className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-medium ${toneClass[tone]}`}
                  >
                    <span className="flex items-start gap-2">
                      <Icon className="mt-px h-4 w-4 shrink-0" />
                      {text}
                    </span>
                    {link && (
                      <Link to={link.to} className="shrink-0 font-semibold underline-offset-4 hover:underline">
                        {link.label}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft-sm">
          <div className="flex items-center justify-between px-4 pt-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Recent activity</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest staff actions</p>
            </div>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>

          {activity.isLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse space-y-1.5">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-2.5 w-1/3 rounded bg-muted/60" />
                </div>
              ))}
            </div>
          ) : activity.isError ? (
            <SectionError label="recent activity" />
          ) : logs.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No activity yet"
              description="Staff actions will appear here as soon as the first patient or bill is created."
              className="m-4 border-0 bg-transparent py-6"
            />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {logs.map((log) => (
                <li key={log.id} className="px-4 py-2.5">
                  <div className="text-xs text-foreground">
                    <span className="font-semibold">{log.user?.name || 'Someone'}</span>{' '}
                    <span className="text-muted-foreground">
                      {log.action.charAt(0).toLowerCase() + log.action.slice(1)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo(log.createdAt)}
                    {log.user?.role && (
                      <Badge variant={log.user.role} className="ml-1 px-1.5 py-0 text-[10px]">
                        {ROLE_LABELS[log.user.role] || log.user.role}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/dashboard/audit-logs"
            className="mt-auto flex items-center justify-between border-t border-border px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-muted/40"
          >
            View full audit log <ArrowRight className="h-3 w-3" />
          </Link>
        </section>
      </div>
    </div>
  );
}
