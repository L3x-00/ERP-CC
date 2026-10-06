import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Esqueleto de carga de la cola/ficha de propuestas. */
export default function CargandoPropuestas() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
