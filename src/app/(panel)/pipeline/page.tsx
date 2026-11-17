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
  // Marca el origen para que `/rfq` pueda mostrar la aclaración del modelo
  // (la oportunidad es el RFQ). Conserva los deep-links históricos.
  query.set('desde', 'pipeline');
  redirect(`/rfq?${query.toString()}`);
}
