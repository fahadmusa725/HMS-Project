import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  X,
  Loader2,
  Stethoscope,
  AlertCircle,
  Pill,
  CalendarCheck,
  ClipboardList,
  FileText,
  Activity,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PRECHECK_VITALS, fetchPreCheck, formatBytes, openPreCheckAttachment } from '@/lib/precheck';
import { cn } from '@/lib/utils';

const emptyRx = () => ({
  medicineName: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

// The doctor's own vitals form, in the order the record already used.
const CONSULT_VITALS = [
  { key: 'bloodPressure', label: 'Blood Pressure', ph: '120/80' },
  { key: 'temperature', label: 'Temperature', ph: '98.6 F' },
  { key: 'pulse', label: 'Pulse', ph: '76 bpm' },
  { key: 'weight', label: 'Weight', ph: '70 kg' },
  { key: 'height', label: 'Height', ph: '170 cm' },
];

/**
 * Seeds the vitals inputs from what is already on file: a reading measured at the desk wins
 * over the patient's own estimate, because it is the same thing the record should carry.
 * Anything not measured is taken from the pre-check and flagged as patient-reported.
 */
function buildInitialVitals(preCheck) {
  const measured = preCheck?.staffVitals || {};
  const reported = preCheck?.patientVitals || {};
  const values = {};
  const sources = {};

  for (const { key } of CONSULT_VITALS) {
    if (measured[key]) {
      values[key] = measured[key];
      sources[key] = 'staff';
    } else if (reported[key]) {
      values[key] = reported[key];
      sources[key] = 'patient';
    } else {
      values[key] = '';
    }
  }

  return { values, sources };
}

function VitalSourceChip({ source }) {
  if (source === 'patient') {
    return (
      <span className="rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
        Patient-reported
      </span>
    );
  }
  if (source === 'staff') {
    return (
      <span className="rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success">
        Measured
      </span>
    );
  }
  return null;
}

/** The editable consultation body, seeded once from the patient's pre-check. */
function ConsultationEditor({ appointment, preCheck, mutation }) {
  const [initial] = useState(() => buildInitialVitals(preCheck));
  const [vitals, setVitals] = useState(initial.values);
  const [vitalSources, setVitalSources] = useState(initial.sources);
  const [symptoms, setSymptoms] = useState(preCheck?.symptoms || '');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState([emptyRx()]);
  const [followUpDate, setFollowUpDate] = useState('');
  const [formError, setFormError] = useState(null);

  const serverError = mutation.error?.response?.data?.message;
  const busy = mutation.isPending;

  const handleVitalChange = (field, value) => {
    setVitals((prev) => ({ ...prev, [field]: value }));
    // Once the doctor types in a field, what is in the record is their measurement.
    setVitalSources((prev) => ({ ...prev, [field]: 'staff' }));
  };

  const handleRxChange = (idx, field, value) =>
    setPrescriptions((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const addRxRow = () => setPrescriptions((prev) => [...prev, emptyRx()]);
  const removeRxRow = (idx) => setPrescriptions((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!diagnosis.trim()) {
      setFormError('Diagnosis is required before submitting.');
      return;
    }
    setFormError(null);

    // Omit empty strings so the backend doesn't store blanks.
    const vitalsPayload = Object.fromEntries(
      Object.entries(vitals).filter(([, value]) => value.trim())
    );
    // Only the readings that still came from the patient need explaining - everything else
    // is what the doctor measured in the room.
    const patientSourced = Object.fromEntries(
      Object.entries(vitalSources).filter(([key, source]) => source === 'patient' && vitalsPayload[key])
    );

    const payload = {
      patientId: appointment.patientId?._id || appointment.patientId,
      appointmentId: appointment._id,
      ...(Object.keys(vitalsPayload).length > 0 ? { vitals: vitalsPayload } : {}),
      ...(Object.keys(patientSourced).length > 0 ? { vitalsSource: patientSourced } : {}),
      ...(preCheck?._id ? { preCheckId: preCheck._id } : {}),
      ...(symptoms.trim() ? { symptoms } : {}),
      diagnosis: diagnosis.trim(),
      ...(notes.trim() ? { notes } : {}),
      prescriptions: prescriptions.filter((r) => r.medicineName.trim()),
      ...(followUpDate ? { followUpDate } : {}),
    };

    mutation.mutate(payload);
  };

  return (
    <form id="consultation-form" onSubmit={handleSubmit} className="space-y-5">
      {(formError || serverError) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive animate-slide-up">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{formError || serverError}</span>
        </div>
      )}

      {/* What the patient already told the hospital, before the doctor types anything. */}
      {preCheck ? (
        <div className="space-y-3 rounded-xl border border-info/30 bg-info/5 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-info">
              <ClipboardList className="h-3.5 w-3.5" />
              Patient pre-check
            </div>
            <span className="text-[11px] text-muted-foreground">
              {preCheck.submittedAt
                ? `Submitted ${new Date(preCheck.submittedAt).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                : 'No patient submission yet'}
            </span>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Symptoms reported
            </div>
            <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">
              {preCheck.symptoms || <span className="text-muted-foreground">—</span>}
            </p>
            {preCheck.duration && (
              <p className="mt-1 text-[11px] text-muted-foreground">Ongoing for {preCheck.duration}</p>
            )}
          </div>

          {Object.keys(preCheck.patientVitals || {}).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Vitals the patient reported
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preCheck.patientVitals).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
                  >
                    {PRECHECK_VITALS.find((vital) => vital.key === key)?.label || key}: {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {Object.keys(preCheck.staffVitals || {}).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Vitals measured at the desk
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preCheck.staffVitals).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-lg border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
                  >
                    {PRECHECK_VITALS.find((vital) => vital.key === key)?.label || key}: {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(preCheck.attachments || []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Reports uploaded
              </div>
              <ul className="space-y-1.5">
                {preCheck.attachments.map((attachment) => (
                  <li
                    key={attachment._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{attachment.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatBytes(attachment.bytes)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        openPreCheckAttachment(appointment._id, attachment._id).catch(() =>
                          toast.error('Could not open that report.')
                        )
                      }
                      className="shrink-0 text-[11px] font-semibold text-primary hover:text-primary/80"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Patient-reported readings are prefilled below and tagged. Edit any value you measured
            yourself - it is then recorded as measured.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
          No digital pre-check was submitted for this visit.
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Stethoscope className="h-3.5 w-3.5 text-primary" />
          Diagnosis *
        </label>
        <Input
          placeholder="e.g. Acute Upper Respiratory Infection"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          disabled={busy}
          className="h-11 text-sm font-semibold border-primary/40 focus-visible:ring-primary"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
          Vitals <span className="font-normal text-muted-foreground">(all optional)</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CONSULT_VITALS.map(({ key, label, ph }) => (
            <div key={key} className="space-y-0.5">
              <label className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
                {vitals[key]?.trim() && <VitalSourceChip source={vitalSources[key]} />}
              </label>
              <Input
                placeholder={ph}
                value={vitals[key]}
                onChange={(e) => handleVitalChange(key, e.target.value)}
                disabled={busy}
                className={cn(
                  'h-9 text-xs',
                  vitals[key]?.trim() && vitalSources[key] === 'patient'
                    ? 'border-warning/40 bg-warning/5'
                    : undefined
                )}
              />
            </div>
          ))}
        </div>
        {Object.values(vitalSources).includes('patient') && (
          <p className="flex items-center gap-1.5 text-[11px] text-warning">
            <Activity className="h-3 w-3" />
            Amber fields are the patient's own readings, not measurements taken in the room.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
          Symptoms
        </label>
        <textarea
          placeholder="Describe presenting symptoms..."
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          disabled={busy}
          rows={3}
          className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
          Clinical Notes
        </label>
        <textarea
          placeholder="Observations, examination findings, special instructions..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          rows={2}
          className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
            <Pill className="h-3.5 w-3.5 text-primary" />
            Prescriptions
          </label>
          <button
            type="button"
            onClick={addRxRow}
            disabled={busy}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Medicine
          </button>
        </div>

        <div className="space-y-2">
          {prescriptions.map((row, idx) => (
            <div key={idx} className="relative p-3 rounded-xl border border-border bg-muted/20 space-y-2">
              {prescriptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRxRow(idx)}
                  disabled={busy}
                  className="absolute top-2 right-2 h-5 w-5 rounded-full bg-muted hover:bg-destructive/15 hover:text-destructive text-muted-foreground flex items-center justify-center transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Input
                    placeholder="Medicine name *"
                    value={row.medicineName}
                    onChange={(e) => handleRxChange(idx, 'medicineName', e.target.value)}
                    disabled={busy}
                    className="h-8 text-xs font-medium"
                  />
                </div>
                <Input
                  placeholder="Dosage (e.g. 500mg)"
                  value={row.dosage}
                  onChange={(e) => handleRxChange(idx, 'dosage', e.target.value)}
                  disabled={busy}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Frequency (e.g. twice daily)"
                  value={row.frequency}
                  onChange={(e) => handleRxChange(idx, 'frequency', e.target.value)}
                  disabled={busy}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Duration (e.g. 5 days)"
                  value={row.duration}
                  onChange={(e) => handleRxChange(idx, 'duration', e.target.value)}
                  disabled={busy}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Instructions (e.g. after meals)"
                  value={row.instructions}
                  onChange={(e) => handleRxChange(idx, 'instructions', e.target.value)}
                  disabled={busy}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5 block">
          <CalendarCheck className="h-3.5 w-3.5 text-primary" />
          Follow-up Date <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          disabled={busy}
          className="h-9 w-44 text-xs"
        />
      </div>
    </form>
  );
}

/**
 * ConsultationForm
 * Opens as a modal; on successful submit POSTs /api/consultations which
 * also marks the linked appointment as "completed" on the backend.
 *
 * The patient's digital pre-check (if any) is loaded first and folded into the form:
 * symptoms are prefilled, and vitals are seeded with the measured values if the desk took
 * them, otherwise with the patient's own readings marked as patient-reported.
 *
 * Props:
 *   appointment – the full appointment object (needs _id, patientId.{name,mrn})
 *   onClose     – called when the modal should be dismissed
 */
export default function ConsultationForm({ appointment, onClose }) {
  const queryClient = useQueryClient();

  const preCheckQuery = useQuery({
    queryKey: ['pre-check', appointment?._id],
    queryFn: () => fetchPreCheck(appointment._id),
    enabled: Boolean(appointment?._id),
  });

  const consultationMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post('/api/consultations', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pre-check', appointment?._id] });
      toast.success('Consultation recorded successfully!', {
        description: 'Appointment has been marked as completed.',
      });
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to record consultation.');
    },
  });

  const patientName = appointment?.patientId?.name || 'Patient';
  const patientMRN = appointment?.patientId?.mrn || '';

  return (
    <Modal
      isOpen={!!appointment}
      onClose={() => {
        if (!consultationMutation.isPending) onClose();
      }}
      title="Record Consultation"
      description={`${patientName}${patientMRN ? ` · MRN: ${patientMRN}` : ''} · Token #${appointment?.tokenNumber ?? ''}`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={consultationMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="consultation-form"
            disabled={consultationMutation.isPending || preCheckQuery.isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {consultationMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <Stethoscope className="mr-1.5 h-4 w-4" />
                Record &amp; Complete
              </>
            )}
          </Button>
        </>
      }
    >
      {preCheckQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the patient's pre-check…
        </div>
      ) : (
        <ConsultationEditor
          key={preCheckQuery.data?.preCheck?._id || 'no-precheck'}
          appointment={appointment}
          preCheck={preCheckQuery.data?.preCheck || null}
          mutation={consultationMutation}
        />
      )}
    </Modal>
  );
}
