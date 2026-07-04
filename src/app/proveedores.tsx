'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

/**
 * Proveedores de la aplicación: TanStack Query + devtools.
 * QueryClient se crea en estado para evitar compartirlo entre requests SSR.
 */
export default function ProveedoresApp({ children }: { children: ReactNode }) {
  const [clienteQuery] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutos
            gcTime: 1000 * 60 * 10, // 10 minutos
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={clienteQuery}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
