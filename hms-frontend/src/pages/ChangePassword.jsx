import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Lock, Loader2, AlertCircle, KeyRound, HeartPulse, LogOut } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuthStore();
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const forced = Boolean(user?.mustChangePassword);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Clear the flag locally so the route guard lets the user back into the app
      // without waiting for the next /me refresh.
      setUser({ ...user, mustChangePassword: false });
      toast.success('Password updated.');
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(err.response?.data?.message || 'Could not update your password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-background overflow-hidden">
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10 animate-fade-in">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/20 mb-4 ring-8 ring-primary/10">
            <HeartPulse className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            CareFlow <span className="text-primary font-medium">HMS</span>
          </h1>
        </div>

        <Card className="bg-card border-border shadow-soft-xl">
          <CardHeader className="space-y-1 text-center pb-5">
            <CardTitle className="text-xl font-bold text-foreground">Change your password</CardTitle>
            <CardDescription className="text-muted-foreground">
              {forced
                ? 'Your account is using a temporary password. Set your own password to continue.'
                : 'Choose a new password for your account.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {forced && (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning-foreground">
                <KeyRound className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Temporary passwords are known to whoever created your account. Everything else stays locked until
                  you set a new one.
                </span>
              </div>
            )}

            {serverError && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{serverError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Current Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    className={`pl-10 h-11 ${errors.currentPassword ? 'border-destructive' : ''}`}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    {...register('currentPassword')}
                  />
                </div>
                {errors.currentPassword && (
                  <p className="text-xs text-destructive font-medium">{errors.currentPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    className={`pl-10 h-11 ${errors.newPassword ? 'border-destructive' : ''}`}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    {...register('newPassword')}
                  />
                </div>
                {errors.newPassword && (
                  <p className="text-xs text-destructive font-medium">{errors.newPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    className={`pl-10 h-11 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    {...register('confirmPassword')}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive font-medium">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full h-11 font-semibold">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                Back to app
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
