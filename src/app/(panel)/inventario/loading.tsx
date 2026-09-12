import { Skeleton, SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Carga de la pantalla: título, acciones y tabla con la estructura real. */
export default function Cargando() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" aria-busy="true" aria-label="Cargando inventario">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-28" />
      </div>
      <SkeletonTabla filas={7} columnas={7} />
    </div>
  );
}