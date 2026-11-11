import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Lock,
  Mail,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  HeartPulse
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  // Seconds left on a server-side lockout. Purely a UI hint: the API keeps
  // refusing logins until lockUntil passes, whether or not this is running.
  const [lockSeconds, setLockSeconds] = useState(0);
  // Set by the API interceptor when the server ends a session (account disabled,
  // hospital suspended, trial expired). Read once, then cleared so it doesn't stick around.
  const [sessionMessage] = useState(() => {
    const stored = sessionStorage.getItem('careflow-auth-error');
    if (stored) sessionStorage.removeItem('careflow-auth-error');
    return stored;
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = setTimeout(() => setLockSeconds((seconds) => Math.max(seconds - 1, 0)), 1000);
    return () => clearTimeout(timer);
  }, [lockSeconds]);

  const lockLabel = `${Math.floor(lockSeconds / 60)}:${String(lockSeconds % 60).padStart(2, '0')}`;

  const onSubmit = async (data) => {
    clearError();
    const result = await login(data.email, data.password);

    if (result.success && result.user) {
      if (result.user.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      const { role } = result.user;
      if (role === 'platform_super_admin') {
        navigate('/super-admin/dashboard', { replace: true });
      } else if (role === 'patient') {
        navigate('/portal', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else if (result.retryAfter > 0) {
      setLockSeconds(result.retryAfter);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-background overflow-hidden selection:bg-primary/20 selection:text-primary">
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10 animate-fade-in">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/20 mb-4 ring-8 ring-primary/10">
            <HeartPulse className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            CareFlow <span className="text-primary font-medium">HMS</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-normal">
            Enterprise Multi-Tenant Healthcare Management Platform
          </p>
        </div>

        <Card className="bg-card border-border shadow-soft-xl">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-xl font-bold text-foreground">Sign in to your account</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your hospital workspace
            </CardDescription>
          </CardHeader>

          <CardContent>
            {sessionMessage && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-sm text-warning-foreground animate-slide-up">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{sessionMessage}</div>
              </div>
            )}

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive animate-slide-up">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">
                  {error}
                  {lockSeconds > 0 && (
                    <div className="mt-1.5 text-xs font-semibold text-destructive/90">
                      Retry in {lockLabel}{' '}
                      <Link to="/forgot-password" className="underline font-medium">
                        Forgot password?
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    type="email"
                    placeholder="name@hospital.org"
                    className={`pl-10 h-11 bg-card border-border text-foreground ${errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    className={`pl-10 pr-10 h-11 bg-card border-border text-foreground ${errors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    {...register('password')}
                    disabled={isLoading}
                    autoComplete="current-password"
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

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200 mt-2"
                disabled={isLoading || lockSeconds > 0}
              >
                {lockSeconds > 0 ? (
                  `Try again in ${lockLabel}`
                ) : isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-muted-foreground">
              Are you a patient without an account?{' '}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                Sign up
              </Link>
            </div>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border pt-4 pb-4 bg-muted/20 rounded-b-2xl">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Role-based access control</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
