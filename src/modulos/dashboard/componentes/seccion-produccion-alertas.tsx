import type { ResumenOrdenesDashboard } from '@/modulos/dashboard/tipos/indice';

export function SeccionProduccionAlertas({ ordenes }: { ordenes: ResumenOrdenesDashboard }) {
  return (
    <section aria-labelledby="titulo-produccion-dashboard" className="grid gap-3">
      <h2 id="titulo-produccion-dashboard" className="text-xl font-semibold">Alertas de producción</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-base border border-foreground/15 bg-background p-4"><p className="text-xs text-foreground/65">Aprobaciones pendientes</p><p className="mt-1 text-2xl font-bold tabular-nums">{ordenes.aprobacionesPendientes}</p></article>
        <article className="rounded-base border border-foreground/15 bg-background p-4"><p className="text-xs text-foreground/65">Órdenes activas</p><p className="mt-1 text-2xl font-bold tabular-nums">{ordenes.activas}</p></article>
        <article className="rounded-base border border-red-500/30 bg-background p-4"><p className="text-xs text-foreground/65">Órdenes atrasadas</p><p className="mt-1 text-2xl font-bold tabular-nums">{ordenes.atrasadas}</p></article>
        <article className="rounded-base border border-amber-500/30 bg-background p-4"><p className="text-xs text-foreground/65">En riesgo (3 días)</p><p className="mt-1 text-2xl font-bold tabular-nums">{ordenes.enRiesgo}</p></article>
        <article className="rounded-base border border-foreground/15 bg-background p-4"><p className="text-xs text-foreground/65">Completadas</p><p className="mt-1 text-2xl font-bold tabular-nums">{ordenes.completadas}</p></article>
      </div>
    </section>
  );
}
