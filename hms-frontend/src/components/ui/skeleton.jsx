import { cn } from '@/lib/utils';

/** Neutral placeholder block shown while a chunk or a query is still loading. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} />;
}
