import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Lock,
  Mail,
  User,
  Phone,
  CreditCard,
  Building2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  HeartPulse,
  Info,
  MapPin,
  CalendarDays,
  ChevronDown
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const signupSchema = z.object({
  hospitalId: z.string().min(1, 'Please select your hospital'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
  cnic: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
});

export default function PatientSignup() {
  const navigate = useNavigate();
  const { signupPatient, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [hospitalsError, setHospitalsError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      hospitalId: '',
      name: '',
      email: '',
      password: '',
      phone: '',
      cnic: '',
      dob: '',
      gender: '',
      address: '',
    },
  });

  useEffect(() => {
    clearError();
    const fetchHospitals = async () => {
      try {
        setLoadingHospitals(true);
        const res = await axios.get(`${API_BASE_URL}/api/public/hospitals`);
        setHospitals(res.data || []);
      } catch (err) {
        console.error('Failed to load hospitals:', err);
        setHospitalsError('Unable to load participating hospitals list.');
      } finally {
        setLoadingHospitals(false);
      }
    };
    fetchHospitals();
  }, [clearError]);

  const onSubmit = async (data) => {
    clearError();
    const payload = {
      hospitalId: data.hospitalId,
      name: data.name.trim(),
      email: data.email.trim(),
      password: data.password,
      phone: data.phone?.trim() || undefined,
      cnic: data.cnic?.trim() || undefined,
      dob: data.dob || undefined,
      gender: data.gender || undefined,
      address: data.address?.trim() || undefined,
    };

    const result = await signupPatient(payload);

    if (result.success) {
      toast.success('Account created successfully!', {
        description: 'Welcome to your patient portal.',
      });
      navigate('/portal', { replace: true });
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-background overflow-hidden selection:bg-primary/20 selection:text-primary">
      {/* Top right theme toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Subtle ambient background glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-lg z-10 animate-fade-in my-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/20 mb-4 ring-8 ring-primary/10">
            <HeartPulse className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            CareFlow <span className="text-primary font-medium">Patient Portal</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-normal">
            Create your account to view medical records, appointments, and bills
          </p>
        </div>

        {/* Signup Card */}
        <Card className="bg-card border-border shadow-soft-xl">
          <CardHeader className="space-y-1 text-center pb-5">
            <CardTitle className="text-xl font-bold text-foreground">Self Patient Registration</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your details to register or link with your existing hospital record
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Inline Error Alert */}
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive animate-slide-up">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">
                  {error}
                  {error.toLowerCase().includes('already exists') && (
                    <div className="mt-1.5">
                      <Link to="/login" className="underline font-bold hover:text-destructive/80">
                        Go to Login Page →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {hospitalsError && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-sm text-warning-foreground animate-slide-up">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{hospitalsError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Hospital Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Select Hospital *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <select
                    {...register('hospitalId')}
                    disabled={isLoading || loadingHospitals}
                    className={`pl-10 h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      errors.hospitalId ? 'border-destructive focus-visible:ring-destructive' : ''
                    }`}
                  >
                    <option value="">
                      {loadingHospitals ? 'Loading hospitals...' : '-- Choose your hospital --'}
                    </option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.hospitalId && (
                  <p className="text-xs text-destructive font-medium mt-1">
                    {errors.hospitalId.message}
                  </p>
                )}
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Full Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <User className="h-4 w-4" />
                  </div>
                  <Input
                    placeholder="e.g. Fatima Ali"
                    className={`pl-10 h-11 bg-card border-border text-foreground ${
                      errors.name ? 'border-destructive focus-visible:ring-destructive' : ''
                    }`}
                    {...register('name')}
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>
                {errors.name && (
                  <p className="text-xs text-destructive font-medium mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Phone & CNIC (2 Column Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Phone Number <span className="text-muted-foreground font-normal lowercase">(optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <Phone className="h-4 w-4" />
                    </div>
                    <Input
                      placeholder="03001234567"
                      className="pl-10 h-11 bg-card border-border text-foreground"
                      {...register('phone')}
                      disabled={isLoading}
                      autoComplete="tel"
                    />
                  </div>
                </div>

                {/* CNIC / National ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    CNIC / ID <span className="text-muted-foreground font-normal lowercase">(optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <Input
                      placeholder="35201-1234567-1"
                      className="pl-10 h-11 bg-card border-border text-foreground"
                      {...register('cnic')}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* CNIC Link Helper Note */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> Providing your CNIC helps link your account directly to any existing medical record already on file at this hospital, avoiding duplicate records.
                </span>
              </div>

              {/* DOB & Gender (2 Column Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date of Birth */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Date of Birth <span className="text-muted-foreground font-normal lowercase">(optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <Input
                      type="date"
                      className="pl-10 h-11 bg-card border-border text-foreground"
                      {...register('dob')}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Gender <span className="text-muted-foreground font-normal lowercase">(optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <ChevronDown className="h-4 w-4" />
                    </div>
                    <select
                      {...register('gender')}
                      disabled={isLoading}
                      className="pl-10 h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <option value="">-- Select gender --</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Address <span className="text-muted-foreground font-normal lowercase">(optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <Input
                    placeholder="e.g. House 5, Street 12, Islamabad"
                    className="pl-10 h-11 bg-card border-border text-foreground"
                    {...register('address')}
                    disabled={isLoading}
                    autoComplete="street-address"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Email Address *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    type="email"
                    placeholder="patient@example.com"
                    className={`pl-10 h-11 bg-card border-border text-foreground ${
                      errors.email ? 'border-destructive focus-visible:ring-destructive' : ''
                    }`}
                    {...register('email')}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive font-medium mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    className={`pl-10 pr-10 h-11 bg-card border-border text-foreground ${
                      errors.password ? 'border-destructive focus-visible:ring-destructive' : ''
                    }`}
                    {...register('password')}
                    disabled={isLoading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive font-medium mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200 mt-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Patient Account'
                )}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Log in
              </Link>
            </div>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border pt-4 pb-4 bg-muted/20 rounded-b-2xl">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>HIPAA Compliant &amp; End-to-End Encrypted</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
