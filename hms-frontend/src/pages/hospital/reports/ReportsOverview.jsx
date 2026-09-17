import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function ReportsOverview() {
  const {
    data: overview,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['reports-overview'],
    queryFn: async () => {
      const res = await api.get('/api/reports/overview');
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      {/* Top action / Refresh bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Hospital-Wide Current Totals
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-8 px-2.5 text-muted-foreground hover:text-foreground text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Unified 4-Segment Stat Strip */}
      <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <div className="p-4 sm:p-5 border-b lg:border-b-0 border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {isLoading ? '—' : formatCurrency(overview?.totalRevenue || 0)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Total hospital revenue
          </div>
        </div>

        {/* Total Patients */}
        <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {isLoading ? '—' : (overview?.totalPatients ?? 0).toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Total registered patients
          </div>
        </div>

        {/* Appointments Today */}
        <div className="p-4 sm:p-5 border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
            {isLoading ? '—' : (overview?.appointmentsToday ?? 0).toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Appointments scheduled today
          </div>
        </div>

        {/* Bed Occupancy Rate */}
        <div className="p-4 sm:p-5">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {isLoading ? (
              '—'
            ) : (
              <span>
                {overview?.bedOccupancyPercent ?? 0}%{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({overview?.occupiedBeds ?? 0}/{overview?.totalBeds ?? 0})
                </span>
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Bed occupancy rate
          </div>
        </div>
      </div>

      {/* Sub-report Quick Links (Simple minimal flat links, no boxed feature cards or icon badges) */}
      <div className="pt-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Detailed Analytics Sections
        </div>
        <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
          {[
            {
              path: '/dashboard/reports/financial',
              title: 'Financial Reports',
              desc: 'Revenue over time, collection vs invoiced amounts, category split, and payment status auditing.',
            },
            {
              path: '/dashboard/reports/clinical',
              title: 'Clinical Reports',
              desc: 'OPD appointment trends, top consulting doctors, frequent diagnoses, and patient registrations.',
            },
            {
              path: '/dashboard/reports/operations',
              title: 'Operations Reports',
              desc: 'Diagnostic lab tests & revenue, pharmacy sales & low-stock alerts, IPD bed occupancy, and staff counts.',
            },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors group"
            >
              <div className="min-w-0 pr-4">
                <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors block">
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {item.desc}
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
