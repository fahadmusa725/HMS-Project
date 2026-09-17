import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserIdentityBlock } from '@/components/UserIdentityBlock';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Building2,
  HeartPulse,
  Users,
  UserCheck,
  Calendar,
  Bed,
  Stethoscope,
  LayoutDashboard,
  FlaskConical,
  Pill,
  Receipt,
  BarChart3,
  ClipboardList
} from 'lucide-react';

export default function HospitalDashboardLayout() {
  const { user, logout } = useAuthStore();
  const role = user?.role || 'hospital_admin';
  const navigate = useNavigate();

  // Navigation items configuration per role with real router paths
  const getNavItemsForRole = (userRole) => {
    switch (userRole) {
      case 'hospital_admin':
        return [
          { path: '/dashboard', end: true, label: 'Overview', icon: LayoutDashboard },
          { path: '/dashboard/reports', label: 'Reports & Analytics', icon: BarChart3 },
          { path: '/dashboard/audit-logs', label: 'Audit Logs', icon: ClipboardList },
          { path: '/dashboard/staff', label: 'Staff Directory', icon: Users },
          { path: '/dashboard/patients', label: 'Patient Records', icon: UserCheck },
          { path: '/dashboard/appointments', label: 'Appointments & Queue', icon: Calendar },
          { path: '/dashboard/wards', label: 'Wards & Beds', icon: Bed },
          { path: '/dashboard/lab', label: 'Lab & Diagnostics', icon: FlaskConical },
          { path: '/dashboard/pharmacy', label: 'Pharmacy & Stock', icon: Pill },
          { path: '/dashboard/billing', label: 'Billing & Invoices', icon: Receipt },
        ];
      case 'doctor':
        return [
          { path: '/dashboard/appointments', label: 'My OPD Queue', icon: Calendar },
          { path: '/dashboard/patients', label: 'Patient Directory', icon: UserCheck },
          { path: '/dashboard/wards', label: 'Wards & Beds', icon: Bed },
          { path: '/dashboard/lab', label: 'Lab Orders', icon: FlaskConical },
        ];
      case 'receptionist':
        return [
          { path: '/dashboard/patients', label: 'Patient Registration', icon: UserCheck },
          { path: '/dashboard/appointments', label: 'Appointments & Queue', icon: Calendar },
          { path: '/dashboard/wards', label: 'Wards & Beds', icon: Bed },
          { path: '/dashboard/billing', label: 'Billing & Payments', icon: Receipt },
        ];
      case 'nurse':
        return [
          { path: '/dashboard/patients', label: 'Patient Directory', icon: UserCheck },
          { path: '/dashboard/wards', label: 'Wards & IPD', icon: Bed },
          { path: '/dashboard/lab', label: 'Lab Worklist', icon: FlaskConical },
        ];
      case 'lab_technician':
        return [
          { path: '/dashboard/lab', label: 'Diagnostic Lab', icon: FlaskConical },
          { path: '/dashboard/patients', label: 'Patient Records', icon: UserCheck },
        ];
      case 'pharmacist':
        return [
          { path: '/dashboard/pharmacy', label: 'Pharmacy & Stock', icon: Pill },
          { path: '/dashboard/patients', label: 'Patient Directory', icon: UserCheck },
        ];
      case 'accountant':
        return [
          { path: '/dashboard/billing', label: 'Billing & Invoices', icon: Receipt },
          { path: '/dashboard/reports/financial', label: 'Financial Reports', icon: BarChart3 },
          { path: '/dashboard/patients', label: 'Patient Records', icon: UserCheck },
        ];
      default:
        return [{ path: '/dashboard', end: true, label: 'Overview', icon: LayoutDashboard }];
    }
  };

  const navItems = getNavItemsForRole(role);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Top Header */}
      <header className="border-b border-border bg-card z-30 shadow-soft-sm shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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

      {/* Main Body Shell Layout */}
      <div className="flex-1 overflow-hidden flex flex-row">
        {/* Left Sidebar */}
        <aside className="w-64 h-full border-r border-border bg-card/50 p-4 shrink-0 flex flex-col">
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
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area: Renders the active child route */}
        <main className="flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 animate-fade-in min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
