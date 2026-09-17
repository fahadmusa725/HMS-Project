import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Loader2, RefreshCw, AlertCircle, Stethoscope, UserCheck, Calendar, Activity } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/reports/DateRangePicker';

// Capitalize helper for diagnoses
function formatDiagnosis(str) {
  if (!str) return '—';
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function ClinicalReport() {
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return {
      startDate: d.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
    };
  });

  const {
    data: report,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['reports-clinical', dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const params = {};
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;
      const res = await api.get('/api/reports/clinical', { params });
      return res.data;
    },
  });

  const appointmentsOverTime = report?.appointmentsOverTime || [];
  const appointmentsByStatus = report?.appointmentsByStatus || [];
  const topDoctors = report?.topDoctors || [];
  const topDiagnoses = report?.topDiagnoses || [];
  const newPatientsOverTime = report?.newPatientsOverTime || [];

  return (
    <div className="space-y-6">
      {/* Top Controls: Date Range Picker & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <DateRangePicker onRangeChange={(range) => setDateRange(range)} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs self-end sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
          <span className="text-sm font-medium">Loading clinical analytics...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart 1: Appointments Over Time (Bar Chart) */}
          <Card className="lg:col-span-2 p-5 border-border shadow-soft bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Appointments Volume</h3>
                <p className="text-xs text-muted-foreground">Daily OPD consultations scheduled</p>
              </div>
            </div>

            {appointmentsOverTime.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-xs">
                <AlertCircle className="h-6 w-6 mb-1 opacity-50" />
                No appointment records found for this period
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={appointmentsOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                    <XAxis dataKey="_id" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(val) => [`${val} consultations`, 'Appointments']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Bar dataKey="count" fill="hsl(175, 77%, 26%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Appointments By Status Breakdown List */}
          <Card className="p-5 border-border shadow-soft bg-card space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Status Distribution</h3>
              <p className="text-xs text-muted-foreground">Breakdown of appointments by fulfillment state</p>
            </div>

            {appointmentsByStatus.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No appointment statuses in this period.
              </div>
            ) : (
              <div className="space-y-3">
                {appointmentsByStatus.map((item) => {
                  const statusMap = {
                    scheduled: { label: 'Scheduled', variant: 'info' },
                    completed: { label: 'Completed', variant: 'paid' },
                    cancelled: { label: 'Cancelled', variant: 'unpaid' },
                    no_show: { label: 'No Show', variant: 'partial' },
                    in_progress: { label: 'In Progress', variant: 'pending' },
                  };
                  const cfg = statusMap[item._id] || { label: item._id, variant: 'default' };

                  return (
                    <div
                      key={item._id}
                      className="p-3 bg-muted/30 rounded-xl border border-border flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground capitalize">{cfg.label}</span>
                      </div>
                      <Badge variant={cfg.variant}>
                        {item.count} {item.count === 1 ? 'visit' : 'visits'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
              Total appointments in range: <strong className="text-foreground">{appointmentsByStatus.reduce((acc, s) => acc + s.count, 0)}</strong>
            </div>
          </Card>

          {/* Chart 2: New Patients Over Time (Line / Area Chart) */}
          <Card className="lg:col-span-3 p-5 border-border shadow-soft bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">New Patient Registrations</h3>
                <p className="text-xs text-muted-foreground">Trend of newly registered patients over time</p>
              </div>
            </div>

            {newPatientsOverTime.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-xs">
                <AlertCircle className="h-6 w-6 mb-1 opacity-50" />
                No patient registration data for this period
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={newPatientsOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="patientGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                    <XAxis dataKey="_id" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(val) => [`${val} patients`, 'New Registrations']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(173, 80%, 40%)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#patientGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Top Doctors (Ranked List) */}
          <Card className="p-5 border-border shadow-soft bg-card space-y-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Top Consulting Doctors</h3>
                <p className="text-xs text-muted-foreground">Ranked by completed appointments</p>
              </div>
            </div>

            {topDoctors.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No doctor appointment data recorded in this period.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {topDoctors.map((doc, idx) => (
                  <div key={doc._id || idx} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-xs text-foreground truncate max-w-[150px]">
                        Dr. {doc.name || 'Unknown'}
                      </span>
                    </div>
                    <Badge variant="secondary">
                      {doc.count} {doc.count === 1 ? 'consult' : 'consults'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Top Diagnoses (Ranked List) */}
          <Card className="lg:col-span-2 p-5 border-border shadow-soft bg-card space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Top Diagnoses</h3>
                <p className="text-xs text-muted-foreground">Most common clinical diagnoses recorded</p>
              </div>
            </div>

            {topDiagnoses.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No clinical diagnosis records found for this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topDiagnoses.map((item, idx) => (
                  <div
                    key={item._id || idx}
                    className="p-3 bg-muted/30 rounded-xl border border-border flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="h-5 w-5 rounded bg-muted text-muted-foreground font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-xs text-foreground truncate" title={item._id}>
                        {formatDiagnosis(item._id)}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-primary shrink-0">
                      {item.count} {item.count === 1 ? 'case' : 'cases'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
