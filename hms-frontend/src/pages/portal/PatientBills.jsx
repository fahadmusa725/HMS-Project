import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Receipt,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  CreditCard,
  Calendar,
  DollarSign,
  Wallet,
  CheckCircle2,
  FileText
} from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PatientBills() {
  const [expandedBillIds, setExpandedBillIds] = useState([]);

  const {
    data: bills = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['patient-bills-mine'],
    queryFn: async () => {
      const res = await api.get('/api/billing/mine');
      return res.data;
    },
  });

  const toggleExpand = (billId) => {
    setExpandedBillIds((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, billId]
    );
  };

  // Financial summary calculations
  const stats = useMemo(() => {
    const list = Array.isArray(bills) ? bills : [];
    const totalBilled = list.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalPaid = list.reduce((sum, b) => sum + (b.amountPaid || 0), 0);
    const outstanding = Math.max(0, totalBilled - totalPaid);
    return { totalBilled, totalPaid, outstanding, count: list.length };
  }, [bills]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Receipt className="h-7 w-7 text-primary" />
            My Invoices &amp; Bills
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review itemized hospital invoices, payment receipts, and balance summaries for your medical services.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Financial Summary Strip */}
      <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Total Billed
          </span>
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mt-1">
            {isLoading ? '—' : formatCurrency(stats.totalBilled)}
          </div>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Across {stats.count} invoices
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Amount Paid
          </span>
          <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-1">
            {isLoading ? '—' : formatCurrency(stats.totalPaid)}
          </div>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Cleared at hospital billing desk
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Outstanding Balance
          </span>
          <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 ${
            stats.outstanding > 0 ? 'text-destructive' : 'text-foreground'
          }`}>
            {isLoading ? '—' : formatCurrency(stats.outstanding)}
          </div>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            {stats.outstanding > 0 ? 'Payable at hospital counter' : 'All accounts settled'}
          </span>
        </div>
      </div>

      {/* Invoices List / Table Card */}
      <Card className="border-border bg-card shadow-soft overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Invoices History
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Click any invoice row to expand its itemized service breakdown
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Total Invoices: <span className="font-bold text-foreground">{bills.length}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-muted/20 animate-pulse space-y-2">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-3 w-60 bg-muted/60 rounded" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-xs text-destructive">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <h3 className="text-sm font-bold text-foreground">Could not load bills</h3>
              <p className="text-muted-foreground mt-1 mb-4">
                {error?.response?.data?.message || 'Server error while fetching your billing records.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : bills.length === 0 ? (
            <div className="py-12 sm:py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <Receipt className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-foreground">No invoices generated yet</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Any bills issued for OPD consultations, laboratory diagnostics, pharmacy medicines, or admissions will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {bills.map((bill) => {
                const isExpanded = expandedBillIds.includes(bill._id);
                const balanceDue = Math.max(0, (bill.totalAmount || 0) - (bill.amountPaid || 0));

                return (
                  <div key={bill._id} className="transition-colors hover:bg-muted/10">
                    {/* Main Invoice Header Row */}
                    <div
                      onClick={() => toggleExpand(bill._id)}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 mt-0.5 sm:mt-0">
                          <Receipt className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-foreground">
                              INV-{bill._id.slice(-6).toUpperCase()}
                            </span>
                            <Badge variant={bill.paymentStatus}>
                              {bill.paymentStatus.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>
                              {new Date(bill.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            {bill.paymentMethod && (
                              <>
                                <span>·</span>
                                <span className="capitalize">{bill.paymentMethod}</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{bill.items?.length || 0} item(s)</span>
                          </div>
                        </div>
                      </div>

                      {/* Amounts & Expand Toggle */}
                      <div className="flex items-center justify-between sm:justify-end gap-5">
                        <div className="text-left sm:text-right">
                          <div className="text-sm sm:text-base font-extrabold text-foreground">
                            {formatCurrency(bill.totalAmount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Paid: <span className="font-medium text-primary">{formatCurrency(bill.amountPaid || 0)}</span>
                            {balanceDue > 0 && (
                              <span className="text-destructive font-medium ml-1">
                                (Due: {formatCurrency(balanceDue)})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="h-8 w-8 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-center text-muted-foreground">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Itemized Breakdown */}
                    {isExpanded && (
                      <div className="px-4 sm:px-6 pb-5 pt-1 bg-muted/20 border-t border-border/50 animate-fade-in">
                        <div className="p-3 sm:p-4 rounded-xl bg-card border border-border/60 space-y-3">
                          <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            Itemized Breakdown
                          </div>

                          <div className="divide-y divide-border/40 text-xs">
                            {bill.items && bill.items.length > 0 ? (
                              bill.items.map((item, idx) => (
                                <div key={idx} className="py-2 flex items-center justify-between gap-2">
                                  <div>
                                    <span className="font-medium text-foreground">{item.description}</span>
                                    {item.category && (
                                      <span className="ml-2 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                        {item.category}
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-semibold text-foreground shrink-0">
                                    {formatCurrency(item.amount)}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="py-2 text-muted-foreground italic">No line items recorded.</div>
                            )}
                          </div>

                          {/* Breakdown Total Footer */}
                          <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-bold">
                            <span className="text-foreground">Total Invoiced:</span>
                            <span className="text-primary">{formatCurrency(bill.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
