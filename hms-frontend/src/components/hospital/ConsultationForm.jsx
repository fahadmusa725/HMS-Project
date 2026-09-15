import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  X,
  Loader2,
  Stethoscope,
  AlertCircle,
  Pill,
  CalendarCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

const emptyRx = () => ({
  medicineName: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

/**
 * ConsultationForm
 * Opens as a modal; on successful submit POSTs /api/consultations which
 * also marks the linked appointment as "completed" on the backend.
 *
 * Props:
 *   appointment – the full appointment object (needs _id, patientId.{name,mrn})
 *   onClose     – called when the modal should be dismissed
 */
export default function ConsultationForm({ appointment, onClose }) {
  const queryClient = useQueryClient();

  const [vitals, setVitals] = useState({
    bloodPressure: '',
    temperature: '',
    pulse: '',
    weight: '',
    height: '',
  });
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState([emptyRx()]);
  const [followUpDate, setFollowUpDate] = useState('');
  const [formError, setFormError] = useState(null);

  const consultationMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post('/api/consultations', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      toast.success('Consultation recorded successfully!', {
        description: 'Appointment has been marked as completed.',
      });
      onClose();
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to record consultation.';
      setFormError(message);
      toast.error(message);
    },
  });

  const handleVitalChange = (field, value) =>
    setVitals((prev) => ({ ...prev, [field]: value }));

  const handleRxChange = (idx, field, value) =>
    setPrescriptions((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );

  const addRxRow = () => setPrescriptions((prev) => [...prev, emptyRx()]);
  const removeRxRow = (idx) =>
    setPrescriptions((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!diagnosis.trim()) {
      setFormError('Diagnosis is required before submitting.');
      return;
    }
    setFormError(null);

    // Build vitals object – omit empty strings so the backend doesn't store blanks
    const vitalsPayload = Object.fromEntries(
      Object.entries(vitals).filter(([, v]) => v.trim())
    );

    const payload = {
      patientId: appointment.patientId?._id || appointment.patientId,
      appointmentId: appointment._id,
      ...(Object.keys(vitalsPayload).length > 0 ? { vitals: vitalsPayload } : {}),
      ...(symptoms.trim() ? { symptoms } : {}),
      diagnosis: diagnosis.trim(),
      ...(notes.trim() ? { notes } : {}),
      prescriptions: prescriptions.filter((r) => r.medicineName.trim()),
      ...(followUpDate ? { followUpDate } : {}),
    };

    consultationMutation.mutate(payload);
  };

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
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-0">
        {/* Scrollable body */}
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1 pb-2">
          {formError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium animate-slide-up">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* ── Diagnosis ── */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 text-primary" />
              Diagnosis *
            </label>
            <Input
              placeholder="e.g. Acute Upper Respiratory Infection"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              disabled={consultationMutation.isPending}
              className="h-11 text-sm font-semibold border-primary/40 focus-visible:ring-primary"
              required
            />
          </div>

          {/* ── Vitals Grid ── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Vitals <span className="font-normal text-muted-foreground">(all optional)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: 'bloodPressure', label: 'Blood Pressure', ph: '120/80' },
                { key: 'temperature',   label: 'Temperature',   ph: '98.6 F' },
                { key: 'pulse',         label: 'Pulse',         ph: '76 bpm' },
                { key: 'weight',        label: 'Weight',        ph: '70 kg' },
                { key: 'height',        label: 'Height',        ph: '170 cm' },
              ].map(({ key, label, ph }) => (
                <div key={key} className="space-y-0.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    {label}
                  </label>
                  <Input
                    placeholder={ph}
                    value={vitals[key]}
                    onChange={(e) => handleVitalChange(key, e.target.value)}
                    disabled={consultationMutation.isPending}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Symptoms ── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Symptoms
            </label>
            <textarea
              placeholder="Describe presenting symptoms..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              disabled={consultationMutation.isPending}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
            />
          </div>

          {/* ── Clinical Notes ── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Clinical Notes
            </label>
            <textarea
              placeholder="Observations, examination findings, special instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={consultationMutation.isPending}
              rows={2}
              className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
            />
          </div>

          {/* ── Prescription Builder ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                <Pill className="h-3.5 w-3.5 text-primary" />
                Prescriptions
              </label>
              <button
                type="button"
                onClick={addRxRow}
                disabled={consultationMutation.isPending}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Medicine
              </button>
            </div>

            <div className="space-y-2">
              {prescriptions.map((row, idx) => (
                <div
                  key={idx}
                  className="relative p-3 rounded-xl border border-border bg-muted/20 space-y-2"
                >
                  {prescriptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRxRow(idx)}
                      disabled={consultationMutation.isPending}
                      className="absolute top-2 right-2 h-5 w-5 rounded-full bg-muted hover:bg-destructive/15 hover:text-destructive text-muted-foreground flex items-center justify-center transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Input
                        placeholder="Medicine name *"
                        value={row.medicineName}
                        onChange={(e) => handleRxChange(idx, 'medicineName', e.target.value)}
                        disabled={consultationMutation.isPending}
                        className="h-8 text-xs font-medium"
                      />
                    </div>
                    <Input
                      placeholder="Dosage (e.g. 500mg)"
                      value={row.dosage}
                      onChange={(e) => handleRxChange(idx, 'dosage', e.target.value)}
                      disabled={consultationMutation.isPending}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="Frequency (e.g. twice daily)"
                      value={row.frequency}
                      onChange={(e) => handleRxChange(idx, 'frequency', e.target.value)}
                      disabled={consultationMutation.isPending}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="Duration (e.g. 5 days)"
                      value={row.duration}
                      onChange={(e) => handleRxChange(idx, 'duration', e.target.value)}
                      disabled={consultationMutation.isPending}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="Instructions (e.g. after meals)"
                      value={row.instructions}
                      onChange={(e) => handleRxChange(idx, 'instructions', e.target.value)}
                      disabled={consultationMutation.isPending}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Follow-up Date ── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5 block">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" />
              Follow-up Date <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              disabled={consultationMutation.isPending}
              className="h-9 w-44 text-xs"
            />
          </div>
        </div>

        {/* ── Sticky Footer ── */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-4">
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
            disabled={consultationMutation.isPending}
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
        </div>
      </form>
    </Modal>
  );
}
