import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  CalendarDays,
  Plus,
  Stethoscope,
  Clock,
  Calendar,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Printer,
  LogIn,
  Users,
  XCircle,
  Radio,
} from 'lucide-react';
import api, { openPdf } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { SlotPicker } from '@/components/hospital/SlotPicker';
import { formatCurrency, formatSlotTime, doctorName, localDateStr } from '@/lib/utils';

const bookingSchema = z.object({
  doctorId: z.string().min(1, 'Please select a doctor'),
  date: z.string().min(1, 'Please select a valid date'),
  time: z.string().min(1, 'Please pick one of the available time slots'),
  reason: z.string().optional(),
});

const printSlip = (appointmentId) =>
  openPdf(`/api/appointments/${appointmentId}/slip-pdf`).catch(() => toast.error('Could not open the token slip.'));

// Mirrors CHECK_IN_GRACE_MINUTES in appointmentController.js - the backend is the real gate,
// this just decides when to show the button so patients aren't tapping it hours too early.
const CHECK_IN_GRACE_MINUTES = 30;

// "N patients ahead" is only useful while it's fresh: poll every 15s, and never in a
// hidden tab (a background portal tab has no reason to query the queue).
const LIVE_STATUS_INTERVAL_MS = 15 * 1000;
const liveStatusInterval = () =>
  document.visibilityState === 'visible' ? LIVE_STATUS_INTERVAL_MS : false;

function canCheckInNow(apt) {
  if (apt.status !== 'scheduled') return false;
  const now = new Date();
  const nowDateStr = localDateStr(now);
  if (apt.date !== nowDateStr) return false;
  if (!apt.time) return true;
  const match = /^(\d{2}):(\d{2})$/.exec(apt.time);
  if (!match) return true;
  const apptMinutes = Number(match[1]) * 60 + Number(match[2]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= apptMinutes - CHECK_IN_GRACE_MINUTES;
}

/** Cancelling is only possible before arrival, and never for a past date (same rule as the server). */
function canCancel(apt) {
  return apt.status === 'scheduled' && apt.date >= localDateStr();
}

export default function PatientAppointments() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('upcoming'); // 'upcoming' | 'past' | 'all'
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [lastBooked, setLastBooked] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      doctorId: '',
      date: localDateStr(),
      time: '',
      reason: '',
    },
  });
  const bookingDate = watch('date');
  const bookingDoctorId = watch('doctorId');
  const bookingTime = watch('time');

  const {
    data: appointments = [],
    isLoading: isAppointmentsLoading,
    isError: isAppointmentsError,
    error: appointmentsError,
    refetch: refetchAppointments,
    isRefetching,
  } = useQuery({
    queryKey: ['patient-appointments-mine'],
    queryFn: async () => {
      const res = await api.get('/api/appointments/mine');
      return res.data;
    },
  });

  // Today's live position: how many checked-in patients are ahead, the token the doctor is
  // serving right now, and an estimate from the hospital's average consultation minutes.
  // Also carries allowPatientSelfCheckIn, so the button below follows the hospital setting.
  const { data: live } = useQuery({
    queryKey: ['patient-live-status'],
    queryFn: async () => {
      const res = await api.get('/api/appointments/mine/live');
      return res.data;
    },
    staleTime: 0,
    refetchInterval: liveStatusInterval,
    refetchIntervalInBackground: false,
  });

  const selfCheckInAllowed = live?.selfCheckInAllowed === true;

  const bookMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/api/appointments/book-mine', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient-appointments-mine'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      setIsBookModalOpen(false);
      reset();
      setLastBooked(data);
      toast.success(`Appointment confirmed! Your token number is #${data.tokenNumber}`, {
        description: `Date: ${data.date} at ${formatSlotTime(data.time)}`,
        duration: 6000,
      });
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to schedule appointment.';
      toast.error(message);
      if (err.response?.status === 409) {
        setValue('time', '');
        queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      }
    },
  });

  const onSubmitBooking = (data) => {
    bookMutation.mutate(data);
  };

  const checkInMutation = useMutation({
    mutationFn: async (appointmentId) => {
      const res = await api.patch(`/api/appointments/${appointmentId}/status`, { status: 'checked_in' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-appointments-mine'] });
      queryClient.invalidateQueries({ queryKey: ['patient-live-status'] });
      toast.success('Checked in! Please wait to be called.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to check in.');
    },
  });

  // Patients may cancel their own appointment only while it is still "scheduled" and not
  // in the past - the server enforces both, this is just the UI path.
  const cancelMutation = useMutation({
    mutationFn: async (appointmentId) => {
      const res = await api.patch(`/api/appointments/${appointmentId}/status`, { status: 'cancelled' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-appointments-mine'] });
      queryClient.invalidateQueries({ queryKey: ['patient-live-status'] });
      setCancelTarget(null);
      toast.success('Appointment cancelled.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not cancel the appointment.');
    },
  });

  const todayStr = localDateStr();

  const filteredAppointments = useMemo(() => {
    const list = Array.isArray(appointments) ? appointments : [];
    if (filter === 'upcoming') {
      return list.filter((apt) => apt.date >= todayStr && apt.status !== 'cancelled');
    }
    if (filter === 'past') {
      return list.filter((apt) => apt.date < todayStr || apt.status === 'completed' || apt.status === 'cancelled');
    }
    return list;
  }, [appointments, filter, todayStr]);

  const getStatusDisplay = (status) => {
    const map = {
      scheduled: 'Scheduled',
      checked_in: 'Checked In',
      in_consultation: 'In Consultation',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
    };
    return map[status] || status;
  };

  // One line the patient can read at a glance, straight from the live payload.
  const liveHeadline = (() => {
    const apt = live?.appointment;
    if (!apt) return '';
    if (apt.status === 'in_consultation') return "It's your turn - please go in to the doctor.";
    if (apt.status === 'completed') return 'Your consultation is complete.';
    if (apt.status === 'checked_in') {
      if (live.patientsAhead === 0) return "You're next - please stay close to the room.";
      return `${live.patientsAhead} patient${live.patientsAhead === 1 ? '' : 's'} ahead of you.`;
    }
    return 'Not checked in yet.';
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <CalendarDays className="h-7 w-7 text-primary" />
            My Appointments
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Book consultations with hospital doctors, track your OPD token numbers, and view visit status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAppointments()}
            disabled={isRefetching}
            className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setIsBookModalOpen(true)}
            className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5 shadow-sm text-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Book Appointment</span>
          </Button>
        </div>
      </div>

      {lastBooked && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-between gap-3 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">
                Your latest appointment token is <span className="text-primary font-mono text-base">#{lastBooked.tokenNumber}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {lastBooked.bill
                  ? `Consultation fee of ${formatCurrency(lastBooked.bill.totalAmount)} is payable at reception. `
                  : ''}
                Please arrive 15 minutes before your {formatSlotTime(lastBooked.time)} slot.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => printSlip(lastBooked._id)}
              className="text-xs h-8"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Slip
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastBooked(null)}
              className="text-xs text-muted-foreground hover:text-foreground h-8"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {live?.appointment && (
        <Card className="overflow-hidden border-primary/25 bg-card shadow-soft">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-[74px] w-[74px] shrink-0 flex-col items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
                <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Your token</span>
                <span className="font-mono text-2xl font-extrabold leading-none text-primary">
                  {live.appointment.tokenNumber}
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Radio className="h-3.5 w-3.5 animate-pulse" />
                  Live queue · updates every 15s
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {doctorName(live.appointment.doctor?.name, 'Your doctor')}
                  {live.appointment.doctor?.department ? ` · ${live.appointment.doctor.department}` : ''}
                  {live.appointment.time ? ` · ${formatSlotTime(live.appointment.time)}` : ''}
                </div>
                <div className="text-sm font-semibold text-foreground">{liveHeadline}</div>
                {live.appointment.status === 'checked_in' && live.estimatedWaitMinutes !== null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Estimated wait ~{live.estimatedWaitMinutes} min
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Now serving
                </div>
                <div className="font-mono text-2xl font-extrabold leading-none text-foreground">
                  {live.nowServingToken ?? '—'}
                </div>
              </div>
              {live.appointment.status === 'checked_in' && live.patientsAhead !== null && (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Users className="h-2.5 w-2.5" />
                    Ahead
                  </div>
                  <div className="font-mono text-2xl font-extrabold leading-none text-foreground">
                    {live.patientsAhead}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="border-border bg-card shadow-soft overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('upcoming')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === 'upcoming'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Upcoming ({appointments.filter((a) => a.date >= todayStr && a.status !== 'cancelled').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('past')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === 'past'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Past Visits
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({appointments.length})
            </button>
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            Showing <span className="font-bold text-foreground">{filteredAppointments.length}</span> appointments
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {isAppointmentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-muted/20 animate-pulse space-y-2">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-3 w-60 bg-muted/60 rounded" />
                </div>
              ))}
            </div>
          ) : isAppointmentsError ? (
            <div className="py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h3 className="text-base font-bold text-foreground">Could not load appointments</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                {appointmentsError?.response?.data?.message || 'Server error while fetching appointments.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchAppointments()}>
                Try Again
              </Button>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="py-12 sm:py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                {filter === 'upcoming' ? 'No upcoming appointments' : 'No appointment records found'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto mb-4">
                {filter === 'upcoming'
                  ? 'You do not have any future consultations scheduled. Book a slot whenever you need to see a doctor.'
                  : 'Your past and completed doctor appointments will be recorded here.'}
              </p>
              {filter === 'upcoming' && (
                <Button
                  onClick={() => setIsBookModalOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Book Now
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAppointments.map((apt) => (
                <div
                  key={apt._id}
                  className="p-4 rounded-xl border border-border bg-muted/15 hover:border-border/80 transition-all space-y-3 shadow-soft-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold shrink-0">
                        <Stethoscope className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">
                          {doctorName(apt.doctorId?.name, 'Assigned Specialist')}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {apt.doctorId?.department || 'General Medicine'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold text-muted-foreground block uppercase">OPD Token</span>
                      <span className="font-mono text-sm font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                        #{apt.tokenNumber || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        {new Date(apt.date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {apt.time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatSlotTime(apt.time)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant={apt.status}>
                        {getStatusDisplay(apt.status)}
                      </Badge>
                      {apt.status !== 'cancelled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Download token slip"
                          onClick={() => printSlip(apt._id)}
                          className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {apt.reason && (
                    <div className="text-xs text-muted-foreground bg-card/60 p-2.5 rounded-lg border border-border/40">
                      <span className="font-semibold text-foreground/80">Reason:</span> {apt.reason}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {canCheckInNow(apt) &&
                      (selfCheckInAllowed ? (
                        <Button
                          size="sm"
                          onClick={() => checkInMutation.mutate(apt._id)}
                          disabled={checkInMutation.isPending}
                          className="h-8 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                        >
                          <LogIn className="mr-1.5 h-3.5 w-3.5" />
                          {checkInMutation.isPending ? 'Checking In...' : 'Check In Now'}
                        </Button>
                      ) : (
                        live && (
                          <div className="flex flex-1 items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Self check-in is off for this hospital - please check in at the reception desk.
                          </div>
                        )
                      ))}
                    {canCancel(apt) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelTarget(apt)}
                        disabled={cancelMutation.isPending}
                        className="h-8 shrink-0 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Cancel appointment
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isBookModalOpen}
        onClose={() => {
          if (!bookMutation.isPending) setIsBookModalOpen(false);
        }}
        title="Book Doctor Appointment"
        description="Pick a date, a doctor on duty that day, and one of their open slots. An OPD token number is issued immediately."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBookModalOpen(false)}
              disabled={bookMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="patient-book-appointment-form"
              disabled={bookMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {bookMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Token...
                </>
              ) : (
                'Confirm & Issue Token'
              )}
            </Button>
          </>
        }
      >
        <form id="patient-book-appointment-form" onSubmit={handleSubmit(onSubmitBooking)} className="space-y-4">
          {/* Date first - it decides which doctors are on duty */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Appointment Date *
            </label>
            <Input
              type="date"
              min={todayStr}
              value={bookingDate}
              onChange={(e) => {
                setValue('date', e.target.value, { shouldValidate: true });
                setValue('doctorId', '');
                setValue('time', '');
              }}
              disabled={bookMutation.isPending}
              className={errors.date ? 'border-destructive' : ''}
            />
            {errors.date && (
              <p className="text-xs text-destructive font-medium mt-1">
                {errors.date.message}
              </p>
            )}
          </div>

          <SlotPicker
            date={bookingDate}
            doctorId={bookingDoctorId}
            time={bookingTime}
            onDoctorChange={(id) => setValue('doctorId', id, { shouldValidate: true })}
            onTimeChange={(t) => setValue('time', t, { shouldValidate: !!t })}
            disabled={bookMutation.isPending}
            errors={errors}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Reason / Symptoms <span className="text-muted-foreground font-normal lowercase">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Regular checkup, persistent fever, headache..."
              {...register('reason')}
              disabled={bookMutation.isPending}
            />
          </div>

        </form>
      </Modal>

      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={() => {
          if (!cancelMutation.isPending) setCancelTarget(null);
        }}
        title="Cancel this appointment?"
        description={
          cancelTarget
            ? `${doctorName(cancelTarget.doctorId?.name, 'Doctor')} · ${new Date(
                `${cancelTarget.date}T00:00:00`
              ).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${
                cancelTarget.time ? ` · ${formatSlotTime(cancelTarget.time)}` : ''
              }`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelMutation.isPending}
            >
              Keep appointment
            </Button>
            <Button
              type="button"
              onClick={() => cancelMutation.mutate(cancelTarget._id)}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Yes, cancel it'
              )}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Your appointment will be cancelled and the doctor's slot freed up for another patient. You can
          book a new appointment afterwards - that slot may already be taken by then.
        </p>
      </Modal>
    </div>
  );
}
