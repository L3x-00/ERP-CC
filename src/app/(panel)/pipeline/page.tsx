import { redirect } from 'next/navigation';

type ParametrosPaginaPipeline = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * SII-B3 ola 2: la cola del pipeline se movió a `/rfq`. Esta ruta conserva los
 * enlaces históricos (incluido `?oportunidad=<id>`) redirigiendo con su query.
 */
export default async function PaginaPipeline({ searchParams }: ParametrosPaginaPipeline) {
  const parametros = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (typeof valor === 'string') query.set(clave, valor);
  }
  const cadena = query.toString();
  redirect(cadena ? `/rfq?${cadena}` : '/rfq');
}
