import { Badge, type BadgeProps } from '@wacc/ui';
import { humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';

type Tone = NonNullable<BadgeProps['tone']>;

function StatusBadge({
  value,
  tones,
  labels,
}: {
  value: string | null | undefined;
  tones: Record<string, Tone>;
  labels?: Record<string, string>;
}) {
  useLocale();
  if (!value) return <Badge tone="neutral">{tr('Unknown')}</Badge>;
  return (
    <Badge tone={tones[value] ?? 'neutral'} dot>
      {labels?.[value] ?? humanize(value)}
    </Badge>
  );
}

export function TemplateStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        APPROVED: 'success',
        PENDING: 'info',
        IN_APPEAL: 'info',
        REJECTED: 'danger',
        PAUSED: 'warning',
        DISABLED: 'danger',
        LIMIT_EXCEEDED: 'warning',
        PENDING_DELETION: 'neutral',
        DELETED: 'neutral',
        ARCHIVED: 'neutral',
      }}
    />
  );
}

/** quality_rating / quality_score: GREEN | YELLOW | RED | NA | UNKNOWN. */
export function QualityBadge({ rating }: { rating: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={rating}
      tones={{ GREEN: 'success', YELLOW: 'warning', RED: 'danger', NA: 'neutral', UNKNOWN: 'neutral' }}
      labels={{
        GREEN: tr('High'),
        YELLOW: tr('Medium'),
        RED: tr('Low'),
        NA: tr('Not rated'),
        UNKNOWN: tr('Unknown'),
      }}
    />
  );
}

export function PhoneStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        CONNECTED: 'success',
        PENDING: 'info',
        FLAGGED: 'warning',
        RESTRICTED: 'warning',
        BANNED: 'danger',
        DISCONNECTED: 'neutral',
        UNVERIFIED: 'warning',
      }}
    />
  );
}

export function NameStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        APPROVED: 'success',
        AVAILABLE_WITHOUT_REVIEW: 'success',
        PENDING_REVIEW: 'info',
        DECLINED: 'danger',
        EXPIRED: 'warning',
        NONE: 'neutral',
      }}
    />
  );
}

export function FlowStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        PUBLISHED: 'success',
        DRAFT: 'info',
        DEPRECATED: 'neutral',
        BLOCKED: 'danger',
        THROTTLED: 'warning',
      }}
    />
  );
}

export function MessageStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        accepted: 'neutral',
        sent: 'info',
        delivered: 'accent',
        read: 'success',
        played: 'success',
        failed: 'danger',
        received: 'neutral',
        held_for_quality_assessment: 'warning',
        paused: 'warning',
      }}
    />
  );
}

export function ProcessingStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        PROCESSED: 'success',
        PENDING: 'info',
        IGNORED: 'neutral',
        FAILED: 'danger',
        REJECTED: 'danger',
      }}
      labels={{ REJECTED: tr('Bad signature') }}
    />
  );
}

export function ConnectionStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge value={status} tones={{ ACTIVE: 'success', ERROR: 'danger', DISCONNECTED: 'neutral' }} />
  );
}

export function ReviewStatusBadge({ status }: { status: string | null | undefined }) {
  useLocale();
  return (
    <StatusBadge
      value={status}
      tones={{
        APPROVED: 'success',
        VERIFIED: 'success',
        PENDING: 'info',
        DEFERRED: 'warning',
        REJECTED: 'danger',
        FAILED: 'danger',
        NOT_VERIFIED: 'neutral',
        EXPIRED: 'warning',
        REVOKED: 'danger',
      }}
    />
  );
}

export function HttpStatus({ code }: { code: number | null | undefined }) {
  useLocale();
  if (code == null) return <Badge tone="danger">{tr('No response')}</Badge>;
  const tone: Tone = code >= 500 ? 'danger' : code >= 400 ? 'warning' : 'success';
  return (
    <Badge tone={tone} className="font-mono tabular-nums">
      {code}
    </Badge>
  );
}
