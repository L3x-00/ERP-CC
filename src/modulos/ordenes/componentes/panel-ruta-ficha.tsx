import { claveValor } from '@/modulos/ordenes/utilidades/formato-ficha';
import type { ItemSnapshotOrden } from '@/modulos/ordenes/tipos/orden-sii';

export function PanelRutaFicha({ ruta }: { ruta: ItemSnapshotOrden[] }) {
  return (
    <section className="grid gap-3" data-testid="ficha-panel-ruta">
      {ruta.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin ruteo en el snapshot.</p>
      ) : ruta.map((item) => (
        <article key={item.codigo ?? item.codigo_item} className="rounded-md border border-borde p-3">
          <h3 className="font-mono text-sm font-semibold">{item.codigo ?? item.codigo_item}</h3>
          <ol className="mt-2 grid gap-1 text-sm">
            {(item.ruteo ?? []).map((paso, indice) => (
              <li key={indice} className="flex flex-wrap gap-2 text-texto-secundario">
                <span className="font-semibold text-texto-primario">{String((paso as Record<string, unknown>).secuencia ?? indice + 1)}.</span>
                <span>{String((paso as Record<string, unknown>).proceso_nombre ?? 'Proceso')}</span>
                <span>setup {claveValor((paso as Record<string, unknown>).setup_horas)} h · run {claveValor((paso as Record<string, unknown>).run_horas)} h</span>
              </li>
            ))}
            {(item.operaciones ?? []).length > 0 && (item.ruteo ?? []).length === 0 ? (
              (item.operaciones ?? []).map((operacion, indice) => (
                <li key={indice} className="text-texto-secundario">
                  {String((operacion as Record<string, unknown>).nombre ?? (operacion as Record<string, unknown>).codigo ?? 'Operación')}
                </li>
              ))
            ) : null}
          </ol>
        </article>
      ))}
    </section>
  );
}
