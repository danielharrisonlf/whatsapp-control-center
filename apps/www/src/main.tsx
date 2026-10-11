import { useLocale } from '@/lib/i18n';
import '@/styles.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { setApiBaseUrl, setUnauthorizedHandler } from '@wacc/api-client';
import { TooltipProvider } from '@wacc/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { router } from '@/router';

setApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? '/api');
setUnauthorizedHandler(() => {
  queryClient.clear();
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  if (!window.location.pathname.startsWith('/login')) router.navigate(`/login?next=${next}`);
});

function ThemedToaster() {
  useLocale();
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!bg-overlay !border-border !text-fg !shadow-overlay !rounded-lg',
          description: '!text-muted',
        },
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
