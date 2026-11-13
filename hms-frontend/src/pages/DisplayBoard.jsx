import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse, ShieldAlert, WifiOff } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Kiosk-style screen: it must keep refreshing even when the TV tab is not the focused
// window, and the payload is tiny (tokens only) with a short server cache.
const DISPLAY_REFRESH_MS = 10 * 1000;

async function fetchDisplay(hospitalId, key) {
  const res = await fetch(
    `${API_BASE_URL}/api/public/display/${encodeURIComponent(hospitalId)}?key=${encodeURIComponent(key)}`,
    { headers: { Accept: 'application/json' } }
  );

  if (!res.ok) {
    let message = 'Could not load the queue.';
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // Non-JSON error body - keep the generic message.
    }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

/**
 * Public waiting-room display: /display/:hospitalId?key=...
 *
 * No login and no patient data - the endpoint only returns token numbers per doctor,
 * and the render below never prints a name, an MRN or a priority label. The URL itself
 * carries the hospital's display key, which can be rotated from Hospital Settings.
 */
export default function DisplayBoard() {
  const { hospitalId } = useParams();
  const [searchParams] = useSearchParams();
  const key = searchParams.get('key') || '';

  const { data, error, isLoading, isError } = useQuery({
    queryKey: ['public-display', hospitalId, key],
    queryFn: () => fetchDisplay(hospitalId, key),
    enabled: Boolean(hospitalId && key),
    staleTime: 0,
    refetchInterval: DISPLAY_REFRESH_MS,
    refetchIntervalInBackground: true,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // The screen is kiosk-style: hide the app's scrollbars and keep the canvas edge to edge.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const doctors = Array.isArray(data?.doctors) ? data.doctors : [];

  const renderMessage = (icon, title, detail) => (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">{title}</h1>
      {detail && <p className="max-w-2xl text-lg text-muted-foreground sm:text-2xl">{detail}</p>}
    </div>
  );

  if (!key) {
    return (
      <div className="fixed inset-0 bg-background">
        {renderMessage(
          <ShieldAlert className="h-12 w-12" />,
          'Display link is incomplete',
          'Ask the hospital administrator for the full waiting-room link (it includes a key).'
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="animate-pulse text-4xl font-bold text-muted-foreground">Loading queue…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="fixed inset-0 bg-background">
        {renderMessage(
          <WifiOff className="h-12 w-12" />,
          error?.status === 403 ? 'Display link not valid' : 'Reconnecting…',
          error?.status === 403
            ? 'This link has been changed or disabled. Ask the hospital administrator for the current one.'
            : 'The queue could not be loaded. This screen keeps retrying automatically.'
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-border px-8 py-5">
        <div className="flex min-w-0 items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HeartPulse className="h-9 w-9" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-4xl font-extrabold tracking-tight sm:text-5xl">
              {data?.hospital?.name || 'OPD Queue'}
            </h1>
            <p className="mt-1 text-lg font-medium text-muted-foreground">Outpatient Department · Today</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 rounded-full border border-border bg-card px-5 py-2.5">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
          </span>
          <span className="text-lg font-semibold text-muted-foreground">Live</span>
        </div>
      </header>

      {doctors.length === 0 ? (
        <div className="flex-1">
          {renderMessage(
            <HeartPulse className="h-12 w-12" />,
            'No patients in the queue',
            'Token numbers appear here as soon as patients are checked in.'
          )}
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
          <div
            className="grid gap-5 sm:gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
          >
            {doctors.map((doctor) => (
              <section
                key={doctor.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
              >
                <div className="border-b border-border bg-muted/40 px-6 py-4">
                  <h2 className="truncate text-2xl font-extrabold leading-tight text-foreground lg:text-3xl">
                    {doctor.name}
                  </h2>
                  {doctor.department && (
                    <p className="truncate text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {doctor.department}
                    </p>
                  )}
                </div>

                <div className="flex flex-1 flex-col items-center justify-center px-4 py-6">
                  <div className="text-sm font-bold uppercase tracking-[0.25em] text-primary">Now serving</div>
                  <div className="mt-2 font-mono text-[clamp(4rem,9vw,8rem)] font-extrabold leading-none text-primary">
                    {doctor.nowServing ?? '—'}
                  </div>
                </div>

                <div className="border-t border-border bg-muted/20 px-6 py-5">
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Next</div>
                  {doctor.nextTokens?.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                      {doctor.nextTokens.map((token) => (
                        <span
                          key={token}
                          className="font-mono text-4xl font-extrabold leading-none text-foreground sm:text-5xl"
                        >
                          {token}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-2xl font-semibold text-muted-foreground">—</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </main>
      )}

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-8 py-3">
        <span className="text-sm font-medium text-muted-foreground">
          Please keep this token with you and watch this screen.
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          Updated{' '}
          {data?.updatedAt
            ? new Date(data.updatedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
        </span>
      </footer>
    </div>
  );
}
