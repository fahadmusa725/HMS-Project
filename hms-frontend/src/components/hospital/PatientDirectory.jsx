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
  Edit2
} from 'lucide-react';
import api from '@/lib/api';
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

export default function PatientDirectory() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [formError, setFormError] = useState(null);

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
            {!isEditingDetail ? (
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

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Registered on: {new Date(selectedPatient.createdAt).toLocaleDateString()}
                  </span>
                  <Button
                    type="button"
                    onClick={() => setIsEditingDetail(true)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            ) : (
              /* Edit Mode */
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
    </div>
  );
}
