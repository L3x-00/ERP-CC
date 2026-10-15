import { Button } from '@/compartido/componentes/ui/button';
import { Totales } from '@/modulos/ordenes/componentes/tarjeta-ficha';
import type { FichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import { claveValor, formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';

export function PanelDocumentoFicha({ ficha, folio }: { ficha: FichaOrden; folio: string }) {
  return (
    <section className="grid gap-4" data-testid="ficha-panel-documento">
      <div className="flex justify-end print:hidden">
        <Button variante="contorno" tamano="sm" onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      <article className="rounded-lg border border-borde p-6">
        <header className="border-b border-borde pb-3">
          <h2 className="text-lg font-bold">Orden de servicio {folio}</h2>
          <p className="text-sm text-texto-secundario">
            {ficha.orden.clienteNombre ?? ''} · Compromiso comercial{' '}
            {ficha.orden.fechaCompromisoComercial
              ? formatearFechaCalendario(ficha.orden.fechaCompromisoComercial)
              : 'no disponible'}
          </p>
        </header>
        {ficha.snapshot ? (
          <div className="mt-4 grid gap-3 text-sm">
            {(ficha.snapshot.items ?? []).filter((item) => !item.es_descuento).map((item) => (
              <div key={item.codigo ?? item.codigo_item} className="rounded-md bg-superficie-2 p-3">
                <p className="font-semibold">
                  {item.codigo ?? item.codigo_item} · {item.descripcion ?? ''}
                </p>
                <p className="text-xs text-texto-secundario">
                  {claveValor(item.cantidad)} · {item.material ?? 'sin material'} · {item.espesor ?? 'sin espesor'}
                </p>
                {(item.ruteo ?? []).length > 0 ? (
                  <p className="text-xs text-texto-secundario">
                    {(item.ruteo ?? []).map((paso) => String((paso as Record<string, unknown>).proceso_nombre ?? '')).join(' → ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-texto-secundario">
            Orden anterior al flujo SII; documento basado en sus partidas:
            {' '}{ficha.partidas.map((partida) => partida.descripcion ?? partida.codigoPieza).join(' · ')}
          </p>
        )}
        <div className="mt-4">
          <Totales totales={ficha.totales} />
        </div>
      </article>
    </section>
  );
}
