import { Skeleton, SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Carga de la pantalla: título, filtros y tabla con la estructura real. */
export default function Cargando() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" aria-busy="true" aria-label="Cargando actividad">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <SkeletonTabla filas={7} columnas={6} />
    </div>
  );
}
