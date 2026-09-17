import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import PatientPortal from '@/pages/PatientPortal';

import HospitalDashboardLayout from '@/layouts/HospitalDashboardLayout';
import HospitalOverview from '@/pages/hospital/HospitalOverview';
import StaffManagement from '@/components/hospital/StaffManagement';
import PatientDirectory from '@/components/hospital/PatientDirectory';
import AppointmentsQueue from '@/components/hospital/AppointmentsQueue';
import WardsBeds from '@/components/hospital/WardsBeds';
import LabModule from '@/components/hospital/LabModule';
import PharmacyModule from '@/components/hospital/PharmacyModule';
import BillingModule from '@/components/hospital/BillingModule';

import ReportsLayout from '@/pages/hospital/reports/ReportsLayout';
import ReportsOverview from '@/pages/hospital/reports/ReportsOverview';
import FinancialReport from '@/pages/hospital/reports/FinancialReport';
import ClinicalReport from '@/pages/hospital/reports/ClinicalReport';
import OperationsReport from '@/pages/hospital/reports/OperationsReport';

export function AppRoutes() {
  const { isAuthenticated, user } = useAuthStore();

  // Root redirector based on authentication and role
  const getHomeRedirect = () => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (user?.role === 'platform_super_admin') return <Navigate to="/super-admin/dashboard" replace />;
    if (user?.role === 'patient') return <Navigate to="/portal" replace />;
    
    // Role-specific default landing page for staff
    switch (user?.role) {
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

      {/* Protected Routes: Hospital App Shell Layout */}
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
        <Route path="/dashboard" element={<HospitalDashboardLayout />}>
          {/* Overview / Home - Hospital Admin only */}
          <Route
            index
            element={
              <ProtectedRoute allowedRoles={['hospital_admin']}>
                <HospitalOverview />
              </ProtectedRoute>
            }
          />

          {/* Staff Directory - Hospital Admin only */}
          <Route
            path="staff"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin']}>
                <StaffManagement />
              </ProtectedRoute>
            }
          />

          {/* Patient Directory - Admin, Doctor, Receptionist, Nurse, Lab, Pharmacy, Accountant */}
          <Route
            path="patients"
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
              >
                <PatientDirectory />
              </ProtectedRoute>
            }
          />

          {/* Appointments & OPD Queue - Admin, Doctor, Receptionist */}
          <Route
            path="appointments"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'doctor', 'receptionist']}>
                <AppointmentsQueue />
              </ProtectedRoute>
            }
          />

          {/* Wards & Bed Management - Admin, Doctor, Receptionist, Nurse */}
          <Route
            path="wards"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'doctor', 'receptionist', 'nurse']}>
                <WardsBeds />
              </ProtectedRoute>
            }
          />

          {/* Lab & Diagnostics - Admin, Doctor, Nurse, Lab Technician */}
          <Route
            path="lab"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'doctor', 'nurse', 'lab_technician']}>
                <LabModule />
              </ProtectedRoute>
            }
          />

          {/* Pharmacy & Stock - Admin, Pharmacist */}
          <Route
            path="pharmacy"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'pharmacist']}>
                <PharmacyModule />
              </ProtectedRoute>
            }
          />

          {/* Billing & Invoices - Admin, Accountant, Receptionist */}
          <Route
            path="billing"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'accountant', 'receptionist']}>
                <BillingModule />
              </ProtectedRoute>
            }
          />

          {/* Reports & Analytics - Hospital Admin (all 4) and Accountant (Financial only) */}
          <Route
            path="reports"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'accountant']}>
                <ReportsLayout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <ProtectedRoute allowedRoles={['hospital_admin']}>
                  <ReportsOverview />
                </ProtectedRoute>
              }
            />
            <Route
              path="financial"
              element={
                <ProtectedRoute allowedRoles={['hospital_admin', 'accountant']}>
                  <FinancialReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="clinical"
              element={
                <ProtectedRoute allowedRoles={['hospital_admin']}>
                  <ClinicalReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="operations"
              element={
                <ProtectedRoute allowedRoles={['hospital_admin']}>
                  <OperationsReport />
                </ProtectedRoute>
              }
            />
          </Route>
        </Route>
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
