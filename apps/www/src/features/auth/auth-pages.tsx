import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useGetAuthConfig, useLogin, useRegister } from '@wacc/api-client';
import { Button, Field, Input } from '@wacc/ui';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { AuthFrame } from '@/components/app-shell';
import { ErrorPanel } from '@/components/states';
import { t as tr, useLocale } from '@/lib/i18n';

function safeNext(next: string | null) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const loginSchema = z.object({
  email: z.email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
});

export function LoginPage() {
  useLocale();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const login = useLogin();
  const config = useGetAuthConfig();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit((data) =>
    login.mutate(
      { data },
      {
        onSuccess: (me) => {
          qc.setQueryData(getGetMeQueryKey(), me);
          navigate(safeNext(params.get('next')), { replace: true });
        },
      },
    ),
  );

  return (
    <AuthFrame
      footer={
        config.data?.signupEnabled && (
          <>
            {tr('New here?')}{' '}
            <Link
              to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
              className="font-medium text-accent-text hover:underline"
            >
              {tr('Create an account')}
            </Link>
          </>
        )
      }
    >
      <h1 className="text-lg font-semibold text-fg">{tr('Sign in')}</h1>
      <p className="mt-1 text-sm text-muted">{tr('Manage your WhatsApp Business Platform setup.')}</p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4" noValidate>
        <Field label={tr('Email')} htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </Field>
        <Field label={tr('Password')} htmlFor="password" error={form.formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        </Field>
        {login.error && <ErrorPanel error={login.error} />}
        <Button type="submit" variant="primary" size="lg" loading={login.isPending}>
          {tr('Sign in')}
        </Button>
      </form>
    </AuthFrame>
  );
}

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.'),
  email: z.email('Enter a valid email.'),
  password: z.string().min(12, 'Use at least 12 characters.'),
});

export function RegisterPage() {
  useLocale();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const register = useRegister();
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = form.handleSubmit((data) =>
    register.mutate(
      { data },
      {
        onSuccess: (me) => {
          qc.setQueryData(getGetMeQueryKey(), me);
          navigate(params.get('next') ? safeNext(params.get('next')) : '/onboarding', { replace: true });
        },
      },
    ),
  );

  return (
    <AuthFrame
      footer={
        <>
          {tr('Already have an account?')}{' '}
          <Link to="/login" className="font-medium text-accent-text hover:underline">
            {tr('Sign in')}
          </Link>
        </>
      }
    >
      <h1 className="text-lg font-semibold text-fg">{tr('Create your account')}</h1>
      <p className="mt-1 text-sm text-muted">{tr('You will create or join an organization next.')}</p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4" noValidate>
        <Field label={tr('Name')} htmlFor="name" error={form.formState.errors.name?.message}>
          <Input id="name" autoComplete="name" autoFocus {...form.register('name')} />
        </Field>
        <Field label={tr('Email')} htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field
          label={tr('Password')}
          htmlFor="password"
          hint={tr('At least 12 characters.')}
          error={form.formState.errors.password?.message}
        >
          <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        {register.error && <ErrorPanel error={register.error} />}
        <Button type="submit" variant="primary" size="lg" loading={register.isPending}>
          {tr('Create account')}
        </Button>
      </form>
    </AuthFrame>
  );
}
