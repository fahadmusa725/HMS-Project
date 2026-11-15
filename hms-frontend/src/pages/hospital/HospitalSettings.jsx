import React, { useRef, useState } from 'react';
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
  Building2,
  Upload,
  Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import HospitalLogo from '@/components/HospitalLogo';
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

const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg'];

/**
 * The hospital's own name and logo. Both are saved through the settings endpoint, but the
 * logo uploads on its own (it is a file, not a field) - so this card keeps its own name form
 * and hands the picked file straight up to the caller.
 */
function IdentityCard({
  name,
  logoUrl,
  isSavingName,
  isUploadingLogo,
  isRemovingLogo,
  onSaveName,
  onUploadLogo,
  onRemoveLogo,
}) {
  const [nameValue, setNameValue] = useState(name || '');
  const [nameError, setNameError] = useState('');
  const fileInputRef = useRef(null);
  const busy = isSavingName || isUploadingLogo || isRemovingLogo;

  const submit = (e) => {
    e.preventDefault();
    const trimmed = nameValue.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      setNameError('The hospital name must be between 2 and 80 characters.');
      return;
    }
    setNameError('');
    setNameValue(trimmed);
    onSaveName(trimmed);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    // Clear the input so picking the same file again (after a failure) still fires onChange.
    e.target.value = '';
    if (!file) return;

    // The server decides by magic bytes; this only avoids a doomed round trip.
    if (file.type && !LOGO_TYPES.includes(file.type)) {
      toast.error('The logo must be a PNG or JPG image.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('The logo must be 1 MB or smaller.');
      return;
    }
    onUploadLogo(file);
  };

  return (
    <Card className="border-border bg-card shadow-soft">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Building2 className="h-4 w-4 text-primary" />
          Hospital identity
        </CardTitle>
        <CardDescription className="text-xs">
          Your hospital's own name and logo, shown in the app header, patient portal, waiting-room TV,
          printable slips and reminder emails. CareFlow HMS stays the platform name above them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <HospitalLogo
            name={name}
            logoUrl={logoUrl}
            className="h-16 w-16"
            rounded="rounded-2xl"
            textClassName="text-xl"
            iconClassName="h-8 w-8"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {isUploadingLogo ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRemoveLogo}
                  disabled={busy}
                  className="text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  {isRemovingLogo ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG or JPG, up to 1 MB. Square images look best; SVG is not supported.
            </p>
            {!logoUrl && (
              <p className="text-xs text-muted-foreground">
                No logo yet - the initials of the hospital name stand in for it.
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleFile}
            />
          </div>
        </div>

        <form onSubmit={submit} className="space-y-1.5 border-t border-border/60 pt-5">
          <label
            htmlFor="hospital-name"
            className="block text-xs font-semibold uppercase tracking-wider text-foreground/80"
          >
            Hospital name
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="w-full sm:max-w-md">
              <Input
                id="hospital-name"
                value={nameValue}
                maxLength={80}
                required
                onChange={(e) => {
                  setNameValue(e.target.value);
                  if (nameError) setNameError('');
                }}
                disabled={isSavingName}
                aria-invalid={Boolean(nameError)}
                className={nameError ? 'border-destructive' : ''}
              />
              {nameError ? (
                <p className="mt-1 text-xs text-destructive">{nameError}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  2 to 80 characters. This is the official name everywhere, including the super admin
                  hospital list.
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {isSavingName ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save name
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Owns the editable form state. Mounted only once the server values have arrived (the
 * parent renders it conditionally), so the initial state can simply BE the server values -
 * no effect needed to copy them in, and a re-render never stomps on unsaved edits.
 */
function SettingsForm({ settings, onSave, isSaving }) {
  const [form, setForm] = useState({
    seniorAgeThreshold: settings.seniorAgeThreshold,
    allowPatientSelfCheckIn: Boolean(settings.allowPatientSelfCheckIn),
    averageConsultationMinutes: settings.averageConsultationMinutes,
  });

  const submit = (e) => {
    e.preventDefault();
    onSave({
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
  const fetchMe = useAuthStore((state) => state.fetchMe);
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

  // Renaming refreshes the session too: the header, the tenant card and the login screen's
  // remembered brand all read the hospital name from the signed-in user.
  const saveNameMutation = useMutation({
    mutationFn: async (name) => {
      const res = await api.patch('/api/hospital-admin/settings', { name });
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['hospital-settings'] });
      await fetchMe();
      toast.success('Hospital name updated.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not update the hospital name.');
    },
  });

  const logoUploadMutation = useMutation({
    // axios only sends real multipart when the content type is not the JSON default.
    mutationFn: async (file) => {
      const payload = new FormData();
      payload.append('logo', file);
      const res = await api.post('/api/hospital-admin/settings/logo', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['hospital-settings'] });
      await fetchMe();
      toast.success('Hospital logo updated.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not upload the logo.');
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/api/hospital-admin/settings/logo');
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['hospital-settings'] });
      await fetchMe();
      toast.success('Hospital logo removed.');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Could not remove the logo.');
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
      toast.success('Display link ready.', {
        description: 'Open it on each waiting-room screen. Any TV still using an old link has stopped updating.',
      });
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

  const hasDisplayKey = Boolean(data?.displayPath);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-foreground">
          <Settings2 className="h-6 w-6 text-primary" />
          Hospital Settings
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your hospital's name and logo, plus clinic-wide behaviour for the OPD queue, the patient
          portal and the waiting-room display.
        </p>
      </div>

      {data && (
        <IdentityCard
          name={data.name}
          logoUrl={data.logoUrl}
          isSavingName={saveNameMutation.isPending}
          isUploadingLogo={logoUploadMutation.isPending}
          isRemovingLogo={removeLogoMutation.isPending}
          onSaveName={(name) => saveNameMutation.mutate(name)}
          onUploadLogo={(file) => logoUploadMutation.mutate(file)}
          onRemoveLogo={() => removeLogoMutation.mutate()}
        />
      )}

      {/* The TV link is what admins come here for most often, so it stays high on the page. */}
      <Card id="waiting-room-display" className="scroll-mt-24 border-border bg-card shadow-soft">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Tv className="h-4 w-4 text-primary" />
            Waiting room display
          </CardTitle>
          <CardDescription className="text-xs">
            A login-free screen for the TV in the waiting area: one column per doctor with the token being
            served and the next 5 tokens. The board title is your hospital name, next to your logo.{' '}
            <span className="font-semibold text-foreground">
              It shows token numbers only - never patient names, MRNs or priority.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {hasDisplayKey ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
                  Display link
                </label>
                <Input
                  readOnly
                  value={displayUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={copyLink}>
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy link
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(displayUrl, '_blank', 'noopener')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open display
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmRegenerate(true)}
                  disabled={regenerateMutation.isPending}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', regenerateMutation.isPending && 'animate-spin')} />
                  Regenerate key
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep this link private - anyone who has it can see live token numbers for this hospital.
                Regenerating the key stops every TV still using the old link immediately.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No display link yet. Create one, then open it on the waiting-room TV - no login is needed
                on that screen.
              </p>
              <Button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                disabled={regenerateMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                <Tv className={cn('mr-2 h-4 w-4', regenerateMutation.isPending && 'animate-pulse')} />
                Create display link
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {data && (
        <SettingsForm
          settings={data}
          isSaving={saveMutation.isPending}
          onSave={(payload) => saveMutation.mutate(payload)}
        />
      )}

      <Modal
        isOpen={confirmRegenerate}
        onClose={() => {
          if (!regenerateMutation.isPending) setConfirmRegenerate(false);
        }}
        title={hasDisplayKey ? 'Regenerate display link?' : 'Create display link?'}
        description={
          hasDisplayKey
            ? 'Every TV still showing the old link will stop updating immediately.'
            : 'A new secret key is generated for this hospital.'
        }
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
                  {hasDisplayKey ? 'Regenerating...' : 'Creating...'}
                </>
              ) : hasDisplayKey ? (
                'Regenerate'
              ) : (
                'Create link'
              )}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {hasDisplayKey
            ? 'You will need to open the new link on each waiting-room screen. This does not affect any queue data or tokens already issued today.'
            : 'This does not affect any queue data or tokens already issued today.'}
        </p>
      </Modal>
    </div>
  );
}
