import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  HeartPulse,
  Users,
  Calendar,
  Bed,
  FlaskConical,
  Pill,
  Receipt,
  BarChart3,
  ShieldCheck,
  Building2,
  Banknote,
  PackageSearch,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const demoRequestSchema = z.object({
  name: z.string().min(2, 'Please enter your name'),
  hospitalName: z.string().min(2, 'Please enter your hospital/clinic name'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  phone: z.string().optional(),
  message: z.string().optional(),
});

const FEATURES = [
  { icon: Users, title: 'Patients', desc: 'Full demographic records, MRN generation, allergies, chronic conditions, and referral tracking.' },
  { icon: Calendar, title: 'Appointments', desc: 'Doctor schedules, real-time slot booking, OPD token queue, and automatic no-show handling.' },
  { icon: Bed, title: 'Admissions & Wards', desc: 'Bed management, IPD admissions, running bills, and discharge billing.' },
  { icon: FlaskConical, title: 'Lab', desc: 'Diagnostic test catalog, order tracking, and result reporting.' },
  { icon: Pill, title: 'Pharmacy', desc: 'Batch and expiry (FEFO) stock tracking, dispensing, and low-stock/near-expiry alerts.' },
  { icon: Receipt, title: 'Billing', desc: 'Cash, card, JazzCash, Easypaisa, bank transfer, and multi-sponsor (panel/TPA) billing.' },
  { icon: BarChart3, title: 'Reports', desc: 'Financial, clinical, and operations analytics with exportable hospital data.' },
  { icon: ShieldCheck, title: 'Patient Portal', desc: "Patients can book appointments, view their records, and check in themselves." },
];

const WHY_POINTS = [
  {
    icon: Building2,
    title: 'Built for multi-hospital operators',
    desc: "Every hospital's data is isolated automatically at the database layer - a chain running several facilities gets one account per hospital, with no risk of data crossing between them.",
  },
  {
    icon: Banknote,
    title: 'Matches how Pakistani hospitals actually get paid',
    desc: 'JazzCash, Easypaisa, and bank transfer are first-class payment methods, not an afterthought, and a bill can be split between a patient and a corporate panel or TPA.',
  },
  {
    icon: PackageSearch,
    title: 'Pharmacy stock that matches reality',
    desc: 'Medicines are tracked batch by batch with real expiry dates, and dispensing automatically draws from the soonest-to-expire batch first (FEFO) - not just a single stock number.',
  },
];

function DemoRequestForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: { name: '', hospitalName: '', email: '', phone: '', message: '' },
  });

  const onSubmit = async (values) => {
    try {
      await api.post('/api/public/demo-request', values);
      setIsSubmitted(true);
      reset();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong. Please try again.');
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Request received</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Thanks for reaching out. We'll get back to you shortly.
        </p>
        <Button variant="outline" size="sm" onClick={() => setIsSubmitted(false)} className="mt-2">
          Send another request
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">Your Name *</label>
          <Input placeholder="Dr. Ayesha Khan" {...register('name')} disabled={isSubmitting} className={errors.name ? 'border-destructive' : ''} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">Hospital / Clinic Name *</label>
          <Input placeholder="City Hospital" {...register('hospitalName')} disabled={isSubmitting} className={errors.hospitalName ? 'border-destructive' : ''} />
          {errors.hospitalName && <p className="text-xs text-destructive">{errors.hospitalName.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">Email *</label>
          <Input type="email" placeholder="you@hospital.com" {...register('email')} disabled={isSubmitting} className={errors.email ? 'border-destructive' : ''} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
            Phone <span className="text-muted-foreground font-normal lowercase">(optional)</span>
          </label>
          <Input placeholder="03001234567" {...register('phone')} disabled={isSubmitting} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">
          Message <span className="text-muted-foreground font-normal lowercase">(optional)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Tell us a bit about your hospital and what you're looking for..."
          {...register('message')}
          disabled={isSubmitting}
          className="flex w-full rounded-lg border border-input bg-background/50 px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none disabled:opacity-50"
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          'Request a Demo'
        )}
      </Button>
    </form>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm shrink-0">
              <HeartPulse className="h-5 w-5" />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">
              CareFlow <span className="text-primary font-medium">HMS</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-9' })}>
              Log In
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full mb-5">
            <Building2 className="h-3.5 w-3.5" />
            Multi-Tenant Hospital Management SaaS
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground max-w-3xl mx-auto">
            Run your hospital on one system, built for how it actually works
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            CareFlow HMS brings patients, appointments, wards, lab, pharmacy, and billing into one
            platform, with each hospital's data fully isolated, Pakistani payment methods built
            in, and a patient portal included.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#demo"
              className={buttonVariants({ size: 'lg', className: 'bg-primary hover:bg-primary/90 text-primary-foreground font-semibold w-full sm:w-auto' })}
            >
              Request a Demo
            </a>
            <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full sm:w-auto' })}>
              Log In to Your Hospital
            </Link>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20 border-t border-border bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Everything a hospital needs, in one place
            </h2>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Each module is built around a real clinical or administrative workflow, not a generic form builder.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <Card key={f.title} className="p-5 border-border bg-card shadow-soft">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Why hospitals in Pakistan pick CareFlow
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {WHY_POINTS.map((p) => (
              <div key={p.title} className="text-center sm:text-left">
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 mx-auto sm:mx-0">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-foreground">{p.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="py-14 sm:py-20 border-t border-border bg-muted/20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">Request a Demo</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell us about your hospital and we'll get in touch to set up a walkthrough.
            </p>
          </div>

          <Card className="p-5 sm:p-6 border-border bg-card shadow-soft-xl">
            <DemoRequestForm />
          </Card>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">CareFlow HMS</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-foreground transition-colors">Log In</Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">Patient Sign Up</Link>
            <a href="#demo" className="hover:text-foreground transition-colors">Contact Us</a>
          </div>
          <span>&copy; {new Date().getFullYear()} CareFlow HMS. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
