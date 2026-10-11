import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFlowQueryKey,
  useDeleteFlow,
  useDeprecateFlow,
  useGetFlow,
  useGetFlowPreview,
  usePublishFlow,
  useRefreshFlow,
  useUpdateFlowJson,
} from '@wacc/api-client';
import { Button, ConfirmDialog } from '@wacc/ui';
import { CircleAlert, ExternalLink, RefreshCw, Save } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { JsonEditor } from '@/components/json-editor';
import { PageBody, PageHeader, Section } from '@/components/page';
import { BlockSkeleton, ErrorPanel, ErrorState } from '@/components/states';
import { FlowStatusBadge } from '@/components/status';
import { formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

interface FlowScreen {
  id?: string;
  title?: string;
  terminal?: boolean;
  layout?: { children?: { type?: string }[] };
}

function Structure({ json }: { json: string }) {
  useLocale();
  let screens: FlowScreen[] = [];
  try {
    screens = (JSON.parse(json) as { screens?: FlowScreen[] }).screens ?? [];
  } catch {
    return <p className="text-[13px] text-muted">{tr('Fix the JSON to see the structure.')}</p>;
  }
  if (screens.length === 0) return <p className="text-[13px] text-muted">{tr('No screens defined.')}</p>;
  return (
    <ol className="grid gap-2">
      {screens.map((s, i) => (
        <li key={s.id ?? i} className="rounded-md border border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted">{s.id}</span>
            {s.terminal && <span className="text-[11px] font-medium text-accent-text">{tr('terminal')}</span>}
          </div>
          <p className="text-sm font-medium text-fg">{s.title ?? tr('Untitled screen')}</p>
          <p className="mt-0.5 text-xs text-muted">
            {(s.layout?.children ?? [])
              .map((c) => c.type)
              .filter(Boolean)
              .join(', ') || tr('No components')}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function FlowEditorPage() {
  useLocale();
  const { flowId } = useParams<{ flowId: string }>();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canManage = useCan('flows.manage');
  const flow = useGetFlow(orgId, flowId!);
  const refresh = useRefreshFlow();
  const save = useUpdateFlowJson();
  const publish = usePublishFlow();
  const deprecate = useDeprecateFlow();
  const del = useDeleteFlow();
  const [preview, setPreview] = React.useState(false);
  const previewQuery = useGetFlowPreview(orgId, flowId!, undefined, { query: { enabled: preview } });
  const [text, setText] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<'publish' | 'deprecate' | 'delete' | null>(null);
  const autoRefreshed = React.useRef(false);

  // The first open pulls the JSON from Meta when we have none cached.
  React.useEffect(() => {
    if (flow.data && flow.data.flowJson == null && !autoRefreshed.current) {
      autoRefreshed.current = true;
      refresh.mutate(
        { organizationId: orgId, flowId: flow.data.id },
        { onSuccess: (f) => qc.setQueryData(getGetFlowQueryKey(orgId, f.id), f) },
      );
    }
  }, [flow.data, orgId, qc, refresh]);

  React.useEffect(() => {
    if (flow.data && text === null && flow.data.flowJson != null)
      setText(JSON.stringify(flow.data.flowJson, null, 2));
  }, [flow.data, text]);

  React.useEffect(() => {
    if (previewQuery.data) window.open(previewQuery.data.previewUrl, '_blank', 'noopener');
  }, [previewQuery.data]);

  if (flow.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={8} />;
  if (flow.error || !flow.data) return <ErrorState error={flow.error} onRetry={() => flow.refetch()} />;
  const f = flow.data;
  const draft = f.status === 'DRAFT';
  const current = text ?? '';
  let parseError: string | null = null;
  try {
    if (current) JSON.parse(current);
  } catch (e) {
    parseError = (e as Error).message;
  }
  const dirty = f.flowJson != null ? current !== JSON.stringify(f.flowJson, null, 2) : current.length > 0;
  const setFlow = (next: typeof f) => qc.setQueryData(getGetFlowQueryKey(orgId, next.id), next);
  const anyError =
    refresh.error ?? save.error ?? publish.error ?? deprecate.error ?? del.error ?? previewQuery.error;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: tr('Flows'), to: orgPath(orgId, 'flows') }, { label: f.name }]}
        title={f.name}
        meta={
          <>
            <FlowStatusBadge status={f.status} />
            <IdChip value={f.metaFlowId} />
            <span className="text-[13px] text-muted">{f.categories.map(humanize).join(', ')}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              loading={refresh.isPending}
              onClick={() =>
                refresh.mutate(
                  { organizationId: orgId, flowId: f.id },
                  {
                    onSuccess: (n) => {
                      setFlow(n);
                      setText(n.flowJson != null ? JSON.stringify(n.flowJson, null, 2) : '');
                    },
                  },
                )
              }
            >
              <RefreshCw /> {tr('Refresh')}
            </Button>
            <Button
              variant="secondary"
              loading={preview && previewQuery.isFetching}
              onClick={() => (preview ? previewQuery.refetch() : setPreview(true))}
            >
              <ExternalLink /> {tr('Preview')}
            </Button>
            {canManage && draft && (
              <>
                <Button variant="danger-outline" onClick={() => setConfirm('delete')}>
                  {tr('Delete')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!dirty || Boolean(parseError)}
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate(
                      { organizationId: orgId, flowId: f.id, data: { flowJson: current } },
                      {
                        onSuccess: (n) => {
                          setFlow(n);
                          if (n.validationErrors.length)
                            toast.warning(
                              tr('Saved with {0} validation error(s)', n.validationErrors.length),
                            );
                          else toast.success(tr('Saved and valid'));
                        },
                      },
                    )
                  }
                >
                  <Save /> {tr('Save and validate')}
                </Button>
                <Button
                  variant="primary"
                  disabled={dirty || f.validationErrors.length > 0}
                  onClick={() => setConfirm('publish')}
                >
                  {tr('Publish')}
                </Button>
              </>
            )}
            {canManage && f.status === 'PUBLISHED' && (
              <Button variant="secondary" onClick={() => setConfirm('deprecate')}>
                {tr('Deprecate')}
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-4">
          {anyError && <ErrorPanel error={anyError} />}
          {!draft && (
            <p className="text-[13px] text-muted">
              {humanize(f.status)}{' '}
              {tr('flows cannot be edited. Create a new flow (or clone this one in Meta) to change it.')}
            </p>
          )}
          {text === null && refresh.isPending ? (
            <BlockSkeleton lines={10} />
          ) : (
            <JsonEditor
              value={current}
              onChange={draft && canManage ? setText : undefined}
              readOnly={!draft || !canManage}
              height="calc(100vh - 300px)"
              ariaLabel={tr('Flow JSON')}
            />
          )}
          {parseError && (
            <p className="flex items-center gap-1.5 text-[13px] text-danger-text">
              <CircleAlert className="size-4" aria-hidden /> {parseError}
            </p>
          )}
        </div>
        <aside className="grid content-start gap-6">
          <Section
            title={tr('Validation')}
            description={tr(
              'Reported by Meta{0}.',
              f.lastSyncedAt ? `, ${formatRelative(f.lastSyncedAt)}` : '',
            )}
          >
            {f.validationErrors.length === 0 ? (
              <p className="text-[13px] text-success-text">{tr('No validation errors.')}</p>
            ) : (
              <ul className="grid gap-2">
                {f.validationErrors.map((e, i) => {
                  const err = e as {
                    error?: string;
                    message?: string;
                    line_start?: number;
                    pointers?: { path?: string }[];
                  };
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: Meta returns no ids
                      key={i}
                      className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px]"
                    >
                      <p className="font-medium text-fg">{err.error ?? tr('Error')}</p>
                      <p className="text-fg/80">{err.message}</p>
                      {(err.line_start || err.pointers?.[0]?.path) && (
                        <p className="mt-0.5 font-mono text-xs text-muted">
                          {err.line_start ? `line ${err.line_start}` : ''} {err.pointers?.[0]?.path ?? ''}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          <Section title={tr('Screens')}>
            <Structure json={current} />
          </Section>
          <Section title={tr('Details')}>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
              <dt className="text-muted">{tr('JSON version')}</dt>
              <dd>{f.jsonVersion ?? '—'}</dd>
              <dt className="text-muted">{tr('Data API')}</dt>
              <dd>{f.dataApiVersion ?? '—'}</dd>
              <dt className="text-muted">{tr('Endpoint')}</dt>
              <dd className="break-all">{f.endpointUri ?? tr('None')}</dd>
            </dl>
          </Section>
        </aside>
      </PageBody>
      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={tr('Publish {0}?', f.name)}
        description={
          <p>
            {tr(
              'Publishing is irreversible. Published flows can be sent to customers but can no longer be edited.',
            )}
          </p>
        }
        consequences={[tr('To change it later, create a new flow and deprecate this one.')]}
        tone="default"
        confirmLabel={tr('Publish flow')}
        loading={publish.isPending}
        onConfirm={() =>
          publish.mutate(
            { organizationId: orgId, flowId: f.id },
            {
              onSuccess: (n) => {
                setFlow(n);
                toast.success(tr('Flow published'));
              },
              onSettled: () => setConfirm(null),
            },
          )
        }
      />
      <ConfirmDialog
        open={confirm === 'deprecate'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={tr('Deprecate {0}?', f.name)}
        description={<p>{tr('The flow stops being available for new messages.')}</p>}
        consequences={[
          tr('Templates and messages that reference it will fail to open the flow.'),
          tr('Deprecation cannot be undone.'),
        ]}
        confirmLabel={tr('Deprecate')}
        loading={deprecate.isPending}
        onConfirm={() =>
          deprecate.mutate(
            { organizationId: orgId, flowId: f.id },
            { onSuccess: setFlow, onSettled: () => setConfirm(null) },
          )
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={tr('Delete draft {0}?', f.name)}
        description={<p>{tr('The draft and its JSON are deleted at Meta.')}</p>}
        consequences={[tr('This cannot be undone.')]}
        confirmLabel={tr('Delete draft')}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(
            { organizationId: orgId, flowId: f.id },
            {
              onSuccess: () => {
                invalidateOrg(qc, orgId, 'flows');
                navigate(orgPath(orgId, 'flows'));
              },
              onSettled: () => setConfirm(null),
            },
          )
        }
      />
    </>
  );
}
