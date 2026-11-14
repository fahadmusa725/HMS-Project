import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Header and footer are fixed; only the body between them scrolls. This keeps the title/close
 * button and the action buttons always visible even when the form content is taller than the
 * viewport (the whole dialog is capped at 90vh so the 3-part layout has a reason to kick in).
 * `footer` is optional - pass it separately from `children` instead of putting action buttons at
 * the end of the scrollable content, so they stay pinned. If a footer button submits a `<form>`
 * that lives in `children`, give that form an `id` and put `form="that-id"` on the button.
 *
 * Keyboard: Escape closes, Tab is trapped inside the dialog, focus moves in on open and back
 * to the trigger on close, so the page behind is never reachable while the dialog is up.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, description, children, footer }) {
  const modalRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const node = modalRef.current;
    const visibleFocusables = () =>
      Array.from(node?.querySelectorAll(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);

    // Focus the first control (or the dialog itself when the body is just text).
    const first = visibleFocusables()[0];
    (first || node)?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = visibleFocusables();
      if (!focusable.length) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <div
        className="fixed inset-0 bg-overlay/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-card text-card-foreground rounded-2xl border border-border/80 shadow-soft-xl z-10 overflow-hidden animate-slide-up focus:outline-none"
      >
        <div className="shrink-0 flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-border/60">
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-bold text-foreground">{title}</h3>
            {description && (
              <p id={descriptionId} className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
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
