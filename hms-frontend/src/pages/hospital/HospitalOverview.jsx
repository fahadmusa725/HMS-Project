import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Pill,
  Clock,
  Users,
  UserCheck,
  Calendar,
  Bed,
  Receipt,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

// Order the OPD queue moves through during the day, and how each stage reads on the dashboard.
const QUEUE_STAGES = [
  { key: 'scheduled', label: 'Not arrived yet' },
  { key: 'checked_in', label: 'Waiting' },
  { key: 'in_consultation', label: 'With doctor' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Cancelled / no-show' },
];

const QUICK_ACTIONS = [
  { path: '/dashboard/staff', title: 'Staff Directory', desc: 'Invite staff, doctor schedules & fees', Icon: Users },
  { path: '/dashboard/patients', title: 'Patient Records', desc: 'Register patients & search by MRN', Icon: UserCheck },
  { path: '/dashboard/appointments', title: 'Appointments & Queue', desc: 'Book slots & run the OPD queue', Icon: Calendar },
  { path: '/dashboard/wards', title: 'Wards & Beds', desc: 'Admissions, running bills & discharge', Icon: Bed },
  { path: '/dashboard/billing', title: 'Billing', desc: 'Invoices, payments & balances', Icon: Receipt },
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

/** One query per existing endpoint; each section renders on its own as its data arrives. */
function useDashboardData() {
  const get = (url, params) => api.get(url, { params }).then((r) => r.data);
  return {
    overview: useQuery({ queryKey: ['reports-overview'], queryFn: () => get('/api/reports/overview') }),
    financial: useQuery({ queryKey: ['dashboard-financial'], queryFn: () => get('/api/reports/financial') }),
    queue: useQuery({ queryKey: ['opd-queue', 'dashboard-today'], queryFn: () => get('/api/appointments/queue') }),
    admissions: useQuery({ queryKey: ['admissions', 'admitted'], queryFn: () => get('/api/admissions', { status: 'admitted' }) }),
    lowStock: useQuery({ queryKey: ['dashboard-low-stock'], queryFn: () => get('/api/pharmacy/medicines', { lowStock: 'true' }) }),
    activity: useQuery({ queryKey: ['dashboard-activity'], queryFn: () => get('/api/audit-logs', { limit: 8 }) }),
  };
}

function StatSegment({ value, label, sub, loading, emphasis, className = '' }) {
  return (
    <div className={`p-4 sm:p-5 border-border ${className}`}>
      <div
        className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
          emphasis === 'primary' ? 'text-primary' : emphasis === 'destructive' ? 'text-destructive' : 'text-foreground'
        }`}
      >
        {loading ? '—' : value}
      </div>
      <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">{label}</div>
      {sub && !loading && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>}
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
  const { overview, financial, queue, admissions, lowStock, activity } = useDashboardData();

  const isRefreshing = [overview, financial, queue, admissions, lowStock, activity].some((q) => q.isRefetching);
  const refreshAll = () =>
    [overview, financial, queue, admissions, lowStock, activity].forEach((q) => q.refetch());

  // Today's queue grouped into the stages above.
  const queueList = Array.isArray(queue.data) ? queue.data : [];
  const stageCounts = queueList.reduce((acc, a) => {
    const key = a.status === 'cancelled' || a.status === 'no_show' ? 'missed' : a.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const unpaidFees = queueList.filter((a) => a.bill && a.bill.paymentStatus !== 'paid').length;

  const lowStockList = Array.isArray(lowStock.data) ? lowStock.data : [];
  const admittedCount = Array.isArray(admissions.data) ? admissions.data.length : 0;
  const logs = activity.data?.logs || [];

  // Subscription notice: only when on trial or suspended.
  const trialDaysLeft =
    user?.hospitalStatus === 'trial' && user?.trialEndDate
      ? daysUntil(user.trialEndDate)
      : null;

  const alerts = [];
  if (user?.hospitalStatus === 'suspended') {
    alerts.push({ key: 'suspended', tone: 'destructive', text: 'This hospital account is suspended. Contact the platform administrator.' });
  } else if (trialDaysLeft !== null) {
    alerts.push({
      key: 'trial',
      tone: trialDaysLeft <= 3 ? 'warning' : 'muted',
      text:
        trialDaysLeft > 0
          ? `Free trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left (ends ${new Date(user.trialEndDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}).`
          : 'Free trial has ended. Contact the platform administrator to activate your account.',
    });
  }
  if (lowStockList.length > 0) {
    const names = lowStockList.slice(0, 3).map((m) => `${m.name} (${m.stock})`).join(', ');
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
    warning: 'border-warning/30 bg-warning/10 text-warning-foreground',
    destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
    muted: 'border-border bg-muted/40 text-foreground',
  };

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            {greeting()}, {user?.name?.split(' ')[0] || 'Admin'}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {user?.hospitalName || 'Your hospital'} · {todayLabel}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAll}
          disabled={isRefreshing}
          className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Unified stat strip */}
      <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-2 lg:grid-cols-4">
        <StatSegment
          className="border-b lg:border-b-0 border-r"
          loading={overview.isLoading}
          value={(overview.data?.totalPatients ?? 0).toLocaleString()}
          label="Registered patients"
        />
        <StatSegment
          className="border-b lg:border-b-0 lg:border-r"
          loading={overview.isLoading}
          emphasis="primary"
          value={(overview.data?.appointmentsToday ?? 0).toLocaleString()}
          label="Appointments today"
          sub={queue.isLoading ? null : `${stageCounts.completed || 0} completed so far`}
        />
        <StatSegment
          className="border-r"
          loading={admissions.isLoading || overview.isLoading}
          value={admittedCount.toLocaleString()}
          label="Currently admitted"
          sub={`${overview.data?.bedOccupancyPercent ?? 0}% bed occupancy (${overview.data?.occupiedBeds ?? 0}/${overview.data?.totalBeds ?? 0})`}
        />
        <StatSegment
          loading={financial.isLoading}
          emphasis={(financial.data?.totalOutstanding || 0) > 0 ? 'destructive' : undefined}
          value={formatCurrency(financial.data?.totalOutstanding || 0)}
          label="Outstanding balance"
          sub={`${formatCurrency(financial.data?.totalCollected || 0)} collected in total`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today at a glance */}
        <div className="lg:col-span-2 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today at a glance</div>

          <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 pt-4">
              <span className="text-sm font-bold text-foreground">OPD queue</span>
              <Link
                to="/dashboard/appointments"
                className="text-xs font-medium text-primary hover:underline underline-offset-4 flex items-center gap-1"
              >
                Open queue <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {queue.isError ? (
              <SectionError label="today's queue" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 mt-3 border-t border-border">
                {QUEUE_STAGES.map((stage, i) => (
                  <div
                    key={stage.key}
                    className={`px-4 sm:px-5 py-3 border-border ${i < QUEUE_STAGES.length - 1 ? 'sm:border-r' : ''} ${
                      i % 2 === 0 ? 'border-r sm:border-r' : ''
                    } ${i < 4 ? 'border-b sm:border-b-0' : ''}`}
                  >
                    <div
                      className={`text-xl font-extrabold ${
                        stage.key === 'in_consultation' && stageCounts[stage.key] ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {queue.isLoading ? '—' : stageCounts[stage.key] || 0}
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground mt-0.5">{stage.label}</div>
                  </div>
                ))}
              </div>
            )}
            {!queue.isLoading && !queue.isError && queueList.length === 0 && (
              <p className="px-4 sm:px-5 py-3 text-xs text-muted-foreground border-t border-border">
                No OPD appointments booked for today yet.
              </p>
            )}
          </div>

          {/* Alerts */}
          <div className="bg-card border border-border rounded-xl shadow-soft p-4 sm:p-5 space-y-2.5">
            <span className="text-sm font-bold text-foreground">Needs attention</span>
            {lowStock.isLoading ? (
              <div className="h-9 rounded-lg bg-muted/60 animate-pulse" />
            ) : alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                All clear — no low-stock medicines or unpaid fees for today.
              </div>
            ) : (
              alerts.map(({ key, tone, text, link, icon: Icon = AlertCircle }) => (
                <div
                  key={key}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-medium ${toneClass[tone]}`}
                >
                  <span className="flex items-start gap-2">
                    <Icon className="h-4 w-4 shrink-0 mt-px" />
                    {text}
                  </span>
                  {link && (
                    <Link to={link.to} className="shrink-0 font-semibold underline-offset-4 hover:underline">
                      {link.label}
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent activity</div>
          <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden">
            {activity.isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1.5 animate-pulse">
                    <div className="h-3 w-3/4 bg-muted rounded" />
                    <div className="h-2.5 w-1/3 bg-muted/60 rounded" />
                  </div>
                ))}
              </div>
            ) : activity.isError ? (
              <SectionError label="recent activity" />
            ) : logs.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No staff activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {logs.map((log) => (
                  <li key={log.id} className="px-4 py-2.5">
                    <div className="text-xs text-foreground">
                      <span className="font-semibold">{log.user?.name || 'Someone'}</span>{' '}
                      <span className="text-muted-foreground">{log.action.charAt(0).toLowerCase() + log.action.slice(1)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
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
              className="flex items-center justify-between px-4 py-2.5 border-t border-border text-xs font-medium text-primary hover:bg-muted/40 transition-colors"
            >
              View full audit log <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick actions</div>
        <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 overflow-hidden">
          {QUICK_ACTIONS.map(({ path, title, desc, Icon }, i) => (
            <Link
              key={path}
              to={path}
              className={`group p-4 sm:p-5 border-border hover:bg-muted/40 transition-colors ${
                i < QUICK_ACTIONS.length - 1 ? 'border-b lg:border-b-0 lg:border-r' : ''
              } ${i % 2 === 0 && i < QUICK_ACTIONS.length - 1 ? 'sm:border-r' : ''}`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-primary" />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-3 font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
