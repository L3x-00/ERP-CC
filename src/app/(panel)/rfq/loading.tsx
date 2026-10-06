import { Skeleton, SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Carga de la cola/ficha RFQ con la estructura real. */
export default function Cargando() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando RFQ">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <SkeletonTabla filas={5} columnas={8} />
    </div>
  );
}
