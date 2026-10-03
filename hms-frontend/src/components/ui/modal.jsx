import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Header and footer are fixed; only the body between them scrolls. This keeps the title/close
 * button and the action buttons always visible even when the form content is taller than the
 * viewport (the whole dialog is capped at 90vh so the 3-part layout has a reason to kick in).
 * `footer` is optional - pass it separately from `children` instead of putting action buttons at
 * the end of the scrollable content, so they stay pinned. If a footer button submits a `<form>`
 * that lives in `children`, give that form an `id` and put `form="that-id"` on the button.
 */
export function Modal({ isOpen, onClose, title, description, children, footer }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-card text-card-foreground rounded-2xl border border-border/80 shadow-soft-xl z-10 overflow-hidden animate-slide-up"
      >
        <div className="shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-border/60">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">{children}</div>

        {footer && (
          <div className="shrink-0 flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-border/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
