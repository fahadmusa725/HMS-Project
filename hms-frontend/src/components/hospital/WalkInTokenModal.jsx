import React, { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, UserPlus, Loader2, AlertCircle, Check, Ticket } from 'lucide-react';
import api, { openPdf } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'senior', label: 'Senior' },
  { value: 'emergency', label: 'Emergency' },
];

/**
 * Front-desk walk-in flow: issue a same-day token that is already checked in, with no
 * time slot, even when the doctor has a working schedule (walk-ins never consume a slot).
 * Either an existing patient is picked from the search results, or a minimal record is
 * quick-registered from name + phone (CNIC optional). Billing is identical to a normal
 * booking - the server raises the consultation-fee bill from the doctor's schedule.
 */
export default function WalkInTokenModal({ doctors = [], defaultDoctorId = '', onClose, onIssued }) {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [doctorId, setDoctorId] = useState(defaultDoctorId);
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState('normal');
  const [priorityReason, setPriorityReason] = useState('');
  const [error, setError] = useState(null);

  const searchQuery = search.trim();
  const { data: searchResults, isFetching: searchLoading } = useQuery({
    queryKey: ['walkin-patient-search', searchQuery],
    queryFn: async () => {
      const res = await api.get('/api/patients', { params: { search: searchQuery, limit: 6 } });
      return res.data;
    },
    enabled: searchQuery.length > 1 && !selectedPatient,
  });

  const patients = useMemo(
    () => (Array.isArray(searchResults?.patients) ? searchResults.patients : []),
    [searchResults]
  );

  const needsRegistration = !selectedPatient;
  const canSubmit =
    Boolean(doctorId) &&
    (selectedPatient || (name.trim() && phone.trim())) &&
    (priority === 'normal' || priorityReason.trim());

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        doctorId,
        reason: reason.trim() || undefined,
        priority,
        priorityReason: priority === 'normal' ? undefined : priorityReason.trim(),
      };
      if (selectedPatient) {
        payload.patientId = selectedPatient._id;
      } else {
        payload.name = name.trim();
        payload.phone = phone.trim();
        payload.cnic = cnic.trim() || undefined;
      }
      const res = await api.post('/api/appointments/walk-in', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Walk-in token #${data.tokenNumber} issued`, {
        description: `${data.patientId?.name || 'Patient'} is now checked in and in the queue.`,
        action: {
          label: 'Print slip',
          onClick: () =>
            openPdf(`/api/appointments/${data._id}/slip-pdf`).catch(() =>
              toast.error('Could not open the token slip.')
            ),
        },
        duration: 8000,
      });
      onIssued?.(data);
      onClose();
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Could not issue the walk-in token.';
      setError(message);
      toast.error(message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    mutation.mutate();
  };

  const busy = mutation.isPending;

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Walk-in token"
      description="Same-day token, issued already checked in. No time slot is consumed."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="walk-in-form"
            disabled={busy || !canSubmit}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Issuing...
              </>
            ) : (
              <>
                <Ticket className="mr-2 h-4 w-4" />
                Issue token
              </>
            )}
          </Button>
        </>
      }
    >
      <form id="walk-in-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Existing patient search */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
            Find an existing patient
          </label>
          {selectedPatient ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{selectedPatient.name}</div>
                <div className="truncate text-xs font-mono text-muted-foreground">
                  MRN {selectedPatient.mrn}
                  {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedPatient(null);
                  setSearch('');
                }}
                disabled={busy}
                className="h-8 shrink-0 text-xs"
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, MRN, phone or CNIC..."
                  className="h-10 pl-9"
                  disabled={busy}
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>

              {patients.length > 0 && (
                <div className="max-h-40 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-soft">
                  {patients.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => {
                        setSelectedPatient(p);
                        setSearch('');
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold text-foreground">{p.name}</span>
                        <span className="ml-2 font-mono text-muted-foreground">{p.mrn}</span>
                      </span>
                      {p.phone && <span className="shrink-0 text-muted-foreground">{p.phone}</span>}
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length > 1 && !searchLoading && patients.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No match. Register them below with just a name and phone number.
                </p>
              )}
            </>
          )}
        </div>

        {/* Quick registration for a patient that isn't in the system yet */}
        {needsRegistration && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/25 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              Or quick-register a new patient
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-muted-foreground">Full name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Patient name"
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-muted-foreground">Phone *</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03001234567"
                  inputMode="tel"
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="block text-[11px] font-semibold text-muted-foreground">
                  CNIC (optional)
                </label>
                <Input
                  value={cnic}
                  onChange={(e) => setCnic(e.target.value)}
                  placeholder="35201-1234567-1"
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
              Doctor *
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={busy}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Select doctor</option>
              {doctors.map((doc) => (
                <option key={doc._id} value={doc._id}>
                  {doc.name}
                  {doc.department ? ` (${doc.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={busy}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {priority !== 'normal' && (
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
              Reason for priority *
            </label>
            <Input
              value={priorityReason}
              onChange={(e) => setPriorityReason(e.target.value)}
              placeholder={priority === 'emergency' ? 'e.g. chest pain, bleeding' : 'e.g. 72 years old, mobility issues'}
              className="h-9 text-sm"
              disabled={busy}
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
            Reason / symptoms (optional)
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. fever since yesterday"
            className="h-9 text-sm"
            disabled={busy}
          />
        </div>

        <p className={cn('flex items-start gap-2 text-[11px] text-muted-foreground')}>
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          The token is issued immediately in the queue. Any consultation fee is billed like a normal
          booking and can be collected from Billing.
        </p>
      </form>
    </Modal>
  );
}
