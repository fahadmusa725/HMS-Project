import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
  Phone,
  ChevronLeft,
  ChevronRight,
  X,
  Edit2,
  ClipboardList,
  Stethoscope,
  Pill,
  CalendarCheck,
  HeartPulse,
  User,
  FlaskConical
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';

const patientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  dob: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

// ─── PatientEMRTimeline ────────────────────────────────────────────────────────
function PatientEMRTimeline({ patientId }) {
  const {
    data: consultations = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['patient-emr', patientId],
    queryFn: async () => {
      const response = await api.get(`/api/consultations/patient/${patientId}`);
      return response.data;
    },
    enabled: !!patientId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse space-y-2 p-4 rounded-xl border border-border bg-muted/20">
            <div className="h-3 w-32 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted/80 rounded" />
            <div className="h-3 w-full bg-muted/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-6 text-center text-xs text-destructive">
        <AlertCircle className="h-6 w-6 mx-auto mb-2" />
        Could not load medical history.
      </div>
    );
  }

  if (consultations.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
          <ClipboardList className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">No consultations yet</p>
        <p className="text-xs text-muted-foreground mt-1">Consultations recorded by doctors will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
      {consultations.map((c, idx) => (
        <div
          key={c._id}
          className="relative pl-4 border-l-2 border-primary/30 space-y-2.5"
        >
          {/* Timeline dot */}
          <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-primary shadow-sm" />

          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2.5">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {new Date(c.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
                {c.doctorId?.name && (
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" />
                    Dr. {c.doctorId.name}
                    {c.doctorId.department && (
                      <span className="text-muted-foreground/60">· {c.doctorId.department}</span>
                    )}
                  </div>
                )}
              </div>
              {c.followUpDate && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                  <CalendarCheck className="h-3 w-3" />
                  Follow-up {new Date(c.followUpDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            {/* Diagnosis */}
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Diagnosis</span>
              <p className="text-sm font-bold text-foreground mt-0.5">{c.diagnosis}</p>
            </div>

            {/* Symptoms */}
            {c.symptoms && (
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Symptoms</span>
                <p className="text-xs text-foreground mt-0.5">{c.symptoms}</p>
              </div>
            )}

            {/* Vitals */}
            {c.vitals && Object.values(c.vitals).some(Boolean) && (
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <HeartPulse className="h-3 w-3" />Vitals
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {c.vitals.bloodPressure && (
                    <span className="text-[10px] bg-card border border-border px-2 py-0.5 rounded-full font-medium">
                      BP: {c.vitals.bloodPressure}
                    </span>
                  )}
                  {c.vitals.temperature && (
                    <span className="text-[10px] bg-card border border-border px-2 py-0.5 rounded-full font-medium">
                      Temp: {c.vitals.temperature}
                    </span>
                  )}
                  {c.vitals.pulse && (
                    <span className="text-[10px] bg-card border border-border px-2 py-0.5 rounded-full font-medium">
                      Pulse: {c.vitals.pulse}
                    </span>
                  )}
                  {c.vitals.weight && (
                    <span className="text-[10px] bg-card border border-border px-2 py-0.5 rounded-full font-medium">
                      Wt: {c.vitals.weight}
                    </span>
                  )}
                  {c.vitals.height && (
                    <span className="text-[10px] bg-card border border-border px-2 py-0.5 rounded-full font-medium">
                      Ht: {c.vitals.height}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Prescriptions */}
            {c.prescriptions && c.prescriptions.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Pill className="h-3 w-3" />Prescriptions
                </span>
                <div className="mt-1 space-y-1">
                  {c.prescriptions.map((rx, ri) => (
                    <div key={ri} className="text-xs text-foreground flex items-baseline gap-1.5">
                      <span className="font-semibold">{rx.medicineName}</span>
                      {rx.dosage && <span className="text-muted-foreground">{rx.dosage}</span>}
                      {rx.frequency && <span className="text-muted-foreground">· {rx.frequency}</span>}
                      {rx.duration && <span className="text-muted-foreground">· {rx.duration}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {c.notes && (
              <div className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
                {c.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PatientDirectory() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState('profile'); // 'profile' | 'history'
  const [formError, setFormError] = useState(null);

  // Roles allowed to view EMR / medical history
  const canViewHistory = ['doctor', 'nurse', 'hospital_admin', 'receptionist'].includes(user?.role);

  // Tag inputs state for registration form
  const [regAllergies, setRegAllergies] = useState([]);
  const [allergyInput, setAllergyInput] = useState('');
  const [regConditions, setRegConditions] = useState([]);
  const [conditionInput, setConditionInput] = useState('');

  // Tag inputs state for detail drawer edit
  const [detailAllergies, setDetailAllergies] = useState([]);
  const [detailAllergyInput, setDetailAllergyInput] = useState('');
  const [detailConditions, setDetailConditions] = useState([]);
  const [detailConditionInput, setDetailConditionInput] = useState('');

  // Lab Order from Patient Directory state
  const canOrderLab = ['doctor', 'hospital_admin', 'receptionist'].includes(user?.role);
  const [isOrderLabOpen, setIsOrderLabOpen] = useState(false);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState([]);
  const [labSearchQuery, setLabSearchQuery] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: '',
      dob: '',
      gender: 'male',
      phone: '',
      address: '',
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    setValue: setEditValue,
    formState: { errors: editErrors },
  } = useForm({
    resolver: zodResolver(patientSchema),
  });

  // Query: Paginated & Searchable Patient list
  const {
    data: patientsData = { patients: [], total: 0, page: 1, limit: 15 },
    isLoading,
    isError,
    error: queryError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['hospital-patients', search, page],
    queryFn: async () => {
      const response = await api.get('/api/patients', {
        params: { search, page, limit: 15 },
      });
      return response.data;
    },
    keepPreviousData: true,
  });

  // Mutation: Register Patient
  const registerMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = {
        ...formData,
        allergies: regAllergies,
        chronicConditions: regConditions,
      };
      const response = await api.post('/api/patients', payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hospital-patients'] });
      setIsRegisterOpen(false);
      reset();
      setRegAllergies([]);
      setRegConditions([]);
      setFormError(null);
      toast.success(`Patient registered — MRN: ${data.mrn}`, {
        description: `Name: ${data.name}`,
      });
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to register patient.';
      setFormError(message);
      toast.error(message);
    },
  });

  // Mutation: Update Patient
  const updateMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = {
        ...formData,
        allergies: detailAllergies,
        chronicConditions: detailConditions,
      };
      const response = await api.patch(`/api/patients/${selectedPatient._id}`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hospital-patients'] });
      setSelectedPatient(data);
      setIsEditingDetail(false);
      toast.success(`Patient profile updated — MRN: ${data.mrn}`);
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to update patient details.';
      toast.error(message);
    },
  });

  // Query: Lab test catalog for ordering
  const { data: labCatalog = [] } = useQuery({
    queryKey: ['lab-tests-catalog'],
    queryFn: async () => {
      const res = await api.get('/api/lab/tests');
      return res.data;
    },
    enabled: isOrderLabOpen,
  });

  // Mutation: Place Lab Order
  const createLabOrderMutation = useMutation({
    mutationFn: async ({ patientId, testIds }) => {
      const res = await api.post('/api/lab/orders', { patientId, testIds });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders-list'] });
      setIsOrderLabOpen(false);
      setSelectedLabTestIds([]);
      toast.success(`Lab test order placed successfully for ${selectedPatient?.name}.`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to place lab order.');
    },
  });

  // Toggle test checkbox
  const toggleLabTestSelection = (testId) => {
    setSelectedLabTestIds((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  };

  const labOrderModalTotal = (labCatalog || []).reduce((sum, item) => {
    return selectedLabTestIds.includes(item._id) ? sum + (item.price || 0) : sum;
  }, 0);

  const onSubmitRegister = (values) => {
    setFormError(null);
    registerMutation.mutate(values);
  };

  const onSubmitEdit = (values) => {
    updateMutation.mutate(values);
  };

  const openPatientDetail = (patient) => {
    setSelectedPatient(patient);
    setIsEditingDetail(false);
    setDetailTab('profile');
    setDetailAllergies(patient.allergies || []);
    setDetailConditions(patient.chronicConditions || []);
    setEditValue('name', patient.name);
    setEditValue('dob', patient.dob ? new Date(patient.dob).toISOString().slice(0, 10) : '');
    setEditValue('gender', patient.gender || 'male');
    setEditValue('phone', patient.phone || '');
    setEditValue('address', patient.address || '');
    setIsDetailOpen(true);
  };

  // Tag helper handlers
  const handleAddAllergy = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (allergyInput.trim() && !regAllergies.includes(allergyInput.trim())) {
        setRegAllergies([...regAllergies, allergyInput.trim()]);
        setAllergyInput('');
      }
    }
  };

  const handleAddCondition = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (conditionInput.trim() && !regConditions.includes(conditionInput.trim())) {
        setRegConditions([...regConditions, conditionInput.trim()]);
        setConditionInput('');
      }
    }
  };

  const handleAddDetailAllergy = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (detailAllergyInput.trim() && !detailAllergies.includes(detailAllergyInput.trim())) {
        setDetailAllergies([...detailAllergies, detailAllergyInput.trim()]);
        setDetailAllergyInput('');
      }
    }
  };

  const handleAddDetailCondition = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (detailConditionInput.trim() && !detailConditions.includes(detailConditionInput.trim())) {
        setDetailConditions([...detailConditions, detailConditionInput.trim()]);
        setDetailConditionInput('');
      }
    }
  };

  const totalPages = Math.ceil((patientsData.total || 0) / (patientsData.limit || 15)) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Patient Directory &amp; Records
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Search, register, and review medical record numbers (MRN) and patient profiles.
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
          <Button
            onClick={() => {
              setFormError(null);
              setIsRegisterOpen(true);
            }}
            className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span>Register Patient</span>
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="bg-card border-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
          {/* Search Input */}
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, MRN, phone number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-10 w-full bg-card border-border"
            />
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            Total Records: <span className="font-bold text-foreground">{patientsData.total || 0}</span>
          </div>
        </div>

        {/* Content Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border/40 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 w-44 bg-muted rounded"></div>
                    <div className="h-3 w-28 bg-muted/60 rounded"></div>
                  </div>
                  <div className="h-6 w-20 bg-muted rounded"></div>
                  <div className="h-4 w-32 bg-muted rounded hidden sm:block"></div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h3 className="text-base font-bold text-foreground">Error loading patients</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                {queryError?.message || 'Could not fetch patient records from server.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : patientsData.patients.length === 0 ? (
            <div className="p-12 sm:p-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {search ? 'No matching patients found' : 'No patients registered yet'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-6">
                {search
                  ? 'Try searching with a different MRN, name, or phone number.'
                  : 'Start by registering your first patient to generate an MRN.'}
              </p>
              {!search && (
                <Button
                  onClick={() => {
                    setFormError(null);
                    setIsRegisterOpen(true);
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Register First Patient
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3.5 px-6">MRN</th>
                  <th className="py-3.5 px-6">Patient Name</th>
                  <th className="py-3.5 px-4">Gender</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-6 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {patientsData.patients.map((patient) => (
                  <tr
                    key={patient._id}
                    onClick={() => openPatientDetail(patient)}
                    className="hover:bg-accent/40 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
                        {patient.mrn}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {patient.name}
                      </div>
                      {patient.dob && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          DOB: {new Date(patient.dob).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-foreground capitalize">
                      {patient.gender || '—'}
                    </td>
                    <td className="py-4 px-4 text-xs text-muted-foreground">
                      {patient.phone ? (
                        <span className="flex items-center gap-1.5 text-foreground">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {patient.phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-4 px-6 text-right text-xs text-muted-foreground">
                      {patient.createdAt
                        ? new Date(patient.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between bg-card">
            <div className="text-xs text-muted-foreground">
              Page <span className="font-semibold text-foreground">{page}</span> of{' '}
              <span className="font-semibold text-foreground">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-2"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-2"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal: Register Patient */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => {
          if (!registerMutation.isPending) setIsRegisterOpen(false);
        }}
        title="Register New Patient"
        description="Create patient demographic record and auto-assign unique hospital MRN."
      >
        {formError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive animate-slide-up font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitRegister)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Patient Full Name *
            </label>
            <Input
              placeholder="e.g. Bilal Ahmed"
              {...register('name')}
              disabled={registerMutation.isPending}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Date of Birth
              </label>
              <Input
                type="date"
                {...register('dob')}
                disabled={registerMutation.isPending}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Gender
              </label>
              <select
                {...register('gender')}
                disabled={registerMutation.isPending}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Phone Number
              </label>
              <Input
                placeholder="03001234567"
                {...register('phone')}
                disabled={registerMutation.isPending}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Address
              </label>
              <Input
                placeholder="City, Area"
                {...register('address')}
                disabled={registerMutation.isPending}
              />
            </div>
          </div>

          {/* Allergies Tag Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Known Allergies (Press Enter to add)
            </label>
            <Input
              placeholder="e.g. Penicillin, Peanuts (Press Enter)"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={handleAddAllergy}
              disabled={registerMutation.isPending}
            />
            {regAllergies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {regAllergies.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => setRegAllergies(regAllergies.filter((_, i) => i !== idx))}
                      className="hover:text-destructive/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Chronic Conditions Tag Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Chronic Conditions (Press Enter to add)
            </label>
            <Input
              placeholder="e.g. Diabetes Type 2, Hypertension (Press Enter)"
              value={conditionInput}
              onChange={(e) => setConditionInput(e.target.value)}
              onKeyDown={handleAddCondition}
              disabled={registerMutation.isPending}
            />
            {regConditions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {regConditions.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning-foreground border border-warning/30"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => setRegConditions(regConditions.filter((_, i) => i !== idx))}
                      className="hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRegisterOpen(false)}
              disabled={registerMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                'Save & Generate MRN'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal / Drawer: Patient Detail & Edit */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedPatient ? `Patient: ${selectedPatient.name}` : 'Patient Details'}
        description={selectedPatient ? `MRN: ${selectedPatient.mrn}` : ''}
      >
        {selectedPatient && (
          <div className="space-y-4">
            {/* Tab switcher */}
            {canViewHistory && !isEditingDetail && (
              <div className="flex gap-1 p-1 bg-muted/50 rounded-xl border border-border/60">
                <button
                  type="button"
                  onClick={() => setDetailTab('profile')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    detailTab === 'profile'
                      ? 'bg-card text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('history')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    detailTab === 'history'
                      ? 'bg-card text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Medical History
                </button>
              </div>
            )}
            {detailTab === 'profile' && !isEditingDetail && (
              /* View Mode */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                    <span className="text-xs text-muted-foreground block font-medium">MRN Number</span>
                    <span className="font-mono text-xs font-bold text-primary">{selectedPatient.mrn}</span>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                    <span className="text-xs text-muted-foreground block font-medium">Gender</span>
                    <span className="font-semibold text-foreground capitalize">{selectedPatient.gender || '—'}</span>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                    <span className="text-xs text-muted-foreground block font-medium">Phone</span>
                    <span className="font-medium text-foreground">{selectedPatient.phone || '—'}</span>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                    <span className="text-xs text-muted-foreground block font-medium">Date of Birth</span>
                    <span className="font-medium text-foreground">
                      {selectedPatient.dob ? new Date(selectedPatient.dob).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-sm">
                  <span className="text-xs text-muted-foreground block font-medium">Address</span>
                  <span className="font-medium text-foreground">{selectedPatient.address || '—'}</span>
                </div>

                {/* Allergies */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Allergies
                  </span>
                  {selectedPatient.allergies && selectedPatient.allergies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPatient.allergies.map((all, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20"
                        >
                          {all}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No known allergies</span>
                  )}
                </div>

                {/* Chronic Conditions */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Chronic Conditions
                  </span>
                  {selectedPatient.chronicConditions && selectedPatient.chronicConditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPatient.chronicConditions.map((cond, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning-foreground border border-warning/30"
                        >
                          {cond}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No chronic conditions listed</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Registered on: {new Date(selectedPatient.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    {canOrderLab && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedLabTestIds([]);
                          setIsOrderLabOpen(true);
                        }}
                        className="h-9 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10 flex items-center gap-1.5"
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Order Lab Test
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setIsEditingDetail(true)}
                      className="h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit Profile
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Medical History Tab */}
            {detailTab === 'history' && canViewHistory && (
              <PatientEMRTimeline patientId={selectedPatient._id} />
            )}

            {/* Edit Mode (only when isEditingDetail) */}
            {isEditingDetail && (
              <form onSubmit={handleSubmitEdit(onSubmitEdit)} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Patient Name
                  </label>
                  <Input
                    {...registerEdit('name')}
                    disabled={updateMutation.isPending}
                    className={editErrors.name ? 'border-destructive' : ''}
                  />
                  {editErrors.name && <p className="text-xs text-destructive">{editErrors.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                      Date of Birth
                    </label>
                    <Input type="date" {...registerEdit('dob')} disabled={updateMutation.isPending} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                      Gender
                    </label>
                    <select
                      {...registerEdit('gender')}
                      disabled={updateMutation.isPending}
                      className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                      Phone Number
                    </label>
                    <Input {...registerEdit('phone')} disabled={updateMutation.isPending} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                      Address
                    </label>
                    <Input {...registerEdit('address')} disabled={updateMutation.isPending} />
                  </div>
                </div>

                {/* Edit Allergies Tag Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Allergies (Press Enter to add)
                  </label>
                  <Input
                    placeholder="Add allergy and press Enter..."
                    value={detailAllergyInput}
                    onChange={(e) => setDetailAllergyInput(e.target.value)}
                    onKeyDown={handleAddDetailAllergy}
                    disabled={updateMutation.isPending}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {detailAllergies.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => setDetailAllergies(detailAllergies.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Edit Conditions Tag Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Chronic Conditions (Press Enter to add)
                  </label>
                  <Input
                    placeholder="Add condition and press Enter..."
                    value={detailConditionInput}
                    onChange={(e) => setDetailConditionInput(e.target.value)}
                    onKeyDown={handleAddDetailCondition}
                    disabled={updateMutation.isPending}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {detailConditions.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning-foreground border border-warning/30"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => setDetailConditions(detailConditions.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditingDetail(false)}
                    disabled={updateMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Order Lab Test for Selected Patient */}
      <Modal
        isOpen={isOrderLabOpen}
        onClose={() => setIsOrderLabOpen(false)}
        title="Order Diagnostic Lab Tests"
        description={selectedPatient ? `Patient: ${selectedPatient.name} (MRN: ${selectedPatient.mrn})` : ''}
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground/80 uppercase tracking-wider block">
              Choose Tests ({selectedLabTestIds.length} selected)
            </span>
            <span className="text-xs font-bold text-primary">
              Running Total: {formatCurrency(labOrderModalTotal)}
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tests..."
              value={labSearchQuery}
              onChange={(e) => setLabSearchQuery(e.target.value)}
              className="pl-9 h-8 text-xs bg-muted/30"
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border p-2 space-y-1 bg-card divide-y divide-border/40">
            {labCatalog.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 text-center">
                No diagnostic tests available in catalog.
              </p>
            ) : (
              labCatalog
                .filter(
                  (t) =>
                    !labSearchQuery ||
                    t.name.toLowerCase().includes(labSearchQuery.toLowerCase()) ||
                    (t.department && t.department.toLowerCase().includes(labSearchQuery.toLowerCase()))
                )
                .map((test) => {
                  const isChecked = selectedLabTestIds.includes(test._id);
                  return (
                    <label
                      key={test._id}
                      onClick={() => toggleLabTestSelection(test._id)}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                        isChecked ? 'bg-primary/10 border border-primary/25' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                        />
                        <div>
                          <div className="text-xs font-semibold text-foreground">{test.name}</div>
                          <div className="text-[10px] text-muted-foreground">{test.department || 'Diagnostic'}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-primary">{formatCurrency(test.price)}</div>
                        <div className="text-[10px] text-muted-foreground">{test.turnaroundTime || '24h'}</div>
                      </div>
                    </label>
                  );
                })
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOrderLabOpen(false)}
              disabled={createLabOrderMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedLabTestIds.length === 0) {
                  toast.error('Please select at least one test.');
                  return;
                }
                createLabOrderMutation.mutate({
                  patientId: selectedPatient._id,
                  testIds: selectedLabTestIds,
                });
              }}
              disabled={createLabOrderMutation.isPending || selectedLabTestIds.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createLabOrderMutation.isPending ? 'Placing Order...' : `Order Tests (${formatCurrency(labOrderModalTotal)})`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
