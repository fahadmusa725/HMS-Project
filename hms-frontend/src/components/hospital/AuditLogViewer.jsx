import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ROLE_LABELS = {
  hospital_admin: 'Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  nurse: 'Nurse',
  lab_technician: 'Lab Tech',
  pharmacist: 'Pharmacist',
  accountant: 'Accountant',
};

const PAGE_LIMIT = 25;

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusDot({ code }) {
  const isOk = code >= 200 && code < 300;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        isOk
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-destructive'}`}
      />
      {code}
    </span>
  );
}

export default function AuditLogViewer() {
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Fetch audit logs (paginated, optionally filtered by userId)
  const {
    data,
    isLoading,
    isError,
    error: queryError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['audit-logs', page, selectedUserId],
    queryFn: async () => {
      const params = { page, limit: PAGE_LIMIT };
      if (selectedUserId) params.userId = selectedUserId;
      const res = await api.get('/api/audit-logs', { params });
      return res.data;
    },
    keepPreviousData: true,
  });

  // Fetch staff list for the filter dropdown
  const { data: staffList = [] } = useQuery({
    queryKey: ['hospital-staff'],
    queryFn: async () => {
      const res = await api.get('/api/hospital-admin/staff');
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // reuse cached staff list for 5 min
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const handleUserFilterChange = (e) => {
    setSelectedUserId(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Audit Logs
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            A read-only record of every mutating action performed across the hospital.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-10 px-3 text-muted-foreground hover:text-foreground self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table Card */}
      <Card className="bg-card border-border shadow-soft overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          {/* Staff filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              id="audit-user-filter"
              value={selectedUserId}
              onChange={handleUserFilterChange}
              className="h-9 rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-w-[200px]"
            >
              <option value="">All staff members</option>
              {staffList.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({ROLE_LABELS[s.role] ?? s.role})
                </option>
              ))}
            </select>
          </div>

          {/* Count badge */}
          <span className="text-xs text-muted-foreground font-medium">
            {isLoading ? '…' : `${total.toLocaleString()} log${total !== 1 ? 's' : ''} total`}
          </span>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-3 border-b border-border/40 animate-pulse"
                >
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-4 w-48 bg-muted/60 rounded flex-1" />
                  <div className="h-4 w-28 bg-muted/50 rounded" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h3 className="text-base font-bold text-foreground">Error loading audit logs</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                {queryError?.response?.data?.message || queryError?.message || 'Could not fetch audit log data.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">No audit entries found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {selectedUserId
                  ? 'No actions logged for the selected staff member.'
                  : 'No mutating actions have been recorded yet.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3.5 px-6">Who</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right whitespace-nowrap">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/40 transition-colors">
                    {/* Who */}
                    <td className="py-4 px-6">
                      {log.user ? (
                        <>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                            {log.user.name}
                          </div>
                          <div className="mt-1">
                            <Badge variant={log.user.role}>
                              {ROLE_LABELS[log.user.role] ?? log.user.role}
                            </Badge>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Deleted user</span>
                      )}
                    </td>

                    {/* What */}
                    <td className="py-4 px-4 max-w-xs">
                      <span className="font-medium text-foreground">{log.action}</span>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate" title={`${log.method} ${log.path}`}>
                        {log.method} {log.path}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      <StatusDot code={log.statusCode} />
                    </td>

                    {/* When */}
                    <td className="py-4 px-6 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination footer */}
        {!isLoading && !isError && total > 0 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/10 gap-4 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Page <span className="font-semibold text-foreground">{page}</span> of{' '}
              <span className="font-semibold text-foreground">{totalPages}</span>
              {' · '}
              Showing{' '}
              <span className="font-semibold text-foreground">
                {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)}
              </span>{' '}
              of <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isRefetching}
                className="h-8 px-2.5"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isRefetching}
                className="h-8 px-2.5"
              >
                <span className="mr-1 hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
