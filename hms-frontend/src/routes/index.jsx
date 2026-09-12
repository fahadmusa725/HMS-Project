import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import HospitalDashboard from '@/pages/HospitalDashboard';
import PatientPortal from '@/pages/PatientPortal';

export function AppRoutes() {
  const { isAuthenticated, user } = useAuthStore();

  // Root redirector based on authentication and role
  const getHomeRedirect = () => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (user?.role === 'platform_super_admin') return <Navigate to="/super-admin/dashboard" replace />;
    if (user?.role === 'patient') return <Navigate to="/portal" replace />;
    return <Navigate to="/dashboard" replace />;
  };

  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={getHomeRedirect()} />

      {/* Public Login Route */}
      <Route
        path="/login"
        element={
          isAuthenticated ? getHomeRedirect() : <Login />
        }
      />

      {/* Protected Routes: Platform Super Admin */}
      <Route element={<ProtectedRoute allowedRoles={['platform_super_admin']} />}>
        <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
      </Route>

      {/* Protected Routes: Hospital Admin & Staff */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={[
              'hospital_admin',
              'doctor',
              'receptionist',
              'nurse',
              'lab_technician',
              'pharmacist',
              'accountant',
            ]}
          />
        }
      >
        <Route path="/dashboard" element={<HospitalDashboard />} />
      </Route>

      {/* Protected Routes: Patient Portal */}
      <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
        <Route path="/portal" element={<PatientPortal />} />
      </Route>

      {/* Catch-all fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
