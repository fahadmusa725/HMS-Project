import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { BarChart3, TrendingUp, Stethoscope, Activity, LayoutDashboard } from 'lucide-react';

export default function ReportsLayout() {
  const { user } = useAuthStore();
  const role = user?.role || 'hospital_admin';
  const location = useLocation();

  const isHospitalAdmin = role === 'hospital_admin';

  // Sub-navigation tabs for reports
  const subNavItems = [
    { path: '/dashboard/reports', end: true, label: 'Overview', icon: LayoutDashboard },
    { path: '/dashboard/reports/financial', label: 'Financial', icon: TrendingUp },
    { path: '/dashboard/reports/clinical', label: 'Clinical', icon: Stethoscope },
    { path: '/dashboard/reports/operations', label: 'Operations', icon: Activity },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-primary" />
            {role === 'accountant' ? 'Financial Reports & Analytics' : 'Reports & Analytics'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {role === 'accountant'
              ? 'Revenue breakdown, collection timelines, and invoice status audits.'
              : 'Hospital-wide performance metrics across revenue, clinical volume, and department operations.'}
          </p>
        </div>
      </div>

      {/* Sub-navigation tabs (Only for Hospital Admin; accountant only sees Financial report) */}
      {isHospitalAdmin && (
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl border border-border/60 w-fit overflow-x-auto">
          {subNavItems.map(({ path, end, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-card text-foreground shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Active Sub-report Content */}
      <div>
        <Outlet />
      </div>
    </div>
  );
}
