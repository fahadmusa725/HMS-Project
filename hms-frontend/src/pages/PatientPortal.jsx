import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserIdentityBlock } from '@/components/UserIdentityBlock';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { LogOut, Heart, Shield } from 'lucide-react';

export default function PatientPortal() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30 shadow-soft-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold">
              <Heart className="h-5 w-5 fill-primary text-primary" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-foreground">CareFlow</span>
              <span className="ml-2 text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full border border-primary/20">
                Patient Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <UserIdentityBlock />
            <div className="h-6 w-px bg-border mx-1" />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            My Health Records &amp; Portal
          </h1>
          <p className="text-muted-foreground mt-1 text-base">
            Welcome back, <span className="font-semibold text-foreground">{user?.name || user?.email || 'Patient'}</span>!
          </p>
        </div>

        {/* Patient Profile Card */}
        <Card className="border-border bg-card shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-primary" />
              Patient Account Info
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Authenticated Patient Profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                <span className="text-xs text-muted-foreground block font-medium">Patient ID</span>
                <span className="font-mono text-xs font-semibold text-foreground">{user?.id || 'pat-001'}</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                <span className="text-xs text-muted-foreground block font-medium">Email</span>
                <span className="font-medium text-foreground">{user?.email || 'patient@example.com'}</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
                <span className="text-xs text-muted-foreground block font-medium">Account Role</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                  {user?.role || 'patient'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
