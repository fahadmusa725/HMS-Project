import React, { useState } from 'react';
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
  Ticket
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Please select a patient'),
  doctorId: z.string().min(1, 'Please select a doctor'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().optional(),
  reason: z.string().optional(),
});

export default function AppointmentsQueue() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const isDoctor = user?.role === 'doctor';
  const canBook = user?.role === 'hospital_admin' || user?.role === 'receptionist';

  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [doctorFilter, setDoctorFilter] = useState(isDoctor ? user?.id : 'all');
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [formError, setFormError] = useState(null);

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
      time: '09:00 AM',
      reason: '',
    },
  });

  const selectedPatientId = watch('patientId');

  // Query: Doctors list for booking & filtering
  const { data: staffList = [] } = useQuery({
    queryKey: ['hospital-doctors-list'],
    queryFn: async () => {
      if (user?.role === 'hospital_admin') {
        const response = await api.get('/api/hospital-admin/staff');
        return response.data.filter((s) => s.role === 'doctor');
      }
      return [];
    },
  });

  // Query: Search patients for booking modal
  const { data: patientSearchResults = { patients: [] } } = useQuery({
    queryKey: ['booking-patient-search', patientSearch],
    queryFn: async () => {
      if (!patientSearch.trim()) return { patients: [] };
      const response = await api.get('/api/patients', {
        params: { search: patientSearch, limit: 8 },
      });
      return response.data;
    },
    enabled: isBookOpen && patientSearch.trim().length > 0,
  });

  // Query: Live Queue
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
  });

  // Mutation: Book Appointment
  const bookMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await api.post('/api/appointments', formData);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opd-queue'] });
      setIsBookOpen(false);
      reset();
      setPatientSearch('');
      setFormError(null);
      toast.success(`Token #${data.tokenNumber} assigned successfully!`, {
        description: `Appointment booked for ${data.date} at ${data.time || 'scheduled slot'}.`,
      });
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to book appointment.';
      setFormError(message);
      toast.error(message);
    },
  });

  // Mutation: Update Appointment Status
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

  const onSubmitBook = (values) => {
    setFormError(null);
    bookMutation.mutate(values);
  };

  const handleStatusChange = (id, newStatus, tokenNumber) => {
    statusMutation.mutate({ id, status: newStatus, tokenNumber });
  };

  // Helper for quick-action buttons
  const renderActionButtons = (appointment) => {
    const { _id, status, tokenNumber } = appointment;

    switch (status) {
      case 'scheduled':
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStatusChange(_id, 'checked_in', tokenNumber)}
            disabled={statusMutation.isPending}
            className="h-8 text-xs font-semibold text-primary hover:bg-primary/10 hover:border-primary/40 flex items-center gap-1"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Check In
          </Button>
        );
      case 'checked_in':
        return (
          <Button
            size="sm"
            onClick={() => handleStatusChange(_id, 'in_consultation', tokenNumber)}
            disabled={statusMutation.isPending}
            className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1 shadow-sm"
          >
            <Play className="h-3 w-3 fill-current" />
            Start Consult
          </Button>
        );
      case 'in_consultation':
        return (
          <Button
            size="sm"
            onClick={() => handleStatusChange(_id, 'completed', tokenNumber)}
            disabled={statusMutation.isPending}
            className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1"
          >
            <Check className="h-3.5 w-3.5" />
            Complete
          </Button>
        );
      case 'completed':
        return (
          <span className="text-xs font-medium text-muted-foreground">
            Consultation done
          </span>
        );
      case 'cancelled':
        return (
          <span className="text-xs font-medium text-destructive">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Appointments &amp; Live OPD Queue
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage live patient arrival tokens, appointments, and consultation queues.
          </p>
        </div>

        <div className="flex items-center gap-3">
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

      {/* Queue Filter Bar & Table Card */}
      <Card className="bg-card border-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Date selector */}
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

            {/* Doctor filter */}
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

        {/* Live Queue Table */}
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
                      <div className="font-semibold text-foreground">
                        {item.patientId?.name || 'Patient'}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">
                        MRN: {item.patientId?.mrn || '—'}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-xs font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <Stethoscope className="h-3.5 w-3.5 text-primary" />
                        <span>{item.doctorId?.name || 'Assigned Doctor'}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-xs">
                      <div className="font-medium text-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {item.time || '—'}
                      </div>
                      {item.reason && (
                        <div className="text-muted-foreground truncate max-w-[160px] mt-0.5">
                          {item.reason}
                        </div>
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

      {/* Modal: Book Appointment */}
      <Modal
        isOpen={isBookOpen}
        onClose={() => {
          if (!bookMutation.isPending) setIsBookOpen(false);
        }}
        title="Book OPD Appointment"
        description="Assign a daily token number and schedule a patient consultation."
      >
        <form onSubmit={handleSubmit(onSubmitBook)} className="space-y-4">
          {formError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive animate-slide-up font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Patient Search & Select */}
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

            {/* Patient Dropdown results */}
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

          {/* Doctor Select */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Select Doctor *
            </label>
            <select
              {...register('doctorId')}
              disabled={bookMutation.isPending}
              className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">-- Choose Doctor --</option>
              {staffList.map((doc) => (
                <option key={doc._id} value={doc._id}>
                  {doc.name} {doc.department ? `(${doc.department})` : ''}
                </option>
              ))}
            </select>
            {errors.doctorId && (
              <p className="text-xs text-destructive">{errors.doctorId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Date
              </label>
              <Input
                type="date"
                {...register('date')}
                disabled={bookMutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Time Slot
              </label>
              <Input
                placeholder="e.g. 10:30 AM"
                {...register('time')}
                disabled={bookMutation.isPending}
              />
            </div>
          </div>

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

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBookOpen(false)}
              disabled={bookMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
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
          </div>
        </form>
      </Modal>
    </div>
  );
}
