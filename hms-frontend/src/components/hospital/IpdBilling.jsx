import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Receipt, Wallet, Plus, Loader2, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils';

/**
 * Flattens the backend's running-bill breakdown (room / lab / pharmacy) into
 * the same { description, category, amount } line shape a saved Bill uses,
 * so the running bill and the final discharge bill render identically.
 */
function linesFromRunning(running) {
  const lines = [];
  if (running.room) {
    lines.push({
      description: `Bed charges (${running.room.days} day${running.room.days !== 1 ? 's' : ''} × ${formatCurrency(running.room.dailyRate)})`,
      category: 'IPD',
      amount: running.room.amount,
    });
  }
  (running.labCharges || []).forEach((c) =>
    c.tests.forEach((t) => lines.push({ description: `Lab: ${t.testName}`, category: 'Lab', amount: t.price }))
  );
  (running.pharmacyCharges || []).forEach((c) =>
    c.items.forEach((i) =>
      lines.push({ description: `Medicine: ${i.medicineName} × ${i.quantity}`, category: 'Pharmacy', amount: i.subtotal })
    )
  );
  return lines;
}

function BillLines({ lines }) {
  if (lines.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground text-center">No charges yet.</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <th className="py-2 px-4">Item</th>
          <th className="py-2 px-2">Category</th>
          <th className="py-2 px-4 text-right">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="py-2 px-4 text-foreground">{l.description}</td>
            <td className="py-2 px-2 text-muted-foreground">{l.category}</td>
            <td className="py-2 px-4 text-right font-medium text-foreground">{formatCurrency(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsRow({ label, value, emphasis, tone }) {
  const toneClass = tone === 'destructive' ? 'text-destructive' : tone === 'primary' ? 'text-primary' : 'text-foreground';
  return (
    <div className={`flex items-center justify-between ${emphasis ? 'text-sm font-bold' : 'text-xs'}`}>
      <span className={emphasis ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={`${toneClass} ${emphasis ? '' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}

/** Grand total / advance / balance-or-refund summary shared by running and final bills. */
function BillTotals({ grandTotal, advancePaid, amountPaid }) {
  const balance = grandTotal - advancePaid;
  return (
    <div className="p-4 space-y-1.5 border-t border-border bg-muted/20">
      <TotalsRow label="Grand total" value={formatCurrency(grandTotal)} emphasis />
      <TotalsRow label="Advance paid" value={`− ${formatCurrency(advancePaid)}`} />
      {amountPaid !== undefined && amountPaid !== advancePaid && (
        <TotalsRow label="Applied to this bill" value={formatCurrency(amountPaid)} />
      )}
      {balance >= 0 ? (
        <TotalsRow label="Balance due" value={formatCurrency(balance)} emphasis tone={balance > 0 ? 'destructive' : 'primary'} />
      ) : (
        <TotalsRow label="Refund due to patient" value={formatCurrency(-balance)} emphasis tone="primary" />
      )}
    </div>
  );
}

function AdvancePaymentModal({ admission, onClose }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/admissions/${admission._id}/advance-payment`, { amount: Number(amount), method });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['running-bill', admission._id] });
      queryClient.invalidateQueries({ queryKey: ['admission', admission._id] });
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
      toast.success(`Advance of ${formatCurrency(amount)} recorded.`, {
        description: `Total advance so far: ${formatCurrency(data.advancePaid)}`,
      });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record advance payment.'),
  });

  return (
    <Modal
      isOpen
      onClose={() => !mutation.isPending && onClose()}
      title="Add Advance Payment"
      description={`Deposit against ${admission.patientId?.name || 'this patient'}'s admission — netted off the final bill at discharge.`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">Amount (PKR) *</label>
            <Input
              type="number"
              min="1"
              placeholder="e.g. 20000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={mutation.isPending}
              className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="insurance">Insurance</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !(Number(amount) > 0)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Record Advance'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Live bill for an admission. While admitted it's recomputed on every fetch
 * (bed days × ward rate + unbilled lab/pharmacy during the stay); once
 * discharged it shows the saved final bill.
 */
export function RunningBillCard({ admission, canAddAdvance }) {
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['running-bill', admission._id],
    queryFn: async () => {
      const res = await api.get(`/api/admissions/${admission._id}/running-bill`);
      return res.data;
    },
    refetchInterval: admission.status === 'admitted' ? 60 * 1000 : false,
    staleTime: 0,
  });

  // Fresh admission detail - carries the advance payment history.
  const { data: detail } = useQuery({
    queryKey: ['admission', admission._id],
    queryFn: async () => {
      const res = await api.get(`/api/admissions/${admission._id}`);
      return res.data;
    },
  });

  const isDischarged = data?.admission?.status === 'discharged';
  const lines = !data ? [] : isDischarged ? data.finalBill?.items || [] : linesFromRunning(data);
  const grandTotal = !data ? 0 : isDischarged ? data.finalBill?.totalAmount || 0 : data.totals.grandTotal;
  const advances = detail?.advancePayments || [];

  return (
    <Card className="border-border shadow-soft overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border bg-muted/20 flex items-center gap-2">
        <Receipt className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">{isDischarged ? 'Final Bill' : 'Running Bill'}</h3>
        {data && (
          <span className="text-xs text-muted-foreground">
            · {data.daysAdmitted} day{data.daysAdmitted !== 1 ? 's' : ''}
            {!isDischarged && data.room?.dailyRate === 0 && ' · ward daily rate not set'}
          </span>
        )}
        {isDischarged && data.finalBill && <Badge variant={data.finalBill.paymentStatus} className="ml-1">{data.finalBill.paymentStatus}</Badge>}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            title="Refresh"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
          {canAddAdvance && !isDischarged && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAdvanceOpen(true)}
              className="h-8 text-xs font-semibold text-primary hover:bg-primary/10 hover:border-primary/40"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Advance Payment
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-2 animate-pulse">
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted/70 rounded" />
        </div>
      ) : isError ? (
        <div className="p-6 flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error?.response?.data?.message || 'Could not load the bill.'}
        </div>
      ) : (
        <>
          <BillLines lines={lines} />
          <BillTotals
            grandTotal={grandTotal}
            advancePaid={data.advancePaid}
            amountPaid={isDischarged ? data.finalBill?.amountPaid : undefined}
          />
        </>
      )}

      {advances.length > 0 && (
        <div className="p-4 border-t border-border space-y-1.5">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Advance Payments
          </h4>
          {advances.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {new Date(p.receivedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · '}
                <span className="capitalize">{p.method}</span>
              </span>
              <span className="font-semibold text-foreground">{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {isAdvanceOpen && <AdvancePaymentModal admission={admission} onClose={() => setIsAdvanceOpen(false)} />}
    </Card>
  );
}

/** Shown right after discharge: the itemized final bill that was just raised. */
export function FinalBillModal({ result, onClose }) {
  const { admission, bill, refundDue, summary } = result;
  const lines = bill ? bill.items : linesFromRunning(summary);
  const grandTotal = bill ? bill.totalAmount : 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Discharge Complete — Final Bill"
      description={`${admission.patientId?.name || 'Patient'} · ${admission.wardId?.name || ''}, Bed ${admission.bedId?.bedNumber || '—'} · ${summary.daysAdmitted} day${summary.daysAdmitted !== 1 ? 's' : ''}`}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border overflow-hidden max-h-[45vh] overflow-y-auto">
          <BillLines lines={lines} />
          <BillTotals grandTotal={grandTotal} advancePaid={summary.advancePaid} amountPaid={bill?.amountPaid} />
        </div>

        {refundDue > 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            The advance exceeded the bill. Refund {formatCurrency(refundDue)} to the patient.
          </div>
        ) : bill && bill.paymentStatus !== 'paid' ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {formatCurrency(bill.totalAmount - bill.amountPaid)} is still outstanding — collect it from Billing &amp; Invoices.
          </div>
        ) : null}

        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={onClose} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
