import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function ProtectedRoute({ allowedRoles = [], children }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login preserving intended return URL if needed
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If specific roles are required, verify user role matches
  if (allowedRoles.length > 0 && user && !allowedRoles.includes(user.role)) {
    // Redirect to their default dashboard based on role
    if (user.role === 'platform_super_admin') {
      return <Navigate to="/super-admin/dashboard" replace />;
    } else if (user.role === 'patient') {
      return <Navigate to="/portal" replace />;
    } else {
      // Direct staff to their primary authorized module to prevent redirect loops
      switch (user.role) {
        case 'doctor':
          return <Navigate to="/dashboard/appointments" replace />;
        case 'nurse':
        case 'receptionist':
          return <Navigate to="/dashboard/patients" replace />;
        case 'lab_technician':
          return <Navigate to="/dashboard/lab" replace />;
        case 'pharmacist':
          return <Navigate to="/dashboard/pharmacy" replace />;
        case 'accountant':
          return <Navigate to="/dashboard/billing" replace />;
        case 'hospital_admin':
        default:
          return <Navigate to="/dashboard" replace />;
      }
    }
  }

  return children ? children : <Outlet />;
}
