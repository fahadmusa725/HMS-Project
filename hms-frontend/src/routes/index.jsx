import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import RouteFallback from '@/components/RouteFallback';

// Every page is its own chunk: the landing page no longer ships the dashboard, the
// patient portal, or recharts (which only the report pages import).
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const PatientSignup = lazy(() => import('@/pages/PatientSignup'));
const SuperAdminDashboard = lazy(() => import('@/pages/SuperAdminDashboard'));
// Public, login-free waiting-room screen (the URL carries a per-hospital display key).
const DisplayBoard = lazy(() => import('@/pages/DisplayBoard'));

const PatientPortalLayout = lazy(() => import('@/layouts/PatientPortalLayout'));
const PatientOverview = lazy(() => import('@/pages/portal/PatientOverview'));
const PatientAppointments = lazy(() => import('@/pages/portal/PatientAppointments'));
const PatientHistory = lazy(() => import('@/pages/portal/PatientHistory'));
const PatientBills = lazy(() => import('@/pages/portal/PatientBills'));

const HospitalDashboardLayout = lazy(() => import('@/layouts/HospitalDashboardLayout'));
const HospitalOverview = lazy(() => import('@/pages/hospital/HospitalOverview'));
const HospitalSettings = lazy(() => import('@/pages/hospital/HospitalSettings'));
const StaffManagement = lazy(() => import('@/components/hospital/StaffManagement'));
const PatientDirectory = lazy(() => import('@/components/hospital/PatientDirectory'));
const AppointmentsQueue = lazy(() => import('@/components/hospital/AppointmentsQueue'));
const WardsBeds = lazy(() => import('@/components/hospital/WardsBeds'));
const LabModule = lazy(() => import('@/components/hospital/LabModule'));
const PharmacyModule = lazy(() => import('@/components/hospital/PharmacyModule'));
const BillingModule = lazy(() => import('@/components/hospital/BillingModule'));
const AuditLogViewer = lazy(() => import('@/components/hospital/AuditLogViewer'));

const ReportsLayout = lazy(() => import('@/pages/hospital/reports/ReportsLayout'));
const ReportsOverview = lazy(() => import('@/pages/hospital/reports/ReportsOverview'));
const FinancialReport = lazy(() => import('@/pages/hospital/reports/FinancialReport'));
const ClinicalReport = lazy(() => import('@/pages/hospital/reports/ClinicalReport'));
const OperationsReport = lazy(() => import('@/pages/hospital/reports/OperationsReport'));

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
    <Suspense fallback={<RouteFallback />}>
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

        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Waiting-room TV: public by design - the ?key= in the URL is the credential. */}
        <Route path="/display/:hospitalId" element={<DisplayBoard />} />

        <Route
          path="/change-password"
          element={
            <ProtectedRoute allowedRoles={[]}>
              <ChangePassword />
            </ProtectedRoute>
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
              path="settings"
              element={
                <ProtectedRoute allowedRoles={['hospital_admin']}>
                  <HospitalSettings />
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
    </Suspense>
  );
}
