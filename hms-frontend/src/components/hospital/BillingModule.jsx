import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Receipt,
  Plus,
  Search,
  CreditCard,
  Loader2,
  RefreshCw,
  Trash2,
  User,
  FileText,
  Bed,
} from 'lucide-react';

import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { RunningBillCard } from '@/components/hospital/IpdBilling';
import { formatCurrency } from '@/lib/utils';

// OPD consultation fees are billed automatically at booking, so manual invoices start blank
// (pre-filling a consultation fee here would double-charge the patient).
const EMPTY_LINE_ITEM = { description: '', category: 'Other', amount: 0 };

/**
 * Same query key RunningBillCard itself uses for this admission, so the two rows/cells below
 * share one request (React Query dedupes it), and opening the detail modal for a row is instant
 * since the data it needs is already cached.
 */
function useRunningBillTotal(admissionId) {
  return useQuery({
    queryKey: ['running-bill', admissionId],
    queryFn: async () => {
      const res = await api.get(`/api/admissions/${admissionId}/running-bill`);
      return res.data;
    },
    staleTime: 30 * 1000,
  });
}

function IpdRunningTotalCell({ admissionId }) {
  const { data, isLoading } = useRunningBillTotal(admissionId);
  return (
    <td className="py-3.5 px-4 font-bold text-foreground text-xs">
      {isLoading ? (
        <span className="text-muted-foreground font-normal">…</span>
      ) : (
        formatCurrency(data?.totals?.grandTotal ?? 0)
      )}
    </td>
  );
}

function IpdBalanceCell({ admission }) {
  const { data, isLoading } = useRunningBillTotal(admission._id);
  const balance = isLoading || !data ? null : Math.max(0, (data.totals?.grandTotal ?? 0) - (admission.advancePaid || 0));
  return (
    <td className="py-3.5 px-4 font-bold text-xs">
      {balance === null ? (
        <span className="text-muted-foreground font-normal">…</span>
      ) : balance > 0 ? (
        <span className="text-warning-foreground">{formatCurrency(balance)}</span>
      ) : (
        <span className="text-muted-foreground font-normal">PKR 0</span>
      )}
    </td>
  );
}

export default function BillingModule({ initialPatient = null }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const role = user?.role;
  const canCreateBill = ['accountant', 'hospital_admin', 'receptionist'].includes(role);
  const canRecordPayment = ['accountant', 'hospital_admin'].includes(role);
  // Matches the backend's advance-payment role list exactly (hospital_admin, receptionist, accountant).
  const canAddAdvance = ['hospital_admin', 'receptionist', 'accountant'].includes(role);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(!!initialPatient);
  const [selectedBillForDetails, setSelectedBillForDetails] = useState(null);
  const [paymentBillTarget, setPaymentBillTarget] = useState(null);
  const [selectedIpdAdmission, setSelectedIpdAdmission] = useState(null);

  // Create Bill Form State
  const [billPatientSearch, setBillPatientSearch] = useState('');
  const [billPatient, setBillPatient] = useState(initialPatient);
  const [billItems, setBillItems] = useState([
    EMPTY_LINE_ITEM,
  ]);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(0);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('cash');
  const [initialPaymentReference, setInitialPaymentReference] = useState('');
  const [billSponsors, setBillSponsors] = useState([]);

  // Record Payment Form State
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentSponsorIndex, setPaymentSponsorIndex] = useState('');

  const REFERENCE_REQUIRED_METHODS = ['jazzcash', 'easypaisa', 'bank_transfer'];

  // Query: Bills List
  const {
    data: bills = [],
    isLoading: isBillsLoading,
    refetch: refetchBills,
    isRefetching: isBillsRefetching,
  } = useQuery({
    queryKey: ['billing-invoices', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'all' ? { paymentStatus: statusFilter } : {};
      const res = await api.get('/api/billing', { params });
      return res.data;
    },
  });

  // Query: Currently-admitted patients with charges still accruing (no Bill exists for these yet -
  // same endpoint and query key Wards & Beds uses for its own Active IPD list).
  const {
    data: activeAdmissions = [],
    isLoading: isAdmissionsLoading,
    refetch: refetchAdmissions,
    isRefetching: isAdmissionsRefetching,
  } = useQuery({
    queryKey: ['admissions', 'admitted'],
    queryFn: async () => {
      const res = await api.get('/api/admissions', { params: { status: 'admitted' } });
      return res.data;
    },
  });

  // Query: Patient Search for Create Bill Modal
  const { data: patientSearchResults = { patients: [] } } = useQuery({
    queryKey: ['billing-patient-search', billPatientSearch],
    queryFn: async () => {
      if (!billPatientSearch.trim()) return { patients: [] };
      const res = await api.get('/api/patients', { params: { search: billPatientSearch, limit: 8 } });
      return res.data;
    },
    enabled: isCreateOpen && !billPatient && billPatientSearch.trim().length > 0,
  });

  // Mutation: Create Bill
  const createBillMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/api/billing', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      setIsCreateOpen(false);
      setBillItems([EMPTY_LINE_ITEM]);
      if (!initialPatient) setBillPatient(null);
      setInitialPaymentAmount(0);
      setInitialPaymentReference('');
      setBillSponsors([]);
      toast.success(`Invoice generated successfully. Total: ${formatCurrency(data.totalAmount)}`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to create invoice.');
    },
  });

  // Mutation: Record Payment
  const recordPaymentMutation = useMutation({
    mutationFn: async ({ billId, amount, paymentMethod, referenceNumber, sponsorIndex }) => {
      const res = await api.patch(`/api/billing/${billId}/payment`, {
        amount,
        paymentMethod,
        referenceNumber,
        sponsorIndex: sponsorIndex === '' ? undefined : Number(sponsorIndex),
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      setPaymentBillTarget(null);
      setPaymentReference('');
      setPaymentSponsorIndex('');
      toast.success(`Payment of ${formatCurrency(paymentAmount)} recorded. Status: ${data.paymentStatus.toUpperCase()}`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to record payment.');
    },
  });

  // Computed Financial Stats
  const stats = useMemo(() => {
    const list = Array.isArray(bills) ? bills : [];
    const totalBilled = list.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalCollected = list.reduce((sum, b) => sum + (b.amountPaid || 0), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalCollected);
    const paidCount = list.filter((b) => b.paymentStatus === 'paid').length;
    const unpaidCount = list.filter((b) => b.paymentStatus === 'unpaid').length;
    return { totalBilled, totalCollected, totalOutstanding, paidCount, unpaidCount, totalCount: list.length };
  }, [bills]);

  // Filtered Bills
  const filteredBills = useMemo(() => {
    const list = Array.isArray(bills) ? bills : [];
    return list.filter((bill) => {
      const patientName = bill.patientId?.name?.toLowerCase() || '';
      const patientMrn = bill.patientId?.mrn?.toLowerCase() || '';
      const billId = bill._id?.toLowerCase() || '';
      return (
        !searchQuery ||
        patientName.includes(searchQuery.toLowerCase()) ||
        patientMrn.includes(searchQuery.toLowerCase()) ||
        billId.includes(searchQuery.toLowerCase())
      );
    });
  }, [bills, searchQuery]);

  // Dynamic Line Item actions
  const handleAddLineItem = () => {
    setBillItems((prev) => [...prev, { description: '', category: 'Other', amount: 0 }]);
  };

  const handleUpdateLineItem = (index, field, value) => {
    setBillItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: field === 'amount' ? Number(value) || 0 : value };
      return updated;
    });
  };

  const handleRemoveLineItem = (index) => {
    if (billItems.length <= 1) return;
    setBillItems((prev) => prev.filter((_, i) => i !== index));
  };

  const createBillTotal = useMemo(() => {
    return billItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [billItems]);

  // Sponsor split actions (e.g. corporate panel/TPA covering part of the bill alongside the patient)
  const handleAddSponsor = () => {
    setBillSponsors((prev) => [...prev, { payerType: 'panel', payerName: '', amountOwed: 0, amountPaid: 0 }]);
  };

  const handleUpdateSponsor = (index, field, value) => {
    setBillSponsors((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: field === 'amountOwed' ? Number(value) || 0 : value };
      return updated;
    });
  };

  const handleRemoveSponsor = (index) => {
    setBillSponsors((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Receipt className="h-7 w-7 text-primary" />
            Hospital Billing &amp; Invoices
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate patient invoices, collect payments across departments, and track outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canCreateBill && (
            <Button
              onClick={() => {
                if (!initialPatient) setBillPatient(null);
                setIsCreateOpen(true);
              }}
              className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5 shadow-sm text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Invoice</span>
            </Button>
          )}
        </div>
      </div>

      {/* Unified Stat Strip */}
      <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-2 lg:grid-cols-4">
        <div className="p-4 sm:p-5 border-b lg:border-b-0 border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {isBillsLoading ? '—' : formatCurrency(stats.totalBilled)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Total invoiced revenue
          </div>
        </div>

        <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
            {isBillsLoading ? '—' : formatCurrency(stats.totalCollected)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Total payments collected
          </div>
        </div>

        <div className="p-4 sm:p-5 border-r border-border">
          <div className="text-2xl sm:text-3xl font-extrabold text-warning-foreground tracking-tight">
            {isBillsLoading ? '—' : formatCurrency(stats.totalOutstanding)}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Outstanding balance
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {isBillsLoading ? '—' : `${stats.paidCount} / ${stats.totalCount}`}
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
            Fully paid invoices
          </div>
        </div>
      </div>

      {/* Active IPD Stays - charges accruing for currently-admitted patients that haven't
          become a real Bill yet (that only happens at discharge). Without this, billing staff
          had no way to see a long-staying patient's running balance short of checking Wards & Beds. */}
      <Card className="bg-card border-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-4 bg-muted/20">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Bed className="h-4 w-4 text-primary" />
              Active IPD Stays
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently-admitted patients with charges still accruing — not yet a finalized invoice.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAdmissions()}
            disabled={isAdmissionsRefetching}
            className="h-8 px-2.5 text-muted-foreground hover:text-foreground shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAdmissionsRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="overflow-x-auto">
          {isAdmissionsLoading ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
              <span className="text-xs font-medium">Loading active IPD stays...</span>
            </div>
          ) : activeAdmissions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-muted-foreground">No patients are currently admitted.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                  <th className="py-3 px-6">Patient</th>
                  <th className="py-3 px-4">Ward / Bed</th>
                  <th className="py-3 px-4">Days Admitted</th>
                  <th className="py-3 px-4">Running Total</th>
                  <th className="py-3 px-4">Advance Paid</th>
                  <th className="py-3 px-4">Balance So Far</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeAdmissions.map((adm) => (
                  <tr key={adm._id} className="hover:bg-accent/40 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-foreground text-xs">
                        {adm.patientId?.name || 'Unknown Patient'}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        MRN: {adm.patientId?.mrn || '—'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-foreground">
                      {adm.wardId?.name || '—'}
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Bed {adm.bedId?.bedNumber || '—'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-semibold text-foreground">
                      {adm.daysAdmitted} day{adm.daysAdmitted !== 1 ? 's' : ''}
                    </td>

                    <IpdRunningTotalCell admissionId={adm._id} />

                    <td className="py-3.5 px-4 font-semibold text-primary text-xs">
                      {formatCurrency(adm.advancePaid)}
                    </td>

                    <IpdBalanceCell admission={adm} />

                    <td className="py-3.5 px-4">
                      <Badge variant="in_progress">In Progress</Badge>
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedIpdAdmission(adm)}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Receipt className="h-3.5 w-3.5 mr-1" />
                        View Running Bill
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Bills Table Card */}
      <Card className="bg-card border-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by patient name, MRN, or bill ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-card border-border text-foreground text-xs"
            />
          </div>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { key: 'all', label: 'All Invoices' },
              { key: 'unpaid', label: 'Unpaid' },
              { key: 'partial', label: 'Partial' },
              { key: 'paid', label: 'Paid in Full' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchBills()}
              disabled={isBillsRefetching}
              className="h-8 px-2.5 ml-1 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBillsRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="overflow-x-auto">
          {isBillsLoading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
              <span className="text-sm font-medium">Loading hospital bills...</span>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-bold text-foreground">No invoices found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search criteria or payment filter.'
                  : 'Click "Create New Invoice" to generate a bill for an OPD/IPD/Lab/Pharmacy charge.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-4">Patient</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Amount Paid</th>
                  <th className="py-3.5 px-4">Balance Due</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Method</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredBills.map((bill) => {
                  const balanceDue = Math.max(0, (bill.totalAmount || 0) - (bill.amountPaid || 0));
                  return (
                    <tr key={bill._id} className="hover:bg-accent/40 transition-colors">
                      <td className="py-4 px-6 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(bill.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-semibold text-foreground">
                          {bill.patientId?.name || 'Unknown Patient'}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          MRN: {bill.patientId?.mrn || '—'}
                        </div>
                      </td>

                      <td className="py-4 px-4 font-bold text-foreground text-xs">
                        {formatCurrency(bill.totalAmount)}
                      </td>

                      <td className="py-4 px-4 font-semibold text-primary text-xs">
                        {formatCurrency(bill.amountPaid)}
                      </td>

                      <td className="py-4 px-4 font-bold text-xs">
                        {balanceDue > 0 ? (
                          <span className="text-warning-foreground">{formatCurrency(balanceDue)}</span>
                        ) : (
                          <span className="text-muted-foreground font-normal">PKR 0</span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <Badge variant={bill.paymentStatus}>
                          {bill.paymentStatus === 'paid'
                            ? 'Paid in Full'
                            : bill.paymentStatus === 'partial'
                            ? 'Partial Payment'
                            : 'Unpaid'}
                        </Badge>
                      </td>

                      <td className="py-4 px-4 text-xs capitalize text-muted-foreground">
                        {bill.paymentMethod?.replace('_', ' ') || '—'}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedBillForDetails(bill)}
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Items ({bill.items?.length || 0})
                          </Button>

                          {canRecordPayment && bill.paymentStatus !== 'paid' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setPaymentBillTarget(bill);
                                setPaymentAmount(balanceDue);
                                setPaymentMethod(bill.paymentMethod || 'cash');
                              }}
                              className="h-7 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Record Payment
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* MODAL 1: CREATE BILL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          if (!createBillMutation.isPending) setIsCreateOpen(false);
        }}
        title="Create Patient Invoice"
        description="Add line items for consultations, procedures, lab tests, or pharmacy charges."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createBillMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!billPatient) {
                  toast.error('Please select a patient.');
                  return;
                }
                const invalid = billItems.some((i) => !i.description.trim() || i.amount <= 0);
                if (invalid) {
                  toast.error('Please ensure all line items have descriptions and valid amounts.');
                  return;
                }
                if (
                  initialPaymentAmount > 0 &&
                  REFERENCE_REQUIRED_METHODS.includes(initialPaymentMethod) &&
                  !initialPaymentReference.trim()
                ) {
                  toast.error('A transaction/reference number is required for this payment method.');
                  return;
                }
                createBillMutation.mutate({
                  patientId: billPatient._id,
                  items: billItems,
                  amountPaid: initialPaymentAmount,
                  paymentMethod: initialPaymentAmount > 0 ? initialPaymentMethod : undefined,
                  referenceNumber: initialPaymentAmount > 0 ? initialPaymentReference : undefined,
                  sponsors: billSponsors,
                });
              }}
              disabled={createBillMutation.isPending || !billPatient}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createBillMutation.isPending ? 'Generating...' : `Create Invoice (${formatCurrency(createBillTotal)})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Patient Selection */}
          <div className="space-y-2">
            <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
              Patient *
            </label>
            {billPatient ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <div>
                    <span className="font-bold text-foreground">{billPatient.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">MRN: {billPatient.mrn}</span>
                  </div>
                </div>
                {!initialPatient && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBillPatient(null)}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search patient by Name or MRN..."
                    value={billPatientSearch}
                    onChange={(e) => setBillPatientSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
                {patientSearchResults.patients?.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border shadow-soft">
                    {patientSearchResults.patients.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => {
                          setBillPatient(p);
                          setBillPatientSearch('');
                        }}
                        className="w-full text-left p-2 hover:bg-muted/50 flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold text-foreground">{p.name}</span>
                        <span className="font-mono text-muted-foreground">MRN: {p.mrn}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dynamic Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
                Billable Items ({billItems.length})
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLineItem}
                className="h-7 text-xs font-semibold text-primary border-primary/30"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {billItems.map((item, idx) => (
                <div key={idx} className="p-2.5 bg-muted/30 rounded-xl border border-border flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Item description (e.g. Consultation, CBC)"
                      value={item.description}
                      onChange={(e) => handleUpdateLineItem(idx, 'description', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="w-28">
                    <select
                      value={item.category}
                      onChange={(e) => handleUpdateLineItem(idx, 'category', e.target.value)}
                      className="flex h-8 w-full rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                    >
                      <option value="OPD">OPD</option>
                      <option value="IPD">IPD</option>
                      <option value="Lab">Lab</option>
                      <option value="Pharmacy">Pharmacy</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Amount"
                      value={item.amount}
                      onChange={(e) => handleUpdateLineItem(idx, 'amount', e.target.value)}
                      className="h-8 text-xs font-bold"
                    />
                  </div>

                  {billItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(idx)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between font-bold">
              <span className="text-foreground">Total Bill Amount:</span>
              <span className="text-base text-primary">{formatCurrency(createBillTotal)}</span>
            </div>
          </div>

          {/* Initial Payment options */}
          <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-3">
            <span className="font-bold text-foreground block">Initial Payment (Optional)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground block">Amount Paid Now (PKR)</label>
                <Input
                  type="number"
                  min="0"
                  max={createBillTotal}
                  value={initialPaymentAmount}
                  onChange={(e) => setInitialPaymentAmount(Number(e.target.value) || 0)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground block">Payment Method</label>
                <select
                  value={initialPaymentMethod}
                  onChange={(e) => setInitialPaymentMethod(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Credit/Debit Card</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="insurance">Insurance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {REFERENCE_REQUIRED_METHODS.includes(initialPaymentMethod) && (
                <div className="space-y-1 col-span-2">
                  <label className="text-[11px] font-semibold text-muted-foreground block">
                    Transaction / Reference Number *
                  </label>
                  <Input
                    value={initialPaymentReference}
                    onChange={(e) => setInitialPaymentReference(e.target.value)}
                    placeholder="e.g. TXN12345678"
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sponsor split (e.g. patient + a corporate panel/TPA) */}
          <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground block">Sponsors / Payer Split (Optional)</span>
              <Button type="button" variant="outline" size="sm" onClick={handleAddSponsor} className="h-7 text-[11px]">
                <Plus className="h-3 w-3 mr-1" /> Add Sponsor
              </Button>
            </div>
            {billSponsors.map((sponsor, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                <select
                  value={sponsor.payerType}
                  onChange={(e) => handleUpdateSponsor(idx, 'payerType', e.target.value)}
                  className="flex h-8 rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                >
                  <option value="patient">Patient</option>
                  <option value="panel">Corporate Panel</option>
                  <option value="tpa">TPA / Insurer</option>
                </select>
                <Input
                  value={sponsor.payerName}
                  onChange={(e) => handleUpdateSponsor(idx, 'payerName', e.target.value)}
                  placeholder="Payer name"
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  min="0"
                  value={sponsor.amountOwed}
                  onChange={(e) => handleUpdateSponsor(idx, 'amountOwed', e.target.value)}
                  placeholder="Amount owed"
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSponsor(idx)}
                  className="text-muted-foreground hover:text-destructive p-1 justify-self-start"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

        </div>
      </Modal>

      {/* MODAL 2: RECORD PAYMENT */}
      <Modal
        isOpen={!!paymentBillTarget}
        onClose={() => setPaymentBillTarget(null)}
        title="Record Invoice Payment"
        description={
          paymentBillTarget
            ? `Invoice #${paymentBillTarget._id.slice(-6)} • Patient: ${paymentBillTarget.patientId?.name}`
            : ''
        }
        footer={
          paymentBillTarget && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentBillTarget(null)}
                disabled={recordPaymentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (paymentAmount <= 0) {
                    toast.error('Payment amount must be greater than zero.');
                    return;
                  }
                  if (REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !paymentReference.trim()) {
                    toast.error('A transaction/reference number is required for this payment method.');
                    return;
                  }
                  recordPaymentMutation.mutate({
                    billId: paymentBillTarget._id,
                    amount: paymentAmount,
                    paymentMethod,
                    referenceNumber: paymentReference,
                    sponsorIndex: paymentSponsorIndex,
                  });
                }}
                disabled={recordPaymentMutation.isPending || paymentAmount <= 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {recordPaymentMutation.isPending ? 'Processing...' : `Confirm Payment (${formatCurrency(paymentAmount)})`}
              </Button>
            </>
          )
        }
      >
        {paymentBillTarget && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-xl border border-border text-center">
              <div>
                <span className="text-[10px] text-muted-foreground block font-medium">Total Bill</span>
                <span className="font-bold text-foreground">{formatCurrency(paymentBillTarget.totalAmount)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-medium">Already Paid</span>
                <span className="font-bold text-primary">{formatCurrency(paymentBillTarget.amountPaid)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-medium">Remaining Due</span>
                <span className="font-bold text-warning-foreground">
                  {formatCurrency(Math.max(0, paymentBillTarget.totalAmount - paymentBillTarget.amountPaid))}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
                  Payment Amount to Collect (PKR) *
                </label>
                <Input
                  type="number"
                  min="1"
                  max={paymentBillTarget.totalAmount - paymentBillTarget.amountPaid}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="font-bold text-sm"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Credit / Debit Card</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="insurance">Insurance Claim</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && (
                <div className="space-y-1">
                  <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
                    Transaction / Reference Number *
                  </label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. TXN12345678"
                    className="text-xs"
                  />
                </div>
              )}

              {paymentBillTarget.sponsors?.length > 0 && (
                <div className="space-y-1">
                  <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
                    Apply to Sponsor (Optional)
                  </label>
                  <select
                    value={paymentSponsorIndex}
                    onChange={(e) => setPaymentSponsorIndex(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground"
                  >
                    <option value="">— Not sponsor-specific —</option>
                    {paymentBillTarget.sponsors.map((s, i) => (
                      <option key={i} value={i}>
                        {s.payerType} {s.payerName ? `(${s.payerName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: VIEW BILL ITEMS BREAKDOWN */}
      <Modal
        isOpen={!!selectedBillForDetails}
        onClose={() => setSelectedBillForDetails(null)}
        title="Invoice Itemization"
        description={
          selectedBillForDetails
            ? `Invoice #${selectedBillForDetails._id.slice(-6)} • ${selectedBillForDetails.patientId?.name}`
            : ''
        }
        footer={
          selectedBillForDetails && (
            <div className="w-full flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                Payment Method: <strong className="capitalize text-foreground">{selectedBillForDetails.paymentMethod?.replace('_', ' ') || 'Unspecified'}</strong>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedBillForDetails(null)}>
                Close
              </Button>
            </div>
          )
        }
      >
        {selectedBillForDetails && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-card border border-border rounded-xl space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div>
                  <span className="font-bold text-foreground text-sm">{selectedBillForDetails.patientId?.name}</span>
                  <span className="block text-muted-foreground font-mono">MRN: {selectedBillForDetails.patientId?.mrn}</span>
                </div>
                <Badge variant={selectedBillForDetails.paymentStatus}>
                  {selectedBillForDetails.paymentStatus?.toUpperCase()}
                </Badge>
              </div>

              <div className="space-y-1 divide-y divide-border/40">
                {selectedBillForDetails.items?.map((item, i) => (
                  <div key={i} className="pt-1.5 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-foreground">{item.description}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground uppercase bg-muted/60 px-1.5 py-0.5 rounded">
                        {item.category}
                      </span>
                    </div>
                    <span className="font-bold text-foreground">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border space-y-1">
                <div className="flex items-center justify-between font-bold text-sm">
                  <span>Grand Total:</span>
                  <span>{formatCurrency(selectedBillForDetails.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Amount Paid:</span>
                  <span className="font-semibold text-primary">{formatCurrency(selectedBillForDetails.amountPaid)}</span>
                </div>
                <div className="flex items-center justify-between font-bold">
                  <span>Balance Remaining:</span>
                  <span className="text-warning-foreground">
                    {formatCurrency(Math.max(0, selectedBillForDetails.totalAmount - selectedBillForDetails.amountPaid))}
                  </span>
                </div>
              </div>
            </div>

            {selectedBillForDetails.payments?.length > 0 && (
              <div className="p-3 bg-card border border-border rounded-xl space-y-2">
                <span className="font-bold text-foreground block">Payment History</span>
                <div className="space-y-1 divide-y divide-border/40">
                  {selectedBillForDetails.payments.map((p, i) => (
                    <div key={i} className="pt-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground capitalize">{p.method.replace('_', ' ')}</span>
                        {p.referenceNumber && (
                          <span className="ml-2 text-[10px] text-muted-foreground font-mono">Ref: {p.referenceNumber}</span>
                        )}
                        <span className="block text-[10px] text-muted-foreground">
                          {p.date ? new Date(p.date).toLocaleString() : ''}
                        </span>
                      </div>
                      <span className="font-bold text-foreground">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedBillForDetails.sponsors?.length > 0 && (
              <div className="p-3 bg-card border border-border rounded-xl space-y-2">
                <span className="font-bold text-foreground block">Payer Split</span>
                <div className="space-y-1 divide-y divide-border/40">
                  {selectedBillForDetails.sponsors.map((s, i) => (
                    <div key={i} className="pt-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground capitalize">{s.payerType}</span>
                        {s.payerName && <span className="ml-2 text-[10px] text-muted-foreground">{s.payerName}</span>}
                      </div>
                      <span className="text-muted-foreground">
                        {formatCurrency(s.amountPaid)} / {formatCurrency(s.amountOwed)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

      {/* MODAL 4: ACTIVE IPD RUNNING BILL - reuses the exact same card built for Wards & Beds,
          so there's one running-bill UI in the app, not two. */}
      <Modal
        isOpen={!!selectedIpdAdmission}
        onClose={() => setSelectedIpdAdmission(null)}
        title={selectedIpdAdmission?.patientId?.name || 'Active IPD Stay'}
        description={
          selectedIpdAdmission
            ? `${selectedIpdAdmission.wardId?.name || 'Ward'} · Bed ${selectedIpdAdmission.bedId?.bedNumber || '—'} · MRN: ${selectedIpdAdmission.patientId?.mrn || '—'}`
            : ''
        }
      >
        {selectedIpdAdmission && (
          <RunningBillCard admission={selectedIpdAdmission} canAddAdvance={canAddAdvance} />
        )}
      </Modal>
    </div>
  );
}
