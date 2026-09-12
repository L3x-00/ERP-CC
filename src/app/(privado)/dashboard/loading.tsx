import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Carga del dashboard: rejilla de KPIs y secciones imitando la pantalla real. */
export default function CargandoDashboard() {
  return (
    <div
      className="mx-auto flex max-w-7xl flex-col gap-6"
      aria-busy="true"
      aria-label="Cargando dashboard"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <section aria-label="Indicadores clave" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, indice) => (
          <Skeleton key={indice} className="h-32 rounded-lg" />
        ))}
      </section>
      <section aria-label="Sección financiera" className="grid gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-56 rounded-lg" />
      </section>
      <section aria-label="Sección de pipeline" className="grid gap-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-56 rounded-lg" />
      </section>
    </div>
  );
}
