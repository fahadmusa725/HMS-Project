import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { DAY_NAMES, doctorName } from '@/lib/utils';

const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60];
const NEW_BLOCK = { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' };

const selectClass =
  'flex h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Hospital admin sets a doctor's consultation fee, slot length and weekly
 * working hours. This is what drives the booking slot-picker and the
 * auto-created OPD fee bill.
 */
export default function DoctorScheduleModal({ doctor, onClose }) {
  const { data: schedule, isLoading } = useQuery({
    queryKey: ['doctor-schedule', doctor._id],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/doctor-schedules/${doctor._id}`);
        return res.data;
      } catch (err) {
        if (err.response?.status === 404) return null; // no schedule yet - start blank
        throw err;
      }
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Schedule — ${doctorName(doctor.name)}`}
      description="Consultation fee, appointment length and weekly OPD hours. Patients can only be booked into these slots."
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule...
        </div>
      ) : (
        <ScheduleForm doctor={doctor} schedule={schedule} onClose={onClose} />
      )}
    </Modal>
  );
}

/** Rendered only once the schedule has loaded, so its state is initialised straight from it. */
function ScheduleForm({ doctor, schedule, onClose }) {
  const queryClient = useQueryClient();
  const [fee, setFee] = useState(schedule?.consultationFee ?? 0);
  const [slotMinutes, setSlotMinutes] = useState(schedule?.slotDurationMinutes ?? 20);
  const [blocks, setBlocks] = useState(schedule?.weeklyAvailability ?? []);
  const [formError, setFormError] = useState(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/api/doctor-schedules/${doctor._id}`, {
        consultationFee: Number(fee) || 0,
        slotDurationMinutes: Number(slotMinutes),
        weeklyAvailability: blocks.map((b) => ({ ...b, dayOfWeek: Number(b.dayOfWeek) })),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-schedule', doctor._id] });
      queryClient.invalidateQueries({ queryKey: ['available-doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success(`Schedule saved for ${doctorName(doctor.name)}.`);
      onClose();
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to save schedule.';
      setFormError(msg);
      toast.error(msg);
    },
  });

  const updateBlock = (idx, field, value) =>
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));

  const invalidBlock = blocks.some((b) => !b.startTime || !b.endTime || b.startTime >= b.endTime);
  const busy = saveMutation.isPending;

  return (
    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
      {formError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {formError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
            Consultation Fee (PKR)
          </label>
          <Input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} disabled={busy} />
          <p className="text-[10px] text-muted-foreground">0 = no fee is billed at booking.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
            Slot Length
          </label>
          <select
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
            disabled={busy}
            className={`${selectClass} h-10`}
          >
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">Weekly OPD Hours</label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setBlocks((prev) => [...prev, { ...NEW_BLOCK }])}
            disabled={busy}
            className="h-7 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Hours
          </Button>
        </div>

        {blocks.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-border text-xs text-muted-foreground text-center">
            No working hours yet — this doctor won&rsquo;t appear in appointment booking until you add some.
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map((b, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
                <select
                  value={b.dayOfWeek}
                  onChange={(e) => updateBlock(idx, 'dayOfWeek', Number(e.target.value))}
                  disabled={busy}
                  className={selectClass}
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <Input
                  type="time"
                  value={b.startTime}
                  onChange={(e) => updateBlock(idx, 'startTime', e.target.value)}
                  disabled={busy}
                  className="h-9 w-28"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={b.endTime}
                  onChange={(e) => updateBlock(idx, 'endTime', e.target.value)}
                  disabled={busy}
                  className={`h-9 w-28 ${b.startTime >= b.endTime ? 'border-destructive' : ''}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Remove"
                  onClick={() => setBlocks((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={busy}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {invalidBlock && (
              <p className="text-xs text-destructive">Each block&rsquo;s end time must be after its start time.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setFormError(null);
            saveMutation.mutate();
          }}
          disabled={busy || invalidBlock || !(Number(fee) >= 0)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Schedule'
          )}
        </Button>
      </div>
    </div>
  );
}
