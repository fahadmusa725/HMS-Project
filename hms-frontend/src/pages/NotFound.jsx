import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';

/**
 * 404 page. The old catch-all redirected to "/", which silently dropped the URL the
 * person typed - a wrong link looked like a spontaneous redirect instead of a mistake.
 */
export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  const home = !isAuthenticated
    ? '/'
    : user?.role === 'platform_super_admin'
      ? '/super-admin/dashboard'
      : user?.role === 'patient'
        ? '/portal'
        : '/dashboard';

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="h-7 w-7" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Error 404</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There is nothing at <span className="font-mono text-foreground">{location.pathname}</span>. The link may
          be outdated, or the page may have moved.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link to={home} className={buttonVariants()}>
            Go to home page
          </Link>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Need something else?{' '}
          <Link to="/" className="font-semibold text-primary hover:underline">
            Visit the CareFlow HMS home page
          </Link>
        </p>
      </div>
    </div>
  );
}
