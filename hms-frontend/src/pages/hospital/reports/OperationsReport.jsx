import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  FlaskConical,
  Pill,
  Bed,
  Users,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/reports/DateRangePicker';

export default function OperationsReport() {
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
    queryKey: ['reports-operations', dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const params = {};
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;
      const res = await api.get('/api/reports/operations', { params });
      return res.data;
    },
  });

  const lab = report?.lab || { ordersByStatus: [], topTests: [], totalRevenue: 0 };
  const pharmacy = report?.pharmacy || { revenueOverTime: [], topMedicines: [], lowStockCount: 0 };
  const ipd = report?.ipd || { bedsByWard: [], admissionsOverTime: [], avgLengthOfStayDays: 0 };
  const staff = report?.staff || { countByRole: [] };

  // Group bedsByWard data into per-ward summaries
  const wardSummaryMap = {};
  (ipd.bedsByWard || []).forEach((item) => {
    if (!wardSummaryMap[item.wardName]) {
      wardSummaryMap[item.wardName] = { wardName: item.wardName, occupied: 0, vacant: 0, reserved: 0, total: 0 };
    }
    wardSummaryMap[item.wardName][item.status] = item.count;
    wardSummaryMap[item.wardName].total += item.count;
  });
  const wardSummaries = Object.values(wardSummaryMap);

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
          <span className="text-sm font-medium">Loading operations analytics...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ════════════════ 1. LAB OPERATIONS ════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Diagnostic Lab Operations</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stat Card: Total Lab Revenue */}
              <Card className="p-5 border-border shadow-soft bg-card flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Total Lab Revenue
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-2">
                    {formatCurrency(lab.totalRevenue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Diagnostic order test revenue</p>
                </div>

                <div className="pt-4 border-t border-border mt-4 space-y-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Order Status Breakdown
                  </span>
                  <div className="space-y-1">
                    {(lab.ordersByStatus || []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">No orders in period</span>
                    ) : (
                      lab.ordersByStatus.map((item) => (
                        <div key={item._id} className="flex items-center justify-between text-xs">
                          <span className="capitalize text-foreground font-medium">{item._id}</span>
                          <Badge variant="outline">{item.count} orders</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>

              {/* Top Lab Tests (Ranked List) */}
              <Card className="lg:col-span-2 p-5 border-border shadow-soft bg-card space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Top Ordered Diagnostic Tests</h3>
                  <p className="text-xs text-muted-foreground">Ranked by volume and revenue generated</p>
                </div>

                {(lab.topTests || []).length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No lab tests recorded in this period.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {lab.topTests.map((t, idx) => (
                      <div key={t._id || idx} className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-foreground truncate" title={t._id}>
                            {t._id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="secondary">{t.count} orders</Badge>
                          <span className="text-xs font-bold text-foreground min-w-[70px] text-right">
                            {formatCurrency(t.revenue || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ════════════════ 2. PHARMACY OPERATIONS ════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Pharmacy &amp; Stock Operations</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pharmacy Revenue Over Time Line/Area Chart */}
              <Card className="lg:col-span-2 p-5 border-border shadow-soft bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Pharmacy Sales Trend</h3>
                    <p className="text-xs text-muted-foreground">Daily dispensing counter revenue</p>
                  </div>
                </div>

                {(pharmacy.revenueOverTime || []).length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-xs">
                    <AlertCircle className="h-6 w-6 mb-1 opacity-50" />
                    No pharmacy sale records found for this period
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={pharmacy.revenueOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pharmacyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(175, 77%, 26%)" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="hsl(175, 77%, 26%)" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                        <XAxis dataKey="_id" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} tickFormatter={(val) => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '0.75rem',
                            fontSize: '12px',
                            color: 'hsl(var(--foreground))',
                          }}
                          formatter={(val) => [formatCurrency(val), 'Pharmacy Revenue']}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="hsl(175, 77%, 26%)"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#pharmacyGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Top Medicines & Low Stock Stat */}
              <Card className="p-5 border-border shadow-soft bg-card space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                      <span className="text-xs font-bold text-foreground">Low Stock Alert</span>
                    </div>
                    <span className="text-lg font-extrabold text-warning-foreground">
                      {pharmacy.lowStockCount || 0} items
                    </span>
                  </div>

                  <div className="pt-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Top Dispensed Medicines
                    </h3>
                    {(pharmacy.topMedicines || []).length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">
                        No medicines dispensed in this period.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {pharmacy.topMedicines.map((m, idx) => (
                          <div key={m._id || idx} className="py-1.5 flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground truncate max-w-[140px]" title={m._id}>
                              {m._id}
                            </span>
                            <Badge variant="secondary">{m.quantity} units</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* ════════════════ 3. IPD OPERATIONS ════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bed className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Inpatient Department (IPD) &amp; Wards</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stat: Average Length of Stay */}
              <Card className="p-5 border-border shadow-soft bg-card flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Average Length of Stay (ALOS)
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mt-2">
                    {ipd.avgLengthOfStayDays || 0} <span className="text-base font-normal text-muted-foreground">days</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Average stay duration for discharged patients</p>
                </div>

                {/* Ward Occupancy Overview */}
                <div className="pt-4 border-t border-border mt-4 space-y-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                    Ward Occupancy Overview
                  </span>
                  {wardSummaries.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No ward bed data</span>
                  ) : (
                    <div className="space-y-2">
                      {wardSummaries.map((w) => (
                        <div key={w.wardName} className="p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                          <div className="flex items-center justify-between font-bold text-foreground">
                            <span>{w.wardName}</span>
                            <span>{w.occupied} / {w.total} occupied</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground font-medium">
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-primary" />
                              {w.vacant || 0} vacant
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                              {w.occupied || 0} occupied
                            </span>
                            {w.reserved > 0 && (
                              <span className="flex items-center gap-1 text-warning-foreground">
                                <span className="h-2 w-2 rounded-full bg-warning" />
                                {w.reserved} reserved
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Admissions Over Time Bar Chart */}
              <Card className="lg:col-span-2 p-5 border-border shadow-soft bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">IPD Admissions Volume</h3>
                    <p className="text-xs text-muted-foreground">Daily patient inpatient admissions</p>
                  </div>
                </div>

                {(ipd.admissionsOverTime || []).length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-xs">
                    <AlertCircle className="h-6 w-6 mb-1 opacity-50" />
                    No admission records for this period
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ipd.admissionsOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                          formatter={(val) => [`${val} patients`, 'Admissions']}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Bar dataKey="count" fill="hsl(173, 80%, 40%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ════════════════ 4. STAFF OPERATIONS ════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Staff &amp; Workforce Headcount</h2>
            </div>

            <Card className="p-5 border-border shadow-soft bg-card space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">Staff Distribution by Role</h3>
                <p className="text-xs text-muted-foreground">Active personnel configured across departments</p>
              </div>

              {(staff.countByRole || []).length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No staff members configured.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {staff.countByRole.map((item) => {
                    const roleNames = {
                      hospital_admin: 'Hospital Admin',
                      doctor: 'Doctor',
                      receptionist: 'Receptionist',
                      nurse: 'Nurse',
                      lab_technician: 'Lab Tech',
                      pharmacist: 'Pharmacist',
                      accountant: 'Accountant',
                    };

                    return (
                      <div
                        key={item._id}
                        className="p-3.5 rounded-xl border border-border bg-muted/30 flex flex-col justify-between"
                      >
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {roleNames[item._id] || item._id}
                        </span>
                        <div className="text-2xl font-extrabold text-foreground mt-2">
                          {item.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
