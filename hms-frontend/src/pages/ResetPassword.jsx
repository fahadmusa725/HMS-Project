import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { toast } from 'sonner';
import { Lock, Loader2, AlertCircle, HeartPulse } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/reset-password`, {
        token,
        newPassword: values.newPassword,
      });
      toast.success('Password reset. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(err.response?.data?.message || 'Could not reset your password.');
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
            <CardTitle className="text-xl font-bold text-foreground">Set a new password</CardTitle>
            <CardDescription className="text-muted-foreground">
              {token
                ? 'The reset link works once and expires shortly. Choose a password with at least 8 characters.'
                : 'This reset link is incomplete. Request a new one to continue.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {serverError && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{serverError}</div>
              </div>
            )}

            {token ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </form>
            ) : (
              <Link
                to="/forgot-password"
                className={buttonVariants({ size: 'lg', className: 'w-full font-semibold' })}
              >
                Request a new reset link
              </Link>
            )}

            <div className="mt-5 text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
