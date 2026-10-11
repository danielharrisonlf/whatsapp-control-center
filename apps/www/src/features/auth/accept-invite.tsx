import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useAcceptInvitation, useGetMe } from '@wacc/api-client';
import { Button } from '@wacc/ui';
import { useNavigate, useParams } from 'react-router';
import { AuthFrame } from '@/components/app-shell';
import { ErrorPanel } from '@/components/states';
import { t as tr, useLocale } from '@/lib/i18n';

export function AcceptInvitePage() {
  useLocale();
  const { token } = useParams<{ token: string }>();
  const me = useGetMe();
  const accept = useAcceptInvitation();
  const qc = useQueryClient();
  const navigate = useNavigate();

  return (
    <AuthFrame>
      <h1 className="text-lg font-semibold text-fg">{tr('Join organization')}</h1>
      <p className="mt-1 text-sm text-muted">
        {tr('You are signed in as')} <span className="font-medium text-fg">{me.data?.user.email}</span>
        {tr('. The invitation must have been sent to this email.')}
      </p>
      {accept.error && <ErrorPanel className="mt-4" error={accept.error} />}
      <Button
        className="mt-5 w-full"
        variant="primary"
        size="lg"
        loading={accept.isPending}
        onClick={() =>
          accept.mutate(
            { data: { token: token! } },
            {
              onSuccess: async (org) => {
                await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
                navigate(`/o/${org.id}`, { replace: true });
              },
            },
          )
        }
      >
        {tr('Accept invitation')}
      </Button>
    </AuthFrame>
  );
}
