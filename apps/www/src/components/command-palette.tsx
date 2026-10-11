import { useListPhoneNumbers, useListTemplates } from '@wacc/api-client';
import { Dialog, DialogContent, DialogTitle } from '@wacc/ui';
import { Command } from 'cmdk';
import { ArrowRight, FileText, Phone } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { formatPhone } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';

const PAGES: [string, string][] = [
  ['Overview', ''],
  ['Connect WhatsApp', 'connect'],
  ['Accounts', 'accounts'],
  ['Phone numbers', 'phone-numbers'],
  ['Add phone number', 'phone-numbers/new'],
  ['Templates', 'templates'],
  ['New template', 'templates/new'],
  ['Flows', 'flows'],
  ['Inbox', 'messages'],
  ['Messaging playground', 'messages/playground'],
  ['Media', 'media'],
  ['Analytics', 'analytics'],
  ['Webhooks', 'developers/webhooks'],
  ['Event logs', 'developers/events'],
  ['API logs', 'developers/api-logs'],
  ['Diagnostics', 'developers/diagnostics'],
  ['Audit log', 'developers/audit'],
  ['Members', 'settings/members'],
  ['Settings', 'settings'],
];

const itemClass =
  'flex h-9 cursor-default items-center gap-2.5 rounded-md px-2 text-sm text-fg data-[selected=true]:bg-raised [&_svg]:size-4 [&_svg]:text-subtle';

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const templates = useListTemplates(
    orgId,
    { limit: 8, search: search || undefined },
    { query: { enabled: open && search.length > 1 } },
  );
  const phones = useListPhoneNumbers(orgId, undefined, { query: { enabled: open } });

  const go = (path: string) => {
    onOpenChange(false);
    setSearch('');
    navigate(orgPath(orgId, path));
  };

  const phoneMatches = (phones.data ?? []).filter((p) =>
    `${p.displayPhoneNumber} ${p.verifiedName} ${p.metaPhoneNumberId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[16vh] max-w-xl gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{tr('Search')}</DialogTitle>
        <Command shouldFilter label={tr('Search')} className="flex flex-col">
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder={tr('Search pages, templates, phone numbers…')}
            className="h-12 border-b border-border bg-transparent px-4 text-sm text-fg outline-none placeholder:text-subtle"
          />
          <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
              {tr('No results.')}
            </Command.Empty>
            <Command.Group
              heading={tr('Go to')}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle"
            >
              {PAGES.map(([label, path]) => (
                <Command.Item
                  key={path}
                  value={tr(label)}
                  keywords={[label]}
                  onSelect={() => go(path)}
                  className={itemClass}
                >
                  <ArrowRight /> {tr(label)}
                </Command.Item>
              ))}
            </Command.Group>
            {phoneMatches.length > 0 && search && (
              <Command.Group
                heading={tr('Phone numbers')}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle"
              >
                {phoneMatches.slice(0, 6).map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`phone ${p.displayPhoneNumber} ${p.verifiedName} ${p.metaPhoneNumberId}`}
                    onSelect={() => go(`phone-numbers/${p.id}`)}
                    className={itemClass}
                  >
                    <Phone /> {formatPhone(p.displayPhoneNumber)}
                    <span className="truncate text-muted">{p.verifiedName}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {(templates.data?.items.length ?? 0) > 0 && (
              <Command.Group
                heading={tr('Templates')}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle"
              >
                {templates.data?.items.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={`template ${t.name} ${t.language} ${search}`}
                    onSelect={() => go(`templates/${t.id}`)}
                    className={itemClass}
                  >
                    <FileText /> <span className="font-mono text-[13px]">{t.name}</span>
                    <span className="text-muted">{t.language}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
