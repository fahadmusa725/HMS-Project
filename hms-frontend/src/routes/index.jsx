import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import PatientSignup from '@/pages/PatientSignup';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';

import PatientPortalLayout from '@/layouts/PatientPortalLayout';
import PatientOverview from '@/pages/portal/PatientOverview';
import PatientAppointments from '@/pages/portal/PatientAppointments';
import PatientHistory from '@/pages/portal/PatientHistory';
import PatientBills from '@/pages/portal/PatientBills';

import HospitalDashboardLayout from '@/layouts/HospitalDashboardLayout';
import HospitalOverview from '@/pages/hospital/HospitalOverview';
import StaffManagement from '@/components/hospital/StaffManagement';
import PatientDirectory from '@/components/hospital/PatientDirectory';
import AppointmentsQueue from '@/components/hospital/AppointmentsQueue';
import WardsBeds from '@/components/hospital/WardsBeds';
import LabModule from '@/components/hospital/LabModule';
import PharmacyModule from '@/components/hospital/PharmacyModule';
import BillingModule from '@/components/hospital/BillingModule';
import AuditLogViewer from '@/components/hospital/AuditLogViewer';

import ReportsLayout from '@/pages/hospital/reports/ReportsLayout';
import ReportsOverview from '@/pages/hospital/reports/ReportsOverview';
import FinancialReport from '@/pages/hospital/reports/FinancialReport';
import ClinicalReport from '@/pages/hospital/reports/ClinicalReport';
import OperationsReport from '@/pages/hospital/reports/OperationsReport';

export function AppRoutes() {
  const { isAuthenticated, user } = useAuthStore();

  // Redirector for already-authenticated users landing on / or /login - sends them to their
  // role's default workspace. Unauthenticated visitors to / get the public landing page instead
  // (handled directly in the route below), not a redirect to /login.
  const getHomeRedirect = () => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (user?.role === 'platform_super_admin') return <Navigate to="/super-admin/dashboard" replace />;
    if (user?.role === 'patient') return <Navigate to="/portal" replace />;
    
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
      {/* Public landing page for logged-out visitors; authenticated users are sent to their workspace */}
      <Route path="/" element={isAuthenticated ? getHomeRedirect() : <Landing />} />

      <Route
        path="/login"
        element={
          isAuthenticated ? getHomeRedirect() : <Login />
        }
      />

      <Route
        path="/signup"
        element={
          isAuthenticated ? getHomeRedirect() : <PatientSignup />
        }
      />

      <Route element={<ProtectedRoute allowedRoles={['platform_super_admin']} />}>
        <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
      </Route>

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
          <Route
            index
            element={
              <ProtectedRoute allowedRoles={['hospital_admin']}>
                <HospitalOverview />
              </ProtectedRoute>
            }
          />

          <Route
            path="staff"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin']}>
                <StaffManagement />
              </ProtectedRoute>
            }
          />

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

          <Route
            path="appointments"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'doctor', 'receptionist']}>
                <AppointmentsQueue />
              </ProtectedRoute>
            }
          />

          <Route
            path="wards"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'doctor', 'receptionist', 'nurse']}>
                <WardsBeds />
              </ProtectedRoute>
            }
          />

          <Route
            path="lab"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'doctor', 'nurse', 'lab_technician']}>
                <LabModule />
              </ProtectedRoute>
            }
          />

          <Route
            path="pharmacy"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'pharmacist']}>
                <PharmacyModule />
              </ProtectedRoute>
            }
          />

          <Route
            path="billing"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin', 'accountant', 'receptionist']}>
                <BillingModule />
              </ProtectedRoute>
            }
          />

          <Route
            path="audit-logs"
            element={
              <ProtectedRoute allowedRoles={['hospital_admin']}>
                <AuditLogViewer />
              </ProtectedRoute>
            }
          />

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

      <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
        <Route path="/portal" element={<PatientPortalLayout />}>
          <Route index element={<PatientOverview />} />
          <Route path="appointments" element={<PatientAppointments />} />
          <Route path="history" element={<PatientHistory />} />
          <Route path="bills" element={<PatientBills />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
