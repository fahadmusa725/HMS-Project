import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function ProtectedRoute({ allowedRoles = [] }) {
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
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Outlet />;
}
