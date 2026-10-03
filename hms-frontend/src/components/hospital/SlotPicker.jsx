import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Stethoscope, Clock, Loader2, Check, CalendarX2 } from 'lucide-react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatSlotTime, doctorName } from '@/lib/utils';

/**
 * Real-availability booking picker, shared by staff booking (AppointmentsQueue)
 * and patient self-booking (PatientAppointments). Only doctors who actually
 * work on the chosen date are listed, and only their still-open slots can be
 * picked - no free-typed times. The backend re-validates the slot on submit.
 */
export function SlotPicker({ date, doctorId, time, onDoctorChange, onTimeChange, onFeeChange, disabled, errors = {} }) {
  const [doctorSearch, setDoctorSearch] = useState('');

  const { data: doctors = [], isLoading: doctorsLoading } = useQuery({
    queryKey: ['available-doctors', date],
    queryFn: async () => {
      const res = await api.get('/api/doctor-schedules/available-doctors', { params: { date } });
      return res.data;
    },
    enabled: !!date,
    staleTime: 30 * 1000,
  });

  const { data: slotData, isLoading: slotsLoading } = useQuery({
    queryKey: ['available-slots', doctorId, date],
    queryFn: async () => {
      const res = await api.get('/api/doctor-schedules/available-slots', { params: { doctorId, date } });
      return res.data;
    },
    enabled: !!doctorId && !!date,
    staleTime: 0, // slots change as others book - always refetch when opened
  });

  // Let the booking form know the selected doctor's fee so it can offer to collect it on the spot.
  useEffect(() => {
    if (onFeeChange) onFeeChange(doctorId ? slotData?.consultationFee || 0 : 0);
  }, [doctorId, slotData?.consultationFee]);

  const search = doctorSearch.trim().toLowerCase();
  const filteredDoctors = doctors.filter(
    (d) => !search || d.name?.toLowerCase().includes(search) || d.department?.toLowerCase().includes(search)
  );
  const slots = slotData?.slots || [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
          Select Doctor *
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by doctor name or department..."
            value={doctorSearch}
            onChange={(e) => setDoctorSearch(e.target.value)}
            className="pl-9 h-10"
            disabled={disabled}
          />
        </div>

        <div className="max-h-40 overflow-y-auto border border-border rounded-lg bg-card p-1 space-y-0.5">
          {doctorsLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding doctors on duty...
            </div>
          ) : doctors.length === 0 ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <CalendarX2 className="h-3.5 w-3.5" /> No doctors have working hours on this date.
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No doctor matches &ldquo;{doctorSearch}&rdquo;.</div>
          ) : (
            filteredDoctors.map((d) => {
              const selected = String(d.id) === String(doctorId);
              return (
                <button
                  type="button"
                  key={d.id}
                  disabled={disabled}
                  onClick={() => {
                    onDoctorChange(String(d.id));
                    onTimeChange('');
                  }}
                  className={`w-full flex items-center justify-between gap-2 p-2 rounded text-xs text-left transition-colors hover:bg-accent ${
                    selected ? 'bg-primary/10 text-primary' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Stethoscope className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="min-w-0">
                      <span className="font-semibold text-foreground block truncate">{doctorName(d.name)}</span>
                      {d.department && <span className="text-muted-foreground block truncate">{d.department}</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-medium text-muted-foreground">
                      {d.consultationFee > 0 ? formatCurrency(d.consultationFee) : 'No fee'}
                    </span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {errors.doctorId && <p className="text-xs text-destructive">{errors.doctorId.message}</p>}
      </div>

      {doctorId && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center justify-between">
            <span>Available Time Slots *</span>
            {slotData?.consultationFee > 0 && (
              <span className="normal-case tracking-normal font-medium text-muted-foreground">
                Consultation fee: <span className="font-bold text-foreground">{formatCurrency(slotData.consultationFee)}</span>
              </span>
            )}
          </label>
          {slotsLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading open slots...
            </div>
          ) : slots.length === 0 ? (
            <div className="p-3 rounded-lg border border-warning/30 bg-warning/10 text-xs text-warning-foreground font-medium">
              {slotData?.message || 'No open slots for this doctor on this date.'}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {slots.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  disabled={disabled}
                  onClick={() => onTimeChange(slot)}
                  className={`h-9 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                    time === slot
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <Clock className="h-3 w-3 opacity-70" />
                  {formatSlotTime(slot)}
                </button>
              ))}
            </div>
          )}
          {errors.time && <p className="text-xs text-destructive">{errors.time.message}</p>}
        </div>
      )}
    </div>
  );
}
