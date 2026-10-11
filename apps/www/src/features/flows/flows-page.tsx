import { useQueryClient } from '@tanstack/react-query';
import { useCreateFlow, useListFlows, useSyncFlows } from '@wacc/api-client';
import { FLOW_CATEGORIES } from '@wacc/types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@wacc/ui';
import { Plus, RefreshCw, Workflow } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { PageHeader } from '@/components/page';
import { WabaSelect } from '@/components/pickers';
import { EmptyState, ErrorPanel, ErrorState, TableSkeleton } from '@/components/states';
import { FlowStatusBadge } from '@/components/status';
import { formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useCapabilities, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

export const STARTER_FLOW = {
  version: '7.2',
  screens: [
    {
      id: 'WELCOME',
      title: 'Welcome',
      terminal: true,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'Tell us about you' },
          { type: 'TextInput', name: 'full_name', label: 'Full name', required: true },
          {
            type: 'Footer',
            label: 'Submit',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Flow JSON data binding, not a JS template
            'on-click-action': { name: 'complete', payload: { full_name: '${form.full_name}' } },
          },
        ],
      },
    },
  ],
};

function CreateFlowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [wabaId, setWabaId] = React.useState<string>();
  const [name, setName] = React.useState('');
  const [categories, setCategories] = React.useState<string[]>(['OTHER']);
  const [starter, setStarter] = React.useState(true);
  const create = useCreateFlow();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('New flow')}</DialogTitle>
          <DialogDescription>
            {tr('Creates a draft flow at Meta. You can edit its JSON and preview it before publishing.')}
          </DialogDescription>
        </DialogHeader>
        <Field label={tr('WhatsApp account')} htmlFor="flow-waba">
          <WabaSelect id="flow-waba" value={wabaId} onChange={setWabaId} className="w-full" />
        </Field>
        <Field label={tr('Name')} htmlFor="flow-name">
          <Input
            id="flow-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr('Lead capture')}
          />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium text-fg">{tr('Categories')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {FLOW_CATEGORIES.map((c) => (
              <label key={c} htmlFor={`cat-${c}`} className="flex items-center gap-2 text-[13px] text-fg">
                <Checkbox
                  id={`cat-${c}`}
                  checked={categories.includes(c)}
                  onCheckedChange={(v) =>
                    setCategories(v ? [...categories, c] : categories.filter((x) => x !== c))
                  }
                />
                {humanize(c)}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="flow-starter" className="flex items-center gap-2 text-[13px] text-muted">
          <Checkbox id="flow-starter" checked={starter} onCheckedChange={(v) => setStarter(v === true)} />{' '}
          {tr('Start from a one-screen example')}
        </label>
        {create.error && <ErrorPanel error={create.error} title={tr('Meta did not create the flow')} />}
        <DialogFooter>
          <Button
            variant="primary"
            disabled={!wabaId || !name.trim() || categories.length === 0}
            loading={create.isPending}
            onClick={() =>
              create.mutate(
                {
                  organizationId: orgId,
                  data: {
                    wabaId: wabaId!,
                    name: name.trim(),
                    categories: categories as (typeof FLOW_CATEGORIES)[number][],
                    flowJson: starter ? JSON.stringify(STARTER_FLOW, null, 2) : undefined,
                  },
                },
                {
                  onSuccess: (f) => {
                    invalidateOrg(qc, orgId, 'flows');
                    onOpenChange(false);
                    navigate(orgPath(orgId, `flows/${f.id}`));
                  },
                },
              )
            }
          >
            {tr('Create draft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FlowsPage() {
  useLocale();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [wabaId, setWabaId] = React.useState<string>();
  const [creating, setCreating] = React.useState(false);
  const flows = useListFlows(orgId, { wabaId });
  const sync = useSyncFlows();
  const canManage = useCan('flows.manage');
  const canSync = useCan('wabas.sync');
  const caps = useCapabilities();

  return (
    <>
      <PageHeader
        title={tr('Flows')}
        description={tr(
          "WhatsApp Flows: structured forms inside the chat. For visual editing, Meta's Flow Builder remains the reference; this page manages JSON, validation and lifecycle.",
        )}
        actions={
          <>
            <WabaSelect value={wabaId} onChange={setWabaId} allowAll />
            {canSync && (
              <Button
                variant="secondary"
                loading={sync.isPending}
                onClick={() =>
                  sync.mutate(
                    { organizationId: orgId, data: { wabaId } },
                    {
                      onSuccess: (r) => {
                        invalidateOrg(qc, orgId, 'flows');
                        toast.success(tr('Synced {0} flows', r.synced));
                      },
                    },
                  )
                }
              >
                <RefreshCw /> {tr('Sync')}
              </Button>
            )}
            {canManage && caps.canManageFlows && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> {tr('New flow')}
              </Button>
            )}
          </>
        }
      />
      {sync.error && <ErrorPanel className="mx-6 mt-4" error={sync.error} title={tr('Sync failed')} />}
      {flows.isLoading ? (
        <TableSkeleton columns={5} />
      ) : flows.error ? (
        <ErrorState error={flows.error} onRetry={() => flows.refetch()} />
      ) : flows.data?.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title={tr('No flows')}
          description={tr('Sync flows created in Meta, or create a draft here.')}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{tr('Name')}</TH>
              <TH>{tr('Status')}</TH>
              <TH>{tr('Categories')}</TH>
              <TH>{tr('Validation')}</TH>
              <TH>{tr('Flow ID')}</TH>
              <TH className="text-right">{tr('Updated')}</TH>
            </TR>
          </THead>
          <TBody>
            {flows.data?.map((f) => {
              const go = () => navigate(orgPath(orgId, `flows/${f.id}`));
              return (
                <TR
                  key={f.id}
                  data-interactive="true"
                  tabIndex={0}
                  onClick={go}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                >
                  <TD className="font-medium text-fg">{f.name}</TD>
                  <TD>
                    <FlowStatusBadge status={f.status} />
                  </TD>
                  <TD className="text-[13px] text-muted">{f.categories.map(humanize).join(', ')}</TD>
                  <TD className="text-[13px]">
                    {f.validationErrors.length > 0 ? (
                      <span className="text-danger-text">
                        {f.validationErrors.length} {tr('error(s)')}
                      </span>
                    ) : (
                      <span className="text-muted">{tr('Valid')}</span>
                    )}
                  </TD>
                  <TD>
                    <IdChip value={f.metaFlowId} />
                  </TD>
                  <TD className="text-right text-xs text-subtle">{formatRelative(f.updatedAt)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <CreateFlowDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
