import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bed,
  LayoutGrid,
  ClipboardList,
  Settings,
  UserPlus,
  RefreshCw,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Plus,
  Search,
  Building2,
  Stethoscope,
  CalendarDays,
  FileText,
  Check,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';

// ─── Bed status — CSS variable token colours ONLY (no raw Tailwind colour classes) ───
const BED_STYLES = {
  vacant:   'bg-primary/10 border-primary/40 text-primary',
  occupied: 'bg-muted/60 border-border text-foreground',
  reserved: 'bg-warning/15 border-warning/40 text-warning-foreground',
};
const BED_ICON = {
  vacant:   <CheckCircle2 className="h-4 w-4" />,
  occupied: <XCircle className="h-4 w-4" />,
  reserved: <Clock className="h-4 w-4" />,
};
const BED_LABELS = { vacant: 'Vacant', occupied: 'Occupied', reserved: 'Reserved' };

export default function WardsBeds() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.role;

  const isAdmin   = role === 'hospital_admin';
  const canAdmit  = ['hospital_admin', 'doctor', 'nurse'].includes(role);
  // Receptionist can VIEW detail but NOT add notes or discharge
  const canActOnIPD = ['hospital_admin', 'doctor', 'nurse'].includes(role);

  // ── View state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('beds');

  // ── Bed grid filters ──────────────────────────────────────────────────────
  const [wardFilter, setWardFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── Manage wards state ────────────────────────────────────────────────────
  const [selectedWardForManage, setSelectedWardForManage] = useState(null);
  const [isAddWardOpen, setIsAddWardOpen] = useState(false);
  const [isAddBedsOpen, setIsAddBedsOpen] = useState(false);
  const [addWardName, setAddWardName] = useState('');
  const [addWardDept, setAddWardDept] = useState('');
  const [addBedsInput, setAddBedsInput] = useState('');
  const [wardFormError, setWardFormError] = useState(null);
  const [bedsFormError, setBedsFormError] = useState(null);

  // ── Admit state ───────────────────────────────────────────────────────────
  const [isAdmitOpen, setIsAdmitOpen] = useState(false);
  const [admitError, setAdmitError] = useState(null);
  const [admitPatientSearch, setAdmitPatientSearch] = useState('');
  const [admitPatientId, setAdmitPatientId] = useState('');
  const [admitPatientLabel, setAdmitPatientLabel] = useState('');
  const [admitWardId, setAdmitWardId] = useState('');
  const [admitBedId, setAdmitBedId] = useState('');
  const [admitDoctorId, setAdmitDoctorId] = useState(
    role === 'doctor' ? (user?.id || '') : ''
  );
  const [admitReason, setAdmitReason] = useState('');

  // ── IPD detail state ──────────────────────────────────────────────────────
  const [selectedAdmission, setSelectedAdmission] = useState(null);
  const [isDischargeOpen, setIsDischargeOpen] = useState(false);
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteVitals, setNoteVitals] = useState({
    bloodPressure: '',
    temperature: '',
    pulse: '',
  });

  // ── Queries ───────────────────────────────────────────────────────────────

  // Ward list (shared across all tabs)
  const { data: wards = [], isLoading: wardsLoading } = useQuery({
    queryKey: ['wards'],
    queryFn: async () => {
      const res = await api.get('/api/wards');
      return res.data;
    },
  });

  // Beds for the status grid (respects filters)
  const {
    data: gridBeds = [],
    isLoading: bedsLoading,
    isRefetching: bedsRefetching,
    refetch: refetchBeds,
  } = useQuery({
    queryKey: ['beds-grid', wardFilter, statusFilter],
    queryFn: async () => {
      const params = {};
      if (wardFilter !== 'all') params.wardId = wardFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/api/wards/beds/all', { params });
      return res.data;
    },
  });

  // Beds for selected ward in manage panel (all statuses)
  const { data: manageBeds = [], isLoading: manageBedsLoading } = useQuery({
    queryKey: ['beds-manage', selectedWardForManage?._id],
    queryFn: async () => {
      const res = await api.get('/api/wards/beds/all', {
        params: { wardId: selectedWardForManage._id },
      });
      return res.data;
    },
    enabled: !!selectedWardForManage,
  });

  // Vacant beds for the admit form (re-fetches when ward changes)
  const { data: vacantBeds = [], isLoading: vacantBedsLoading } = useQuery({
    queryKey: ['beds-vacant', admitWardId],
    queryFn: async () => {
      const res = await api.get('/api/wards/beds/all', {
        params: { wardId: admitWardId, status: 'vacant' },
      });
      return res.data;
    },
    enabled: isAdmitOpen && !!admitWardId,
  });

  // Patient search for admit form
  const { data: admitPatientResults = { patients: [] } } = useQuery({
    queryKey: ['admit-patient-search', admitPatientSearch],
    queryFn: async () => {
      if (!admitPatientSearch.trim()) return { patients: [] };
      const res = await api.get('/api/patients', {
        params: { search: admitPatientSearch, limit: 8 },
      });
      return res.data;
    },
    enabled: isAdmitOpen && admitPatientSearch.trim().length > 0,
  });

  // Doctor list for admit form (hospital_admin only; others get empty → fallback logic)
  const { data: doctorsList = [] } = useQuery({
    queryKey: ['doctors-list'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/hospital-admin/staff');
        return res.data.filter((s) => s.role === 'doctor');
      } catch {
        return [];
      }
    },
    enabled: isAdmitOpen,
  });

  // Active admissions list
  const {
    data: admissions = [],
    isLoading: admissionsLoading,
    isRefetching: admissionsRefetching,
    refetch: refetchAdmissions,
  } = useQuery({
    queryKey: ['admissions'],
    queryFn: async () => {
      const res = await api.get('/api/admissions');
      return res.data;
    },
  });

  // Rounds notes for the selected admission
  const {
    data: admissionNotes = [],
    isLoading: notesLoading,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: ['admission-notes', selectedAdmission?._id],
    queryFn: async () => {
      const res = await api.get(`/api/admissions/${selectedAdmission._id}/notes`);
      return res.data;
    },
    enabled: !!selectedAdmission,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createWardMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/wards', {
        name: addWardName.trim(),
        department: addWardDept.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wards'] });
      setIsAddWardOpen(false);
      setAddWardName('');
      setAddWardDept('');
      setWardFormError(null);
      toast.success('Ward created successfully!');
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to create ward.';
      setWardFormError(msg);
      toast.error(msg);
    },
  });

  const addBedsMutation = useMutation({
    mutationFn: async () => {
      const bedNumbers = addBedsInput
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);
      const res = await api.post(`/api/wards/${selectedWardForManage._id}/beds`, {
        bedNumbers,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beds-grid'] });
      queryClient.invalidateQueries({ queryKey: ['beds-manage'] });
      setIsAddBedsOpen(false);
      setAddBedsInput('');
      setBedsFormError(null);
      toast.success('Beds added successfully!');
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to add beds.';
      setBedsFormError(msg);
      toast.error(msg);
    },
  });

  const admitMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/admissions', {
        patientId: admitPatientId,
        wardId: admitWardId,
        bedId: admitBedId,
        doctorId: admitDoctorId,
        reason: admitReason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
      queryClient.invalidateQueries({ queryKey: ['beds-grid'] });
      queryClient.invalidateQueries({ queryKey: ['beds-vacant'] });
      setIsAdmitOpen(false);
      resetAdmitForm();
      toast.success('Patient admitted successfully!', {
        description: 'Bed status updated to occupied.',
      });
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to admit patient.';
      const is409 = err.response?.status === 409;
      setAdmitError({ message: msg, isBedConflict: is409 });
      toast.error(msg);
    },
  });

  const dischargeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch(
        `/api/admissions/${selectedAdmission._id}/discharge`,
        { dischargeNotes }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
      queryClient.invalidateQueries({ queryKey: ['beds-grid'] });
      queryClient.invalidateQueries({ queryKey: ['beds-vacant'] });
      setIsDischargeOpen(false);
      setSelectedAdmission(null);
      setDischargeNotes('');
      toast.success('Patient discharged. Bed is now vacant.', {
        description: 'The bed has been freed for the next patient.',
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to discharge patient.');
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const vitalsPayload = Object.fromEntries(
        Object.entries(noteVitals).filter(([, v]) => v.trim())
      );
      const res = await api.post(
        `/api/admissions/${selectedAdmission._id}/notes`,
        {
          note: noteText,
          ...(Object.keys(vitalsPayload).length > 0 ? { vitals: vitalsPayload } : {}),
        }
      );
      return res.data;
    },
    onSuccess: () => {
      refetchNotes();
      setNoteText('');
      setNoteVitals({ bloodPressure: '', temperature: '', pulse: '' });
      toast.success('Round note added.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to add note.');
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const resetAdmitForm = () => {
    setAdmitPatientSearch('');
    setAdmitPatientId('');
    setAdmitPatientLabel('');
    setAdmitWardId('');
    setAdmitBedId('');
    setAdmitDoctorId(role === 'doctor' ? (user?.id || '') : '');
    setAdmitReason('');
    setAdmitError(null);
  };

  // Group grid beds by ward for the visual floor board
  const bedsByWard = useMemo(() => {
    const map = {};
    gridBeds.forEach((bed) => {
      const key = bed.wardId?._id || 'unknown';
      if (!map[key]) {
        map[key] = {
          _id: key,
          name: bed.wardId?.name || 'Unknown Ward',
          department: bed.wardId?.department || '',
          beds: [],
        };
      }
      map[key].beds.push(bed);
    });
    return Object.values(map);
  }, [gridBeds]);

  const parsedBedNumbers = addBedsInput
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  const tabs = [
    { id: 'beds',   label: 'Bed Status',    Icon: LayoutGrid },
    { id: 'ipd',    label: 'Active IPD',    Icon: ClipboardList },
    ...(isAdmin ? [{ id: 'manage', label: 'Manage Wards', Icon: Settings }] : []),
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Wards &amp; Bed Management
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Live floor status board, IPD admissions, rounds notes, and discharge.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchBeds(); refetchAdmissions(); }}
            disabled={bedsRefetching || admissionsRefetching}
            className="h-10 px-3 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                bedsRefetching || admissionsRefetching ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </Button>
          {canAdmit && (
            <Button
              onClick={() => { resetAdmitForm(); setIsAdmitOpen(true); }}
              className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 shadow-sm"
            >
              <UserPlus className="h-4 w-4" />
              Admit Patient
            </Button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl border border-border/60 w-fit">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === id
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* BED STATUS GRID                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'beds' && (
        <div className="space-y-5">
          {/* Filters + Legend */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={wardFilter}
              onChange={(e) => setWardFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">All Wards</option>
              {wards.map((w) => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="reserved">Reserved</option>
            </select>

            {/* Legend */}
            <div className="flex items-center gap-4 ml-auto">
              {(['vacant', 'occupied', 'reserved']).map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <span className={`h-3.5 w-3.5 rounded border-2 ${BED_STYLES[s]}`} />
                  {BED_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          {bedsLoading ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : gridBeds.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-soft">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <Bed className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">No beds to display</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isAdmin
                  ? 'Go to the Manage Wards tab to create wards and add beds.'
                  : 'No beds have been configured yet.'}
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {bedsByWard.map((wardGroup) => (
                <div key={wardGroup._id}>
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <h3 className="text-sm font-bold text-foreground">{wardGroup.name}</h3>
                    {wardGroup.department && (
                      <span className="text-xs text-muted-foreground">· {wardGroup.department}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground font-medium">
                      <span className="text-primary font-bold">
                        {wardGroup.beds.filter((b) => b.status === 'vacant').length}
                      </span>
                      /{wardGroup.beds.length} vacant
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
                    {wardGroup.beds.map((bed) => (
                      <div
                        key={bed._id}
                        title={`Bed ${bed.bedNumber} — ${BED_LABELS[bed.status] || bed.status}`}
                        className={`flex flex-col items-center justify-center gap-0.5 p-2.5 rounded-xl border-2 transition-all ${BED_STYLES[bed.status] || BED_STYLES.vacant}`}
                      >
                        {BED_ICON[bed.status] || BED_ICON.vacant}
                        <span className="text-[11px] font-bold leading-none mt-0.5">
                          {bed.bedNumber}
                        </span>
                        <span className="text-[9px] capitalize leading-none opacity-75">
                          {bed.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ACTIVE IPD LIST                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ipd' && !selectedAdmission && (
        <div className="space-y-4">
          {admissionsLoading ? (
            <Card className="border-border shadow-soft overflow-hidden">
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between animate-pulse">
                    <div className="space-y-1.5">
                      <div className="h-4 w-40 bg-muted rounded" />
                      <div className="h-3 w-24 bg-muted/60 rounded" />
                    </div>
                    <div className="h-3 w-24 bg-muted rounded hidden sm:block" />
                    <div className="h-3 w-24 bg-muted rounded hidden sm:block" />
                  </div>
                ))}
              </div>
            </Card>
          ) : admissions.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-soft">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">No active admissions</p>
              <p className="text-xs text-muted-foreground mt-1">
                Admitted patients will appear here.
              </p>
            </Card>
          ) : (
            <Card className="bg-card border-border shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <th className="py-3.5 px-6">Patient</th>
                      <th className="py-3.5 px-4">Ward / Bed</th>
                      <th className="py-3.5 px-4">Doctor</th>
                      <th className="py-3.5 px-4">Admit Date</th>
                      <th className="py-3.5 px-6">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {admissions.map((adm) => (
                      <tr
                        key={adm._id}
                        onClick={() => setSelectedAdmission(adm)}
                        className="hover:bg-accent/40 cursor-pointer transition-colors group"
                      >
                        <td className="py-4 px-6">
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {adm.patientId?.name || '—'}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {adm.patientId?.mrn || ''}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-xs font-medium text-foreground">
                            {adm.wardId?.name || '—'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Bed {adm.bedId?.bedNumber || '—'}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-xs text-foreground">
                          {adm.doctorId?.name ? `Dr. ${adm.doctorId.name}` : '—'}
                        </td>
                        <td className="py-4 px-4 text-xs text-muted-foreground">
                          {adm.createdAt
                            ? new Date(adm.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric', month: 'short', day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="py-4 px-6 text-xs text-foreground max-w-[180px]">
                          <span className="line-clamp-1">{adm.reason || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* IPD DETAIL PANEL                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ipd' && selectedAdmission && (
        <div className="space-y-5 animate-fade-in">
          {/* Back */}
          <button
            onClick={() => setSelectedAdmission(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to IPD List
          </button>

          {/* Admission info card */}
          <Card className="p-5 border-border shadow-soft">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-foreground">
                  {selectedAdmission.patientId?.name}
                </h3>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  MRN: {selectedAdmission.patientId?.mrn || '—'}
                </p>
              </div>
              {/* Discharge button — clinical staff only */}
              {canActOnIPD && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDischargeOpen(true)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive shrink-0"
                >
                  Discharge Patient
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                {
                  label: 'Ward',
                  value: selectedAdmission.wardId?.name || '—',
                  Icon: Building2,
                },
                {
                  label: 'Bed',
                  value: `Bed ${selectedAdmission.bedId?.bedNumber || '—'}`,
                  Icon: Bed,
                },
                {
                  label: 'Doctor',
                  value: selectedAdmission.doctorId?.name
                    ? `Dr. ${selectedAdmission.doctorId.name}`
                    : '—',
                  Icon: Stethoscope,
                },
                {
                  label: 'Admitted',
                  value: selectedAdmission.createdAt
                    ? new Date(selectedAdmission.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                    : '—',
                  Icon: CalendarDays,
                },
              ].map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="p-3 bg-muted/40 rounded-xl border border-border/50"
                >
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                  <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {selectedAdmission.reason && (
              <div className="mt-3 p-3 bg-muted/40 rounded-xl border border-border/50">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Admission Reason
                </span>
                <p className="text-sm text-foreground mt-0.5">{selectedAdmission.reason}</p>
              </div>
            )}
          </Card>

          {/* Rounds Notes + Add Note */}
          <Card className="border-border shadow-soft overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border bg-muted/20 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Rounds Notes</h3>
              <span className="ml-auto text-xs text-muted-foreground font-medium">
                {admissionNotes.length}{' '}
                {admissionNotes.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {/* Notes list */}
            <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
              {notesLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse space-y-1.5">
                      <div className="h-3 w-32 bg-muted rounded" />
                      <div className="h-4 w-full bg-muted/70 rounded" />
                    </div>
                  ))}
                </div>
              ) : admissionNotes.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No rounds notes yet.{' '}
                  {canActOnIPD ? 'Add the first note below.' : ''}
                </div>
              ) : (
                admissionNotes.map((n) => (
                  <div key={n._id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {n.nurseId?.name || 'Staff'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{n.note}</p>
                    {n.vitals && Object.values(n.vitals).some(Boolean) && (
                      <div className="flex flex-wrap gap-1.5">
                        {n.vitals.bloodPressure && (
                          <span className="text-[10px] bg-muted border border-border px-2 py-0.5 rounded-full font-medium">
                            BP: {n.vitals.bloodPressure}
                          </span>
                        )}
                        {n.vitals.temperature && (
                          <span className="text-[10px] bg-muted border border-border px-2 py-0.5 rounded-full font-medium">
                            Temp: {n.vitals.temperature}
                          </span>
                        )}
                        {n.vitals.pulse && (
                          <span className="text-[10px] bg-muted border border-border px-2 py-0.5 rounded-full font-medium">
                            Pulse: {n.vitals.pulse}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add Note form — clinical staff only, NOT receptionist */}
            {canActOnIPD && (
              <div className="p-4 sm:p-5 border-t border-border bg-muted/10 space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Add Rounds Note
                </h4>
                <textarea
                  placeholder="Clinical observations, patient status, treatment updates..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  disabled={addNoteMutation.isPending}
                  rows={3}
                  className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
                />
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'bloodPressure', label: 'BP', ph: '120/80' },
                    { key: 'temperature', label: 'Temp', ph: '98.6 F' },
                    { key: 'pulse', label: 'Pulse', ph: '76 bpm' },
                  ].map(({ key, label, ph }) => (
                    <div key={key} className="space-y-0.5">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                        {label}
                      </label>
                      <Input
                        placeholder={ph}
                        value={noteVitals[key]}
                        onChange={(e) =>
                          setNoteVitals((v) => ({ ...v, [key]: e.target.value }))
                        }
                        disabled={addNoteMutation.isPending}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => addNoteMutation.mutate()}
                    disabled={addNoteMutation.isPending || !noteText.trim()}
                    className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                  >
                    {addNoteMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Note
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MANAGE WARDS (hospital_admin only)                                 */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'manage' && isAdmin && (
        <div className="space-y-5">
          {selectedWardForManage ? (
            /* Ward drill-down: bed list */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setSelectedWardForManage(null)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  All Wards
                </button>
                <h3 className="text-sm font-bold text-foreground">
                  {selectedWardForManage.name}
                </h3>
                {selectedWardForManage.department && (
                  <span className="text-xs text-muted-foreground">
                    · {selectedWardForManage.department}
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={() => { setBedsFormError(null); setIsAddBedsOpen(true); }}
                  className="ml-auto h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Beds
                </Button>
              </div>

              {manageBedsLoading ? (
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : manageBeds.length === 0 ? (
                <Card className="p-10 text-center border-border shadow-soft">
                  <p className="text-sm font-semibold text-foreground">
                    No beds in this ward
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click &ldquo;Add Beds&rdquo; to bulk-create beds.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {manageBeds.map((bed) => (
                    <div
                      key={bed._id}
                      className={`flex flex-col items-center justify-center gap-0.5 p-2.5 rounded-xl border-2 ${BED_STYLES[bed.status] || BED_STYLES.vacant}`}
                    >
                      {BED_ICON[bed.status] || BED_ICON.vacant}
                      <span className="text-[11px] font-bold">{bed.bedNumber}</span>
                      <span className="text-[9px] capitalize opacity-75">{bed.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Ward list */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {wards.length} ward{wards.length !== 1 ? 's' : ''} configured
                </p>
                <Button
                  onClick={() => { setWardFormError(null); setIsAddWardOpen(true); }}
                  className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Ward
                </Button>
              </div>

              {wardsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-24 rounded-2xl bg-muted animate-pulse"
                    />
                  ))}
                </div>
              ) : wards.length === 0 ? (
                <Card className="p-12 text-center border-border shadow-soft">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No wards yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Create the first ward to start managing beds.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => { setWardFormError(null); setIsAddWardOpen(true); }}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Ward
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {wards.map((ward) => (
                    <Card
                      key={ward._id}
                      onClick={() => setSelectedWardForManage(ward)}
                      className="p-5 hover:border-primary/50 cursor-pointer transition-all hover:shadow-soft group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="mt-3">
                        <h4 className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {ward.name}
                        </h4>
                        {ward.department && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ward.department}
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Admit Patient                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isAdmitOpen}
        onClose={() => {
          if (!admitMutation.isPending) {
            setIsAdmitOpen(false);
            resetAdmitForm();
          }
        }}
        title="Admit Patient"
        description="Select a patient, ward, and bed for IPD admission."
      >
        <div className="space-y-4 max-h-[62vh] overflow-y-auto pr-1">
          {admitError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium animate-slide-up">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p>{admitError.message}</p>
                {admitError.isBedConflict && (
                  <p className="mt-1 font-bold">
                    Please select a different vacant bed below.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Patient search */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Patient *
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or MRN..."
                value={admitPatientLabel || admitPatientSearch}
                onChange={(e) => {
                  if (admitPatientId) {
                    setAdmitPatientId('');
                    setAdmitPatientLabel('');
                  }
                  setAdmitPatientSearch(e.target.value);
                }}
                className="pl-9 h-10"
                disabled={admitMutation.isPending}
              />
            </div>
            {!admitPatientId && admitPatientResults.patients.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-border rounded-lg bg-card shadow-soft p-1 space-y-0.5">
                {admitPatientResults.patients.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => {
                      setAdmitPatientId(p._id);
                      setAdmitPatientLabel(`${p.name} (${p.mrn})`);
                      setAdmitPatientSearch('');
                    }}
                    className="flex items-center justify-between p-2 rounded text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <span className="font-semibold text-foreground">{p.name}</span>
                    <span className="text-muted-foreground font-mono">{p.mrn}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ward select */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Ward *
            </label>
            <select
              value={admitWardId}
              onChange={(e) => {
                setAdmitWardId(e.target.value);
                setAdmitBedId('');
                setAdmitError(null);
              }}
              disabled={admitMutation.isPending}
              className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">— Select Ward —</option>
              {wards.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}{w.department ? ` (${w.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Bed select — auto-filtered to vacant beds in chosen ward */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Bed *{' '}
              <span className="font-normal text-muted-foreground">(vacant only)</span>
            </label>
            <select
              value={admitBedId}
              onChange={(e) => {
                setAdmitBedId(e.target.value);
                setAdmitError(null);
              }}
              disabled={admitMutation.isPending || !admitWardId || vacantBedsLoading}
              className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <option value="">
                {!admitWardId
                  ? '— Select a ward first —'
                  : vacantBedsLoading
                  ? 'Loading vacant beds...'
                  : vacantBeds.length === 0
                  ? 'No vacant beds in this ward'
                  : '— Select Bed —'}
              </option>
              {vacantBeds.map((b) => (
                <option key={b._id} value={b._id}>
                  Bed {b.bedNumber}
                </option>
              ))}
            </select>
          </div>

          {/* Doctor select / display */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Doctor *
            </label>
            {role === 'doctor' ? (
              <div className="h-10 flex items-center gap-2 px-3.5 rounded-lg border border-input bg-muted/40 text-sm text-foreground">
                <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                Dr. {user?.name}
                <span className="text-muted-foreground ml-1">(you)</span>
              </div>
            ) : doctorsList.length > 0 ? (
              <select
                value={admitDoctorId}
                onChange={(e) => setAdmitDoctorId(e.target.value)}
                disabled={admitMutation.isPending}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">— Select Doctor —</option>
                {doctorsList.map((d) => (
                  <option key={d._id} value={d._id}>
                    Dr. {d.name}{d.department ? ` (${d.department})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                placeholder="Enter doctor staff ID"
                value={admitDoctorId}
                onChange={(e) => setAdmitDoctorId(e.target.value)}
                disabled={admitMutation.isPending}
                className="h-10"
              />
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Reason for Admission *
            </label>
            <textarea
              placeholder="Describe the reason for admission..."
              value={admitReason}
              onChange={(e) => setAdmitReason(e.target.value)}
              disabled={admitMutation.isPending}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button
            variant="outline"
            onClick={() => { setIsAdmitOpen(false); resetAdmitForm(); }}
            disabled={admitMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => admitMutation.mutate()}
            disabled={
              admitMutation.isPending ||
              !admitPatientId ||
              !admitWardId ||
              !admitBedId ||
              !admitDoctorId ||
              !admitReason.trim()
            }
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {admitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Admitting...
              </>
            ) : (
              <>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Confirm Admission
              </>
            )}
          </Button>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Discharge Confirmation                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isDischargeOpen}
        onClose={() => {
          if (!dischargeMutation.isPending) {
            setIsDischargeOpen(false);
            setDischargeNotes('');
          }
        }}
        title="Discharge Patient"
        description={
          selectedAdmission
            ? `Discharging ${selectedAdmission.patientId?.name} from Bed ${selectedAdmission.bedId?.bedNumber || '—'}`
            : ''
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            This will discharge the patient and immediately free the bed. This action cannot be undone.
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Discharge Notes{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              placeholder="Summary of treatment, discharge instructions, follow-up plan..."
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              disabled={dischargeMutation.isPending}
              rows={4}
              className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-60"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => { setIsDischargeOpen(false); setDischargeNotes(''); }}
              disabled={dischargeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => dischargeMutation.mutate()}
              disabled={dischargeMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              {dischargeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discharging...
                </>
              ) : (
                'Confirm Discharge'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Add Ward                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isAddWardOpen}
        onClose={() => {
          if (!createWardMutation.isPending) {
            setIsAddWardOpen(false);
            setAddWardName('');
            setAddWardDept('');
            setWardFormError(null);
          }
        }}
        title="Add New Ward"
        description="Create a ward to house beds and patients."
      >
        <div className="space-y-4">
          {wardFormError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {wardFormError}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Ward Name *
            </label>
            <Input
              placeholder="e.g. Male Medical Ward"
              value={addWardName}
              onChange={(e) => setAddWardName(e.target.value)}
              disabled={createWardMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Department{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              placeholder="e.g. General Medicine, Cardiology"
              value={addWardDept}
              onChange={(e) => setAddWardDept(e.target.value)}
              disabled={createWardMutation.isPending}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddWardOpen(false);
                setAddWardName('');
                setAddWardDept('');
                setWardFormError(null);
              }}
              disabled={createWardMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createWardMutation.mutate()}
              disabled={createWardMutation.isPending || !addWardName.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createWardMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Ward'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Add Beds                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isAddBedsOpen}
        onClose={() => {
          if (!addBedsMutation.isPending) {
            setIsAddBedsOpen(false);
            setAddBedsInput('');
            setBedsFormError(null);
          }
        }}
        title={`Add Beds — ${selectedWardForManage?.name || ''}`}
        description="Enter comma-separated bed numbers to bulk-create."
      >
        <div className="space-y-4">
          {bedsFormError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {bedsFormError}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Bed Numbers *
            </label>
            <Input
              placeholder="e.g. 101, 102, 103, 104"
              value={addBedsInput}
              onChange={(e) => setAddBedsInput(e.target.value)}
              disabled={addBedsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Separate numbers with commas. Each creates one vacant bed.
            </p>
          </div>

          {/* Preview of beds to be added */}
          {parsedBedNumbers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parsedBedNumbers.map((b, i) => (
                <span
                  key={i}
                  className="text-xs bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-medium"
                >
                  {b}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddBedsOpen(false);
                setAddBedsInput('');
                setBedsFormError(null);
              }}
              disabled={addBedsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addBedsMutation.mutate()}
              disabled={addBedsMutation.isPending || parsedBedNumbers.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {addBedsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add {parsedBedNumbers.length} Bed
                  {parsedBedNumbers.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
