import { useQueryClient } from '@tanstack/react-query';
import { useGetTemplateFacets, useListTemplatesInfinite, useSyncTemplates } from '@wacc/api-client';
import { TEMPLATE_LANGUAGES } from '@wacc/types';
import {
  Badge,
  Button,
  buttonVariants,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@wacc/ui';
import { FileText, Plus, RefreshCw, Search, X } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page';
import { WabaSelect } from '@/components/pickers';
import { EmptyState, ErrorPanel, ErrorState, LoadMore, TableSkeleton } from '@/components/states';
import { QualityBadge, TemplateStatusBadge } from '@/components/status';
import { formatRelative, humanize } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useCapabilities, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

const ANY = '__any__';

function FacetSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  allLabel: string;
  value?: string;
  onChange: (v?: string) => void;
  options: { value: string; label: string; count: number }[];
}) {
  useLocale();
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      <SelectTrigger className="w-auto min-w-36" aria-label={localizeText(label)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {localizeText(o.label)} <span className="ml-1 text-subtle tabular-nums">{o.count}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function TemplatesPage() {
  useLocale();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canManage = useCan('templates.manage');
  const canSync = useCan('wabas.sync');
  const caps = useCapabilities();
  const filters = {
    wabaId: params.get('waba') ?? undefined,
    status: params.get('status') ?? undefined,
    category: params.get('category') ?? undefined,
    language: params.get('language') ?? undefined,
  };
  const [searchInput, setSearchInput] = React.useState(params.get('q') ?? '');
  const search = useDebounced(searchInput.trim());

  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const facets = useGetTemplateFacets(orgId, { wabaId: filters.wabaId });
  const query = { ...filters, search: search || undefined, limit: 25 };
  const templates = useListTemplatesInfinite(orgId, query, {
    query: { getNextPageParam: (last) => last.nextCursor ?? undefined, initialPageParam: undefined },
  });
  const sync = useSyncTemplates();
  const rows = templates.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = Object.values(filters).some(Boolean) || Boolean(search);

  return (
    <>
      <PageHeader
        title={tr('Message templates')}
        description={
          facets.data?.lastSyncedAt
            ? tr(
                'Cached from Meta, last synced {0}. Meta stays the source of truth for status.',
                formatRelative(facets.data.lastSyncedAt),
              )
            : tr('Templates are cached from Meta. Sync to load the latest status.')
        }
        actions={
          <>
            {canSync && (
              <Button
                variant="secondary"
                loading={sync.isPending}
                onClick={() =>
                  sync.mutate(
                    { organizationId: orgId, data: { wabaId: filters.wabaId } },
                    {
                      onSuccess: (r) => {
                        invalidateOrg(qc, orgId, 'templates');
                        if (r.errors.length)
                          toast.warning(
                            tr('Synced {0} templates; {1} account(s) failed', r.synced, r.errors.length),
                          );
                        else toast.success(tr('Synced {0} templates from Meta', r.synced));
                      },
                    },
                  )
                }
              >
                <RefreshCw /> {tr('Sync')}
              </Button>
            )}
            {canManage && caps.canManageTemplates && (
              <Link to={orgPath(orgId, 'templates/new')} className={buttonVariants({ variant: 'primary' })}>
                <Plus /> {tr('New template')}
              </Link>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <div className="relative w-full max-w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={tr('Search by name or ID')}
            className="pl-8"
            aria-label={tr('Search templates')}
          />
        </div>
        <WabaSelect
          value={filters.wabaId}
          onChange={(v) => setFilter('waba', v)}
          allowAll
          className="w-auto min-w-40"
        />
        <FacetSelect
          label={tr('Statuses')}
          allLabel={tr('All statuses')}
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          options={(facets.data?.statuses ?? []).map((s) => ({ ...s, label: humanize(s.value) }))}
        />
        <FacetSelect
          label={tr('Categories')}
          allLabel={tr('All categories')}
          value={filters.category}
          onChange={(v) => setFilter('category', v)}
          options={(facets.data?.categories ?? []).map((s) => ({ ...s, label: humanize(s.value) }))}
        />
        <FacetSelect
          label={tr('Languages')}
          allLabel={tr('All languages')}
          value={filters.language}
          onChange={(v) => setFilter('language', v)}
          options={(facets.data?.languages ?? []).map((s) => ({
            ...s,
            label: TEMPLATE_LANGUAGES[s.value] ?? s.value,
          }))}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('');
              setParams({}, { replace: true });
            }}
          >
            <X /> {tr('Clear')}
          </Button>
        )}
      </div>
      {sync.error && <ErrorPanel className="mx-6 mt-4" error={sync.error} title={tr('Sync failed')} />}
      {templates.isLoading ? (
        <TableSkeleton columns={6} />
      ) : templates.error ? (
        <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Search}
            title={tr('No templates match these filters')}
            description={tr('Try another status or clear the search.')}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title={tr('No templates yet')}
            description={tr(
              'Sync to load templates created in WhatsApp Manager, or create one here with a live preview.',
            )}
            action={
              canManage && (
                <Link to={orgPath(orgId, 'templates/new')} className={buttonVariants({ variant: 'primary' })}>
                  <Plus /> {tr('New template')}
                </Link>
              )
            }
          />
        )
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{tr('Name')}</TH>
                <TH>{tr('Category')}</TH>
                <TH>{tr('Language')}</TH>
                <TH>{tr('Status')}</TH>
                <TH>{tr('Quality')}</TH>
                <TH>{tr('Account')}</TH>
                <TH className="text-right">{tr('Updated')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((t) => {
                const go = () => navigate(orgPath(orgId, `templates/${t.id}`));
                return (
                  <TR
                    key={t.id}
                    data-interactive="true"
                    tabIndex={0}
                    onClick={go}
                    onKeyDown={(e) => e.key === 'Enter' && go()}
                  >
                    <TD>
                      <span className="font-mono text-[13px] text-fg">{t.name}</span>
                      {t.remoteDeletedAt && (
                        <Badge className="ml-2" tone="neutral">
                          {tr('Deleted at Meta')}
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-[13px] text-muted">
                      {humanize(t.category)}
                      {t.previousCategory && t.previousCategory !== t.category && (
                        <span className="text-subtle" title={tr('Requested as {0}', t.previousCategory)}>
                          {' '}
                          {tr('(was')} {humanize(t.previousCategory)})
                        </span>
                      )}
                    </TD>
                    <TD className="text-[13px] text-muted">
                      {tr(TEMPLATE_LANGUAGES[t.language] ?? t.language)}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <TemplateStatusBadge status={t.status} />
                        {t.rejectedReason && (
                          <span className="text-xs text-danger-text">{humanize(t.rejectedReason)}</span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {t.qualityScore ? (
                        <QualityBadge rating={t.qualityScore} />
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </TD>
                    <TD className="max-w-40 truncate text-[13px] text-muted">
                      {t.waba.name ?? t.waba.metaWabaId}
                    </TD>
                    <TD className="text-right text-xs text-subtle">{formatRelative(t.updatedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <LoadMore
            hasMore={Boolean(templates.hasNextPage)}
            loading={templates.isFetchingNextPage}
            onLoad={() => templates.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
