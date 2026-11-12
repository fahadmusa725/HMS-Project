import { Skeleton } from '@/components/ui/skeleton';

/**
 * Suspense fallback for lazily loaded route chunks. Without it a slow chunk leaves the
 * screen blank; this keeps the same page frame on screen until the route renders.
 */
export default function RouteFallback() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8" aria-busy="true">
      <span className="sr-only">Loading page</span>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>

        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
