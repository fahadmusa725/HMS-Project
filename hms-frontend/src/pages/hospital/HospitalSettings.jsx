import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Settings2,
  Save,
  Loader2,
  AlertCircle,
  Tv,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  UserRound,
  Clock3,
  LogIn,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

function FieldRow({ icon: Icon, title, description, children }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 py-4 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="w-full shrink-0 sm:w-56">{children}</div>
    </div>
  );
}

/**
 * Owns the editable form state. Mounted only once the server values have arrived (the
 * parent renders it conditionally), so the initial state can simply BE the server values -
 * no effect needed to copy them in, and a re-render never stomps on unsaved edits.
 */
function SettingsForm({ settings, onSave, isSaving }) {
  const [form, setForm] = useState({
    displayName: settings.displayName || '',
    seniorAgeThreshold: settings.seniorAgeThreshold,
    allowPatientSelfCheckIn: Boolean(settings.allowPatientSelfCheckIn),
    averageConsultationMinutes: settings.averageConsultationMinutes,
  });

  const submit = (e) => {
    e.preventDefault();
    onSave({
      displayName: form.displayName.trim(),
      seniorAgeThreshold: Number(form.seniorAgeThreshold),
      allowPatientSelfCheckIn: form.allowPatientSelfCheckIn,
      averageConsultationMinutes: Number(form.averageConsultationMinutes),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="border-border bg-card shadow-soft">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base font-bold">Queue &amp; clinic</CardTitle>
          <CardDescription className="text-xs">
            These values drive priority suggestions, wait estimates and patient self-service.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <FieldRow
            icon={Settings2}
            title="Display name"
            description="Shown on the waiting-room TV instead of the official hospital name. Leave blank to use the official name."
          >
            <Input
              value={form.displayName}
              maxLength={80}
              placeholder="e.g. City Hospital - OPD"
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              disabled={isSaving}
            />
          </FieldRow>

          <FieldRow
            icon={UserRound}
            title="Senior age threshold"
            description="Patients at or above this age get a 'senior' priority suggestion at the desk. Staff always confirm it."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={130}
                value={form.seniorAgeThreshold}
                onChange={(e) => setForm((f) => ({ ...f, seniorAgeThreshold: e.target.value }))}
                disabled={isSaving}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">years</span>
            </div>
          </FieldRow>

          <FieldRow
            icon={Clock3}
            title="Average consultation time"
            description="Used to turn 'N patients ahead' into an estimated wait in the patient portal."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={240}
                value={form.averageConsultationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, averageConsultationMinutes: e.target.value }))}
                disabled={isSaving}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </FieldRow>

          <FieldRow
            icon={LogIn}
            title="Allow patient self check-in"
            description="When on, patients can check themselves in from the portal. When off, the front desk checks everyone in."
          >
            <button
              type="button"
              role="switch"
              aria-checked={form.allowPatientSelfCheckIn}
              onClick={() => setForm((f) => ({ ...f, allowPatientSelfCheckIn: !f.allowPatientSelfCheckIn }))}
              disabled={isSaving}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                form.allowPatientSelfCheckIn ? 'border-primary bg-primary' : 'border-border-strong/40 bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full shadow-sm transition-transform',
                  form.allowPatientSelfCheckIn
                    ? 'translate-x-6 bg-primary-foreground'
                    : 'translate-x-1 bg-card'
                )}
              />
              <span className="sr-only">Toggle patient self check-in</span>
            </button>
            <div className="mt-1 text-[11px] font-medium text-muted-foreground">
              {form.allowPatientSelfCheckIn ? 'Patients can check in' : 'Front desk checks patients in'}
            </div>
          </FieldRow>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save settings
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * Hospital-wide behaviour toggles (not platform/tenant status - those stay Super Admin only).
 * Everything here is read back by the queue, the patient portal and the waiting-room TV.
 */
export default function HospitalSettings() {
  const queryClient = useQueryClient();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['hospital-settings'],
    queryFn: async () => {
      const res = await api.get('/api/hospital-admin/settings');
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch('/api/hospital-admin/settings', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hospital-settings'] });
      toast.success('Hospital settings saved.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not save the settings.');
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/hospital-admin/settings/display-key');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hospital-settings'] });
      setConfirmRegenerate(false);
      setCopied(false);
      toast.success('New display link generated. Any TV still using the old link has stopped updating.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not regenerate the display key.');
    },
  });

  const displayUrl = data?.displayPath ? `${window.location.origin}${data.displayPath}` : '';

  const copyLink = async () => {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy automatically - select the link and copy it manually.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="h-64 rounded-2xl border border-border bg-card" />
        <div className="h-40 rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h3 className="text-base font-bold text-foreground">Could not load hospital settings</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {error?.response?.data?.message || 'Server error while loading the settings.'}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-foreground">
          <Settings2 className="h-6 w-6 text-primary" />
          Hospital Settings
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Clinic-wide behaviour for the OPD queue, the patient portal and the waiting-room display.
        </p>
      </div>

      {data && (
        <SettingsForm
          settings={data}
          isSaving={saveMutation.isPending}
          onSave={(payload) => saveMutation.mutate(payload)}
        />
      )}

      <Card className="border-border bg-card shadow-soft">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Tv className="h-4 w-4 text-primary" />
            Waiting-room display
          </CardTitle>
          <CardDescription className="text-xs">
            Open this link on the TV in the waiting area - no login needed. It shows one column per doctor
            with the token being served and the next 5 tokens. Patient names are never shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {displayUrl ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={displayUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" onClick={copyLink} className="flex-1 sm:flex-none">
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(displayUrl, '_blank', 'noopener')}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep this link private - anyone with it can see the live token numbers for this hospital.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRegenerate(true)}
                disabled={regenerateMutation.isPending}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', regenerateMutation.isPending && 'animate-spin')} />
                Regenerate link
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No display key yet. Save the settings once and a link will be generated.
            </p>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={confirmRegenerate}
        onClose={() => {
          if (!regenerateMutation.isPending) setConfirmRegenerate(false);
        }}
        title="Regenerate display link?"
        description="Every TV still showing the old link will stop updating immediately."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRegenerate(false)}
              disabled={regenerateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
            >
              {regenerateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                'Regenerate'
              )}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          You will need to open the new link on each waiting-room screen. This does not affect any queue
          data or tokens already issued today.
        </p>
      </Modal>
    </div>
  );
}
