import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import api from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, doctorName } from '@/lib/utils';
import {
  PRECHECK_DURATION_PICKS,
  PRECHECK_FILE_ACCEPT,
  PRECHECK_MAX_FILES,
  PRECHECK_MAX_FILE_BYTES,
  PRECHECK_SYMPTOMS_MAX,
  PRECHECK_VITALS,
  fetchPreCheck,
  formatBytes,
  isAcceptableReport,
  openPreCheckAttachment,
} from '@/lib/precheck';

const emptyVitals = () =>
  PRECHECK_VITALS.reduce((acc, { key }) => ({ ...acc, [key]: '' }), {});

const inputClass =
  'flex h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 sm:text-sm';

/** Read-only rendering of whatever is already on file (the locked state). */
function PreCheckSummary({ appointmentId, preCheck }) {
  if (!preCheck) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        No pre-check was submitted before check-in, so there is nothing to show here.
      </div>
    );
  }

  const patientVitals = Object.entries(preCheck.patientVitals || {});

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Symptoms</div>
        <p className="whitespace-pre-line text-sm text-foreground">{preCheck.symptoms}</p>
        {preCheck.duration && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Ongoing for {preCheck.duration}
          </p>
        )}
      </div>

      {patientVitals.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Vitals you reported
          </div>
          <div className="flex flex-wrap gap-2">
            {patientVitals.map(([key, value]) => (
              <span
                key={key}
                className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning"
              >
                {PRECHECK_VITALS.find((vital) => vital.key === key)?.label || key}: {value}
              </span>
            ))}
          </div>
        </div>
      )}

      {(preCheck.attachments || []).length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            Reports
          </div>
          <ul className="space-y-2">
            {preCheck.attachments.map((attachment) => (
              <li
                key={attachment._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{attachment.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(attachment.bytes)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
                  onClick={() =>
                    openPreCheckAttachment(appointmentId, attachment._id).catch(() =>
                      toast.error('Could not open that report. It may have been removed.')
                    )
                  }
                >
                  View
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The editable form. Mounted with a `key` per pre-check so its local state is seeded once
 * from the loaded document and never clobbers what the patient is typing on a refetch.
 */
function PreCheckEditor({ appointment, preCheck, mutation }) {
  const fileInputRef = useRef(null);
  const [symptoms, setSymptoms] = useState(preCheck?.symptoms || '');
  const [duration, setDuration] = useState(preCheck?.duration || '');
  const [vitals, setVitals] = useState({ ...emptyVitals(), ...(preCheck?.patientVitals || {}) });
  const [consent, setConsent] = useState(Boolean(preCheck?.consentAccepted));
  const [files, setFiles] = useState([]);
  const [keptAttachments, setKeptAttachments] = useState(preCheck?.attachments || []);
  const [removedIds, setRemovedIds] = useState([]);
  const [formError, setFormError] = useState(null);

  const serverError = mutation.error?.response?.data?.message;
  const totalAttachments = keptAttachments.length + files.length;

  const addFiles = (incoming) => {
    const next = [...files];
    let rejected = '';

    for (const file of incoming) {
      if (keptAttachments.length + next.length >= PRECHECK_MAX_FILES) {
        rejected = rejected || `You can attach at most ${PRECHECK_MAX_FILES} files.`;
        break;
      }
      if (!isAcceptableReport(file)) {
        rejected = rejected || `"${file.name}" is not a PDF, JPG or PNG.`;
        continue;
      }
      if (file.size > PRECHECK_MAX_FILE_BYTES) {
        rejected = rejected || `"${file.name}" is larger than 5 MB.`;
        continue;
      }
      next.push(file);
    }

    setFiles(next);
    if (rejected) setFormError(rejected);
    else setFormError(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!symptoms.trim()) {
      setFormError('Please describe your symptoms - it is the only required field.');
      return;
    }
    if (!consent) {
      setFormError('Please tick the consent box so the hospital may use this information for your visit.');
      return;
    }

    setFormError(null);
    const payload = new FormData();
    payload.append('appointmentId', appointment._id);
    payload.append('symptoms', symptoms.trim());
    if (duration.trim()) payload.append('duration', duration.trim());
    PRECHECK_VITALS.forEach(({ key }) => {
      if (vitals[key]?.trim()) payload.append(key, vitals[key].trim());
    });
    payload.append('consentAccepted', 'true');
    files.forEach((file) => payload.append('attachments', file));
    removedIds.forEach((id) => payload.append('removeAttachmentIds', id));

    mutation.mutate(payload);
  };

  const busy = mutation.isPending;

  return (
    <form id="precheck-form" onSubmit={handleSubmit} className="space-y-6">
      {(formError || serverError) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError || serverError}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="precheck-symptoms" className="block text-xs font-bold uppercase tracking-wider text-foreground">
          What are you feeling? <span className="text-destructive">*</span>
        </label>
        <textarea
          id="precheck-symptoms"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value.slice(0, PRECHECK_SYMPTOMS_MAX))}
          rows={5}
          maxLength={PRECHECK_SYMPTOMS_MAX}
          disabled={busy}
          placeholder="e.g. Fever since Tuesday, sore throat, body ache. Worse at night."
          className={cn(inputClass, 'min-h-[120px] resize-y py-3 leading-relaxed')}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Plain words are fine - your doctor will read this before you arrive.</span>
          <span className="tabular-nums">
            {symptoms.length}/{PRECHECK_SYMPTOMS_MAX}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="precheck-duration" className="block text-xs font-bold uppercase tracking-wider text-foreground">
          How long have you had it?
        </label>
        <input
          id="precheck-duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value.slice(0, 120))}
          disabled={busy}
          placeholder="e.g. 3 days"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-2">
          {PRECHECK_DURATION_PICKS.map((pick) => (
            <button
              key={pick}
              type="button"
              disabled={busy}
              onClick={() => setDuration(pick)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                duration === pick
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {pick}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Vitals (optional)</span>
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
            You report these
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Only fill these in if you measured them at home. The nurse re-checks your vitals at the desk, so
          nothing here delays your visit.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PRECHECK_VITALS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <label htmlFor={`precheck-${key}`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </label>
              <input
                id={`precheck-${key}`}
                value={vitals[key]}
                onChange={(e) => setVitals((prev) => ({ ...prev, [key]: e.target.value.slice(0, 40) }))}
                disabled={busy}
                placeholder={placeholder}
                className={cn(inputClass, 'h-10 text-sm')}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Reports (optional)</span>
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalAttachments}/{PRECHECK_MAX_FILES}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">PDF, JPG or PNG · up to 5 MB each.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept={PRECHECK_FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />

        <Button
          type="button"
          variant="outline"
          disabled={busy || totalAttachments >= PRECHECK_MAX_FILES}
          onClick={() => fileInputRef.current?.click()}
          className="h-11 w-full border-dashed text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Upload className="mr-2 h-4 w-4" />
          {totalAttachments >= PRECHECK_MAX_FILES ? 'Maximum reached' : 'Add a report or photo'}
        </Button>

        {keptAttachments.length > 0 && (
          <ul className="space-y-2">
            {keptAttachments.map((attachment) => (
              <li
                key={attachment._id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-xs text-foreground">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{attachment.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.bytes)}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] font-semibold text-primary hover:bg-primary/10"
                    onClick={() =>
                      openPreCheckAttachment(appointment._id, attachment._id).catch(() =>
                        toast.error('Could not open that report.')
                      )
                    }
                  >
                    View
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${attachment.name}`}
                    disabled={busy}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setKeptAttachments((prev) => prev.filter((item) => item._id !== attachment._id));
                      setRemovedIds((prev) => [...prev, attachment._id]);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-xs text-foreground">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${file.name}`}
                  disabled={busy}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label
        htmlFor="precheck-consent"
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
          consent ? 'border-success/40 bg-success/10' : 'border-border bg-muted/20'
        )}
      >
        <input
          id="precheck-consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-primary"
        />
        <span className="text-xs leading-relaxed text-foreground">
          <span className="flex items-center gap-1.5 font-bold">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Consent
          </span>
          <span className="mt-1 block text-muted-foreground">
            I confirm this information is accurate to the best of my knowledge, and I agree that the
            hospital may use it to prepare for my visit. Reports I upload are stored securely and shown
            only to my care team.
          </span>
        </span>
      </label>

      {/* The real submit button lives in the modal footer (form="precheck-form"). */}
      <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1}>
        Submit
      </button>
    </form>
  );
}

/**
 * Digital pre-check modal for one appointment.
 *
 * Mobile-first on purpose: this is filled in on a phone, at home, before the visit. Editable
 * until check-in, read-only afterwards (the server enforces the same rule).
 */
export default function PreCheckForm({ appointment, onClose }) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['pre-check', appointment?._id],
    queryFn: () => fetchPreCheck(appointment._id),
    enabled: Boolean(appointment?._id),
  });

  const mutation = useMutation({
    // axios only sends real multipart when the content type is not the JSON default.
    mutationFn: (formData) =>
      api.post('/api/pre-checks', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-check', appointment._id] });
      queryClient.invalidateQueries({ queryKey: ['my-pre-checks'] });
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      toast.success('Pre-check submitted', {
        description: 'Your doctor can see it before the visit. You can still edit it until you check in.',
      });
      onClose();
    },
  });

  const preCheck = detail.data?.preCheck || null;
  const locked = detail.data ? !detail.data.editable : appointment.status !== 'scheduled';

  const statusBadge = locked ? (
    <Badge variant="precheck_locked" className="gap-1">
      <Lock className="h-3 w-3" />
      Locked
    </Badge>
  ) : preCheck?.submittedAt ? (
    <Badge variant="precheck" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Submitted
    </Badge>
  ) : (
    <Badge variant="precheck_pending">Not started</Badge>
  );

  return (
    <Modal
      isOpen={Boolean(appointment)}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title="Pre-check for your visit"
      description={`${doctorName(appointment?.doctorId?.name, 'Your doctor')}${
        appointment?.tokenNumber ? ` · Token #${appointment.tokenNumber}` : ''
      }`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
            className="h-11 flex-1 sm:flex-none"
          >
            {locked ? 'Close' : 'Cancel'}
          </Button>
          {!locked && (
            <Button
              type="submit"
              form="precheck-form"
              disabled={mutation.isPending || detail.isLoading}
              className="h-11 flex-1 bg-primary font-semibold text-primary-foreground hover:bg-primary/90 sm:flex-none"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Submit pre-check'
              )}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3.5 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {locked
              ? 'Your pre-check is closed for editing because you have checked in.'
              : 'You can edit this any time before you check in.'}
          </span>
          {statusBadge}
        </div>

        {detail.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your pre-check…
          </div>
        ) : detail.isError ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {detail.error?.response?.data?.message || 'Could not load your pre-check. Please try again.'}
            </span>
          </div>
        ) : locked ? (
          <PreCheckSummary appointmentId={appointment._id} preCheck={preCheck} />
        ) : (
          <PreCheckEditor
            key={preCheck?._id || 'new'}
            appointment={appointment}
            preCheck={preCheck}
            mutation={mutation}
          />
        )}
      </div>
    </Modal>
  );
}
