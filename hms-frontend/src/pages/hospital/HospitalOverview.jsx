import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, UserCheck, Calendar } from 'lucide-react';

export default function HospitalOverview() {
  const { user } = useAuthStore();
  const role = user?.role || 'hospital_admin';
  const navigate = useNavigate();

  const getRoleDisplayName = (r) => {
    const rolesMap = {
      hospital_admin: 'Hospital Admin',
      doctor: 'Doctor / Physician',
      receptionist: 'Receptionist / Front Desk',
      nurse: 'Nursing Staff',
      lab_technician: 'Lab Technician',
      pharmacist: 'Pharmacist',
      accountant: 'Accountant / Billing',
    };
    return rolesMap[r] || r;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* User Session Info Card */}
      <Card className="border-border bg-card shadow-soft">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            Active Hospital Session
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Authenticated operational workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground block font-medium">Hospital Tenant</span>
              <span className="font-bold text-foreground truncate block" title={user?.hospitalName || 'Hospital'}>
                {user?.hospitalName || 'Primary Hospital'}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground block font-medium">Logged-in User</span>
              <span className="font-semibold text-foreground truncate block">{user?.name || 'Staff Member'}</span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground block font-medium">Tenant ID</span>
              <span className="font-mono text-xs font-semibold text-foreground">{user?.hospitalId || '—'}</span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground block font-medium">System Role</span>
              <Badge variant={role} className="mt-0.5">
                {getRoleDisplayName(role)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick shortcuts for Hospital Admin */}
      {role === 'hospital_admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            onClick={() => navigate('/dashboard/staff')}
            className="p-5 hover:border-primary/50 cursor-pointer transition-all hover:shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-foreground text-sm">Staff Directory</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Manage &amp; invite medical personnel</p>
              </div>
            </div>
          </Card>

          <Card
            onClick={() => navigate('/dashboard/patients')}
            className="p-5 hover:border-primary/50 cursor-pointer transition-all hover:shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-foreground text-sm">Patient Records</h4>
                <p className="text-xs text-muted-foreground mt-0.5">OPD registrations &amp; MRN search</p>
              </div>
            </div>
          </Card>

          <Card
            onClick={() => navigate('/dashboard/appointments')}
            className="p-5 hover:border-primary/50 cursor-pointer transition-all hover:shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-foreground text-sm">OPD Appointments</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Live token queue &amp; bookings</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
