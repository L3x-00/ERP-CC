import { redirect } from 'next/navigation';

type ParametrosPaginaCobranza = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** La ruta histórica de cobranza vive ahora dentro del módulo de Cobros. */
export default async function PaginaCobranza({ searchParams }: ParametrosPaginaCobranza) {
  const parametros = searchParams ? await searchParams : {};
  const aging = typeof parametros.aging === 'string' ? parametros.aging : null;
  const destino = new URLSearchParams({ seccion: 'cobranza' });
  if (aging) destino.set('aging', aging);
  redirect(`/cobros?${destino.toString()}`);
}
