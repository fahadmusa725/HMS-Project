import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, RefreshCw, Download, Loader2 } from 'lucide-react';
import api, { downloadFile } from '@/lib/api';
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

  const [exportType, setExportType] = useState('patients');
  const [exportFormat, setExportFormat] = useState('csv');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (exportType === 'all' && exportFormat === 'csv') {
      toast.error('CSV export only supports one data type at a time. Choose a single type, or switch to JSON to export everything at once.');
      return;
    }
    setIsExporting(true);
    try {
      await downloadFile(
        '/api/hospital-admin/export',
        { type: exportType, format: exportFormat },
        `${exportType}-export.${exportFormat}`
      );
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export data.');
    } finally {
      setIsExporting(false);
    }
  };

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

      {/* Export Data */}
      <div className="bg-card border border-border rounded-xl shadow-soft p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-sm font-bold text-foreground block">Export Hospital Data</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Download your own patients, bills, medicines, or appointments - plain JSON or CSV, no lock-in.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            disabled={isExporting}
            className="h-9 rounded-lg border border-input bg-card px-3 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="patients">Patients</option>
            <option value="bills">Bills</option>
            <option value="medicines">Medicines</option>
            <option value="appointments">Appointments</option>
            <option value="all">Everything</option>
          </select>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            disabled={isExporting}
            className="h-9 rounded-lg border border-input bg-card px-3 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="h-9 px-3 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
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
