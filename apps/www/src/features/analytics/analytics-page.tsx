import { useQueryClient } from '@tanstack/react-query';
import {
  useEnableTemplateInsights,
  useGetDashboard,
  useGetMetaAnalytics,
  useGetTemplateAnalytics,
  useListTemplates,
  useListWabas,
} from '@wacc/api-client';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { ChevronDown, Info } from 'lucide-react';
import * as React from 'react';
import { PeriodFilter, type PeriodValue, TimeSeriesChart } from '@/components/charts';
import { PageBody, PageHeader, Section } from '@/components/page';
import { PhoneSelect, WabaSelect } from '@/components/pickers';
import { BlockSkeleton, EmptyState, ErrorPanel, MetaErrorPanel } from '@/components/states';
import { formatNumber, formatPercent, humanize } from '@/lib/format';
import { getLocale, t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

function Unavailable({
  reason,
  error,
}: {
  reason: string | null;
  error?: Parameters<typeof MetaErrorPanel>[0]['error'] | null;
}) {
  useLocale();
  if (error) return <MetaErrorPanel error={error} />;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-raised px-3.5 py-3 text-[13px] text-muted">
      <Info className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
      {reason ? tr(reason) : tr('Meta returned no data for this period.')}
    </div>
  );
}

function TemplatePerformance({ wabaId, period }: { wabaId: string; period: PeriodValue }) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const canEnable = useCan('wabas.subscribe');
  const templates = useListTemplates(orgId, { wabaId, status: 'APPROVED', limit: 100 });
  const [selected, setSelected] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (templates.data && selected.length === 0)
      setSelected(templates.data.items.slice(0, 5).map((t) => t.id));
  }, [templates.data, selected.length]);
  const range = period.range === '24h' ? { range: '7d' as const } : period;
  const analytics = useGetTemplateAnalytics(
    orgId,
    { wabaId, templateIds: selected, ...range },
    { query: { enabled: selected.length > 0 } },
  );
  const enable = useEnableTemplateInsights();

  return (
    <Section
      title={tr('Template performance')}
      description={tr(
        'Sent, delivered, read and button clicks per template (Meta keeps 90 days; reads and clicks are counted for 7 days after sending).',
      )}
      actions={
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              {selected.length} {tr('templates')} <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-80 w-72 overflow-y-auto">
            <p className="mb-2 text-xs text-muted">{tr('Up to 10 templates')}</p>
            {templates.data?.items.map((t) => (
              <label key={t.id} htmlFor={`ta-${t.id}`} className="flex items-center gap-2 py-1 text-[13px]">
                <Checkbox
                  id={`ta-${t.id}`}
                  checked={selected.includes(t.id)}
                  disabled={!selected.includes(t.id) && selected.length >= 10}
                  onCheckedChange={(v) =>
                    setSelected(v ? [...selected, t.id] : selected.filter((x) => x !== t.id))
                  }
                />
                <span className="truncate font-mono">{t.name}</span>
                <span className="text-subtle">{t.language}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
      }
    >
      {selected.length === 0 ? (
        <p className="text-[13px] text-muted">{tr('No approved templates in this account.')}</p>
      ) : analytics.isLoading ? (
        <BlockSkeleton lines={4} />
      ) : analytics.error ? (
        <ErrorPanel error={analytics.error} />
      ) : !analytics.data?.available ? (
        <div className="grid gap-3">
          <Unavailable reason={analytics.data?.reason ?? null} error={analytics.data?.error} />
          {analytics.data?.enabled === false && canEnable && (
            <div className="flex items-center gap-3 text-[13px] text-muted">
              {tr('Template insights are disabled for this account.')}
              <Button
                size="sm"
                variant="primary"
                loading={enable.isPending}
                onClick={() =>
                  enable.mutate(
                    { organizationId: orgId, data: { wabaId } },
                    { onSuccess: () => invalidateOrg(qc, orgId, 'analytics') },
                  )
                }
              >
                {tr('Enable template insights')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Table className="rounded-lg border border-border">
          <THead>
            <TR>
              <TH>{tr('Template')}</TH>
              <TH className="text-right">{tr('Sent')}</TH>
              <TH className="text-right">{tr('Delivered')}</TH>
              <TH className="text-right">{tr('Read')}</TH>
              <TH className="text-right">{tr('Read rate')}</TH>
              <TH className="text-right">{tr('Clicks')}</TH>
            </TR>
          </THead>
          <TBody>
            {analytics.data.templates.map((t) => (
              <TR key={t.id}>
                <TD>
                  <span className="font-mono text-[13px]">{t.name}</span>{' '}
                  <span className="text-xs text-subtle">{t.language}</span>
                </TD>
                <TD className="text-right">{formatNumber(t.sent)}</TD>
                <TD className="text-right">{formatNumber(t.delivered)}</TD>
                <TD className="text-right">{formatNumber(t.read)}</TD>
                <TD className="text-right text-muted">{formatPercent(t.read, t.delivered)}</TD>
                <TD className="text-right">{formatNumber(t.clicked)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Section>
  );
}

export function AnalyticsPage() {
  useLocale();
  const { orgId } = useOrg();
  const wabas = useListWabas(orgId);
  const [wabaId, setWabaId] = React.useState<string>();
  const [phoneId, setPhoneId] = React.useState<string>();
  const [country, setCountry] = React.useState('');
  const [category, setCategory] = React.useState<string>('all');
  const [period, setPeriod] = React.useState<PeriodValue>({ range: '30d' });
  const activeWaba = wabaId ?? wabas.data?.[0]?.id;

  const local = useGetDashboard(
    orgId,
    { ...period, phoneNumberId: phoneId },
    { query: { placeholderData: (p) => p } },
  );
  const meta = useGetMetaAnalytics(
    orgId,
    {
      wabaId: activeWaba!,
      phoneNumberId: phoneId,
      countryCode: /^[A-Z]{2}$/.test(country) ? country : undefined,
      ...period,
    },
    { query: { enabled: Boolean(activeWaba), placeholderData: (p) => p } },
  );

  const pricingRows = React.useMemo(() => {
    const map = new Map<string, { category: string; type: string; volume: number; cost: number | null }>();
    for (const p of meta.data?.pricing.points ?? []) {
      const key = `${p.pricingCategory}|${p.pricingType}`;
      const row = map.get(key) ?? {
        category: p.pricingCategory ?? 'unknown',
        type: p.pricingType ?? '—',
        volume: 0,
        cost: null,
      };
      row.volume += p.volume;
      if (p.cost !== null) row.cost = (row.cost ?? 0) + p.cost;
      map.set(key, row);
    }
    return [...map.values()]
      .filter((r) => category === 'all' || r.category === category)
      .sort((a, b) => b.volume - a.volume);
  }, [meta.data, category]);
  const categories = [
    ...new Set((meta.data?.pricing.points ?? []).map((p) => p.pricingCategory).filter(Boolean)),
  ] as string[];

  if (wabas.isSuccess && wabas.data.length === 0) {
    return (
      <>
        <PageHeader title={tr('Analytics')} />
        <EmptyState title={tr('Connect a WhatsApp account to see analytics')} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tr('Analytics')}
        description={tr('Messaging volume, delivery, pricing and template performance.')}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <WabaSelect
          value={activeWaba}
          onChange={(v) => {
            setWabaId(v);
            setPhoneId(undefined);
          }}
        />
        <PhoneSelect value={phoneId} onChange={setPhoneId} wabaId={activeWaba} allowAll />
        <Input
          value={country}
          onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
          placeholder={tr('Country (BR)')}
          aria-label={tr('Country code')}
          className="w-32 font-mono"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44" aria-label={tr('Pricing category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All categories')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {humanize(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PageBody className="grid gap-10">
        <Section
          title={
            <span className="flex items-center gap-2">
              {tr('Delivery')} <Badge>{tr('Observed by this app')}</Badge>
            </span>
          }
          description={tr('Messages sent through this app by their latest webhook status.')}
        >
          {local.data ? (
            <TimeSeriesChart
              data={local.data.series}
              xKey="bucket"
              bucket={local.data.range.bucket}
              ariaLabel={tr('Messages by status')}
              series={[
                { key: 'sent', label: tr('Sent'), color: 'var(--chart-1)' },
                { key: 'delivered', label: tr('Delivered'), color: 'var(--chart-2)' },
                { key: 'read', label: tr('Read'), color: 'var(--chart-3)' },
                { key: 'failed', label: tr('Failed'), color: 'var(--chart-4)' },
              ]}
            />
          ) : (
            <BlockSkeleton lines={5} />
          )}
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              {tr('Messaging')} <Badge tone="info">{tr('Reported by Meta')}</Badge>
            </span>
          }
          description={tr(
            'All messages from this account, including ones sent by other systems (Meta keeps 1 year).',
          )}
        >
          {meta.isLoading ? (
            <BlockSkeleton lines={5} />
          ) : meta.error ? (
            <ErrorPanel error={meta.error} />
          ) : meta.data?.messaging.available && meta.data.messaging.points.length > 0 ? (
            <TimeSeriesChart
              data={meta.data.messaging.points}
              xKey="start"
              bucket={meta.data.range.bucket}
              ariaLabel={tr('Messages sent and delivered reported by Meta')}
              series={[
                { key: 'sent', label: tr('Sent'), color: 'var(--chart-1)' },
                { key: 'delivered', label: tr('Delivered'), color: 'var(--chart-2)' },
              ]}
            />
          ) : (
            <Unavailable reason={meta.data?.messaging.reason ?? null} error={meta.data?.messaging.error} />
          )}
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              {tr('Pricing')} <Badge tone="info">{tr('Reported by Meta')}</Badge>
            </span>
          }
          description={tr(
            'Per-message pricing volume and cost by category. Costs only appear when Meta bills this account directly.',
          )}
        >
          {meta.isLoading ? (
            <BlockSkeleton lines={4} />
          ) : !meta.data?.pricing.available || pricingRows.length === 0 ? (
            <Unavailable
              reason={
                meta.data?.pricing.reason ??
                tr(
                  'Pricing data is not available for this account configuration (for example, when billing goes through a partner credit line).',
                )
              }
              error={meta.data?.pricing.error}
            />
          ) : (
            <Table className="rounded-lg border border-border">
              <THead>
                <TR>
                  <TH>{tr('Category')}</TH>
                  <TH>{tr('Pricing type')}</TH>
                  <TH className="text-right">{tr('Messages')}</TH>
                  <TH className="text-right">
                    {tr('Cost')} {meta.data.pricing.currency ? `(${meta.data.pricing.currency})` : ''}
                  </TH>
                </TR>
              </THead>
              <TBody>
                {pricingRows.map((r) => (
                  <TR key={`${r.category}|${r.type}`}>
                    <TD>{humanize(r.category)}</TD>
                    <TD className="text-muted">{humanize(r.type)}</TD>
                    <TD className="text-right">{formatNumber(r.volume)}</TD>
                    <TD className="text-right">
                      {r.cost === null ? (
                        <span className="text-subtle">{tr('Not reported')}</span>
                      ) : (
                        new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(r.cost)
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Section>

        {activeWaba && <TemplatePerformance wabaId={activeWaba} period={period} />}
      </PageBody>
    </>
  );
}
