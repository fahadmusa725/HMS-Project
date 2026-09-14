import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserIdentityBlock } from '@/components/UserIdentityBlock';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LogOut,
  Building2,
  HeartPulse,
  Users,
  UserCheck,
  Calendar,
  Bed,
  Stethoscope,
  Sparkles,
  LayoutDashboard
} from 'lucide-react';

import StaffManagement from '@/components/hospital/StaffManagement';
import PatientDirectory from '@/components/hospital/PatientDirectory';
import AppointmentsQueue from '@/components/hospital/AppointmentsQueue';

export default function HospitalDashboard() {
  const { user, logout } = useAuthStore();
  const role = user?.role || 'hospital_admin';

  // Navigation items configuration per role
  const getNavItemsForRole = (userRole) => {
    switch (userRole) {
      case 'hospital_admin':
        return [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
          { id: 'staff', label: 'Staff Directory', icon: Users },
          { id: 'patients', label: 'Patient Records', icon: UserCheck },
          { id: 'appointments', label: 'Appointments & Queue', icon: Calendar },
          { id: 'wards', label: 'Wards & Beds', icon: Bed, isPlaceholder: true },
        ];
      case 'doctor':
        return [
          { id: 'appointments', label: 'My OPD Queue', icon: Calendar },
          { id: 'patients', label: 'Patient Directory', icon: UserCheck },
          { id: 'consultations', label: 'Consultations', icon: Stethoscope, isPlaceholder: true },
        ];
      case 'receptionist':
        return [
          { id: 'patients', label: 'Patient Registration', icon: UserCheck },
          { id: 'appointments', label: 'Appointments & Queue', icon: Calendar },
        ];
      case 'nurse':
        return [
          { id: 'patients', label: 'Patient Directory', icon: UserCheck },
          { id: 'wards', label: 'Wards & IPD', icon: Bed, isPlaceholder: true },
        ];
      case 'lab_technician':
      case 'pharmacist':
      case 'accountant':
      default:
        return [{ id: 'overview', label: 'Workspace', icon: LayoutDashboard }];
    }
  };

  const navItems = getNavItemsForRole(role);
  const [activeTab, setActiveTab] = useState(navItems[0]?.id || 'overview');

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

  const renderContent = () => {
    if (['lab_technician', 'pharmacist', 'accountant'].includes(role)) {
      return (
        <Card className="p-12 text-center border-border shadow-soft animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-extrabold text-foreground">
            {getRoleDisplayName(role)} Workspace
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Your specialized departmental module (Phase 3: Support Services) is currently in development and will be available soon.
          </p>
        </Card>
      );
    }

    if (activeTab === 'wards') {
      return (
        <Card className="p-12 text-center border-border shadow-soft animate-fade-in">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Bed className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Ward &amp; Bed Management (IPD)</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Live ward availability, bed tracking, and IPD admission &amp; discharge workflows will be integrated in the upcoming clinical phase.
          </p>
        </Card>
      );
    }

    if (activeTab === 'consultations') {
      return (
        <Card className="p-12 text-center border-border shadow-soft animate-fade-in">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Doctor Consultations &amp; E-Prescriptions</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Clinical vitals recording, diagnosis entry, and e-prescription generation are coming up next.
          </p>
        </Card>
      );
    }

    switch (activeTab) {
      case 'staff':
        return <StaffManagement />;
      case 'patients':
        return <PatientDirectory />;
      case 'appointments':
        return <AppointmentsQueue />;
      case 'overview':
      default:
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
                  onClick={() => setActiveTab('staff')}
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
                  onClick={() => setActiveTab('patients')}
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
                  onClick={() => setActiveTab('appointments')}
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
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Top Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30 shadow-soft-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm shrink-0">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-foreground whitespace-nowrap">CareFlow HMS</span>
                <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full border border-primary/20 whitespace-nowrap hidden sm:inline-flex">
                  Hospital Portal
                </span>
              </div>
              {user?.hospitalName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium truncate">
                  <Building2 className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate max-w-[200px] sm:max-w-md" title={user.hospitalName}>
                    {user.hospitalName}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
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
          {/* Hospital Tenant Display in Sidebar */}
          {user?.hospitalName && (
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15">
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3 text-primary" />
                Hospital Tenant
              </div>
              <div className="text-xs font-bold text-foreground truncate mt-0.5" title={user.hospitalName}>
                {user.hospitalName}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Hospital Modules
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.isPlaceholder && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                        isActive ? 'bg-primary-foreground/20 text-white' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in min-w-0">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
