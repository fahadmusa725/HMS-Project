import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  Pill,
  Plus,
  Search,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Edit2,
  PackagePlus,
  User,
  History,
  AlertCircle
} from 'lucide-react';

import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils';

// Rejects a field that's either empty or nothing but whitespace, for optional text fields where
// "   " shouldn't be treated as a real value.
const notBlankIfFilled = (message) =>
  z
    .string()
    .optional()
    .refine((v) => !v || v.trim().length > 0, message);

// Schema for adding a medicine (with an optional initial batch) / editing its non-batch details.
// Batch fields are kept as raw strings (not z.coerce.number()) so superRefine below can tell an
// untouched field apart from one the user actually typed "0" into.
const medicineSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Medicine name is required'),
    category: notBlankIfFilled('Category cannot be just spaces.'),
    unit: notBlankIfFilled('Dosage unit cannot be just spaces.'),
    price: z.coerce.number().gt(0, 'Unit price must be a number greater than 0'),
    supplier: notBlankIfFilled('Supplier cannot be just spaces.'),
    lowStockThreshold: z.coerce.number().min(0, 'Threshold cannot be negative').default(10),
    batchNumber: z.string().optional(),
    batchQuantity: z.string().optional(),
    batchExpiryDate: z.string().optional(),
    batchPurchasePrice: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const filled = (v) => !!v && v.trim() !== '';
    const batchTouched =
      filled(data.batchNumber) || filled(data.batchQuantity) || filled(data.batchExpiryDate) || filled(data.batchPurchasePrice);

    if (!batchTouched) return;

    if (!filled(data.batchNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batchNumber'], message: 'Batch number is required once any batch field is filled in.' });
    }

    const quantity = Number(data.batchQuantity);
    if (!filled(data.batchQuantity) || !Number.isFinite(quantity) || quantity <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batchQuantity'], message: 'Quantity must be a positive number.' });
    }

    if (!filled(data.batchExpiryDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batchExpiryDate'], message: 'Expiry date is required once any batch field is filled in.' });
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(`${data.batchExpiryDate}T00:00:00`);
      if (Number.isNaN(expiry.getTime()) || expiry < today) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batchExpiryDate'], message: 'Expiry date must be today or a future date.' });
      }
    }

    const purchasePrice = Number(data.batchPurchasePrice);
    if (!filled(data.batchPurchasePrice) || !Number.isFinite(purchasePrice) || purchasePrice < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batchPurchasePrice'], message: 'Purchase price is required and cannot be negative.' });
    }
  });

const batchSchema = z.object({
  batchNumber: z.string().optional(),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  purchasePrice: z.coerce.number().min(0).optional(),
  supplier: z.string().optional(),
});

export default function PharmacyModule() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const role = user?.role;
  const canManageInventory = ['pharmacist', 'hospital_admin'].includes(role);
  const canDispense = ['pharmacist', 'hospital_admin'].includes(role);

  const [activeTab, setActiveTab] = useState('inventory');

  const [searchQuery, setSearchQuery] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const [editMedTarget, setEditMedTarget] = useState(null);
  const [batchMedTarget, setBatchMedTarget] = useState(null);
  const [isDispenseOpen, setIsDispenseOpen] = useState(false);

  const [dispensePatientSearch, setDispensePatientSearch] = useState('');
  const [dispensePatient, setDispensePatient] = useState(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [cartItems, setCartItems] = useState([]); // [{ medicineId, medicineName, price, stock, quantity, subtotal }]
  const [selectedMedIdToAdd, setSelectedMedIdToAdd] = useState('');
  const [qtyToAdd, setQtyToAdd] = useState(1);
  const [dispenseError, setDispenseError] = useState(null);

  const {
    register: registerMed,
    handleSubmit: handleSubmitMed,
    reset: resetMed,
    setValue: setMedValue,
    formState: { errors: medErrors, isValid: isMedFormValid },
  } = useForm({
    resolver: zodResolver(medicineSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      category: '',
      unit: 'tablet',
      price: '',
      supplier: '',
      lowStockThreshold: 10,
      batchNumber: '',
      batchQuantity: '',
      batchExpiryDate: '',
      batchPurchasePrice: '',
    },
  });

  const {
    register: registerBatch,
    handleSubmit: handleSubmitBatch,
    reset: resetBatch,
    formState: { errors: batchErrors },
  } = useForm({
    resolver: zodResolver(batchSchema),
    defaultValues: { batchNumber: '', quantity: 50, expiryDate: '', purchasePrice: undefined, supplier: '' },
  });

  const {
    data: medicines = [],
    isLoading: isMedsLoading,
    refetch: refetchMeds,
    isRefetching: isMedsRefetching,
  } = useQuery({
    queryKey: ['pharmacy-medicines', searchQuery, lowStockOnly],
    queryFn: async () => {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (lowStockOnly) params.lowStock = 'true';
      const res = await api.get('/api/pharmacy/medicines', { params });
      return res.data;
    },
  });

  const {
    data: sales = [],
    isLoading: isSalesLoading,
    refetch: refetchSales,
    isRefetching: isSalesRefetching,
  } = useQuery({
    queryKey: ['pharmacy-sales'],
    queryFn: async () => {
      const res = await api.get('/api/pharmacy/sales');
      return res.data;
    },
    enabled: activeTab === 'sales',
  });

  const { data: patientSearchResults = { patients: [] } } = useQuery({
    queryKey: ['dispense-patient-search', dispensePatientSearch],
    queryFn: async () => {
      if (!dispensePatientSearch.trim()) return { patients: [] };
      const res = await api.get('/api/patients', { params: { search: dispensePatientSearch, limit: 8 } });
      return res.data;
    },
    enabled: isDispenseOpen && !isWalkIn && !dispensePatient && dispensePatientSearch.trim().length > 0,
  });

  const createMedMutation = useMutation({
    mutationFn: async (formData) => {
      const { batchNumber, batchQuantity, batchExpiryDate, batchPurchasePrice, ...medicineFields } = formData;
      const payload = { ...medicineFields };
      // Validated by medicineSchema's superRefine: batch fields are either all filled or all blank.
      if (batchQuantity && batchQuantity.trim() !== '') {
        payload.batch = {
          batchNumber,
          quantity: Number(batchQuantity),
          expiryDate: batchExpiryDate,
          purchasePrice: Number(batchPurchasePrice),
        };
      }
      const res = await api.post('/api/pharmacy/medicines', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-medicines'] });
      setIsAddMedOpen(false);
      resetMed();
      toast.success(`Medicine "${data.name}" added to inventory.`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to add medicine.');
    },
  });

  const updateMedMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await api.patch(`/api/pharmacy/medicines/${id}`, data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-medicines'] });
      setEditMedTarget(null);
      resetMed();
      toast.success(`Medicine "${data.name}" details updated.`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update medicine.');
    },
  });

  const addBatchMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await api.patch(`/api/pharmacy/medicines/${id}/restock`, data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-medicines'] });
      setBatchMedTarget(null);
      resetBatch();
      toast.success(`New batch added to ${data.name}. Current stock: ${data.stock} ${data.unit || 'units'}.`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to add batch.');
    },
  });

  const dispenseMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/api/pharmacy/dispense', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-medicines'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacy-sales'] });
      setIsDispenseOpen(false);
      setCartItems([]);
      setDispensePatient(null);
      setIsWalkIn(false);
      setDispenseError(null);
      toast.success(`Dispense successful. Total: ${formatCurrency(data.totalAmount)}`);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to complete dispense transaction.';
      setDispenseError(msg);
      toast.error(msg);
    },
  });

  const stats = useMemo(() => {
    const list = Array.isArray(medicines) ? medicines : [];
    const total = list.length;
    const lowStock = list.filter((m) => m.stock > 0 && m.stock <= (m.lowStockThreshold || 10)).length;
    const outOfStock = list.filter((m) => m.stock === 0).length;
    const inStock = list.filter((m) => m.stock > (m.lowStockThreshold || 10)).length;
    return { total, inStock, lowStock, outOfStock };
  }, [medicines]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  }, [cartItems]);

  const handleAddToCart = () => {
    if (!selectedMedIdToAdd) return;
    const med = medicines.find((m) => m._id === selectedMedIdToAdd);
    if (!med) return;

    const qty = Number(qtyToAdd) || 1;
    if (qty <= 0) return;

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.medicineId === med._id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const newQty = updated[existingIndex].quantity + qty;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQty,
          subtotal: updated[existingIndex].price * newQty,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            medicineId: med._id,
            medicineName: med.name,
            price: med.price,
            unit: med.unit || 'unit',
            stock: med.stock,
            quantity: qty,
            subtotal: med.price * qty,
          },
        ];
      }
    });

    setSelectedMedIdToAdd('');
    setQtyToAdd(1);
    setDispenseError(null);
  };

  const handleUpdateCartQty = (medicineId, newQty) => {
    if (newQty <= 0) {
      setCartItems((prev) => prev.filter((item) => item.medicineId !== medicineId));
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.medicineId === medicineId
          ? { ...item, quantity: newQty, subtotal: item.price * newQty }
          : item
      )
    );
  };

  const handleRemoveFromCart = (medicineId) => {
    setCartItems((prev) => prev.filter((item) => item.medicineId !== medicineId));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Pill className="h-7 w-7 text-primary" />
            Pharmacy &amp; Dispensary
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {role === 'pharmacist'
              ? 'Manage pharmaceutical stock, dispense prescriptions, and monitor sales logs.'
              : 'Inventory tracking, stock threshold alerts, and medication sales logs.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex bg-muted/60 p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'inventory'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Medicine Inventory ({medicines.length})
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sales'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sales History
            </button>
          </div>

          {canDispense && (
            <Button
              onClick={() => {
                setCartItems([]);
                setDispensePatient(null);
                setIsWalkIn(false);
                setDispenseError(null);
                setIsDispenseOpen(true);
              }}
              className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5 shadow-sm text-xs"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Dispense Medicine</span>
            </Button>
          )}

          {canManageInventory && (
            <Button
              onClick={() => {
                resetMed();
                setIsAddMedOpen(true);
              }}
              variant="outline"
              className="h-9 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Medicine
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-soft grid grid-cols-2 lg:grid-cols-4">
            <div className="p-4 sm:p-5 border-b lg:border-b-0 border-r border-border">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                {isMedsLoading ? '—' : stats.total}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Total medicines
              </div>
            </div>

            <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-border">
              <div className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
                {isMedsLoading ? '—' : stats.inStock}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Well-stocked items
              </div>
            </div>

            <div className="p-4 sm:p-5 border-r border-border">
              <div className="text-2xl sm:text-3xl font-extrabold text-warning-foreground tracking-tight">
                {isMedsLoading ? '—' : stats.lowStock}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Low stock alerts
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-2xl sm:text-3xl font-extrabold text-destructive tracking-tight">
                {isMedsLoading ? '—' : stats.outOfStock}
              </div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                Out of stock
              </div>
            </div>
          </div>

          <Card className="bg-card border-border shadow-soft overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search medicine name or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 bg-card border-border text-foreground text-xs"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLowStockOnly(!lowStockOnly)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    lowStockOnly
                      ? 'bg-warning/20 text-warning-foreground border border-warning/30 font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground border border-border'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" />
                  <span>Show Low Stock Only</span>
                </button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchMeds()}
                  disabled={isMedsRefetching}
                  className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isMedsRefetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {isMedsLoading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                  <span className="text-sm font-medium">Loading medicine inventory...</span>
                </div>
              ) : medicines.length === 0 ? (
                <div className="p-12 text-center">
                  <Pill className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-bold text-foreground">No medicines found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQuery || lowStockOnly
                      ? 'Try adjusting your search criteria.'
                      : 'Click "Add Medicine" to begin populating your pharmacy inventory.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                      <th className="py-3.5 px-6">Medicine Name</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Unit</th>
                      <th className="py-3.5 px-4">Stock Level</th>
                      <th className="py-3.5 px-4">Unit Price</th>
                      <th className="py-3.5 px-4">Batches</th>
                      <th className="py-3.5 px-4">Supplier</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {medicines.map((med) => {
                      const isLowStock = med.stock <= (med.lowStockThreshold || 10);
                      const isOutOfStock = med.stock === 0;
                      return (
                        <tr
                          key={med._id}
                          className={`hover:bg-accent/40 transition-colors ${
                            isOutOfStock
                              ? 'bg-destructive/5'
                              : isLowStock
                              ? 'bg-warning/5'
                              : ''
                          }`}
                        >
                          <td className="py-4 px-6">
                            <div className="font-semibold text-foreground flex items-center gap-2">
                              <Pill className="h-4 w-4 text-primary shrink-0" />
                              <span>{med.name}</span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-xs font-medium text-muted-foreground">
                            {med.category || 'General'}
                          </td>

                          <td className="py-4 px-4 text-xs capitalize text-muted-foreground">
                            {med.unit || 'tablet'}
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                  isOutOfStock
                                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                                    : isLowStock
                                    ? 'bg-warning/15 text-warning-foreground border-warning/30'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                }`}
                              >
                                {med.stock} {med.unit || 'units'}
                              </span>
                              {isLowStock && (
                                <span className="text-[10px] text-warning-foreground font-semibold flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  {isOutOfStock ? 'Empty' : 'Low'}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 font-bold text-foreground text-xs">
                            {formatCurrency(med.price)}
                          </td>

                          <td className="py-4 px-4">
                            {!med.batches || med.batches.length === 0 ? (
                              <span className="text-xs text-muted-foreground">No batches</span>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {med.batches
                                  .filter((b) => b.quantity > 0)
                                  .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
                                  .map((b, idx) => {
                                    const daysToExpiry = Math.ceil(
                                      (new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
                                    );
                                    const isExpired = daysToExpiry < 0;
                                    const isNearExpiry = !isExpired && daysToExpiry <= 30;
                                    return (
                                      <span
                                        key={idx}
                                        title={b.batchNumber || 'Unlabeled batch'}
                                        className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${
                                          isExpired
                                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                                            : isNearExpiry
                                            ? 'bg-warning/15 text-warning-foreground border-warning/30'
                                            : 'bg-muted/60 text-muted-foreground border-border'
                                        }`}
                                      >
                                        {b.quantity} · {new Date(b.expiryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                                        {isExpired ? ' (expired)' : isNearExpiry ? ' (soon)' : ''}
                                      </span>
                                    );
                                  })}
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-4 text-xs text-muted-foreground">
                            {med.supplier || '—'}
                          </td>

                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canManageInventory && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setBatchMedTarget(med);
                                      resetBatch({ batchNumber: '', quantity: 50, expiryDate: '', purchasePrice: undefined, supplier: med.supplier || '' });
                                    }}
                                    className="h-7 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10"
                                    title="Add a new batch"
                                  >
                                    <PackagePlus className="h-3.5 w-3.5 mr-1" />
                                    Add Batch
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditMedTarget(med);
                                      setMedValue('name', med.name);
                                      setMedValue('category', med.category || '');
                                      setMedValue('unit', med.unit || 'tablet');
                                      setMedValue('price', med.price);
                                      setMedValue('supplier', med.supplier || '');
                                      setMedValue('lowStockThreshold', med.lowStockThreshold || 10);
                                      // Edit doesn't show the batch fields, so clear any leftover values from
                                      // an abandoned Add Medicine attempt - they share one form instance.
                                      setMedValue('batchNumber', '');
                                      setMedValue('batchQuantity', '');
                                      setMedValue('batchExpiryDate', '');
                                      setMedValue('batchPurchasePrice', '');
                                    }}
                                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                    title="Edit details"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
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

      {activeTab === 'sales' && (
        <div className="space-y-6">
          <Card className="bg-card border-border shadow-soft overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/20">
              <div>
                <h3 className="text-sm font-bold text-foreground">Dispensary Sales Journal</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Audit trail of all fulfilled medication dispenses
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSales()}
                disabled={isSalesRefetching}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSalesRefetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="overflow-x-auto">
              {isSalesLoading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                  <span className="text-sm font-medium">Loading sales journal...</span>
                </div>
              ) : sales.length === 0 ? (
                <div className="p-12 text-center">
                  <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-bold text-foreground">No dispensary sales recorded yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Completed medication dispenses will be logged here automatically.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                      <th className="py-3.5 px-6">Date &amp; Time</th>
                      <th className="py-3.5 px-4">Patient</th>
                      <th className="py-3.5 px-4">Items Dispensed</th>
                      <th className="py-3.5 px-4">Dispensed By</th>
                      <th className="py-3.5 px-6 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sales.map((sale) => (
                      <tr key={sale._id} className="hover:bg-accent/40 transition-colors">
                        <td className="py-4 px-6 text-xs text-muted-foreground">
                          {new Date(sale.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        <td className="py-4 px-4 font-semibold text-foreground">
                          {sale.patientId ? (
                            <div>
                              <span>{sale.patientId.name}</span>
                              <span className="block text-[11px] font-mono text-muted-foreground font-normal">
                                MRN: {sale.patientId.mrn}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">Walk-in Customer</span>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex flex-wrap gap-1 max-w-sm">
                            {sale.items?.map((item, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] bg-muted/70 px-2 py-0.5 rounded-md border border-border text-foreground font-medium"
                              >
                                {item.medicineName} x{item.quantity}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-4 px-4 text-xs font-medium text-foreground">
                          {sale.dispensedBy?.name || 'Staff Member'}
                        </td>

                        <td className="py-4 px-6 text-right font-bold text-primary">
                          {formatCurrency(sale.totalAmount)}
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

      <Modal
        isOpen={isAddMedOpen}
        onClose={() => setIsAddMedOpen(false)}
        title="Add New Medicine"
        description="Register a pharmaceutical item into hospital inventory."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddMedOpen(false)}
              disabled={createMedMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-medicine-form"
              disabled={createMedMutation.isPending || !isMedFormValid}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createMedMutation.isPending ? 'Saving...' : 'Add Medicine'}
            </Button>
          </>
        }
      >
        <form id="add-medicine-form" onSubmit={handleSubmitMed((data) => createMedMutation.mutate(data))} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Medicine Name *
            </label>
            <Input
              placeholder="e.g. Paracetamol 500mg, Amoxicillin 250mg"
              {...registerMed('name')}
              disabled={createMedMutation.isPending}
              className={medErrors.name ? 'border-destructive' : ''}
            />
            {medErrors.name && <p className="text-xs text-destructive">{medErrors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Category
              </label>
              <Input
                placeholder="e.g. Analgesic, Antibiotic"
                {...registerMed('category')}
                disabled={createMedMutation.isPending}
                className={medErrors.category ? 'border-destructive' : ''}
              />
              {medErrors.category && <p className="text-xs text-destructive">{medErrors.category.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Dosage Unit
              </label>
              <Input
                placeholder="e.g. tablet, syrup, injection"
                {...registerMed('unit')}
                disabled={createMedMutation.isPending}
                className={medErrors.unit ? 'border-destructive' : ''}
              />
              {medErrors.unit && <p className="text-xs text-destructive">{medErrors.unit.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Unit Price (PKR) *
              </label>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 15.50"
                {...registerMed('price')}
                disabled={createMedMutation.isPending}
                className={medErrors.price ? 'border-destructive' : ''}
              />
              {medErrors.price && <p className="text-xs text-destructive">{medErrors.price.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Low Stock Alert Threshold
              </label>
              <Input
                type="number"
                placeholder="e.g. 10"
                {...registerMed('lowStockThreshold')}
                disabled={createMedMutation.isPending}
                className={medErrors.lowStockThreshold ? 'border-destructive' : ''}
              />
              {medErrors.lowStockThreshold && (
                <p className="text-xs text-destructive">{medErrors.lowStockThreshold.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
              Supplier / Distributor
            </label>
            <Input
              placeholder="e.g. PharmaMed Distributors"
              {...registerMed('supplier')}
              disabled={createMedMutation.isPending}
              className={medErrors.supplier ? 'border-destructive' : ''}
            />
            {medErrors.supplier && <p className="text-xs text-destructive">{medErrors.supplier.message}</p>}
          </div>

          <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-3">
            <span className="font-bold text-foreground block text-xs uppercase tracking-wider">
              Initial Batch (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground block">Batch Number</label>
                <Input
                  placeholder="e.g. B-2026-01"
                  {...registerMed('batchNumber')}
                  disabled={createMedMutation.isPending}
                  className={`h-8 text-xs ${medErrors.batchNumber ? 'border-destructive' : ''}`}
                />
                {medErrors.batchNumber && <p className="text-xs text-destructive">{medErrors.batchNumber.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground block">Quantity</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 100"
                  {...registerMed('batchQuantity')}
                  disabled={createMedMutation.isPending}
                  className={`h-8 text-xs ${medErrors.batchQuantity ? 'border-destructive' : ''}`}
                />
                {medErrors.batchQuantity && <p className="text-xs text-destructive">{medErrors.batchQuantity.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground block">Expiry Date</label>
                <Input
                  type="date"
                  {...registerMed('batchExpiryDate')}
                  disabled={createMedMutation.isPending}
                  className={`h-8 text-xs ${medErrors.batchExpiryDate ? 'border-destructive' : ''}`}
                />
                {medErrors.batchExpiryDate && (
                  <p className="text-xs text-destructive">{medErrors.batchExpiryDate.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground block">Purchase Price (PKR)</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 8.00"
                  {...registerMed('batchPurchasePrice')}
                  disabled={createMedMutation.isPending}
                  className={`h-8 text-xs ${medErrors.batchPurchasePrice ? 'border-destructive' : ''}`}
                />
                {medErrors.batchPurchasePrice && (
                  <p className="text-xs text-destructive">{medErrors.batchPurchasePrice.message}</p>
                )}
              </div>
            </div>
          </div>

        </form>
      </Modal>

      <Modal
        isOpen={!!editMedTarget}
        onClose={() => setEditMedTarget(null)}
        title="Edit Medicine Details"
        description="Update pricing, supplier, or threshold information."
        footer={
          editMedTarget && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMedTarget(null)}
                disabled={updateMedMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="edit-medicine-form"
                disabled={updateMedMutation.isPending || !isMedFormValid}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {updateMedMutation.isPending ? 'Updating...' : 'Save Changes'}
              </Button>
            </>
          )
        }
      >
        {editMedTarget && (
          <form
            id="edit-medicine-form"
            onSubmit={handleSubmitMed((data) =>
              updateMedMutation.mutate({ id: editMedTarget._id, data })
            )}
            className="space-y-4"
          >
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Medicine Name *
              </label>
              <Input
                {...registerMed('name')}
                disabled={updateMedMutation.isPending}
                className={medErrors.name ? 'border-destructive' : ''}
              />
              {medErrors.name && <p className="text-xs text-destructive">{medErrors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Category
                </label>
                <Input
                  {...registerMed('category')}
                  disabled={updateMedMutation.isPending}
                  className={medErrors.category ? 'border-destructive' : ''}
                />
                {medErrors.category && <p className="text-xs text-destructive">{medErrors.category.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Unit
                </label>
                <Input
                  {...registerMed('unit')}
                  disabled={updateMedMutation.isPending}
                  className={medErrors.unit ? 'border-destructive' : ''}
                />
                {medErrors.unit && <p className="text-xs text-destructive">{medErrors.unit.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Unit Price (PKR) *
                </label>
                <Input
                  type="number"
                  step="any"
                  {...registerMed('price')}
                  disabled={updateMedMutation.isPending}
                  className={medErrors.price ? 'border-destructive' : ''}
                />
                {medErrors.price && <p className="text-xs text-destructive">{medErrors.price.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Low Stock Threshold
                </label>
                <Input
                  type="number"
                  {...registerMed('lowStockThreshold')}
                  disabled={updateMedMutation.isPending}
                  className={medErrors.lowStockThreshold ? 'border-destructive' : ''}
                />
                {medErrors.lowStockThreshold && (
                  <p className="text-xs text-destructive">{medErrors.lowStockThreshold.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Supplier
              </label>
              <Input
                {...registerMed('supplier')}
                disabled={updateMedMutation.isPending}
                className={medErrors.supplier ? 'border-destructive' : ''}
              />
              {medErrors.supplier && <p className="text-xs text-destructive">{medErrors.supplier.message}</p>}
            </div>

          </form>
        )}
      </Modal>

      <Modal
        isOpen={!!batchMedTarget}
        onClose={() => setBatchMedTarget(null)}
        title={`Add Batch: ${batchMedTarget?.name}`}
        description={`Current stock: ${batchMedTarget?.stock} ${batchMedTarget?.unit || 'units'}`}
        footer={
          batchMedTarget && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBatchMedTarget(null)}
                disabled={addBatchMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="add-batch-form"
                disabled={addBatchMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {addBatchMutation.isPending ? 'Adding...' : 'Add Batch'}
              </Button>
            </>
          )
        }
      >
        {batchMedTarget && (
          <form
            id="add-batch-form"
            onSubmit={handleSubmitBatch((data) => addBatchMutation.mutate({ id: batchMedTarget._id, data }))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Batch Number
                </label>
                <Input
                  placeholder="e.g. B-2026-02"
                  {...registerBatch('batchNumber')}
                  disabled={addBatchMutation.isPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Quantity *
                </label>
                <Input
                  type="number"
                  min="1"
                  {...registerBatch('quantity')}
                  disabled={addBatchMutation.isPending}
                  className={batchErrors.quantity ? 'border-destructive' : ''}
                  autoFocus
                />
                {batchErrors.quantity && <p className="text-xs text-destructive">{batchErrors.quantity.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Expiry Date *
                </label>
                <Input
                  type="date"
                  {...registerBatch('expiryDate')}
                  disabled={addBatchMutation.isPending}
                  className={batchErrors.expiryDate ? 'border-destructive' : ''}
                />
                {batchErrors.expiryDate && <p className="text-xs text-destructive">{batchErrors.expiryDate.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Purchase Price (PKR)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  {...registerBatch('purchasePrice')}
                  disabled={addBatchMutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                Supplier
              </label>
              <Input
                placeholder="e.g. PharmaMed Distributors"
                {...registerBatch('supplier')}
                disabled={addBatchMutation.isPending}
              />
            </div>

          </form>
        )}
      </Modal>

      <Modal
        isOpen={isDispenseOpen}
        onClose={() => {
          if (!dispenseMutation.isPending) setIsDispenseOpen(false);
        }}
        title="Dispense Medications"
        description="Select patient (or walk-in) and assemble medicine items for checkout."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDispenseOpen(false)}
              disabled={dispenseMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (cartItems.length === 0) {
                  toast.error('Please add at least one medicine item to cart.');
                  return;
                }
                dispenseMutation.mutate({
                  patientId: dispensePatient?._id || undefined,
                  items: cartItems.map((i) => ({
                    medicineId: i.medicineId,
                    quantity: i.quantity,
                  })),
                });
              }}
              disabled={dispenseMutation.isPending || cartItems.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {dispenseMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                `Complete Dispense (${formatCurrency(cartTotal)})`
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          {dispenseError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive animate-slide-up font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">{dispenseError}</div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-foreground/80 uppercase tracking-wider block text-xs">
                Customer / Patient
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsWalkIn(!isWalkIn);
                  setDispensePatient(null);
                  setDispensePatientSearch('');
                }}
                className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
                  isWalkIn
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isWalkIn ? '✓ Walk-in Sale (No Patient)' : '+ Walk-in Sale?'}
              </button>
            </div>

            {!isWalkIn && (
              dispensePatient ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <div>
                      <span className="font-bold text-foreground">{dispensePatient.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">MRN: {dispensePatient.mrn}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDispensePatient(null)}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search patient by Name or MRN..."
                      value={dispensePatientSearch}
                      onChange={(e) => setDispensePatientSearch(e.target.value)}
                      className="pl-9 h-8 text-xs"
                    />
                  </div>
                  {patientSearchResults.patients?.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border shadow-soft">
                      {patientSearchResults.patients.map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => {
                            setDispensePatient(p);
                            setDispensePatientSearch('');
                          }}
                          className="w-full text-left p-2 hover:bg-muted/50 flex items-center justify-between transition-colors"
                        >
                          <span className="font-semibold text-foreground">{p.name}</span>
                          <span className="font-mono text-muted-foreground">MRN: {p.mrn}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-2">
            <span className="font-semibold text-foreground/90 block">Add Medicine to Cart:</span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-8">
                <select
                  value={selectedMedIdToAdd}
                  onChange={(e) => setSelectedMedIdToAdd(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">-- Select Medicine --</option>
                  {medicines.map((m) => (
                    <option key={m._id} value={m._id} disabled={m.stock === 0}>
                      {m.name} ({formatCurrency(m.price)}), Stock: {m.stock} {m.unit || 'units'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <Input
                  type="number"
                  min="1"
                  value={qtyToAdd}
                  onChange={(e) => setQtyToAdd(Math.max(1, Number(e.target.value)))}
                  placeholder="Qty"
                  className="h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <Button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!selectedMedIdToAdd}
                  className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground/80 uppercase tracking-wider block">
                Cart Items ({cartItems.length})
              </span>
              <span className="text-sm font-extrabold text-primary">
                Grand Total: {formatCurrency(cartTotal)}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border">
              {cartItems.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  Cart is empty. Select a medicine above to add.
                </div>
              ) : (
                cartItems.map((item) => (
                  <div key={item.medicineId} className="p-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground truncate">{item.medicineName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatCurrency(item.price)} each • Available stock: {item.stock}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-border rounded-lg bg-card">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(item.medicineId, item.quantity - 1)}
                          className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
                        >
                          -
                        </button>
                        <span className="px-2 py-0.5 font-bold text-foreground text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(item.medicineId, item.quantity + 1)}
                          className="px-2 py-0.5 text-muted-foreground hover:text-foreground"
                        >
                          +
                        </button>
                      </div>

                      <div className="font-bold text-foreground text-right w-20">
                        {formatCurrency(item.subtotal)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(item.medicineId)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </Modal>
    </div>
  );
}
