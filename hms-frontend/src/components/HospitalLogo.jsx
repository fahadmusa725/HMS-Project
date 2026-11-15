import React from 'react';
import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "City General Hospital" -> "CG", "City" -> "C", empty -> "" */
function hospitalInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * The hospital's own brand mark: the logo uploaded in Hospital Settings, or its initials when
 * none is set (the pulse icon while the hospital has no name to abbreviate). The caller owns
 * the size through `className`, so the same mark fits the 9x9 header tile, the waiting-room TV
 * and the settings preview.
 */
export default function HospitalLogo({
  name,
  logoUrl,
  className,
  textClassName,
  iconClassName,
  rounded = 'rounded-xl',
}) {
  const initials = hospitalInitials(name);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden',
        rounded,
        logoUrl ? 'border border-border bg-card' : 'bg-primary text-primary-foreground',
        className
      )}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name ? `${name} logo` : 'Hospital logo'}
          className="h-full w-full object-contain"
        />
      ) : initials ? (
        <span className={cn('font-bold uppercase leading-none', textClassName)} aria-hidden="true">
          {initials}
        </span>
      ) : (
        <HeartPulse className={cn('h-5 w-5', iconClassName)} aria-hidden="true" />
      )}
    </div>
  );
}
