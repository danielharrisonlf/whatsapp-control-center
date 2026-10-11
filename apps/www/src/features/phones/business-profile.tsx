import { useQueryClient } from '@tanstack/react-query';
import {
  type BusinessProfile,
  getGetBusinessProfileQueryKey,
  type PhoneNumber,
  type UpdateBusinessProfileInputVertical,
  useGetBusinessProfile,
  useUpdateBusinessProfile,
  useUploadProfilePhoto,
} from '@wacc/api-client';
import { BUSINESS_VERTICALS, BUSINESS_PROFILE_LIMITS as L } from '@wacc/types';
import {
  Button,
  CharCount,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@wacc/ui';
import { BadgeCheck, Camera, Globe, Info, Mail, MapPin, Store } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { BlockSkeleton, ErrorPanel, ErrorState, PartialErrorBanner } from '@/components/states';
import { formatPhone, formatRelative } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';

interface ProfileDraft {
  about: string;
  description: string;
  vertical: string;
  address: string;
  email: string;
  website1: string;
  website2: string;
}

function toDraft(p: BusinessProfile): ProfileDraft {
  return {
    about: p.about ?? '',
    description: p.description ?? '',
    vertical: p.vertical ?? '',
    address: p.address ?? '',
    email: p.email ?? '',
    website1: p.websites[0] ?? '',
    website2: p.websites[1] ?? '',
  };
}

/** Profile screen as WhatsApp users see it. */
function ProfilePreview({
  phone,
  draft,
  pictureUrl,
}: {
  phone: PhoneNumber;
  draft: ProfileDraft;
  pictureUrl: string | null;
}) {
  useLocale();
  const websites = [draft.website1, draft.website2].filter(Boolean);
  const row = (Icon: typeof Info, value: string, link?: boolean) =>
    value ? (
      <div className="flex gap-3 border-t border-[var(--wa-divider)] px-4 py-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-[var(--wa-meta)]" aria-hidden />
        <span className={link ? 'break-all text-[var(--wa-link)]' : tr('whitespace-pre-wrap break-words')}>
          {value}
        </span>
      </div>
    ) : null;
  return (
    <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-[6px] border-[#1c1f23] bg-[var(--wa-header)] text-[13px] text-[var(--wa-text)] shadow-overlay">
      <div className="flex flex-col items-center px-4 pb-4 pt-7 text-center">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-[var(--wa-divider)]">
          {pictureUrl ? (
            <img src={pictureUrl} alt="" className="size-full object-cover" />
          ) : (
            <Store className="size-8 text-[var(--wa-meta)]" />
          )}
        </div>
        <p className="mt-3 flex items-center gap-1 text-lg font-medium">
          {phone.verifiedName ?? tr('Business name')}
          {phone.isOfficialBusinessAccount && (
            <BadgeCheck className="size-4 text-[#25d366]" aria-label={tr('Official business account')} />
          )}
        </p>
        <p className="text-[var(--wa-meta)]">{formatPhone(phone.displayPhoneNumber)}</p>
        <p className="mt-1 text-xs text-[var(--wa-meta)]">{tr('Business account')}</p>
      </div>
      <div className="bg-[var(--wa-header)]">
        {row(Info, draft.about)}
        {draft.description && (
          <div className="border-t border-[var(--wa-divider)] px-4 py-3">
            <p className="whitespace-pre-wrap break-words">{draft.description}</p>
          </div>
        )}
        {row(Store, draft.vertical ? tr(BUSINESS_VERTICALS[draft.vertical] ?? draft.vertical) : '')}
        {row(MapPin, draft.address)}
        {row(Mail, draft.email, true)}
        {websites.map((w) => (
          <React.Fragment key={w}>{row(Globe, w, true)}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function BusinessProfileEditor({ phone }: { phone: PhoneNumber }) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const canEdit = useCan('profile.update');
  const profile = useGetBusinessProfile(orgId, phone.id);
  const update = useUpdateBusinessProfile();
  const upload = useUploadProfilePhoto();
  const [draft, setDraft] = React.useState<ProfileDraft | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (profile.data && !draft) setDraft(toDraft(profile.data));
  }, [profile.data, draft]);

  if (profile.isLoading) return <BlockSkeleton lines={6} className="max-w-xl" />;
  if (profile.error)
    return <ErrorState className="px-0" error={profile.error} onRetry={() => profile.refetch()} />;
  if (!draft || !profile.data) return null;

  const set = (k: keyof ProfileDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [k]: e.target.value });
  const original = toDraft(profile.data);
  const dirty = JSON.stringify(original) !== JSON.stringify(draft);
  const errors = {
    about: draft.about.length > L.about ? tr('Up to {0} characters.', L.about) : undefined,
    description:
      draft.description.length > L.description ? tr('Up to {0} characters.', L.description) : undefined,
    address: draft.address.length > L.address ? tr('Up to {0} characters.', L.address) : undefined,
    email:
      draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) ? tr('Enter a valid email.') : undefined,
    website1:
      draft.website1 && !/^https?:\/\//.test(draft.website1)
        ? tr('Start with http:// or https://')
        : undefined,
    website2:
      draft.website2 && !/^https?:\/\//.test(draft.website2)
        ? tr('Start with http:// or https://')
        : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = () => {
    update.mutate(
      {
        organizationId: orgId,
        phoneId: phone.id,
        data: {
          about: draft.about || undefined,
          description: draft.description,
          address: draft.address,
          email: draft.email,
          vertical: (draft.vertical || undefined) as UpdateBusinessProfileInputVertical | undefined,
          websites: [draft.website1, draft.website2].filter(Boolean),
        },
      },
      {
        onSuccess: (data) => {
          qc.setQueryData(getGetBusinessProfileQueryKey(orgId, phone.id), data);
          setDraft(toDraft(data));
          toast.success(tr('Business profile updated on WhatsApp'));
        },
      },
    );
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <fieldset disabled={!canEdit} className="grid max-w-xl gap-4">
        {profile.data.stale && (
          <PartialErrorBanner>
            {tr('Meta could not be reached; showing the copy saved at the last sync (')}
            {formatRelative(profile.data.lastSyncedAt)}).
          </PartialErrorBanner>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            aria-label={tr('Profile photo')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              upload.mutate(
                { organizationId: orgId, phoneId: phone.id, data: { file } },
                {
                  onSuccess: (data) => {
                    qc.setQueryData(getGetBusinessProfileQueryKey(orgId, phone.id), data);
                    toast.success(tr('Profile photo updated'));
                  },
                },
              );
              e.target.value = '';
            }}
          />
          <Button variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            <Camera /> {tr('Change photo')}
          </Button>
          <span className="text-[13px] text-muted">
            {tr('JPEG or PNG. Square images look best (at least 192×192).')}
          </span>
        </div>
        {upload.error && <ErrorPanel error={upload.error} title={tr('Photo not updated')} />}
        <Field
          label={tr('About')}
          htmlFor="bp-about"
          aside={<CharCount value={draft.about.length} max={L.about} />}
          error={errors.about}
          hint={tr('Shown under the business name.')}
        >
          <Input id="bp-about" value={draft.about} onChange={set('about')} />
        </Field>
        <Field
          label={tr('Description')}
          htmlFor="bp-desc"
          aside={<CharCount value={draft.description.length} max={L.description} />}
          error={errors.description}
        >
          <Textarea id="bp-desc" rows={4} value={draft.description} onChange={set('description')} />
        </Field>
        <Field label={tr('Category')} htmlFor="bp-vertical">
          <Select
            value={draft.vertical || undefined}
            onValueChange={(v) => setDraft({ ...draft, vertical: v })}
          >
            <SelectTrigger id="bp-vertical">
              <SelectValue placeholder={tr('Select a category')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BUSINESS_VERTICALS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {localizeText(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={tr('Address')}
          htmlFor="bp-address"
          aside={<CharCount value={draft.address.length} max={L.address} />}
          error={errors.address}
        >
          <Input id="bp-address" value={draft.address} onChange={set('address')} />
        </Field>
        <Field label={tr('Email')} htmlFor="bp-email" error={errors.email}>
          <Input id="bp-email" type="email" value={draft.email} onChange={set('email')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('Website')} htmlFor="bp-web1" error={errors.website1}>
            <Input
              id="bp-web1"
              placeholder={tr('https://')}
              value={draft.website1}
              onChange={set('website1')}
            />
          </Field>
          <Field label={tr('Second website')} htmlFor="bp-web2" optional error={errors.website2}>
            <Input
              id="bp-web2"
              placeholder={tr('https://')}
              value={draft.website2}
              onChange={set('website2')}
            />
          </Field>
        </div>
        {update.error && <ErrorPanel error={update.error} title={tr('Profile not saved')} />}
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="primary" disabled={!dirty || invalid} loading={update.isPending} onClick={save}>
              {tr('Save to WhatsApp')}
            </Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(original)}>
              {tr('Discard changes')}
            </Button>
          </div>
        )}
      </fieldset>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-3 text-center text-xs text-subtle">{tr('Preview')}</p>
        <ProfilePreview phone={phone} draft={draft} pictureUrl={profile.data.profilePictureUrl} />
      </div>
    </div>
  );
}
