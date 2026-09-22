import { TableroKanban } from '@/modulos/pipeline/componentes/tablero-kanban';

type ParametrosPaginaPipeline = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Página del pipeline (CRM). Server Component: la carga de datos y el tablero
 * Kanban interactivo viven en el cliente (TanStack Query dentro de TableroKanban).
 *
 * OBS-11: `?oportunidad=<id>` abre el editor de esa cotización al entrar, para
 * que el historial del cliente pueda enlazar al registro original.
 */
export default async function PaginaPipeline({ searchParams }: ParametrosPaginaPipeline) {
  const parametros = searchParams ? await searchParams : {};
  const oportunidadInicialId =
    typeof parametros.oportunidad === 'string' ? parametros.oportunidad : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Pipeline</h1>
      <TableroKanban oportunidadInicialId={oportunidadInicialId} />
    </div>
  );
}
