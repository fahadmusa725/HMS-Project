import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserIdentityBlock } from '@/components/UserIdentityBlock';
import { Button } from '@/components/ui/button';
import {
  HeartPulse,
  LogOut,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Receipt,
  Building2,
} from 'lucide-react';

const patientNavItems = [
  {
    to: '/portal',
    label: 'Overview',
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/portal/appointments',
    label: 'Appointments',
    icon: CalendarDays,
  },
  {
    to: '/portal/history',
    label: 'Medical History',
    icon: ClipboardList,
  },
  {
    to: '/portal/bills',
    label: 'Bills & Invoices',
    icon: Receipt,
  },
];

export default function PatientPortalLayout() {
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Top Header */}
      <header className="border-b border-border bg-card z-30 shadow-soft-sm shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Portal Badge */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold shadow-sm shrink-0">
              <HeartPulse className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-foreground whitespace-nowrap">CareFlow HMS</span>
                <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full border border-primary/20 whitespace-nowrap hidden sm:inline-flex">
                  Patient Portal
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

          {/* User Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <UserIdentityBlock />
            <div className="h-6 w-px bg-border mx-1" />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
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
                Hospital
              </div>
              <div className="text-xs font-bold text-foreground truncate mt-0.5" title={user.hospitalName}>
                {user.hospitalName}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Patient Portal
            </div>
            {patientNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
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

        {/* Main Content Area */}
        <main className="flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 animate-fade-in min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
