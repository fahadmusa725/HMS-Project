import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
  Play,
  Check,
  UserCheck,
  Stethoscope,
  Ticket,
  FileText,
  Printer,
  XCircle,
  UserX,
  Megaphone,
  Plus,
  Star,
  TriangleAlert,
  Tv,
  Activity,
  ClipboardList,
} from 'lucide-react';
import api, { openPdf } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import ConsultationForm from '@/components/hospital/ConsultationForm';
import StaffVitalsModal from '@/components/precheck/StaffVitalsModal';
import WalkInTokenModal from '@/components/hospital/WalkInTokenModal';
import { SlotPicker } from '@/components/hospital/SlotPicker';
import { cn, formatCurrency, formatSlotTime, localDateStr } from '@/lib/utils';

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Please select a patient'),
  doctorId: z.string().min(1, 'Please select a doctor'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Please pick one of the available time slots'),
  reason: z.string().optional(),
});

// Mirrors STATUS_TRANSITION_ROLES in the backend's appointmentController - the
// server enforces it, this just hides buttons a role would get a 403 for.
const STATUS_TRANSITION_ROLES = {
  checked_in: ['receptionist', 'hospital_admin'],
  cancelled: ['receptionist', 'hospital_admin', 'doctor'],
  no_show: ['receptionist', 'hospital_admin'],
  in_consultation: ['nurse', 'doctor', 'hospital_admin', 'receptionist'],
  completed: ['doctor'],
};

// Priority controls who is called next (see utils/queueOrder.js on the server).
// Patients are deliberately absent - only staff may change it.
const CAN_SET_PRIORITY = ['receptionist', 'hospital_admin', 'doctor'];

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal', hint: 'Standard arrival order' },
  { value: 'senior', label: 'Senior', hint: 'Elderly or mobility-limited patient' },
  { value: 'emergency', label: 'Emergency', hint: 'Called ahead of everyone else' },
];

const PRIORITY_CHIP = {
  normal: 'bg-muted text-muted-foreground border-border',
  senior: 'bg-info/10 text-info border-info/30',
  emergency: 'bg-destructive/10 text-destructive border-destructive/30',
};

// Live queue polling: 12s while the tab is visible, never in the background.
// Returning false stops the interval entirely instead of polling a hidden tab.
const LIVE_QUEUE_INTERVAL_MS = 12 * 1000;
const liveQueueInterval = () => (document.visibilityState === 'visible' ? LIVE_QUEUE_INTERVAL_MS : false);

export default function AppointmentsQueue() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const role = user?.role;
  const isDoctor = role === 'doctor';
  const canBook = role === 'hospital_admin' || role === 'receptionist';
  const canWalkIn = role === 'hospital_admin' || role === 'receptionist';
  const canSetPriority = CAN_SET_PRIORITY.includes(role);
  const canCallNext = ['doctor', 'hospital_admin', 'receptionist'].includes(role);
  // Mirrors the roles allowed on GET /api/appointments/display-link (the queue audience).
  const canOpenDisplay = ['hospital_admin', 'receptionist', 'doctor', 'nurse'].includes(role);
  // Desk vitals: the same roles the pre-check API lets record them.
  const canRecordVitals = ['hospital_admin', 'receptionist', 'nurse', 'doctor'].includes(role);
  const can = (status) => STATUS_TRANSITION_ROLES[status]?.includes(role);

  const todayStr = localDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [doctorFilter, setDoctorFilter] = useState(isDoctor ? user?.id : 'all');
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isWalkInOpen, setIsWalkInOpen] = useState(false);
  const [priorityTarget, setPriorityTarget] = useState(null);
  const [priorityDraft, setPriorityDraft] = useState({ priority: 'normal', reason: '' });
  const [callNextDoctorId, setCallNextDoctorId] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [consultationAppointment, setConsultationAppointment] = useState(null);
  const [vitalsTarget, setVitalsTarget] = useState(null);
  const [formError, setFormError] = useState(null);
  const [consultationFee, setConsultationFee] = useState(0);
  const [collectPaymentNow, setCollectPaymentNow] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');

  // Deep link from the dashboard quick actions (`?book=1`). Opening is derived from the URL
  // instead of an effect, and the param is cleared on close so it does not reopen.
  const [searchParams, setSearchParams] = useSearchParams();
  const bookDeepLink = searchParams.get('book') === '1';
  const closeBookDeepLink = () => {
    if (!bookDeepLink) return;
    const next = new URLSearchParams(searchParams);
    next.delete('book');
    setSearchParams(next, { replace: true });
  };

  const REFERENCE_REQUIRED_METHODS = ['jazzcash', 'easypaisa', 'bank_transfer'];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patientId: '',
      doctorId: '',
      date: todayStr,
      time: '',
      reason: '',
    },
  });

  const selectedPatientId = watch('patientId');
  const bookingDate = watch('date');
  const bookingDoctorId = watch('doctorId');
  const bookingTime = watch('time');

  const { data: staffList = [] } = useQuery({
    queryKey: ['doctors-list'],
    queryFn: async () => {
      const response = await api.get('/api/appointments/doctors');
      return response.data;
    },
    enabled: !isDoctor,
  });

  const { data: patientSearchResults = { patients: [] } } = useQuery({
    queryKey: ['booking-patient-search', patientSearch],
    queryFn: async () => {
      if (!patientSearch.trim()) return { patients: [] };
      const response = await api.get('/api/patients', {
        params: { search: patientSearch, limit: 8 },
      });
      return response.data;
    },
    enabled: (isBookOpen || bookDeepLink) && patientSearch.trim().length > 0,
  });

  const {
    data: queue = [],
    isLoading,
    isError,
    error: queryError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['opd-queue', selectedDate, isDoctor ? user?.id : doctorFilter],
    queryFn: async () => {
      const params = { date: selectedDate };
      const targetDoc = isDoctor ? user?.id : doctorFilter;
      if (targetDoc && targetDoc !== 'all') {
        params.doctorId = targetDoc;
      }
      const response = await api.get('/api/appointments/queue', { params });
      return response.data;
    },
    // A waiting-room queue is live by definition - always refetch on mount, then poll
    // every 12s while the tab is visible (overrides the global 30s staleTime).
    staleTime: 0,
    refetchInterval: liveQueueInterval,
    refetchIntervalInBackground: false,
  });

  // Waiting-room TV link. Only staff who work the queue may read the key, and the server
  // never creates one here - that stays an explicit admin action in Hospital Settings.
  const { data: displayLink } = useQuery({
    queryKey: ['queue-display-link'],
    queryFn: async () => {
      const response = await api.get('/api/appointments/display-link');
      return response.data;
    },
    enabled: canOpenDisplay,
    staleTime: 5 * 60 * 1000,
  });

  const openTvDisplay = () => {
    if (!displayLink?.displayPath) {
      toast.info('The waiting-room display is not set up yet.', {
        description: 'A hospital admin can create it under Settings > Waiting room display.',
      });
      return;
    }
    window.open(`${window.location.origin}${displayLink.displayPath}`, '_blank', 'noopener');
  };

  const bookMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await api.post('/api/appointments', formData);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      setIsBookOpen(false);
      closeBookDeepLink();
      reset();
      setPatientSearch('');
      setFormError(null);
      setConsultationFee(0);
      setCollectPaymentNow(false);
      setPaymentAmount(0);
      setPaymentReference('');
      const feeText = data.bill
        ? data.bill.paymentStatus === 'paid'
          ? ` Consultation fee ${formatCurrency(data.bill.totalAmount)} collected in full.`
          : data.bill.amountPaid > 0
            ? ` Consultation fee ${formatCurrency(data.bill.totalAmount)} billed (${formatCurrency(data.bill.amountPaid)} collected, balance due).`
            : ` Consultation fee ${formatCurrency(data.bill.totalAmount)} billed (unpaid).`
        : '';
      toast.success(`Token #${data.tokenNumber} assigned successfully!`, {
        description: `Appointment booked for ${data.date} at ${formatSlotTime(data.time)}.${feeText}`,
        action: { label: 'Print slip', onClick: () => printSlip(data._id) },
        duration: 8000,
      });
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to book appointment.';
      setFormError(message);
      toast.error(message);
      // A 409 means the slot was taken in the meantime - refresh the grid so it disappears.
      if (err.response?.status === 409) {
        setValue('time', '');
        queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      }
    },
  });

  const printSlip = (appointmentId) => {
    openPdf(`/api/appointments/${appointmentId}/slip-pdf`).catch(() => toast.error('Could not open the token slip.'));
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, tokenNumber }) => {
      const response = await api.patch(`/api/appointments/${id}/status`, { status });
      return { ...response.data, prevToken: tokenNumber };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      const statusText = data.status.replace('_', ' ');
      toast.success(`Token #${data.tokenNumber || data.prevToken} marked as "${statusText}"`);
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to update status.';
      toast.error(message);
    },
  });

  // Only staff may change priority, and the server audits every change with a reason.
  const priorityMutation = useMutation({
    mutationFn: async ({ id, priority, reason }) => {
      const res = await api.patch(`/api/appointments/${id}/priority`, {
        priority,
        priorityReason: priority === 'normal' ? undefined : reason.trim(),
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      setPriorityTarget(null);
      toast.success(`Token #${data.tokenNumber} priority set to "${data.priority}"`, {
        description: data.priorityReason || undefined,
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not update priority.');
    },
  });

  // Takes the next waiting patient (priority -> check-in time -> token) and moves them
  // into the consultation. The server refuses when the doctor is already with someone.
  const callNextMutation = useMutation({
    mutationFn: async (doctorId) => {
      const res = await api.post('/api/appointments/call-next', doctorId ? { doctorId } : {});
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      setCallNextDoctorId(null);
      toast.success(`Now serving token #${data.tokenNumber}`, {
        description: data.patientId?.name ? `${data.patientId.name} has been called in.` : 'Patient called in.',
      });
    },
    onError: (err) => {
      setCallNextDoctorId(null);
      toast.error(err.response?.data?.message || 'Could not call the next patient.');
    },
  });

  const openPriorityModal = (appointment) => {
    setPriorityDraft({
      priority: appointment.suggestedPriority || appointment.priority || 'normal',
      reason: appointment.priorityReason || '',
    });
    setPriorityTarget(appointment);
  };

  const submitPriority = (e) => {
    e.preventDefault();
    if (!priorityTarget) return;
    if (priorityDraft.priority !== 'normal' && !priorityDraft.reason.trim()) {
      toast.error('A reason is required for senior or emergency priority.');
      return;
    }
    priorityMutation.mutate({ id: priorityTarget._id, ...priorityDraft });
  };

  // The room the "Call next" button acts on: a doctor's own room, or the doctor the
  // front desk has filtered the queue to (never "all" - we can't guess who is free).
  const activeRoomId = isDoctor ? user?.id : doctorFilter !== 'all' ? doctorFilter : null;
  const activeRoomName =
    staffList.find((doc) => String(doc._id) === String(activeRoomId))?.name ||
    (isDoctor ? user?.name : null);
  const nowServing = queue.find((item) => item.status === 'in_consultation') || null;
  const waitingCount = queue.filter((item) => item.status === 'checked_in').length;

  const closeBookModal = () => {
    setIsBookOpen(false);
    closeBookDeepLink();
    setConsultationFee(0);
    setCollectPaymentNow(false);
    setPaymentAmount(0);
    setPaymentReference('');
  };

  const onSubmitBook = (values) => {
    setFormError(null);
    if (collectPaymentNow && paymentAmount > 0 && REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !paymentReference.trim()) {
      setFormError('A transaction/reference number is required for this payment method.');
      return;
    }
    bookMutation.mutate({
      ...values,
      paymentMethod: collectPaymentNow && paymentAmount > 0 ? paymentMethod : undefined,
      paymentAmount: collectPaymentNow ? paymentAmount : undefined,
      referenceNumber: collectPaymentNow && paymentAmount > 0 ? paymentReference : undefined,
    });
  };

  const handleStatusChange = (id, newStatus, tokenNumber) => {
    statusMutation.mutate({ id, status: newStatus, tokenNumber });
  };

  // Helper for quick-action buttons - each one only renders for roles the backend allows
  const renderActionButtons = (appointment) => {
    const { _id, status, tokenNumber } = appointment;
    const isOwnPatient = String(appointment.doctorId?._id) === String(user?.id);
    const busy = statusMutation.isPending;
    const buttons = [];

    const cancelButton = can('cancelled') && (!isDoctor || isOwnPatient) && (
      <Button
        key="cancel"
        size="sm"
        variant="ghost"
        title="Cancel appointment"
        onClick={() => handleStatusChange(_id, 'cancelled', tokenNumber)}
        disabled={busy}
        className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <XCircle className="h-3.5 w-3.5" />
      </Button>
    );

    switch (status) {
      case 'scheduled':
        if (can('checked_in')) {
          buttons.push(
            <Button
              key="checkin"
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange(_id, 'checked_in', tokenNumber)}
              disabled={busy}
              className="h-8 text-xs font-semibold text-primary hover:bg-primary/10 hover:border-primary/40 flex items-center gap-1"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Check In
            </Button>
          );
        }
        if (can('no_show')) {
          buttons.push(
            <Button
              key="noshow"
              size="sm"
              variant="ghost"
              title="Mark as no-show"
              onClick={() => handleStatusChange(_id, 'no_show', tokenNumber)}
              disabled={busy}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <UserX className="h-3.5 w-3.5" />
            </Button>
          );
        }
        buttons.push(cancelButton);
        break;
      case 'checked_in':
        if (can('in_consultation')) {
          buttons.push(
            <Button
              key="start"
              size="sm"
              onClick={() => handleStatusChange(_id, 'in_consultation', tokenNumber)}
              disabled={busy}
              className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1 shadow-sm"
            >
              <Play className="h-3 w-3 fill-current" />
              {isDoctor ? 'Call In' : 'Send In'}
            </Button>
          );
        }
        buttons.push(cancelButton);
        break;
      case 'in_consultation':
        // Only the doctor closes a consultation - everyone else just sees where the patient is.
        if (can('completed') && isOwnPatient) {
          buttons.push(
            <Button
              key="record"
              size="sm"
              onClick={() => setConsultationAppointment(appointment)}
              disabled={busy}
              className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 shadow-sm"
            >
              <FileText className="h-3.5 w-3.5" />
              Record Consultation
            </Button>,
            <Button
              key="complete"
              size="sm"
              variant="outline"
              title="Mark complete without recording notes"
              onClick={() => handleStatusChange(_id, 'completed', tokenNumber)}
              disabled={busy}
              className="h-8 text-xs font-semibold text-primary hover:bg-primary/10 flex items-center gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              Complete
            </Button>
          );
        } else {
          buttons.push(
            <span key="with-doctor" className="text-xs font-medium text-muted-foreground">
              With doctor
            </span>
          );
        }
        break;
      case 'completed':
        buttons.push(
          <span key="done" className="text-xs font-medium text-muted-foreground">
            Consultation done
          </span>
        );
        break;
      case 'cancelled':
        buttons.push(
          <span key="cancelled" className="text-xs font-medium text-destructive">
            Cancelled
          </span>
        );
        break;
      case 'no_show':
        buttons.push(
          <span key="noshow-label" className="text-xs font-medium text-muted-foreground">
            Did not arrive
          </span>
        );
        break;
      default:
        break;
    }

    return (
      <div className="flex items-center justify-end gap-1.5">
        {buttons}
        {canSetPriority && !['completed', 'cancelled', 'no_show'].includes(status) && (
          <Button
            size="sm"
            variant="ghost"
            title="Set queue priority"
            onClick={() => openPriorityModal(appointment)}
            disabled={busy}
            className={cn(
              'h-8 px-2 hover:text-foreground',
              (appointment.priority || 'normal') === 'normal'
                ? 'text-muted-foreground'
                : 'text-info'
            )}
          >
            <Star className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRecordVitals && !['cancelled', 'no_show'].includes(status) && (
          <Button
            size="sm"
            variant="ghost"
            title={
              appointment.preCheck?.staffVitalsRecorded
                ? 'Desk vitals recorded - update them'
                : 'Record vitals at the desk'
            }
            onClick={() => setVitalsTarget(appointment)}
            disabled={busy}
            className={cn(
              'h-8 px-2',
              appointment.preCheck?.staffVitalsRecorded
                ? 'text-success hover:text-success'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Activity className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          title="Print token slip"
          onClick={() => printSlip(_id)}
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
        >
          <Printer className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Appointments &amp; Live OPD Queue
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage live patient arrival tokens, appointments, and consultation queues.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-10 px-3 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canOpenDisplay && (
            <Button
              variant="outline"
              size="sm"
              onClick={openTvDisplay}
              title="Open the waiting-room TV screen"
              className="h-10 px-3 text-muted-foreground hover:text-foreground"
            >
              <Tv className="h-4 w-4 mr-2" />
              TV display
            </Button>
          )}
          {canCallNext && activeRoomId && selectedDate === todayStr && (
            <Button
              onClick={() => setCallNextDoctorId(activeRoomId)}
              disabled={callNextMutation.isPending}
              className="h-10 bg-primary-bright text-primary-bright-foreground hover:bg-primary-bright/90 font-semibold flex items-center gap-2 shadow-sm"
            >
              <Megaphone className="h-4 w-4" />
              <span>Call next</span>
            </Button>
          )}
          {canWalkIn && (
            <Button
              variant="outline"
              onClick={() => setIsWalkInOpen(true)}
              className="h-10 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-semibold flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Walk-in</span>
            </Button>
          )}
          {canBook && (
            <Button
              onClick={() => {
                setFormError(null);
                setIsBookOpen(true);
              }}
              className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 shadow-sm"
            >
              <Calendar className="h-4 w-4" />
              <span>Book Appointment</span>
            </Button>
          )}
        </div>
      </div>

      {selectedDate === todayStr && activeRoomId && (
        <Card className="border-border bg-card shadow-soft-sm p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
                <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Now</span>
                <span className="font-mono text-2xl font-extrabold leading-none text-primary">
                  {nowServing ? nowServing.tokenNumber : '—'}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">
                  {nowServing ? 'In consultation' : 'Room is free'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeRoomName || 'This doctor'} ·{' '}
                  <span className="font-semibold text-foreground">{waitingCount}</span> waiting ·
                  updates every 12s
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Ticket className="h-3.5 w-3.5 text-primary" />
              Tokens reset per doctor, per day
            </div>
          </div>
        </Card>
      )}

      <Card className="bg-card border-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Date:
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-9 w-40 bg-card border-border text-xs font-medium"
              />
            </div>

            {!isDoctor && staffList.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Doctor:
                </label>
                <select
                  value={doctorFilter}
                  onChange={(e) => setDoctorFilter(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="all">All Doctors</option>
                  {staffList.map((doc) => (
                    <option key={doc._id} value={doc._id}>
                      {doc.name} {doc.department ? `(${doc.department})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            Active Tokens Today:{' '}
            <span className="font-bold text-foreground">{queue.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border/40 animate-pulse">
                  <div className="h-8 w-14 bg-muted rounded"></div>
                  <div className="space-y-2">
                    <div className="h-4 w-40 bg-muted rounded"></div>
                    <div className="h-3 w-24 bg-muted/60 rounded"></div>
                  </div>
                  <div className="h-6 w-20 bg-muted rounded-full"></div>
                  <div className="h-8 w-24 bg-muted rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h3 className="text-base font-bold text-foreground">Error loading OPD queue</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                {queryError?.message || 'Could not fetch appointment queue.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : queue.length === 0 ? (
            <div className="p-12 sm:p-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Ticket className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                No patients in queue for this date
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-6">
                {selectedDate === todayStr
                  ? 'There are no appointments scheduled in the OPD queue today.'
                  : `No appointments found for ${new Date(selectedDate).toLocaleDateString()}.`}
              </p>
              {canBook && (
                <Button
                  onClick={() => {
                    setFormError(null);
                    setIsBookOpen(true);
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Book Appointment Now
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3.5 px-6">Token #</th>
                  <th className="py-3.5 px-6">Patient</th>
                  <th className="py-3.5 px-4">Doctor</th>
                  <th className="py-3.5 px-4">Time / Reason</th>
                  <th className="py-3.5 px-4">OPD Fee</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.map((item) => (
                  <tr key={item._id} className="hover:bg-accent/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-base text-primary font-mono shadow-soft-sm">
                        {item.tokenNumber}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <span className="truncate">{item.patientId?.name || 'Patient'}</span>
                        {(item.priority || 'normal') !== 'normal' && (
                          <span
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              PRIORITY_CHIP[item.priority]
                            )}
                            title={item.priorityReason || ''}
                          >
                            {item.priority === 'emergency' ? (
                              <TriangleAlert className="h-2.5 w-2.5" />
                            ) : (
                              <Star className="h-2.5 w-2.5" />
                            )}
                            {item.priority}
                          </span>
                        )}
                      </div>
                      {/* Why this patient is ahead of the queue - kept on screen, not just in a tooltip. */}
                      {(item.priority || 'normal') !== 'normal' && item.priorityReason && (
                        <p
                          className="mt-1 max-w-[220px] truncate text-[11px] leading-snug text-muted-foreground"
                          title={item.priorityReason}
                        >
                          {item.priorityReason}
                        </p>
                      )}
                      <div className="mt-0.5 text-xs font-mono text-muted-foreground">
                        MRN: {item.patientId?.mrn || '—'}
                        {item.patientAge !== null && item.patientAge !== undefined && (
                          <span className="ml-1.5 font-sans">· {item.patientAge} yrs</span>
                        )}
                      </div>
                      {/* The patient filled in symptoms/vitals at home - worth knowing at the desk. */}
                      {item.preCheck?.submitted && (
                        <div className="mt-1">
                          <Badge
                            variant="precheck"
                            className="gap-1"
                            title="Patient submitted the digital pre-check before arriving"
                          >
                            <ClipboardList className="h-2.5 w-2.5" />
                            Pre-check done
                          </Badge>
                        </div>
                      )}
                      {/* Age only ever produces a suggestion - staff must confirm it (and give a reason). */}
                      {item.suggestedPriority && canSetPriority && (
                        <button
                          type="button"
                          onClick={() => openPriorityModal(item)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info transition-colors hover:bg-info/20"
                        >
                          <Star className="h-2.5 w-2.5" />
                          Suggested: {item.suggestedPriority} · confirm
                        </button>
                      )}
                    </td>

                    <td className="py-4 px-4 text-xs font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <Stethoscope className="h-3.5 w-3.5 text-primary" />
                        <span>{item.doctorId?.name || 'Assigned Doctor'}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-xs">
                      {/* Walk-ins have no slot time on purpose - they are seen in token order. */}
                      {item.time ? (
                        <div className="font-medium text-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatSlotTime(item.time)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 font-semibold text-primary" title="No appointment slot - seen in token order">
                          <Ticket className="h-3 w-3" />
                          Walk-in
                        </div>
                      )}
                      {item.reason && (
                        <div className="text-muted-foreground truncate max-w-[160px] mt-0.5">
                          {item.reason}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4 text-xs">
                      {item.bill ? (
                        <div className="space-y-1">
                          <div className="font-semibold text-foreground">{formatCurrency(item.bill.totalAmount)}</div>
                          <Badge variant={item.bill.paymentStatus}>{item.bill.paymentStatus}</Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      <Badge variant={item.status}>
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </td>

                    <td className="py-4 px-6 text-right">
                      {renderActionButtons(item)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isBookOpen || bookDeepLink}
        onClose={() => {
          if (!bookMutation.isPending) closeBookModal();
        }}
        title="Book OPD Appointment"
        description="Assign a daily token number and schedule a patient consultation."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={closeBookModal}
              disabled={bookMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="book-appointment-form"
              disabled={bookMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {bookMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                'Confirm & Assign Token'
              )}
            </Button>
          </>
        }
      >
        <form id="book-appointment-form" onSubmit={handleSubmit(onSubmitBook)} className="space-y-4">
          {formError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive animate-slide-up font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Select Patient *
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient by MRN or name..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {patientSearchResults.patients.length > 0 && (
              <div className="max-h-36 overflow-y-auto border border-border rounded-lg bg-card shadow-soft p-1 space-y-1 divide-y divide-border/40">
                {patientSearchResults.patients.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => {
                      setValue('patientId', p._id);
                      setPatientSearch(`${p.name} (${p.mrn})`);
                    }}
                    className={`p-2 rounded text-xs cursor-pointer hover:bg-accent flex items-center justify-between transition-colors ${
                      selectedPatientId === p._id ? 'bg-primary/10 font-bold text-primary' : ''
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-foreground">{p.name}</span>
                      <span className="text-muted-foreground ml-2">MRN: {p.mrn}</span>
                    </div>
                    {selectedPatientId === p._id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {errors.patientId && (
              <p className="text-xs text-destructive">{errors.patientId.message}</p>
            )}
          </div>

          {/* Date first - it decides which doctors are on duty */}
          <div className="space-y-1">
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
            />
          </div>

          <SlotPicker
            date={bookingDate}
            doctorId={bookingDoctorId}
            time={bookingTime}
            onDoctorChange={(id) => {
              setValue('doctorId', id, { shouldValidate: true });
              setCollectPaymentNow(false);
              setPaymentAmount(0);
              setPaymentReference('');
            }}
            onTimeChange={(t) => setValue('time', t, { shouldValidate: !!t })}
            onFeeChange={setConsultationFee}
            disabled={bookMutation.isPending}
            errors={errors}
          />

          {/* Collect the consultation fee right here instead of a separate trip to Billing */}
          {consultationFee > 0 && (
            <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-3">
              <label className="flex items-center gap-2 font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={collectPaymentNow}
                  onChange={(e) => {
                    setCollectPaymentNow(e.target.checked);
                    setPaymentAmount(e.target.checked ? consultationFee : 0);
                  }}
                  disabled={bookMutation.isPending}
                  className="h-4 w-4"
                />
                Collect payment now ({formatCurrency(consultationFee)} consultation fee)
              </label>

              {collectPaymentNow && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground block">Amount Paid Now (PKR)</label>
                    <Input
                      type="number"
                      min="0"
                      max={consultationFee}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)}
                      disabled={bookMutation.isPending}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground block">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      disabled={bookMutation.isPending}
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

                  {REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && (
                    <div className="space-y-1 col-span-2">
                      <label className="text-[11px] font-semibold text-muted-foreground block">
                        Transaction / Reference Number *
                      </label>
                      <Input
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="e.g. TXN12345678"
                        disabled={bookMutation.isPending}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Reason / Symptoms (Optional)
            </label>
            <Input
              placeholder="e.g. Regular Checkup, Flu symptoms"
              {...register('reason')}
              disabled={bookMutation.isPending}
            />
          </div>

        </form>
      </Modal>

      <Modal
        isOpen={Boolean(priorityTarget)}
        onClose={() => {
          if (!priorityMutation.isPending) setPriorityTarget(null);
        }}
        title="Queue priority"
        description={
          priorityTarget
            ? `Token #${priorityTarget.tokenNumber} · ${priorityTarget.patientId?.name || 'Patient'}`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPriorityTarget(null)}
              disabled={priorityMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="priority-form"
              disabled={priorityMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {priorityMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save priority'
              )}
            </Button>
          </>
        }
      >
        <form id="priority-form" onSubmit={submitPriority} className="space-y-4">
          {/* What the desk has on record right now - the same reason shown in the queue row. */}
          {priorityTarget && (priorityTarget.priority || 'normal') !== 'normal' && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    PRIORITY_CHIP[priorityTarget.priority]
                  )}
                >
                  {priorityTarget.priority === 'emergency' ? (
                    <TriangleAlert className="h-2.5 w-2.5" />
                  ) : (
                    <Star className="h-2.5 w-2.5" />
                  )}
                  {priorityTarget.priority}
                </span>
                <span className="text-xs font-medium text-muted-foreground">Current priority</span>
              </div>
              <p className="mt-1.5 text-xs text-foreground">
                {priorityTarget.priorityReason || 'No reason was recorded for this priority.'}
              </p>
            </div>
          )}

          {priorityTarget?.suggestedPriority && (
            <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/10 p-3 text-xs font-medium text-info">
              <Star className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {priorityTarget.patientAge} years old - the hospital suggests senior priority. Confirm it
                yourself, and add a short reason.
              </span>
            </div>
          )}

          <div className="space-y-2">
            {PRIORITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  priorityDraft.priority === option.value
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:bg-muted/40'
                )}
              >
                <input
                  type="radio"
                  name="priority"
                  value={option.value}
                  checked={priorityDraft.priority === option.value}
                  onChange={() => setPriorityDraft((draft) => ({ ...draft, priority: option.value }))}
                  disabled={priorityMutation.isPending}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {priorityDraft.priority !== 'normal' && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
                Reason *
              </label>
              <Input
                value={priorityDraft.reason}
                onChange={(e) => setPriorityDraft((draft) => ({ ...draft, reason: e.target.value }))}
                placeholder={
                  priorityDraft.priority === 'emergency'
                    ? 'e.g. chest pain, heavy bleeding'
                    : 'e.g. 68 years old, uses a wheelchair'
                }
                disabled={priorityMutation.isPending}
              />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Call order: emergency first, then senior, then whoever checked in earliest. Every priority
            change is recorded in the audit log.
          </p>
        </form>
      </Modal>

      {isWalkInOpen && (
        <WalkInTokenModal
          doctors={staffList}
          defaultDoctorId={doctorFilter !== 'all' ? doctorFilter : ''}
          onClose={() => setIsWalkInOpen(false)}
          onIssued={() => queryClient.invalidateQueries({ queryKey: ['opd-queue'] })}
        />
      )}

      <Modal
        isOpen={Boolean(callNextDoctorId)}
        onClose={() => {
          if (!callNextMutation.isPending) setCallNextDoctorId(null);
        }}
        title="Call next patient"
        description={activeRoomName ? `Room: ${activeRoomName}` : undefined}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCallNextDoctorId(null)}
              disabled={callNextMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => callNextMutation.mutate(callNextDoctorId)}
              disabled={callNextMutation.isPending}
              className="bg-primary-bright text-primary-bright-foreground hover:bg-primary-bright/90 font-semibold"
            >
              {callNextMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calling...
                </>
              ) : (
                <>
                  <Megaphone className="mr-2 h-4 w-4" />
                  Call next
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            The next patient for this room is{' '}
            <span className="font-semibold text-foreground">
              {queue.find((item) => item.status === 'checked_in')?.tokenNumber
                ? `Token #${queue.find((item) => item.status === 'checked_in').tokenNumber}`
                : 'nobody waiting'}
            </span>
            .
          </p>
          <p>
            They move into consultation immediately, so the room must be free. A doctor can only have one
            patient in consultation at a time.
          </p>
        </div>
      </Modal>

      {consultationAppointment && (
        <ConsultationForm
          appointment={consultationAppointment}
          onClose={() => setConsultationAppointment(null)}
        />
      )}

      {vitalsTarget && (
        <StaffVitalsModal appointment={vitalsTarget} onClose={() => setVitalsTarget(null)} />
      )}
    </div>
  );
}
