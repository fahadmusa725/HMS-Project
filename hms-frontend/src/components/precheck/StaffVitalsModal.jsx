import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PRECHECK_VITALS, fetchPreCheck } from '@/lib/precheck';
import { cn, doctorName } from '@/lib/utils';

const inputClass =
  'flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

const emptyVitals = () => PRECHECK_VITALS.reduce((acc, { key }) => ({ ...acc, [key]: '' }), {});

/**
 * Desk vitals: nurse / receptionist / doctor measures the patient on arrival. These are
 * stored separately from the patient's self-reported values, so the two are never confused.
 * Mounted with a key per appointment to seed from the last recorded set.
 */
function VitalsFields({ preCheck, mutation }) {
  const [vitals, setVitals] = useState({ ...emptyVitals(), ...(preCheck?.staffVitals || {}) });
  const [formError, setFormError] = useState(null);
  const serverError = mutation.error?.response?.data?.message;
  const busy = mutation.isPending;

  const reported = preCheck?.patientVitals || {};
  const reportedEntries = Object.entries(reported).filter(([, value]) => value);

  const handleSubmit = (event) => {
    event.preventDefault();

    const filled = Object.fromEntries(
      PRECHECK_VITALS.map(({ key }) => [key, vitals[key]?.trim()]).filter(([, value]) => value)
    );
    if (Object.keys(filled).length === 0) {
      setFormError('Enter at least one vital sign before saving.');
      return;
    }

    setFormError(null);
    mutation.mutate(filled);
  };

  return (
    <form id="staff-vitals-form" onSubmit={handleSubmit} className="space-y-4">
      {(formError || serverError) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError || serverError}</span>
        </div>
      )}

      {reportedEntries.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-warning">Patient reported</div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
            {reportedEntries.map(([key, value]) => (
              <span key={key}>
                <span className="text-muted-foreground">
                  {PRECHECK_VITALS.find((vital) => vital.key === key)?.label || key}:{' '}
                </span>
                <span className="font-semibold">{value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {PRECHECK_VITALS.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <label
              htmlFor={`staff-vital-${key}`}
              className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </label>
            <input
              id={`staff-vital-${key}`}
              value={vitals[key]}
              onChange={(e) => setVitals((prev) => ({ ...prev, [key]: e.target.value.slice(0, 40) }))}
              disabled={busy}
              placeholder={placeholder}
              className={cn(inputClass, 'h-11 sm:h-10')}
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Saved as measured at the desk. The patient's own pre-visit readings stay on file separately, so the
        doctor can compare the two.
      </p>
    </form>
  );
}

/** Modal the front desk uses to record vitals when the patient arrives. */
export default function StaffVitalsModal({ appointment, onClose }) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['pre-check', appointment?._id],
    queryFn: () => fetchPreCheck(appointment._id),
    enabled: Boolean(appointment?._id),
  });

  const mutation = useMutation({
    mutationFn: (vitals) => api.patch(`/api/pre-checks/${appointment._id}/staff-vitals`, vitals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-check', appointment._id] });
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      toast.success('Vitals recorded', { description: 'The doctor will see them in the pre-check summary.' });
      onClose();
    },
  });

  const preCheck = detail.data?.preCheck || null;

  return (
    <Modal
      isOpen={Boolean(appointment)}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title="Record desk vitals"
      description={`${appointment?.patientId?.name || 'Patient'}${
        appointment?.patientId?.mrn ? ` · MRN: ${appointment.patientId.mrn}` : ''
      } · ${doctorName(appointment?.doctorId?.name, 'Doctor')}`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
            className="h-11 flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="staff-vitals-form"
            disabled={mutation.isPending || detail.isLoading}
            className="h-11 flex-1 bg-primary font-semibold text-primary-foreground hover:bg-primary/90 sm:flex-none"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Activity className="mr-1.5 h-4 w-4" />
                Save vitals
              </>
            )}
          </Button>
        </>
      }
    >
      {detail.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : detail.isError ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{detail.error?.response?.data?.message || 'Could not load the pre-check.'}</span>
        </div>
      ) : (
        <VitalsFields
          key={preCheck?._id || 'new'}
          preCheck={preCheck}
          mutation={mutation}
        />
      )}
    </Modal>
  );
}
