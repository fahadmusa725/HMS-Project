import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Ban,
  Shield,
  LogOut,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  AlertTriangle
} from 'lucide-react';

import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserIdentityBlock } from '@/components/UserIdentityBlock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

// Form validation schema for creating a hospital tenant
const createHospitalSchema = z.object({
  hospitalName: z.string().min(2, 'Hospital name must be at least 2 characters'),
  adminName: z.string().min(2, 'Admin name must be at least 2 characters'),
  adminEmail: z.string().email('Please enter a valid email address'),
  adminPassword: z.string().min(6, 'Password must be at least 6 characters'),
  trialDays: z.coerce.number().min(0, 'Trial days cannot be negative').default(14),
});

export default function SuperAdminDashboard() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('hospitals');

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [extendTrialHospital, setExtendTrialHospital] = useState(null);
  const [extendDays, setExtendDays] = useState(14);
  const [deleteHospitalTarget, setDeleteHospitalTarget] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [formError, setFormError] = useState(null);

  // Hook form setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
  } = useForm({
    resolver: zodResolver(createHospitalSchema),
    defaultValues: {
      hospitalName: '',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
      trialDays: 14,
    },
  });

  // Query: List hospitals
  const {
    data: hospitals = [],
    isLoading,
    isError,
    error: queryError,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['super-admin-hospitals'],
    queryFn: async () => {
      const response = await api.get('/api/super-admin/hospitals');
      return response.data;
    },
  });

  // Mutation: Create Hospital Tenant
  const createHospitalMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await api.post('/api/super-admin/hospitals', formData);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-hospitals'] });
      setIsAddModalOpen(false);
      reset();
      setFormError(null);
      toast.success(`Hospital "${data.hospital?.name}" successfully created!`);
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to create hospital tenant.';
      setFormError(message);
      toast.error(message);
    },
  });

  // Mutation: Update Hospital Status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ hospitalId, payload }) => {
      const response = await api.patch(`/api/super-admin/hospitals/${hospitalId}`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-hospitals'] });
      setExtendTrialHospital(null);
      toast.success(`Hospital "${data.name}" status updated to ${data.status.toUpperCase()}.`);
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to update hospital status.';
      toast.error(message);
    },
  });

  // Mutation: Delete Hospital Permanently
  const deleteHospitalMutation = useMutation({
    mutationFn: async (hospitalId) => {
      const response = await api.delete(`/api/super-admin/hospitals/${hospitalId}`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-hospitals'] });
      setDeleteHospitalTarget(null);
      setDeleteConfirmName('');
      toast.success(data?.message || 'Hospital and all associated data permanently deleted.');
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to delete hospital.';
      toast.error(message);
    },
  });

  const onSubmitAdd = (values) => {
    setFormError(null);
    createHospitalMutation.mutate(values);
  };

  const handleStatusChange = (hospitalId, status) => {
    updateStatusMutation.mutate({ hospitalId, payload: { status } });
  };

  const handleExtendTrialSubmit = (e) => {
    e.preventDefault();
    if (!extendTrialHospital) return;
    updateStatusMutation.mutate({
      hospitalId: extendTrialHospital._id,
      payload: {
        status: 'trial',
        trialDays: Number(extendDays),
      },
    });
  };

  // Helper formatting for trial dates
  const formatTrialRemaining = (hospital) => {
    if (hospital.status !== 'trial') return null;
    if (hospital.trialExpired) {
      return <span className="text-destructive font-semibold">Expired</span>;
    }
    if (!hospital.trialEndDate) return <span className="text-muted-foreground">Unlimited</span>;

    const end = new Date(hospital.trialEndDate);
    const now = new Date();
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return <span className="text-destructive font-semibold">Expired today</span>;
    }
    return (
      <span className="text-warning-foreground font-medium">
        Ends in {diffDays} day{diffDays === 1 ? '' : 's'}
      </span>
    );
  };

  // Compute summary stats
  const stats = useMemo(() => {
    const total = hospitals.length;
    const trial = hospitals.filter((h) => h.status === 'trial').length;
    const active = hospitals.filter((h) => h.status === 'active').length;
    const suspended = hospitals.filter((h) => h.status === 'suspended').length;
    return { total, trial, active, suspended };
  }, [hospitals]);

  // Filtered hospitals
  const filteredHospitals = useMemo(() => {
    return hospitals.filter((h) => {
      const matchesSearch =
        h.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h._id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || h.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [hospitals, searchQuery, statusFilter]);

  const navItems = [
    { id: 'hospitals', label: 'Hospital Tenants', icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Top Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30 shadow-soft-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-foreground">CareFlow HMS</span>
              <span className="ml-2 text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full border border-primary/20">
                Super Admin Console
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <UserIdentityBlock />
            <div className="h-6 w-px bg-border mx-1" />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar Layout */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto flex flex-col md:flex-row">
        {/* Left Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-card/50 p-4 shrink-0">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Platform Administration
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in space-y-8 min-w-0">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Hospital Tenants
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                Provision, monitor, and configure multi-tenant hospital environments.
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
                  setIsAddModalOpen(true);
                }}
                className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Add New Hospital</span>
              </Button>
            </div>
          </div>

          {/* Stat Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <Card className="bg-card hover:shadow-soft transition-all border-border">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Hospitals
                  </p>
                  <h3 className="text-2xl font-extrabold text-foreground mt-1">
                    {isLoading ? '—' : stats.total}
                  </h3>
                </div>
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Building2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card hover:shadow-soft transition-all border-border">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Tenants
                  </p>
                  <h3 className="text-2xl font-extrabold text-primary mt-1">
                    {isLoading ? '—' : stats.active}
                  </h3>
                </div>
                <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card hover:shadow-soft transition-all border-border">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Trial Mode
                  </p>
                  <h3 className="text-2xl font-extrabold text-warning-foreground mt-1">
                    {isLoading ? '—' : stats.trial}
                  </h3>
                </div>
                <div className="h-11 w-11 rounded-xl bg-warning/15 text-warning-foreground flex items-center justify-center">
                  <Clock className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card hover:shadow-soft transition-all border-border">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Suspended
                  </p>
                  <h3 className="text-2xl font-extrabold text-muted-foreground mt-1">
                    {isLoading ? '—' : stats.suspended}
                  </h3>
                </div>
                <div className="h-11 w-11 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                  <Ban className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table Container */}
          <Card className="bg-card border-border shadow-soft overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
              {/* Search */}
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by hospital name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 w-full bg-card border-border"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {['all', 'active', 'trial', 'suspended'].map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setStatusFilter(filterKey)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                      statusFilter === filterKey
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-border/40 animate-pulse">
                      <div className="space-y-2">
                        <div className="h-4 w-48 bg-muted rounded"></div>
                        <div className="h-3 w-28 bg-muted/60 rounded"></div>
                      </div>
                      <div className="h-6 w-20 bg-muted rounded-full"></div>
                      <div className="h-8 w-24 bg-muted rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="p-12 text-center">
                  <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
                  <h3 className="text-base font-bold text-foreground">Error loading hospitals</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    {queryError?.message || 'Could not communicate with the backend server.'}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Try Again
                  </Button>
                </div>
              ) : filteredHospitals.length === 0 ? (
                <div className="p-12 sm:p-16 text-center animate-fade-in">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">
                    {searchQuery || statusFilter !== 'all' ? 'No matching hospitals' : 'No hospitals yet'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-6">
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your search criteria or active filters.'
                      : 'Get started by creating your first hospital tenant on the platform.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <th className="py-3.5 px-6">Hospital Name</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Trial Status</th>
                      <th className="py-3.5 px-4">Created Date</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHospitals.map((hospital) => (
                      <tr key={hospital._id} className="hover:bg-accent/40 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            <span>{hospital.name}</span>
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            ID: {hospital._id}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={hospital.status}>
                            {hospital.status}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-xs">
                          {hospital.status === 'trial' ? (
                            formatTrialRemaining(hospital)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-xs text-muted-foreground">
                          {hospital.createdAt
                            ? new Date(hospital.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hospital.status !== 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(hospital._id, 'active')}
                                disabled={updateStatusMutation.isPending}
                                className="h-8 text-xs font-semibold text-primary hover:bg-primary/10 hover:border-primary/40"
                              >
                                Activate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setExtendTrialHospital(hospital);
                                setExtendDays(14);
                              }}
                              disabled={updateStatusMutation.isPending}
                              className="h-8 text-xs font-semibold text-secondary hover:bg-secondary/10 hover:border-secondary/40"
                            >
                              Extend Trial
                            </Button>
                            {hospital.status !== 'suspended' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(hospital._id, 'suspended')}
                                disabled={updateStatusMutation.isPending || deleteHospitalMutation.isPending}
                                className="h-8 text-xs font-semibold text-muted-foreground hover:text-warning hover:bg-warning/10 hover:border-warning/30"
                              >
                                Suspend
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDeleteHospitalTarget(hospital);
                                setDeleteConfirmName('');
                              }}
                              disabled={updateStatusMutation.isPending || deleteHospitalMutation.isPending}
                              className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:border-destructive/40"
                              title="Permanently Delete Hospital Tenant"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </main>
      </div>

      {/* Modal: Add New Hospital */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          if (!createHospitalMutation.isPending) setIsAddModalOpen(false);
        }}
        title="Add New Hospital Tenant"
        description="Provision a new isolated hospital environment and assign its root Hospital Administrator."
      >
        {formError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive animate-slide-up font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitAdd)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Hospital Name
            </label>
            <Input
              placeholder="e.g. City General Hospital"
              {...register('hospitalName')}
              disabled={createHospitalMutation.isPending}
              className={formErrors.hospitalName ? 'border-destructive' : ''}
            />
            {formErrors.hospitalName && (
              <p className="text-xs text-destructive">{formErrors.hospitalName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Admin Name
              </label>
              <Input
                placeholder="Dr. Sarah Johnson"
                {...register('adminName')}
                disabled={createHospitalMutation.isPending}
                className={formErrors.adminName ? 'border-destructive' : ''}
              />
              {formErrors.adminName && (
                <p className="text-xs text-destructive">{formErrors.adminName.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Trial Days
              </label>
              <Input
                type="number"
                min="0"
                placeholder="14"
                {...register('trialDays')}
                disabled={createHospitalMutation.isPending}
                className={formErrors.trialDays ? 'border-destructive' : ''}
              />
              {formErrors.trialDays && (
                <p className="text-xs text-destructive">{formErrors.trialDays.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Admin Email
            </label>
            <Input
              type="email"
              placeholder="admin@citygeneral.org"
              {...register('adminEmail')}
              disabled={createHospitalMutation.isPending}
              className={formErrors.adminEmail ? 'border-destructive' : ''}
            />
            {formErrors.adminEmail && (
              <p className="text-xs text-destructive">{formErrors.adminEmail.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Admin Password
            </label>
            <Input
              type="password"
              placeholder="••••••••••••"
              {...register('adminPassword')}
              disabled={createHospitalMutation.isPending}
              className={formErrors.adminPassword ? 'border-destructive' : ''}
            />
            {formErrors.adminPassword && (
              <p className="text-xs text-destructive">{formErrors.adminPassword.message}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={createHospitalMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createHospitalMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createHospitalMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Provisioning...
                </>
              ) : (
                'Create Hospital'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Extend Trial */}
      <Modal
        isOpen={!!extendTrialHospital}
        onClose={() => setExtendTrialHospital(null)}
        title="Extend Trial Period"
        description={`Set a new trial period duration for "${extendTrialHospital?.name}".`}
      >
        <form onSubmit={handleExtendTrialSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Additional / New Trial Days
            </label>
            <Input
              type="number"
              min="1"
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              disabled={updateStatusMutation.isPending}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExtendTrialHospital(null)}
              disabled={updateStatusMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateStatusMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {updateStatusMutation.isPending ? 'Updating...' : 'Save Trial Extension'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Hospital Confirmation */}
      <Modal
        isOpen={!!deleteHospitalTarget}
        onClose={() => {
          if (!deleteHospitalMutation.isPending) {
            setDeleteHospitalTarget(null);
            setDeleteConfirmName('');
          }
        }}
        title="Delete Hospital Permanently"
        description="Irreversible destructive action - all hospital data will be permanently removed."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive leading-relaxed font-medium">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-bold text-sm text-destructive">
                Warning: Irreversible Tenant Data Destruction
              </p>
              <p>
                Deleting <strong>{deleteHospitalTarget?.name}</strong> will permanently erase all of that hospital's data (staff, patients, appointments, consultations, wards, beds, admissions, nurse notes, and counters) with no way to recover it.
              </p>
              <p className="font-bold underline">
                This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/90 block">
              To confirm deletion, please type the exact hospital name <span className="font-mono font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded border border-destructive/20 select-all">{deleteHospitalTarget?.name}</span> below:
            </label>
            <Input
              placeholder={deleteHospitalTarget?.name}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              disabled={deleteHospitalMutation.isPending}
              className="border-destructive/40 focus-visible:ring-destructive font-medium"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteHospitalTarget(null);
                setDeleteConfirmName('');
              }}
              disabled={deleteHospitalMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleteConfirmName.trim() !== deleteHospitalTarget?.name ||
                deleteHospitalMutation.isPending
              }
              onClick={() => {
                if (deleteHospitalTarget && deleteConfirmName.trim() === deleteHospitalTarget.name) {
                  deleteHospitalMutation.mutate(deleteHospitalTarget._id);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              {deleteHospitalMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting Everything...
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete Hospital
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
