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
  Mail,
  Building
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

const staffSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['doctor', 'receptionist', 'nurse', 'lab_technician', 'pharmacist', 'accountant'], {
    required_error: 'Please select a role',
  }),
  department: z.string().optional(),
});

const ROLE_LABELS = {
  doctor: 'Doctor / Physician',
  receptionist: 'Receptionist / Front Desk',
  nurse: 'Nursing Staff',
  lab_technician: 'Lab Technician',
  pharmacist: 'Pharmacist',
  accountant: 'Accountant / Billing',
};

export default function StaffManagement() {
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'doctor',
      department: '',
    },
  });

  // Query: Staff list
  const {
    data: staffList = [],
    isLoading,
    isError,
    error: queryError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['hospital-staff'],
    queryFn: async () => {
      const response = await api.get('/api/hospital-admin/staff');
      return response.data;
    },
  });

  // Mutation: Invite Staff
  const inviteMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await api.post('/api/hospital-admin/staff', formData);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hospital-staff'] });
      setIsInviteOpen(false);
      reset();
      setFormError(null);
      toast.success(`Staff member "${data.name}" successfully invited as ${ROLE_LABELS[data.role] || data.role}!`);
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Failed to invite staff member.';
      setFormError(message);
      toast.error(message);
    },
  });

  const onSubmit = (values) => {
    setFormError(null);
    inviteMutation.mutate(values);
  };

  const filteredStaff = staffList.filter((staff) => {
    const matchesSearch =
      staff.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      staff.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      staff.department?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || staff.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Staff Directory &amp; Management
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Invite and manage doctors, nurses, receptionists, and departmental staff.
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
              setIsInviteOpen(true);
            }}
            className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Staff</span>
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="bg-card border-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff by name, email, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 w-full bg-card border-border"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {['all', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'accountant'].map((roleKey) => (
              <button
                key={roleKey}
                type="button"
                onClick={() => setRoleFilter(roleKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                  roleFilter === roleKey
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {roleKey === 'all' ? 'All Roles' : roleKey.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border/40 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 w-44 bg-muted rounded"></div>
                    <div className="h-3 w-28 bg-muted/60 rounded"></div>
                  </div>
                  <div className="h-6 w-24 bg-muted rounded-full"></div>
                  <div className="h-4 w-32 bg-muted rounded hidden sm:block"></div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h3 className="text-base font-bold text-foreground">Error loading staff list</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                {queryError?.message || 'Could not fetch hospital staff data.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-12 sm:p-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {searchQuery || roleFilter !== 'all' ? 'No matching staff members' : 'No staff members yet'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-6">
                {searchQuery || roleFilter !== 'all'
                  ? 'Try adjusting your search criteria or role filters.'
                  : 'Start onboarding your medical and administrative team.'}
              </p>
              {!searchQuery && roleFilter === 'all' && (
                <Button
                  onClick={() => {
                    setFormError(null);
                    setIsInviteOpen(true);
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite First Staff Member
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3.5 px-6">Staff Member</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStaff.map((staff) => (
                  <tr key={staff._id} className="hover:bg-accent/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-semibold text-foreground">{staff.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span>{staff.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={staff.role}>
                        {ROLE_LABELS[staff.role] || staff.role}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-foreground">
                      {staff.department ? (
                        <span className="flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5 text-primary/70" />
                          {staff.department}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">General</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                        Active
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-xs text-muted-foreground">
                      {staff.createdAt
                        ? new Date(staff.createdAt).toLocaleDateString(undefined, {
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
      </Card>

      {/* Modal: Invite Staff */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => {
          if (!inviteMutation.isPending) setIsInviteOpen(false);
        }}
        title="Invite New Staff Member"
        description="Create account credentials for a doctor, nurse, receptionist, or administrative staff member."
      >
        {formError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive animate-slide-up font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Full Name
            </label>
            <Input
              placeholder="e.g. Dr. Ayesha Khan"
              {...register('name')}
              disabled={inviteMutation.isPending}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Email Address
            </label>
            <Input
              type="email"
              placeholder="staff@hospital.org"
              {...register('email')}
              disabled={inviteMutation.isPending}
              className={errors.email ? 'border-destructive' : ''}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Temporary Password
            </label>
            <Input
              type="password"
              placeholder="••••••••••••"
              {...register('password')}
              disabled={inviteMutation.isPending}
              className={errors.password ? 'border-destructive' : ''}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Role
              </label>
              <select
                {...register('role')}
                disabled={inviteMutation.isPending}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="doctor">Doctor</option>
                <option value="receptionist">Receptionist</option>
                <option value="nurse">Nurse</option>
                <option value="lab_technician">Lab Technician</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="accountant">Accountant</option>
              </select>
              {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Department (Optional)
              </label>
              <Input
                placeholder="e.g. Cardiology, OPD"
                {...register('department')}
                disabled={inviteMutation.isPending}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInviteOpen(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Staff Member'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
