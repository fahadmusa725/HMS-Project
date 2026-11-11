import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { Mail, Loader2, AlertCircle, CheckCircle2, HeartPulse } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
});

export default function ForgotPassword() {
  const [serverError, setServerError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async (values) => {
    setServerError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, { email: values.email });
      setMessage(res.data.message);
    } catch (err) {
      setServerError(err.response?.data?.message || 'Could not start the password reset.');
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
            <CardTitle className="text-xl font-bold text-foreground">Forgot your password?</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your account email and we will send you a reset link.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {message && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 p-3.5 text-sm text-primary">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{message}</div>
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
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="name@hospital.org"
                    className={`pl-10 h-11 ${errors.email ? 'border-destructive' : ''}`}
                    autoComplete="email"
                    disabled={isSubmitting}
                    {...register('email')}
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive font-medium">{errors.email.message}</p>}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full h-11 font-semibold">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send reset link'
                )}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-muted-foreground">
              Remembered it?{' '}
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
