import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTemplateQueryKey,
  type MessageTemplate,
  type SendResult,
  useDeleteTemplate,
  useGetTemplate,
  useRefreshTemplate,
  useSendMessage,
} from '@wacc/api-client';
import {
  buildTemplateSendComponents,
  EDITABLE_TEMPLATE_STATUSES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_REJECTION_REASONS,
} from '@wacc/types';
import {
  Button,
  buttonVariants,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from '@wacc/ui';
import { CopyPlus, Pencil, RefreshCw, Send, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { JsonView } from '@/components/json-view';
import { ManualActionNotice, META_LINKS } from '@/components/notices';
import { DetailList, PageBody, PageHeader, Section } from '@/components/page';
import { PhoneSelect } from '@/components/pickers';
import { BlockSkeleton, ErrorPanel, ErrorState, MetaErrorPanel } from '@/components/states';
import { MessageStatusBadge, QualityBadge, TemplateStatusBadge } from '@/components/status';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useCapabilities, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';
import { previewFromTemplate } from './template-preview-model';
import { missingSlots, TemplateSendFields } from './template-send-fields';
import { WhatsAppPreview } from './wa-preview';

function TestSendDialog({
  template,
  open,
  onOpenChange,
}: {
  template: MessageTemplate;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [phoneId, setPhoneId] = React.useState<string>();
  const [to, setTo] = React.useState('');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<SendResult | null>(null);
  const send = useSendMessage();
  const missing = missingSlots(template, values);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        v || setResult(null);
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {tr('Send a test of')} {template.name}
          </DialogTitle>
          <DialogDescription>
            {tr(
              'Sends a real message through the Cloud API. Test numbers can only message allowed recipients.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('From')} htmlFor="ts-phone">
            <PhoneSelect
              id="ts-phone"
              value={phoneId}
              onChange={setPhoneId}
              wabaId={template.waba.id}
              className="w-full"
            />
          </Field>
          <Field label={tr('To')} htmlFor="ts-to" hint={tr('International format, digits only.')}>
            <Input
              id="ts-to"
              value={to}
              onChange={(e) => setTo(e.target.value.replace(/[^\d+]/g, ''))}
              placeholder={tr('5591999999999')}
              className="tabular-nums"
            />
          </Field>
        </div>
        <TemplateSendFields template={template} values={values} onChange={setValues} />
        {send.error && <ErrorPanel error={send.error} />}
        {result && (
          <div className="grid gap-2 rounded-lg border border-border p-3 text-[13px]">
            <div className="flex items-center gap-2">
              <MessageStatusBadge status={result.message.status} />
              <span className="text-muted">
                {tr('HTTP')} {result.response.status ?? '—'} {tr('in')} {result.durationMs} {tr('ms')}
              </span>
              {result.wamid && <IdChip value={result.wamid} />}
            </div>
            {result.error && <MetaErrorPanel error={result.error} />}
          </div>
        )}
        <DialogFooter>
          <Link
            to={`${orgPath(orgId, 'messages/playground')}?template=${template.id}`}
            className={buttonVariants({ variant: 'ghost' })}
          >
            {tr('Open in playground')}
          </Link>
          <Button
            variant="primary"
            disabled={!phoneId || to.length < 6 || missing.length > 0}
            loading={send.isPending}
            onClick={() =>
              send.mutate(
                {
                  organizationId: orgId,
                  data: {
                    phoneNumberId: phoneId!,
                    to,
                    type: 'template',
                    payload: {
                      name: template.name,
                      language: { code: template.language },
                      components: buildTemplateSendComponents(template, values),
                    },
                  },
                },
                {
                  onSuccess: (r) => {
                    setResult(r);
                    r.ok ? toast.success(tr('Message accepted by Meta')) : undefined;
                  },
                },
              )
            }
          >
            <Send /> {tr('Send test')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateDetailPage() {
  useLocale();
  const { templateId } = useParams<{ templateId: string }>();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const template = useGetTemplate(orgId, templateId!);
  const refresh = useRefreshTemplate();
  const del = useDeleteTemplate();
  const canManage = useCan('templates.manage');
  const canSend = useCan('messages.send');
  const caps = useCapabilities();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [allLanguages, setAllLanguages] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);

  if (template.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={8} />;
  if (template.error || !template.data)
    return <ErrorState error={template.error} onRetry={() => template.refetch()} />;
  const t = template.data;
  const editable = EDITABLE_TEMPLATE_STATUSES.includes(t.status) && !t.remoteDeletedAt;
  const deleted = Boolean(t.remoteDeletedAt) || t.status === 'DELETED';

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: tr('Templates'), to: orgPath(orgId, 'templates') }, { label: t.name }]}
        title={<span className="font-mono">{t.name}</span>}
        meta={
          <>
            <TemplateStatusBadge status={t.status} />
            {t.qualityScore && <QualityBadge rating={t.qualityScore} />}
            <span className="text-[13px] text-muted">
              {humanize(t.category)}, {tr(TEMPLATE_LANGUAGES[t.language] ?? t.language)}
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              loading={refresh.isPending}
              disabled={!t.metaTemplateId}
              onClick={() =>
                refresh.mutate(
                  { organizationId: orgId, templateId: t.id },
                  {
                    onSuccess: (data) => {
                      qc.setQueryData(getGetTemplateQueryKey(orgId, t.id), data);
                      toast.success(tr('Status refreshed from Meta'));
                    },
                  },
                )
              }
            >
              <RefreshCw /> {tr('Refresh')}
            </Button>
            {canManage && (
              <Link
                to={`${orgPath(orgId, 'templates/new')}?from=${t.id}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <CopyPlus /> {tr('Duplicate')}
              </Link>
            )}
            {canManage && editable && (
              <Link
                to={orgPath(orgId, `templates/${t.id}/edit`)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Pencil /> {tr('Edit')}
              </Link>
            )}
            {canManage && !deleted && (
              <Button variant="danger-outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> {tr('Delete')}
              </Button>
            )}
            {canSend && caps.canSendMessages && t.status === 'APPROVED' && (
              <Button variant="primary" onClick={() => setTestOpen(true)}>
                <Send /> {tr('Send test')}
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-8">
          {refresh.error && <ErrorPanel error={refresh.error} title={tr('Could not refresh from Meta')} />}
          {t.status === 'REJECTED' && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
              <p className="text-sm font-medium text-fg">
                {tr('Rejected:')}{' '}
                {t.rejectedReason
                  ? tr(TEMPLATE_REJECTION_REASONS[t.rejectedReason] ?? humanize(t.rejectedReason))
                  : tr('no reason provided by Meta')}
              </p>
              <p className="mt-1 text-[13px] text-fg/80">
                {tr(
                  'Edit and resubmit, or request a review in WhatsApp Manager if you believe this is a mistake.',
                )}
              </p>
            </div>
          )}
          {(t.status === 'PAUSED' || t.status === 'DISABLED') && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-fg">
              {t.status === 'PAUSED'
                ? tr(
                    'Meta paused this template because of low quality feedback (3h the first time, 6h the second). A third pause disables it.',
                  )
                : tr(
                    'Meta disabled this template permanently because of repeated low quality. It cannot be sent or deleted.',
                  )}
            </div>
          )}
          <Section title={tr('Details')}>
            <DetailList
              items={[
                { label: tr('Template ID'), value: <IdChip value={t.metaTemplateId} truncate={false} /> },
                {
                  label: tr('Account'),
                  value: (
                    <Link
                      className="text-accent-text hover:underline"
                      to={orgPath(orgId, `accounts/${t.waba.id}`)}
                    >
                      {t.waba.name ?? t.waba.metaWabaId}
                    </Link>
                  ),
                },
                {
                  label: tr('Category'),
                  value: (
                    <>
                      {humanize(t.category)}
                      {t.previousCategory && t.previousCategory !== t.category && (
                        <span className="text-muted">
                          {' '}
                          {tr('(requested as')} {humanize(t.previousCategory)})
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  label: tr('Language'),
                  value: `${tr(TEMPLATE_LANGUAGES[t.language] ?? t.language)} (${t.language})`,
                },
                { label: tr('Parameter format'), value: humanize(t.parameterFormat ?? 'POSITIONAL') },
                {
                  label: tr('Quality'),
                  value: t.qualityScore ? <QualityBadge rating={t.qualityScore} /> : tr('Not rated yet'),
                },
                {
                  label: tr('Last synced'),
                  value: `${formatDateTime(t.lastSyncedAt)} (${formatRelative(t.lastSyncedAt)})`,
                },
                ...(t.remoteDeletedAt
                  ? [{ label: tr('Deleted at Meta'), value: formatDateTime(t.remoteDeletedAt) }]
                  : []),
              ]}
            />
          </Section>
          <Section title={tr('Components')} description={tr('As stored by Meta.')}>
            <JsonView value={t.components} />
          </Section>
          <ManualActionNotice href={META_LINKS.templates} linkLabel="Open templates in WhatsApp Manager">
            {tr('Appeals against rejections and template insights settings live in WhatsApp Manager.')}
          </ManualActionNotice>
        </div>
        <aside className="lg:sticky lg:top-5 lg:self-start">
          <WhatsAppPreview
            businessName={t.waba.name ?? tr('Your business')}
            messages={[previewFromTemplate(t)]}
          />
          <p className="mt-3 text-center text-xs text-subtle">
            {tr('Preview with the sample values submitted to Meta.')}
          </p>
        </aside>
      </PageBody>

      <TestSendDialog template={t} open={testOpen} onOpenChange={setTestOpen} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={tr('Delete {0}?', t.name)}
        description={<p>{tr('The template is deleted at Meta. This cannot be undone.')}</p>}
        consequences={[
          tr('Messages using it can no longer be sent; ones already queued may still deliver.'),
          t.status === 'APPROVED'
            ? tr('The name "{0}" cannot be reused for 30 days.', t.name)
            : tr('The name can be reused once Meta finishes the deletion.'),
          allLanguages
            ? tr('Every language with this name is deleted.')
            : tr('Only the {0} version is deleted.', t.language),
        ]}
        confirmText={t.name}
        confirmLabel={tr('Delete template')}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(
            {
              organizationId: orgId,
              templateId: t.id,
              params: { allLanguages: allLanguages ? 'true' : 'false' },
            },
            {
              onSuccess: () => {
                invalidateOrg(qc, orgId, 'templates');
                toast.success(tr('Template deleted'));
                navigate(orgPath(orgId, 'templates'));
              },
              onError: () => setConfirmDelete(false),
            },
          )
        }
      >
        <label htmlFor="del-all" className="flex items-center gap-2 text-[13px] text-muted">
          <Checkbox
            id="del-all"
            checked={allLanguages}
            onCheckedChange={(v) => setAllLanguages(v === true)}
          />
          {tr('Delete all languages of this template')}
        </label>
      </ConfirmDialog>
      {del.error && (
        <ErrorPanel className="mx-6" error={del.error} title={tr('Meta did not delete the template')} />
      )}
    </>
  );
}
