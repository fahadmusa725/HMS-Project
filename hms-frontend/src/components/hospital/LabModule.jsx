import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  FlaskConical,
  TestTube2,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  ExternalLink,
  Ban,
  User,
  Check,
  Stethoscope,
  Filter
} from 'lucide-react';

import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils';

// Schema for adding a lab test to catalog
const labTestSchema = z.object({
  name: z.string().min(2, 'Test name must be at least 2 characters'),
  department: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a positive number'),
  turnaroundTime: z.string().optional(),
});

// Schema for entering lab test results
const labResultSchema = z.object({
  resultNotes: z.string().min(2, 'Please enter clinical result findings/notes'),
  resultFileUrl: z.string().optional(),
});

export default function LabModule({ initialPatient = null, initialTab = 'worklist' }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const role = user?.role;
  const canManageCatalog = role === 'hospital_admin';
  const canOrderTests = ['doctor', 'hospital_admin', 'receptionist'].includes(role);
  const canManageOrders = ['lab_technician', 'hospital_admin'].includes(role);

  // Active view tab: 'worklist' | 'catalog'
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Modals state
  const [isAddTestOpen, setIsAddTestOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(!!initialPatient);
  const [resultOrderTarget, setResultOrderTarget] = useState(null);
  const [viewResultTarget, setViewResultTarget] = useState(null);
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null);

  // Order modal patient & test selection state
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [testSearchInModal, setTestSearchInModal] = useState('');

  // Forms setup
  const {
    register: registerTest,
    handleSubmit: handleSubmitTest,
    reset: resetTest,
    formState: { errors: testErrors },
  } = useForm({
    resolver: zodResolver(labTestSchema),
    defaultValues: { name: '', department: '', price: 0, turnaroundTime: '24 hours' },
  });

  const {
    register: registerResult,
    handleSubmit: handleSubmitResult,
    reset: resetResult,
    formState: { errors: resultErrors },
  } = useForm({
    resolver: zodResolver(labResultSchema),
    defaultValues: { resultNotes: '', resultFileUrl: '' },
  });

  // Query: List Lab Tests Catalog
  const {
    data: labTests = [],
    isLoading: isTestsLoading,
    refetch: refetchTests,
  } = useQuery({
    queryKey: ['lab-tests-catalog'],
    queryFn: async () => {
      const res = await api.get('/api/lab/tests');
      return res.data;
    },
  });

  // Query: List Lab Orders Worklist
  const {
    data: labOrders = [],
    isLoading: isOrdersLoading,
    refetch: refetchOrders,
    isRefetching: isOrdersRefetching,
  } = useQuery({
    queryKey: ['lab-orders-list', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const res = await api.get('/api/lab/orders', { params });
      return res.data;
    },
  });

  // Query: Patient search for Order Modal
  const { data: patientSearchResults = { patients: [] } } = useQuery({
    queryKey: ['lab-patient-search', patientSearch],
    queryFn: async () => {
      if (!patientSearch.trim()) return { patients: [] };
      const res = await api.get('/api/patients', { params: { search: patientSearch, limit: 8 } });
      return res.data;
    },
    enabled: isOrderModalOpen && !selectedPatient && patientSearch.trim().length > 0,
  });

  // Mutation: Create Lab Test (Catalog)
  const createTestMutation = useMutation({
    mutationFn: async (formData) => {
      const res = await api.post('/api/lab/tests', formData);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lab-tests-catalog'] });
      setIsAddTestOpen(false);
      resetTest();
      toast.success(`Lab test "${data.name}" added to catalog.`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to add lab test.');
    },
  });

  // Mutation: Create Lab Order
  const createOrderMutation = useMutation({
    mutationFn: async ({ patientId, testIds }) => {
      const res = await api.post('/api/lab/orders', { patientId, testIds });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders-list'] });
      setIsOrderModalOpen(false);
      setSelectedTestIds([]);
      if (!initialPatient) setSelectedPatient(null);
      setPatientSearch('');
      toast.success('Lab order successfully created.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to create lab order.');
    },
  });

  // Mutation: Update Lab Order Status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }) => {
      const res = await api.patch(`/api/lab/orders/${orderId}/status`, { status });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders-list'] });
      setCancelOrderTarget(null);
      toast.success(`Lab order status updated to ${data.status.replace('_', ' ').toUpperCase()}.`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update order status.');
    },
  });

  // Mutation: Add Lab Result & Complete
  const addResultMutation = useMutation({
    mutationFn: async ({ orderId, payload }) => {
      const res = await api.patch(`/api/lab/orders/${orderId}/result`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders-list'] });
      setResultOrderTarget(null);
      resetResult();
      toast.success('Lab test result recorded and order marked as completed.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to submit lab result.');
    },
  });

  // Computed Stats for Worklist
  const stats = useMemo(() => {
    const list = Array.isArray(labOrders) ? labOrders : [];
    const total = list.length;
    const ordered = list.filter((o) => o.status === 'ordered').length;
    const collected = list.filter((o) => o.status === 'sample_collected').length;
    const inProgress = list.filter((o) => o.status === 'in_progress').length;
    const completed = list.filter((o) => o.status === 'completed').length;
    return { total, ordered, collected, inProgress, completed };
  }, [labOrders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    const list = Array.isArray(labOrders) ? labOrders : [];
    return list.filter((order) => {
      const patientName = order.patientId?.name?.toLowerCase() || '';
      const patientMrn = order.patientId?.mrn?.toLowerCase() || '';
      const orderId = order._id?.toLowerCase() || '';
      const matchesSearch =
        !searchQuery ||
        patientName.includes(searchQuery.toLowerCase()) ||
        patientMrn.includes(searchQuery.toLowerCase()) ||
        orderId.includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [labOrders, searchQuery]);

  // Filtered Catalog Tests
  const filteredCatalogTests = useMemo(() => {
    const list = Array.isArray(labTests) ? labTests : [];
    return list.filter((test) => {
      const name = test.name?.toLowerCase() || '';
      const dept = test.department?.toLowerCase() || '';
      return !catalogSearch || name.includes(catalogSearch.toLowerCase()) || dept.includes(catalogSearch.toLowerCase());
    });
  }, [labTests, catalogSearch]);

  // Total amount for selected tests in Order Modal
  const orderModalTotal = useMemo(() => {
    return selectedTestIds.reduce((sum, id) => {
      const t = labTests.find((item) => item._id === id);
      return sum + (t?.price || 0);
    }, 0);
  }, [selectedTestIds, labTests]);

  const toggleTestSelection = (testId) => {
    setSelectedTestIds((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              <FlaskConical className="h-7 w-7 text-primary" />
              Diagnostic Lab Management
            </h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {role === 'lab_technician'
              ? 'Process diagnostic test orders, log specimens, and submit clinical lab results.'
              : 'Laboratory test ordering, worklist monitoring, and test catalog pricing.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Worklist / Catalog Tab switcher */}
          <div className="flex bg-muted/60 p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab('worklist')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'worklist'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Orders Worklist
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'catalog'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Test Catalog ({labTests.length})
            </button>
          </div>

          {canOrderTests && (
            <Button
              onClick={() => {
                setSelectedTestIds([]);
                if (!initialPatient) setSelectedPatient(null);
                setIsOrderModalOpen(true);
              }}
              className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5 shadow-sm text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Order Lab Test</span>
            </Button>
          )}

          {canManageCatalog && activeTab === 'catalog' && (
            <Button
              onClick={() => setIsAddTestOpen(true)}
              variant="outline"
              className="h-9 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Test
            </Button>
          )}
        </div>
      </div>

      {/* VIEW 1: WORKLIST */}
      {activeTab === 'worklist' && (
        <div className="space-y-6">
          {/* Unified Stat Strip */}
          <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-2 lg:grid-cols-4">
            <div className="p-4 sm:p-5 border-b lg:border-b-0 border-r border-border">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                {isOrdersLoading ? '—' : stats.total}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Total lab orders
              </div>
            </div>

            <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-border">
              <div className="text-2xl sm:text-3xl font-extrabold text-secondary tracking-tight">
                {isOrdersLoading ? '—' : stats.ordered}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Pending sample collection
              </div>
            </div>

            <div className="p-4 sm:p-5 border-r border-border">
              <div className="text-2xl sm:text-3xl font-extrabold text-warning-foreground tracking-tight">
                {isOrdersLoading ? '—' : stats.collected + stats.inProgress}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                In laboratory processing
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
                {isOrdersLoading ? '—' : stats.completed}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Results completed
              </div>
            </div>
          </div>

          {/* Worklist Table Card */}
          <Card className="bg-card border-border shadow-soft overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
              {/* Search */}
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by patient, MRN, or order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 bg-card border-border text-foreground text-xs"
                />
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {[
                  { key: 'all', label: 'All Orders' },
                  { key: 'ordered', label: 'Ordered' },
                  { key: 'sample_collected', label: 'Sample Collected' },
                  { key: 'in_progress', label: 'In Progress' },
                  { key: 'completed', label: 'Completed' },
                  { key: 'cancelled', label: 'Cancelled' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchOrders()}
                  disabled={isOrdersRefetching}
                  className="h-8 px-2.5 ml-1 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isOrdersRefetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              {isOrdersLoading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                  <span className="text-sm font-medium">Loading lab worklist...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <FlaskConical className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-bold text-foreground">No laboratory orders found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your search query or status filter.'
                      : 'New diagnostic test orders will appear in this worklist.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                      <th className="py-3.5 px-6">Patient</th>
                      <th className="py-3.5 px-4">Tests Ordered</th>
                      <th className="py-3.5 px-4">Ordering Doctor</th>
                      <th className="py-3.5 px-4">Order Date</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrders.map((order) => {
                      const totalCost = order.tests?.reduce((sum, t) => sum + (t.price || 0), 0) || 0;
                      return (
                        <tr key={order._id} className="hover:bg-accent/40 transition-colors">
                          {/* Patient Info */}
                          <td className="py-4 px-6">
                            <div className="font-semibold text-foreground">
                              {order.patientId?.name || 'Unknown Patient'}
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground mt-0.5 flex items-center gap-2">
                              <span>MRN: {order.patientId?.mrn || '—'}</span>
                              {order.patientId?.phone && (
                                <>
                                  <span>•</span>
                                  <span>{order.patientId.phone}</span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Tests Ordered */}
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {order.tests?.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted/70 text-foreground px-2 py-0.5 rounded-md border border-border/60"
                                >
                                  <span>{t.testName}</span>
                                  <span className="text-[10px] text-primary font-semibold">({formatCurrency(t.price)})</span>
                                </span>
                              ))}
                            </div>
                            <div className="text-[11px] font-bold text-foreground mt-1">
                              Total: {formatCurrency(totalCost)}
                            </div>
                          </td>

                          {/* Doctor */}
                          <td className="py-4 px-4 text-xs font-medium text-foreground">
                            {order.doctorId?.name ? `Dr. ${order.doctorId.name}` : '—'}
                          </td>

                          {/* Date */}
                          <td className="py-4 px-4 text-xs text-muted-foreground">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4">
                            <Badge variant={order.status}>
                              {order.status?.replace('_', ' ')}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Lab Tech / Admin Status Progression */}
                              {canManageOrders && order.status === 'ordered' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    updateStatusMutation.mutate({
                                      orderId: order._id,
                                      status: 'sample_collected',
                                    })
                                  }
                                  disabled={updateStatusMutation.isPending}
                                  className="h-7 text-xs font-semibold text-warning-foreground border-warning/30 hover:bg-warning/10"
                                >
                                  Collect Sample
                                </Button>
                              )}

                              {canManageOrders && order.status === 'sample_collected' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    updateStatusMutation.mutate({
                                      orderId: order._id,
                                      status: 'in_progress',
                                    })
                                  }
                                  disabled={updateStatusMutation.isPending}
                                  className="h-7 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10"
                                >
                                  Start Processing
                                </Button>
                              )}

                              {canManageOrders && (order.status === 'in_progress' || order.status === 'sample_collected') && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setResultOrderTarget(order);
                                    resetResult({ resultNotes: '', resultFileUrl: '' });
                                  }}
                                  className="h-7 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1" />
                                  Complete &amp; Add Result
                                </Button>
                              )}

                              {/* Completed View Details */}
                              {order.status === 'completed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setViewResultTarget(order)}
                                  className="h-7 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10"
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1" />
                                  View Result
                                </Button>
                              )}

                              {/* Cancel */}
                              {canManageOrders && order.status !== 'completed' && order.status !== 'cancelled' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setCancelOrderTarget(order)}
                                  className="h-7 text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* VIEW 2: TEST CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Catalog Card */}
          <Card className="bg-card border-border shadow-soft overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search catalog by test name or department..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="pl-10 h-10 bg-card border-border text-foreground text-xs"
                />
              </div>

              <div className="text-xs text-muted-foreground font-medium">
                {filteredCatalogTests.length} tests in hospital catalog
              </div>
            </div>

            <div className="overflow-x-auto">
              {isTestsLoading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                  <span className="text-sm font-medium">Loading catalog tests...</span>
                </div>
              ) : filteredCatalogTests.length === 0 ? (
                <div className="p-12 text-center">
                  <TestTube2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-bold text-foreground">No laboratory tests found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {canManageCatalog ? 'Click "Add Test" above to configure your lab tests.' : 'No tests configured in this hospital.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                      <th className="py-3.5 px-6">Test Name</th>
                      <th className="py-3.5 px-4">Department / Category</th>
                      <th className="py-3.5 px-4">Turnaround Time</th>
                      <th className="py-3.5 px-6 text-right">Standard Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredCatalogTests.map((test) => (
                      <tr key={test._id} className="hover:bg-accent/40 transition-colors">
                        <td className="py-4 px-6 font-semibold text-foreground flex items-center gap-2">
                          <TestTube2 className="h-4 w-4 text-primary shrink-0" />
                          <span>{test.name}</span>
                        </td>
                        <td className="py-4 px-4 text-xs font-medium text-muted-foreground">
                          {test.department || 'General Diagnostic'}
                        </td>
                        <td className="py-4 px-4 text-xs text-muted-foreground">
                          {test.turnaroundTime || '24 hours'}
                        </td>
                        <td className="py-4 px-6 text-right font-bold text-primary">
                          {formatCurrency(test.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* MODAL 1: ORDER LAB TEST */}
      <Modal
        isOpen={isOrderModalOpen}
        onClose={() => {
          if (!createOrderMutation.isPending) {
            setIsOrderModalOpen(false);
          }
        }}
        title="Order Diagnostic Lab Tests"
        description="Select patient and choose tests from the hospital diagnostic catalog."
      >
        <div className="space-y-4">
          {/* Patient Selection / Display */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Patient *
            </label>
            {selectedPatient ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2.5">
                  <User className="h-4 w-4 text-primary" />
                  <div>
                    <span className="font-bold text-sm text-foreground">{selectedPatient.name}</span>
                    <span className="ml-2 text-xs font-mono text-muted-foreground">MRN: {selectedPatient.mrn}</span>
                  </div>
                </div>
                {!initialPatient && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPatient(null)}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search patient by Name or MRN..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="pl-10 text-xs"
                  />
                </div>
                {patientSearchResults.patients?.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border shadow-soft">
                    {patientSearchResults.patients.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p);
                          setPatientSearch('');
                        }}
                        className="w-full text-left p-2.5 hover:bg-muted/50 flex items-center justify-between transition-colors text-xs"
                      >
                        <span className="font-semibold text-foreground">{p.name}</span>
                        <span className="font-mono text-muted-foreground">MRN: {p.mrn}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Test Selector with Live Total */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Select Tests ({selectedTestIds.length} chosen) *
              </label>
              <span className="text-xs font-bold text-primary">
                Total: {formatCurrency(orderModalTotal)}
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter tests..."
                value={testSearchInModal}
                onChange={(e) => setTestSearchInModal(e.target.value)}
                className="pl-9 h-8 text-xs bg-muted/30"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-border p-2 space-y-1 bg-card divide-y divide-border/40">
              {labTests.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No tests available in catalog.
                </p>
              ) : (
                labTests
                  .filter((t) =>
                    !testSearchInModal ||
                    t.name.toLowerCase().includes(testSearchInModal.toLowerCase()) ||
                    (t.department && t.department.toLowerCase().includes(testSearchInModal.toLowerCase()))
                  )
                  .map((test) => {
                    const isChecked = selectedTestIds.includes(test._id);
                    return (
                      <label
                        key={test._id}
                        onClick={() => toggleTestSelection(test._id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                          isChecked ? 'bg-primary/10 border border-primary/25' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                          />
                          <div>
                            <div className="text-xs font-semibold text-foreground">{test.name}</div>
                            <div className="text-[10px] text-muted-foreground">{test.department || 'Diagnostic'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-primary">{formatCurrency(test.price)}</div>
                          <div className="text-[10px] text-muted-foreground">{test.turnaroundTime || '24h'}</div>
                        </div>
                      </label>
                    );
                  })
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOrderModalOpen(false)}
              disabled={createOrderMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedPatient) {
                  toast.error('Please select a patient.');
                  return;
                }
                if (selectedTestIds.length === 0) {
                  toast.error('Please choose at least one lab test.');
                  return;
                }
                createOrderMutation.mutate({
                  patientId: selectedPatient._id,
                  testIds: selectedTestIds,
                });
              }}
              disabled={createOrderMutation.isPending || !selectedPatient || selectedTestIds.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Placing Order...
                </>
              ) : (
                `Confirm Order (${formatCurrency(orderModalTotal)})`
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: ADD TEST TO CATALOG (hospital_admin) */}
      <Modal
        isOpen={isAddTestOpen}
        onClose={() => setIsAddTestOpen(false)}
        title="Add Test to Lab Catalog"
        description="Configure diagnostic test pricing and standard turnaround times."
      >
        <form onSubmit={handleSubmitTest((data) => createTestMutation.mutate(data))} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Test Name *
            </label>
            <Input
              placeholder="e.g. Complete Blood Count (CBC)"
              {...registerTest('name')}
              disabled={createTestMutation.isPending}
              className={testErrors.name ? 'border-destructive' : ''}
            />
            {testErrors.name && <p className="text-xs text-destructive">{testErrors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Department
              </label>
              <Input
                placeholder="e.g. Hematology"
                {...registerTest('department')}
                disabled={createTestMutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Price (PKR) *
              </label>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 1500"
                {...registerTest('price')}
                disabled={createTestMutation.isPending}
                className={testErrors.price ? 'border-destructive' : ''}
              />
              {testErrors.price && <p className="text-xs text-destructive">{testErrors.price.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Turnaround Time
            </label>
            <Input
              placeholder="e.g. 12-24 hours"
              {...registerTest('turnaroundTime')}
              disabled={createTestMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddTestOpen(false)}
              disabled={createTestMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTestMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createTestMutation.isPending ? 'Saving...' : 'Add Test to Catalog'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: COMPLETE & ADD RESULT */}
      <Modal
        isOpen={!!resultOrderTarget}
        onClose={() => setResultOrderTarget(null)}
        title="Complete Lab Order &amp; Record Result"
        description={
          resultOrderTarget
            ? `Patient: ${resultOrderTarget.patientId?.name || 'Patient'} (MRN: ${resultOrderTarget.patientId?.mrn || '—'})`
            : ''
        }
      >
        {resultOrderTarget && (
          <form
            onSubmit={handleSubmitResult((data) =>
              addResultMutation.mutate({
                orderId: resultOrderTarget._id,
                payload: data,
              })
            )}
            className="space-y-4"
          >
            {/* Ordered Tests summary */}
            <div className="p-3 bg-muted/40 rounded-xl border border-border/60 text-xs">
              <span className="text-muted-foreground block font-medium">Tests Evaluated:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {resultOrderTarget.tests?.map((t, idx) => (
                  <span key={idx} className="font-semibold text-foreground bg-card px-2 py-0.5 rounded border border-border">
                    {t.testName}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Clinical Findings / Result Notes *
              </label>
              <textarea
                rows={4}
                placeholder="Enter diagnostic observations, abnormal values, normal ranges, and conclusion..."
                {...registerResult('resultNotes')}
                disabled={addResultMutation.isPending}
                className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {resultErrors.resultNotes && (
                <p className="text-xs text-destructive">{resultErrors.resultNotes.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Result Document URL (Optional)
              </label>
              <Input
                placeholder="e.g. https://storage.hospital.org/reports/lab-123.pdf"
                {...registerResult('resultFileUrl')}
                disabled={addResultMutation.isPending}
              />
              <span className="text-[10px] text-muted-foreground">
                Cloudinary / PDF report document link if available.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResultOrderTarget(null)}
                disabled={addResultMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addResultMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {addResultMutation.isPending ? 'Completing Order...' : 'Complete & Publish Result'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 4: VIEW RESULT */}
      <Modal
        isOpen={!!viewResultTarget}
        onClose={() => setViewResultTarget(null)}
        title="Diagnostic Lab Result"
        description={
          viewResultTarget
            ? `Patient: ${viewResultTarget.patientId?.name || '—'} (MRN: ${viewResultTarget.patientId?.mrn || '—'})`
            : ''
        }
      >
        {viewResultTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Tests Evaluated:</span>
                <Badge variant="completed">Completed</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {viewResultTarget.tests?.map((t, i) => (
                  <span key={i} className="font-semibold text-foreground bg-card px-2 py-0.5 rounded border border-border">
                    {t.testName}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground text-xs block">Result Notes / Findings:</label>
              <div className="p-3 bg-card border border-border rounded-xl whitespace-pre-wrap text-foreground font-mono text-xs">
                {viewResultTarget.resultNotes || 'No notes provided.'}
              </div>
            </div>

            {viewResultTarget.resultFileUrl && (
              <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 flex items-center justify-between">
                <span className="font-semibold text-primary">Attached Lab Report Document</span>
                <a
                  href={viewResultTarget.resultFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <span>Open Report</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-border text-muted-foreground text-[11px]">
              <span>Completed at: {viewResultTarget.completedAt ? new Date(viewResultTarget.completedAt).toLocaleString() : '—'}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setViewResultTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 5: CANCEL ORDER CONFIRMATION */}
      <Modal
        isOpen={!!cancelOrderTarget}
        onClose={() => setCancelOrderTarget(null)}
        title="Cancel Lab Order"
        description="Are you sure you want to cancel this diagnostic order?"
      >
        <div className="space-y-4 text-xs">
          <p className="text-foreground">
            Cancelling this order for patient <strong>{cancelOrderTarget?.patientId?.name}</strong> will stop specimen collection and processing.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOrderTarget(null)}
              disabled={updateStatusMutation.isPending}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (cancelOrderTarget) {
                  updateStatusMutation.mutate({
                    orderId: cancelOrderTarget._id,
                    status: 'cancelled',
                  });
                }
              }}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
