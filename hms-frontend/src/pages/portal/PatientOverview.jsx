import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User,
  Shield,
  Building2,
  CalendarDays,
  ClipboardList,
  Receipt,
  ArrowRight,
  AlertCircle,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  CreditCard,
  MapPin,
  Calendar,
  HeartPulse,
  Pencil,
  X,
  Plus,
  ChevronDown,
  Save,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

// ─── Tag Input Component ──────────────────────────────────────────────────────
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

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ patient, onClose, onSuccess }) {
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

  // Trap focus & close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl animate-fade-in overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Edit My Profile</h2>
              <p className="text-xs text-muted-foreground">Update your personal health information</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Read-only notice */}
        <div className="mx-6 mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            <strong>Note:</strong> Name, MRN, and CNIC are staff-controlled for record integrity. Contact the hospital to update those fields.
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* DOB & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Date of Birth */}
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

            {/* Gender */}
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

          {/* Phone */}
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

          {/* Address */}
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

          {/* Allergies tag input */}
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

          {/* Chronic Conditions tag input */}
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
              colorClass="bg-warning/15 text-warning-foreground border-warning/30"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border bg-muted/10">
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
            size="sm"
            disabled={mutation.isPending}
            className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px]"
            onClick={handleSubmit}
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
        </div>
      </div>
    </div>
  );
}

// ─── PatientOverview ──────────────────────────────────────────────────────────
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

  const portalQuickLinks = [
    {
      path: '/portal/appointments',
      title: 'Appointments & Consultations',
      desc: 'View scheduled doctor visits, review token numbers, and book new appointments.',
    },
    {
      path: '/portal/history',
      title: 'Medical History & Clinical Notes',
      desc: 'Access your electronic medical record (EMR), doctor notes, vitals, and prescriptions.',
    },
    {
      path: '/portal/bills',
      title: 'Billing & Invoices',
      desc: 'Review itemized hospital invoices, payment histories, and outstanding balances.',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner */}
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
          {/* Edit Profile Button */}
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
            onClick={() => refetch()}
            disabled={isRefetching || isLoading}
            className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
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
      ) : (
        <>
          {/* Patient Demographic & Clinical Record Card */}
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

            <CardContent className="p-5 sm:p-6 space-y-6">
              {/* Core Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-primary" /> Hospital
                  </span>
                  <span className="font-semibold text-foreground text-xs sm:text-sm mt-0.5 block truncate">
                    {user?.hospitalName || 'CareFlow Network'}
                  </span>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-primary" /> Date of Birth
                  </span>
                  <span className="font-semibold text-foreground text-xs sm:text-sm mt-0.5 block">
                    {patient.dob ? new Date(patient.dob).toLocaleDateString() : '—'}
                  </span>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <User className="h-3 w-3 text-primary" /> Gender
                  </span>
                  <span className="font-semibold text-foreground text-xs sm:text-sm mt-0.5 block capitalize">
                    {patient.gender || '—'}
                  </span>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <CreditCard className="h-3 w-3 text-primary" /> CNIC / ID
                  </span>
                  <span className="font-semibold text-foreground text-xs sm:text-sm mt-0.5 block">
                    {patient.cnic || '—'}
                  </span>
                </div>
              </div>

              {/* Contact & Address Information */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-muted/20 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3 text-primary" /> Phone
                  </span>
                  <span className="font-medium text-foreground text-xs sm:text-sm mt-0.5 block">
                    {patient.phone || '—'}
                  </span>
                </div>

                <div className="p-3 bg-muted/20 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <Mail className="h-3 w-3 text-primary" /> Email
                  </span>
                  <span className="font-medium text-foreground text-xs sm:text-sm mt-0.5 block truncate">
                    {patient.email || user?.email || '—'}
                  </span>
                </div>

                <div className="p-3 bg-muted/20 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-primary" /> Address
                  </span>
                  <span className="font-medium text-foreground text-xs sm:text-sm mt-0.5 block truncate">
                    {patient.address || '—'}
                  </span>
                </div>
              </div>

              {/* Health Alerts: Allergies & Chronic Conditions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
                {/* Allergies */}
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
                    <span className="text-xs text-muted-foreground">No recorded allergies.</span>
                  )}
                </div>

                {/* Chronic Conditions */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Chronic Conditions
                  </span>
                  {patient.chronicConditions && patient.chronicConditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {patient.chronicConditions.map((condition, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning-foreground border border-warning/30"
                        >
                          {condition}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No chronic conditions listed.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Navigation Links */}
          <div className="pt-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Patient Services &amp; Portal Sections
            </div>
            <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden shadow-soft">
              {portalQuickLinks.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors group"
                >
                  <div className="min-w-0 pr-4">
                    <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors block">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {item.desc}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && patient && (
        <EditProfileModal
          patient={patient}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
