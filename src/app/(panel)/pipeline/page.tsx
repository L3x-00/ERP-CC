import { TableroKanban } from '@/modulos/pipeline/componentes/tablero-kanban';

/**
 * Página del pipeline (CRM). Server Component: la carga de datos y el tablero
 * Kanban interactivo viven en el cliente (TanStack Query dentro de TableroKanban).
 */
export default function PaginaPipeline() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Pipeline</h1>
      <TableroKanban />
    </div>
  );
}
