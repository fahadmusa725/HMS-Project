import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User,
  Shield,
  ShieldCheck,
  Building2,
  ArrowRight,
  AlertCircle,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  CreditCard,
  MapPin,
  Calendar,
  CalendarDays,
  ClipboardList,
  Receipt,
  HeartPulse,
  Pencil,
  X,
  ChevronDown,
  Save,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { doctorName, formatCurrency, formatSlotTime, localDateStr } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';

function TagInput({ tags = [], onChange, placeholder, colorClass = 'bg-primary/10 text-primary border-primary/20' }) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  const addTag = (raw) => {
    const val = raw.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInputValue('');
  };

  const removeTag = (idx) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div
      className="min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded-lg border border-input bg-card cursor-text focus-within:ring-2 focus-within:ring-primary"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(idx); }}
            className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputValue.trim()) addTag(inputValue); }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
    </div>
  );
}

function ClaimRecordCard({ onLinked }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: (value) => api.post('/api/patients/me/claim', { code: value }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Your hospital record is now linked.');
      onLinked();
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Could not verify the code. Please try again.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    mutation.mutate(code.trim());
  };

  return (
    <Card className="p-6 sm:p-8 max-w-xl mx-auto border-primary/20">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
        <Shield className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold text-foreground text-center">Link your hospital record</h3>
      <p className="text-sm text-muted-foreground mt-1.5 mb-5 text-center">
        This account is not linked to a patient record yet. If the hospital already had your CNIC or phone on file, we
        emailed a 6-digit code to the address on that record. Enter it to link your history.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={mutation.isPending}
          className="h-11 text-center tracking-[0.4em] font-mono"
        />
        <Button
          type="submit"
          disabled={mutation.isPending || code.length !== 6}
          className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold sm:min-w-[140px]"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify & Link'
          )}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        No email on file, or the code expired? Ask the front desk to link your record in person.
      </p>
    </Card>
  );
}

function EditProfileModal({ patient, onClose }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    dob: patient.dob ? patient.dob.split('T')[0] : '',
    gender: patient.gender || '',
    phone: patient.phone || '',
    address: patient.address || '',
    allergies: patient.allergies || [],
    chronicConditions: patient.chronicConditions || [],
  });

  const mutation = useMutation({
    mutationFn: (payload) => api.patch('/api/patients/me', payload),
    onSuccess: () => {
      toast.success('Profile updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['patient-me'] });
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update profile. Please try again.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {};
    if (form.dob) payload.dob = form.dob;
    if (form.gender) payload.gender = form.gender;
    if (form.phone?.trim()) payload.phone = form.phone.trim();
    if (form.address?.trim()) payload.address = form.address.trim();
    payload.allergies = form.allergies;
    payload.chronicConditions = form.chronicConditions;
    mutation.mutate(payload);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit My Profile"
      description="Update your personal health information"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={mutation.isPending}
            className="h-9"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-my-profile-form"
            size="sm"
            disabled={mutation.isPending}
            className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px]"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-3.5 w-3.5" />
                Save Changes
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <span>
          <strong>Note:</strong> Name, MRN, and CNIC are staff-controlled for record integrity. Contact the hospital to update those fields.
        </span>
      </div>

      <form id="edit-my-profile-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Date of Birth
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                </div>
                <Input
                  type="date"
                  className="pl-10 h-10 bg-background border-border text-foreground"
                  value={form.dob}
                  onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                  disabled={mutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Gender
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <ChevronDown className="h-4 w-4" />
                </div>
                <select
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  disabled={mutation.isPending}
                  className="pl-10 h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">-- Select gender --</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <Phone className="h-4 w-4" />
              </div>
              <Input
                placeholder="03001234567"
                className="pl-10 h-10 bg-background border-border text-foreground"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={mutation.isPending}
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <MapPin className="h-4 w-4" />
              </div>
              <Input
                placeholder="e.g. House 5, Street 12, Islamabad"
                className="pl-10 h-10 bg-background border-border text-foreground"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                disabled={mutation.isPending}
                autoComplete="street-address"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Known Allergies
              <span className="ml-1.5 text-muted-foreground font-normal lowercase normal-case">
                (press Enter or comma to add)
              </span>
            </label>
            <TagInput
              tags={form.allergies}
              onChange={(tags) => setForm((f) => ({ ...f, allergies: tags }))}
              placeholder="e.g. Penicillin, Dust..."
              colorClass="bg-destructive/10 text-destructive border-destructive/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Chronic Conditions
              <span className="ml-1.5 text-muted-foreground font-normal lowercase normal-case">
                (press Enter or comma to add)
              </span>
            </label>
            <TagInput
              tags={form.chronicConditions}
              onChange={(tags) => setForm((f) => ({ ...f, chronicConditions: tags }))}
              placeholder="e.g. Diabetes, Hypertension..."
              colorClass="bg-warning/15 text-warning border-warning/30"
            />
          </div>
      </form>
    </Modal>
  );
}

function InfoTile({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={`rounded-xl border border-border bg-muted/25 p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-bright/10 text-primary-bright">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 truncate text-xs font-semibold text-foreground sm:text-sm">{value}</div>
    </div>
  );
}

export default function PatientOverview() {
  const { user } = useAuthStore();
  const [showEditModal, setShowEditModal] = useState(false);

  const {
    data: patient,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['patient-me'],
    queryFn: async () => {
      const res = await api.get('/api/patients/me');
      return res.data;
    },
  });

  // Same query keys and endpoints as the dedicated portal pages, so navigating between them
  // reuses the cache instead of refetching.
  const appointmentsQuery = useQuery({
    queryKey: ['patient-appointments-mine'],
    queryFn: async () => {
      const res = await api.get('/api/appointments/mine');
      return res.data;
    },
    enabled: Boolean(patient),
  });

  const billsQuery = useQuery({
    queryKey: ['patient-bills-mine'],
    queryFn: async () => {
      const res = await api.get('/api/billing/mine');
      return res.data;
    },
    enabled: Boolean(patient),
  });

  const historyQuery = useQuery({
    queryKey: ['patient-emr-mine'],
    queryFn: async () => {
      const res = await api.get('/api/consultations/mine');
      return res.data;
    },
    enabled: Boolean(patient),
  });

  const appointments = Array.isArray(appointmentsQuery.data) ? appointmentsQuery.data : [];
  const todayStr = localDateStr();
  const upcoming = appointments
    .filter(
      (appointment) =>
        ['scheduled', 'checked_in', 'in_consultation'].includes(appointment.status) && appointment.date >= todayStr
    )
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  const nextAppointment = upcoming[0];

  const bills = Array.isArray(billsQuery.data) ? billsQuery.data : [];
  const openBills = bills.filter((bill) => bill.paymentStatus !== 'paid');
  const outstanding = openBills.reduce(
    (sum, bill) => sum + Math.max(0, (bill.totalAmount || 0) - (bill.amountPaid || 0)),
    0
  );
  const visitCount = Array.isArray(historyQuery.data) ? historyQuery.data.length : 0;

  const refreshing =
    isRefetching || appointmentsQuery.isRefetching || billsQuery.isRefetching || historyQuery.isRefetching;
  const refreshAll = () => {
    refetch();
    appointmentsQuery.refetch();
    billsQuery.refetch();
    historyQuery.refetch();
  };

  const portalQuickLinks = [
    {
      path: '/portal/appointments',
      title: 'Appointments',
      desc: 'Book a visit, review tokens and consultation status.',
      Icon: CalendarDays,
      tile: 'bg-info/10 text-info',
    },
    {
      path: '/portal/history',
      title: 'Medical history',
      desc: 'Doctor notes, vitals and prescriptions in one timeline.',
      Icon: ClipboardList,
      tile: 'bg-primary-bright/10 text-primary-bright',
    },
    {
      path: '/portal/bills',
      title: 'Bills & invoices',
      desc: 'Itemised invoices and outstanding balances.',
      Icon: Receipt,
      tile: 'bg-success/10 text-success',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            My Health Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Welcome back, <span className="font-semibold text-foreground">{user?.name || patient?.name || 'Patient'}</span>
            {user?.hospitalName && (
              <span> · Registered at <span className="text-primary font-medium">{user.hospitalName}</span></span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {patient && !isLoading && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditModal(true)}
              className="h-9 px-3 text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Profile
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing || isLoading}
            className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="p-8 rounded-2xl border border-border bg-card animate-pulse space-y-4">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="h-16 bg-muted/60 rounded-xl" />
              <div className="h-16 bg-muted/60 rounded-xl" />
              <div className="h-16 bg-muted/60 rounded-xl" />
            </div>
          </div>
        </div>
      ) : isError ? (
        error?.response?.status === 404 ? (
          <ClaimRecordCard onLinked={() => refetch()} />
        ) : (
          <Card className="p-8 text-center border-destructive/20 bg-destructive/5">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h3 className="text-base font-bold text-foreground">Unable to load patient profile</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {error?.response?.data?.message || 'There was an issue fetching your patient record.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </Card>
        )
      ) : (
        <>
          <Card className="border-border bg-card shadow-soft overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/10 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      {patient.name}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Official Hospital Patient Record
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">MRN:</span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
                    {patient.mrn}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <InfoTile icon={Building2} label="Hospital" value={user?.hospitalName || 'CareFlow Network'} />
                <InfoTile
                  icon={Calendar}
                  label="Date of birth"
                  value={patient.dob ? new Date(patient.dob).toLocaleDateString() : '—'}
                />
                <InfoTile
                  icon={User}
                  label="Gender"
                  value={patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '—'}
                />
                <InfoTile icon={CreditCard} label="CNIC / ID" value={patient.cnic || '—'} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InfoTile icon={Phone} label="Phone" value={patient.phone || '—'} />
                <InfoTile icon={Mail} label="Email" value={patient.email || user?.email || '—'} />
                <InfoTile icon={MapPin} label="Address" value={patient.address || '—'} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Known Allergies
                  </span>
                  {patient.allergies && patient.allergies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {patient.allergies.map((allergy, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20"
                        >
                          {allergy}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong/35 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                      No known allergies on file. Add any from Edit profile.
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Chronic Conditions
                  </span>
                  {patient.chronicConditions && patient.chronicConditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {patient.chronicConditions.map((condition, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning border border-warning/30"
                        >
                          {condition}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong/35 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                      <HeartPulse className="h-4 w-4 shrink-0 text-primary" />
                      No chronic conditions listed. Keep this current from Edit profile.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Next appointment"
              icon={CalendarDays}
              tone="bright"
              loading={appointmentsQuery.isLoading}
              value={
                nextAppointment
                  ? new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })
                  : 'None'
              }
              sub={
                nextAppointment
                  ? `${doctorName(nextAppointment.doctorId?.name, 'Doctor')} · ${formatSlotTime(nextAppointment.time)} · Token #${nextAppointment.tokenNumber}`
                  : 'Book a visit from Appointments'
              }
            />
            <StatCard
              label="Outstanding balance"
              icon={Receipt}
              tone={outstanding > 0 ? 'warning' : 'success'}
              loading={billsQuery.isLoading}
              value={formatCurrency(outstanding)}
              sub={
                openBills.length > 0
                  ? `${openBills.length} open invoice${openBills.length === 1 ? '' : 's'}`
                  : 'No open invoices'
              }
            />
            <StatCard
              label="Consultation records"
              icon={ClipboardList}
              tone="info"
              loading={historyQuery.isLoading}
              value={visitCount}
              sub={visitCount > 0 ? 'Notes, vitals and prescriptions' : 'No visits recorded yet'}
            />
          </div>

          {!appointmentsQuery.isLoading &&
            !billsQuery.isLoading &&
            appointments.length === 0 &&
            bills.length === 0 && (
              <EmptyState
                icon={HeartPulse}
                title="Your health record is ready"
                description="Book an appointment or visit the front desk. Visits, prescriptions and invoices will appear here automatically."
                action={
                  <Link to="/portal/appointments" className={buttonVariants({ size: 'sm' })}>
                    Book an appointment
                  </Link>
                }
              />
            )}

          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Patient services
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {portalQuickLinks.map(({ path, title, desc, Icon, tile }) => (
                <Link
                  key={path}
                  to={path}
                  className="group rounded-xl border border-border bg-card p-4 shadow-soft-sm transition-colors hover:border-primary-bright/40 hover:bg-primary-bright/[0.03]"
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tile}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {showEditModal && patient && (
        <EditProfileModal
          patient={patient}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
