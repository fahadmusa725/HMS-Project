import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Loader2, RefreshCw, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/reports/DateRangePicker';

// HSL CSS Variable Tokens aligned colors
const CATEGORY_COLORS = {
  OPD: 'hsl(175, 77%, 26%)',      // Primary teal
  IPD: 'hsl(173, 80%, 40%)',      // Secondary teal
  Lab: 'hsl(199, 89%, 48%)',      // Cyan / Blue
  Pharmacy: 'hsl(38, 92%, 50%)',  // Warning amber
  Other: 'hsl(215, 16%, 47%)',    // Muted slate
};

const DEFAULT_CHART_COLORS = [
  'hsl(175, 77%, 26%)',
  'hsl(173, 80%, 40%)',
  'hsl(199, 89%, 48%)',
  'hsl(38, 92%, 50%)',
  'hsl(215, 16%, 47%)',
];

export default function FinancialReport() {
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
    queryKey: ['reports-financial', dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const params = {};
      if (dateRange.startDate) params.startDate = dateRange.startDate;
      if (dateRange.endDate) params.endDate = dateRange.endDate;
      const res = await api.get('/api/reports/financial', { params });
      return res.data;
    },
  });

  const revenueOverTime = report?.revenueOverTime || [];
  const revenueByCategory = report?.revenueByCategory || [];
  const paymentStatusBreakdown = report?.paymentStatusBreakdown || [];

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

      {/* Unified 3-Segment Stat Strip */}
      <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-1 sm:grid-cols-3">
        {/* Total Invoiced */}
        <div className="p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {isLoading ? '—' : formatCurrency(report?.totalInvoiced || 0)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Total invoiced
          </div>
        </div>

        {/* Total Collected */}
        <div className="p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
            {isLoading ? '—' : formatCurrency(report?.totalCollected || 0)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Total collected
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="p-4 sm:p-5">
          <div className="text-2xl sm:text-3xl font-extrabold text-warning-foreground tracking-tight">
            {isLoading ? '—' : formatCurrency(report?.totalOutstanding || 0)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Outstanding balance
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
          <span className="text-sm font-medium">Loading financial metrics...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart: Revenue Over Time (Invoiced vs Collected) */}
          <Card className="lg:col-span-2 p-5 border-border shadow-soft bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Revenue Invoiced vs. Collected</h3>
                <p className="text-xs text-muted-foreground">Daily billing trends over selected date range</p>
              </div>
            </div>

            {revenueOverTime.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-xs">
                <AlertCircle className="h-6 w-6 mb-1 opacity-50" />
                No revenue records found for this period
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="invoicedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(175, 77%, 26%)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(175, 77%, 26%)" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="collectedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                    <XAxis
                      dataKey="_id"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(value, name) => [
                        formatCurrency(value),
                        name === 'invoiced' ? 'Invoiced' : 'Collected',
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(val) => (
                        <span className="text-xs font-semibold text-foreground capitalize">
                          {val === 'invoiced' ? 'Total Invoiced' : 'Total Collected'}
                        </span>
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="invoiced"
                      stroke="hsl(175, 77%, 26%)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#invoicedGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      stroke="hsl(173, 80%, 40%)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#collectedGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Donut Chart: Revenue by Category */}
          <Card className="p-5 border-border shadow-soft bg-card space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Revenue by Category</h3>
              <p className="text-xs text-muted-foreground">Distribution across OPD, IPD, Lab, and Pharmacy</p>
            </div>

            {revenueByCategory.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-muted-foreground text-xs">
                <AlertCircle className="h-6 w-6 mb-1 opacity-50" />
                No category data for this period
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueByCategory}
                      dataKey="total"
                      nameKey="_id"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {revenueByCategory.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CATEGORY_COLORS[entry._id] || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(val) => [formatCurrency(val), 'Revenue']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Category Legend List */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              {revenueByCategory.map((cat, idx) => (
                <div key={cat._id || idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          CATEGORY_COLORS[cat._id] || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length],
                      }}
                    />
                    <span className="font-medium text-foreground">{cat._id || 'Other'}</span>
                  </div>
                  <span className="font-bold text-foreground">{formatCurrency(cat.total)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Payment Status Breakdown */}
          <Card className="lg:col-span-3 p-5 border-border shadow-soft bg-card space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Payment Status Breakdown</h3>
              <p className="text-xs text-muted-foreground">
                Distribution of invoices by paid in full, partial settlement, and unpaid balances
              </p>
            </div>

            {paymentStatusBreakdown.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No invoices recorded in this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {['paid', 'partial', 'unpaid'].map((status) => {
                  const match = paymentStatusBreakdown.find((b) => b._id === status) || { count: 0, total: 0 };
                  const statusColors = {
                    paid: {
                      border: 'border-primary/30',
                      bg: 'bg-primary/5',
                      text: 'text-primary',
                      label: 'Paid in Full',
                    },
                    partial: {
                      border: 'border-warning/30',
                      bg: 'bg-warning/10',
                      text: 'text-warning-foreground',
                      label: 'Partial Payments',
                    },
                    unpaid: {
                      border: 'border-destructive/30',
                      bg: 'bg-destructive/10',
                      text: 'text-destructive',
                      label: 'Unpaid Invoices',
                    },
                  };
                  const cfg = statusColors[status];

                  return (
                    <div
                      key={status}
                      className={`p-4 rounded-xl border ${cfg.border} ${cfg.bg} flex flex-col justify-between`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>
                          {cfg.label}
                        </span>
                        <Badge variant={status}>
                          {match.count} {match.count === 1 ? 'bill' : 'bills'}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <div className="text-xl font-extrabold text-foreground">
                          {formatCurrency(match.total)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Cumulative volume
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
