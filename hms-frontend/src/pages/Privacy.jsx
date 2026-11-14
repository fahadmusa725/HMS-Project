import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react';

/**
 * Placeholder Privacy page. Structure only - the wording is intentionally blank so the
 * final copy can be written and reviewed before launch. Nothing here is a legal claim.
 */
const SECTIONS = [
  { title: 'What we collect', body: 'Placeholder: list account, hospital and patient data the system stores.' },
  { title: 'Why we process it', body: 'Placeholder: describe the purpose for each category of data.' },
  { title: 'Who can see patient data', body: 'Placeholder: describe hospital staff roles, the audit trail and platform access.' },
  { title: 'Where data is stored', body: 'Placeholder: describe hosting region and third-party processors.' },
  { title: 'How long we keep it', body: 'Placeholder: describe retention periods and deletion on request.' },
  { title: 'Your choices', body: 'Placeholder: describe access, correction and export requests.' },
  { title: 'Contact', body: 'Placeholder: add the contact email for privacy questions.' },
];

export default function Privacy() {
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
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Privacy Policy</h1>
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
          <Link to="/terms" className="font-semibold text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
