/** Esqueleto de la cola de entregas mientras el Server Component resuelve. */
export default function CargandoEntregas() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" role="status" aria-label="Cargando entregas">
      <div className="h-8 w-48 animate-pulse rounded bg-superficie-2" />
      <div className="h-4 w-96 animate-pulse rounded bg-superficie-2" />
      <div className="h-64 animate-pulse rounded-lg border border-borde bg-superficie-2" />
    </div>
  );
}
