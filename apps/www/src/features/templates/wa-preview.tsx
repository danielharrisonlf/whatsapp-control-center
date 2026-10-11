import { cn } from '@wacc/ui';
import {
  ArrowLeft,
  BadgeCheck,
  Copy,
  ExternalLink,
  FileText,
  ImageIcon,
  List,
  MapPin,
  Phone,
  Reply,
  Video,
} from 'lucide-react';
import * as React from 'react';
import { t as tr, useLocale } from '@/lib/i18n';

/** WhatsApp inline formatting: *bold*, _italic_, ~strike~, ```mono```, `inline code`, links. */
export function WhatsAppText({ text }: { text: string }) {
  useLocale();
  const nodes: React.ReactNode[] = [];
  const pattern = /```([\s\S]+?)```|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0;
    if (i > last) nodes.push(text.slice(last, i));
    if (m[1] !== undefined)
      nodes.push(
        <code key={key++} className="font-mono text-[12.5px]">
          {m[1]}
        </code>,
      );
    else if (m[2] !== undefined)
      nodes.push(
        <code key={key++} className="rounded bg-black/5 px-1 font-mono text-[12.5px] dark:bg-white/10">
          {m[2]}
        </code>,
      );
    else if (m[3] !== undefined)
      nodes.push(
        <strong key={key++} className="font-semibold">
          {m[3]}
        </strong>,
      );
    else if (m[4] !== undefined) nodes.push(<em key={key++}>{m[4]}</em>);
    else if (m[5] !== undefined) nodes.push(<s key={key++}>{m[5]}</s>);
    else if (m[6] !== undefined)
      nodes.push(
        <span key={key++} className="text-[var(--wa-link)] underline-offset-2">
          {m[6]}
        </span>,
      );
    last = i + m[0].length;
  }
  nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/** Variables without a sample stay visible as {{x}}, highlighted. */
function Templated({ text }: { text: string }) {
  useLocale();
  const parts = text.split(/(\{\{[^{}]*\}\})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\{\{[^{}]*\}\}$/.test(part) ? (
          <mark
            // biome-ignore lint/suspicious/noArrayIndexKey: positional fragments
            key={i}
            className="rounded-sm bg-[#ffeb3b]/40 px-0.5 font-mono text-[12px] text-inherit dark:bg-[#ffeb3b]/20"
          >
            {part}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional fragments
          <WhatsAppText key={i} text={part} />
        ),
      )}
    </>
  );
}

export type PreviewButton =
  | { kind: 'reply'; text: string }
  | { kind: 'url'; text: string }
  | { kind: 'phone'; text: string }
  | { kind: 'copy'; text: string }
  | { kind: 'flow'; text: string };

export interface PreviewMessage {
  header?:
    | { kind: 'text'; text: string }
    | { kind: 'image' | 'video' | 'document'; url?: string; fileName?: string }
    | { kind: 'location' };
  body: string;
  footer?: string;
  buttons?: PreviewButton[];
  /** Messages sent by the user appear on the right (green). */
  outgoing?: boolean;
}

const buttonIcon = { reply: Reply, url: ExternalLink, phone: Phone, copy: Copy, flow: List } as const;

function Bubble({ message, time }: { message: PreviewMessage; time: string }) {
  useLocale();
  const { header, body, footer, buttons = [], outgoing } = message;
  // WhatsApp shows up to 3 buttons; with more, the third becomes "See all options".
  const visible = buttons.length > 3 ? buttons.slice(0, 2) : buttons;
  const hasButtons = buttons.length > 0;

  return (
    <div className={cn('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div className="w-fit min-w-[120px] max-w-[85%]">
        <div
          className={cn(
            'relative rounded-lg px-1.5 pb-1.5 pt-1.5 text-[13.5px] leading-[1.38] text-[var(--wa-text)] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]',
            outgoing ? 'rounded-tr-none bg-[var(--wa-bubble-out)]' : 'rounded-tl-none bg-[var(--wa-bubble)]',
            hasButtons && 'rounded-b-none',
          )}
        >
          {header?.kind === 'text' && header.text && (
            <p className="px-1 pb-0.5 pt-0.5 text-[14px] font-semibold">
              <Templated text={header.text} />
            </p>
          )}
          {header && header.kind !== 'text' && (
            <div className="mb-1 overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
              {header.kind === 'image' && header.url ? (
                <img src={header.url} alt={tr('Header')} className="max-h-44 w-full object-cover" />
              ) : header.kind === 'document' ? (
                <div className="flex items-center gap-2.5 px-2.5 py-3">
                  <FileText className="size-7 shrink-0 text-[#e5534b]" aria-hidden />
                  <span className="truncate text-[13px]">{header.fileName ?? 'document.pdf'}</span>
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center text-[var(--wa-meta)]">
                  {header.kind === 'image' && (
                    <ImageIcon className="size-8" aria-label={tr('Image header')} />
                  )}
                  {header.kind === 'video' && <Video className="size-8" aria-label={tr('Video header')} />}
                  {header.kind === 'location' && (
                    <MapPin className="size-8" aria-label={tr('Location header')} />
                  )}
                </div>
              )}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words px-1">
            {body ? (
              <Templated text={body} />
            ) : (
              <span className="text-[var(--wa-meta)]">{tr('Message body')}</span>
            )}
            {/* Space reserved so the timestamp never overlaps the last line. */}
            {!footer && <span aria-hidden className="inline-block w-12" />}
          </div>
          {footer && (
            <p className="px-1 pt-0.5 text-[12.5px] text-[var(--wa-meta)]">
              {footer}
              <span aria-hidden className="inline-block w-12" />
            </p>
          )}
          <span className="absolute bottom-1 right-2 flex items-center gap-0.5 text-[11px] text-[var(--wa-meta)]">
            {time}
            {outgoing && (
              <svg viewBox="0 0 16 11" className="ml-0.5 h-[11px] w-4 text-[#53bdeb]" aria-label={tr('Read')}>
                <path
                  fill="currentColor"
                  d="M11.07.65 10 0 4.6 7.2 1.4 4.5.4 5.6l4.4 3.9zM15.07.65 14 0 8.6 7.2l-.7-.6-1 1.1 1.9 1.7z"
                />
              </svg>
            )}
          </span>
        </div>
        {hasButtons && (
          <div className="mt-px grid gap-px overflow-hidden rounded-b-lg">
            {visible.map((b, i) => {
              const Icon = buttonIcon[b.kind];
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: order is the identity
                  key={i}
                  className="flex h-9 items-center justify-center gap-1.5 bg-[var(--wa-bubble)] px-3 text-[13.5px] font-medium text-[var(--wa-link)] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{b.text || tr('Button')}</span>
                </div>
              );
            })}
            {buttons.length > 3 && (
              <div className="flex h-9 items-center justify-center gap-1.5 bg-[var(--wa-bubble)] text-[13.5px] font-medium text-[var(--wa-link)]">
                <List className="size-4" aria-hidden /> {tr('See all options')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A phone-sized WhatsApp chat showing one or more messages. */
export function WhatsAppPreview({
  businessName,
  messages,
  className,
}: {
  businessName: string;
  messages: PreviewMessage[];
  className?: string;
}) {
  useLocale();
  const time = React.useMemo(
    () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    [],
  );
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[340px] overflow-hidden rounded-[30px] border-[7px] border-[#1c1f23] bg-[var(--wa-wallpaper)] shadow-overlay',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 bg-[var(--wa-header)] px-3 py-2.5 text-[var(--wa-text)]">
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#25d366]/20 text-[13px] font-semibold text-[#128c4b] dark:text-[#25d366]">
          {businessName.slice(0, 1).toUpperCase() || 'B'}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-[14.5px] font-medium">
            {businessName || tr('Your business')}
            <BadgeCheck className="size-3.5 shrink-0 text-[#25d366]" aria-hidden />
          </p>
          <p className="text-[11.5px] text-[var(--wa-meta)]">{tr('Business account')}</p>
        </div>
      </div>
      <div
        className="flex min-h-[420px] flex-col justify-end gap-1.5 px-3 py-4"
        style={{
          backgroundImage:
            'radial-gradient(var(--wa-doodle) 1px, transparent 1.2px), radial-gradient(var(--wa-doodle) 1px, transparent 1.2px)',
          backgroundSize: '22px 22px',
          backgroundPosition: '0 0, 11px 11px',
        }}
      >
        <div className="mx-auto mb-2 rounded-md bg-[var(--wa-bubble)] px-2.5 py-1 text-[11.5px] text-[var(--wa-meta)] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
          {tr('Today')}
        </div>
        {messages.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: preview order
          <Bubble key={i} message={m} time={time} />
        ))}
      </div>
    </div>
  );
}
