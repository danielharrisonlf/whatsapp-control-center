import { Button, cn, Segmented } from '@wacc/ui';
import { format } from 'date-fns';
import { Table2 } from 'lucide-react';
import * as React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber, getDateLocale } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';

export interface Series {
  key: string;
  label: string;
  /** CSS color token, e.g. `var(--chart-1)`. Follows the entity, never its rank. */
  color: string;
}

interface TimeSeriesProps {
  data: Record<string, number | string>[];
  series: Series[];
  xKey: string;
  bucket: 'hour' | 'day';
  height?: number;
  ariaLabel: string;
}

const axisTick = { fill: 'var(--subtle)', fontSize: 11 };

function ChartTooltip({
  active,
  payload,
  label,
  series,
  bucket,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  series: Series[];
  bucket: 'hour' | 'day';
}) {
  useLocale();
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="min-w-40 rounded-lg border border-border bg-overlay px-3 py-2 text-xs shadow-overlay">
      <p className="mb-1.5 font-medium text-fg">
        {format(new Date(label), bucket === 'hour' ? 'MMM d, HH:mm' : 'EEE, MMM d', {
          locale: getDateLocale(),
        })}
      </p>
      {series.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <div key={s.key} className="flex items-center gap-2 py-0.5">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-muted">{localizeText(s.label)}</span>
            <span className="font-medium tabular-nums text-fg">{formatNumber(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Line chart with crosshair tooltip, legend, and a table view for screen readers and exact values. */
export function TimeSeriesChart({ data, series, xKey, bucket, height = 220, ariaLabel }: TimeSeriesProps) {
  useLocale();
  const [view, setView] = React.useState<'chart' | 'table'>('chart');
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const tickFormat = (v: string) =>
    format(new Date(v), bucket === 'hour' ? 'HH:mm' : 'MMM d', { locale: getDateLocale() });
  const visible = series.filter((s) => !hidden.has(s.key));
  const totals = Object.fromEntries(
    series.map((s) => [s.key, data.reduce((a, d) => a + Number(d[s.key] ?? 0), 0)]),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={tr('Series')}>
          {series.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
                aria-pressed={!hidden.has(s.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded text-xs transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  hidden.has(s.key) && 'opacity-40',
                )}
              >
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <span className="text-muted">{localizeText(s.label)}</span>
                <span className="font-medium tabular-nums text-fg">{formatNumber(totals[s.key])}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
          aria-pressed={view === 'table'}
        >
          <Table2 /> {view === 'chart' ? tr('Table') : tr('Chart')}
        </Button>
      </div>
      {view === 'chart' ? (
        <div role="img" aria-label={ariaLabel} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey={xKey}
                tickFormatter={tickFormat}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                content={<ChartTooltip series={visible} bucket={bucket} />}
              />
              {visible.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <caption className="sr-only">{ariaLabel}</caption>
            <thead className="sticky top-0 bg-raised">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-subtle">{tr('Period')}</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-1.5 text-right font-medium text-subtle">
                    {localizeText(s.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row[xKey])} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted">{tickFormat(String(row[xKey]))}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums text-fg">
                      {formatNumber(Number(row[s.key] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export type Range = '24h' | '7d' | '30d' | 'custom';

export interface PeriodValue {
  range: Range;
  from?: string;
  to?: string;
}

/** 24h / 7 days / 30 days / custom range. */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
}) {
  useLocale();
  const toInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        aria-label={tr('Period')}
        value={value.range}
        onValueChange={(range) =>
          onChange(
            range === 'custom'
              ? {
                  range,
                  from: new Date(Date.now() - 14 * 86_400_000).toISOString(),
                  to: new Date().toISOString(),
                }
              : { range },
          )
        }
        options={[
          { value: '24h', label: tr('24h') },
          { value: '7d', label: tr('7 days') },
          { value: '30d', label: tr('30 days') },
          { value: 'custom', label: tr('Custom') },
        ]}
      />
      {value.range === 'custom' && (
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <label className="sr-only" htmlFor="period-from">
            {tr('From')}
          </label>
          <input
            id="period-from"
            type="date"
            value={toInput(value.from)}
            max={toInput(value.to)}
            onChange={(e) =>
              e.target.value &&
              onChange({ ...value, from: new Date(`${e.target.value}T00:00:00`).toISOString() })
            }
            className="h-7 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span aria-hidden>–</span>
          <label className="sr-only" htmlFor="period-to">
            {tr('To')}
          </label>
          <input
            id="period-to"
            type="date"
            value={toInput(value.to)}
            min={toInput(value.from)}
            onChange={(e) =>
              e.target.value &&
              onChange({ ...value, to: new Date(`${e.target.value}T23:59:59`).toISOString() })
            }
            className="h-7 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  );
}
