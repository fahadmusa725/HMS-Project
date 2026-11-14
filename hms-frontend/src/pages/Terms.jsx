import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, FileText } from 'lucide-react';

/**
 * Placeholder Terms page. Structure only - the wording is intentionally blank so the
 * final copy can be written and reviewed before launch. Nothing here is a legal claim.
 */
const SECTIONS = [
  { title: 'Using the service', body: 'Placeholder: describe what the service is and who may use it.' },
  { title: 'Accounts and access', body: 'Placeholder: describe hospital accounts, staff roles and account security.' },
  { title: 'Patient data', body: 'Placeholder: describe the hospital\u2019s responsibilities for patient data entered into the system.' },
  { title: 'Plans and payment', body: 'Placeholder: describe subscription plans, billing cycle and non-payment handling.' },
  { title: 'Availability and support', body: 'Placeholder: describe support channels and any uptime commitments.' },
  { title: 'Ending the agreement', body: 'Placeholder: describe cancellation, data export and what happens to data afterwards.' },
  { title: 'Changes to these terms', body: 'Placeholder: describe how updates are communicated.' },
  { title: 'Contact', body: 'Placeholder: add the company name, address and contact email.' },
];

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to CareFlow HMS
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Terms of Service</h1>
            <p className="text-xs text-muted-foreground">Placeholder draft. Last updated date goes here.</p>
          </div>
        </div>

        <div className="mt-6 flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            This page is a placeholder. The final text is pending legal review and has not been
            published yet.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-sm font-bold text-foreground">{section.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
          See also our{' '}
          <Link to="/privacy" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
