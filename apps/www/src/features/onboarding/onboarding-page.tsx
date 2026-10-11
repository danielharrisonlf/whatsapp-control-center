import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMeQueryKey,
  getListOrganizationsQueryKey,
  useCreateOrganization,
  useGetMe,
} from '@wacc/api-client';
import { Button, Field, Input } from '@wacc/ui';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthFrame } from '@/components/app-shell';
import { ErrorPanel } from '@/components/states';
import { t as tr, useLocale } from '@/lib/i18n';

const schema = z.object({ name: z.string().trim().min(2, 'Use at least 2 characters.').max(80) });

export function OnboardingPage() {
  useLocale();
  const me = useGetMe();
  const create = useCreateOrganization();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: '' } });
  const existing = me.data?.memberships ?? [];

  const onSubmit = form.handleSubmit((data) =>
    create.mutate(
      { data },
      {
        onSuccess: async (org) => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
            qc.invalidateQueries({ queryKey: getListOrganizationsQueryKey() }),
          ]);
          navigate(`/o/${org.id}/connect`, { replace: true });
        },
      },
    ),
  );

  return (
    <AuthFrame
      footer={
        existing.length > 0 && (
          <Link
            to={`/o/${existing[0]!.organization.id}`}
            className="font-medium text-accent-text hover:underline"
          >
            {tr('Back to')} {existing[0]!.organization.name}
          </Link>
        )
      }
    >
      <h1 className="text-lg font-semibold text-fg">{tr('Create an organization')}</h1>
      <p className="mt-1 text-sm text-muted">
        {tr('Organizations group Meta connections, WhatsApp accounts and members. You will be its owner.')}
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4" noValidate>
        <Field label={tr('Organization name')} htmlFor="org-name" error={form.formState.errors.name?.message}>
          <Input id="org-name" placeholder={tr('Acme Support')} autoFocus {...form.register('name')} />
        </Field>
        {create.error && <ErrorPanel error={create.error} />}
        <Button type="submit" variant="primary" size="lg" loading={create.isPending}>
          {tr('Create organization')}
        </Button>
      </form>
    </AuthFrame>
  );
}
