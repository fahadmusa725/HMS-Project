import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared designed empty state: soft dashed frame, tinted icon tile, a short explanation
 * and an optional action. Used instead of bare "no records" text so a quiet dashboard
 * still looks intentional.
 */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/35 bg-muted/20 px-5 py-8 text-center',
        className
      )}
    >
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-bright/10 text-primary-bright">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
