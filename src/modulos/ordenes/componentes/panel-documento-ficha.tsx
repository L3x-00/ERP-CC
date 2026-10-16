import { Button } from '@/compartido/componentes/ui/button';
import { Totales } from '@/modulos/ordenes/componentes/tarjeta-ficha';
import type { FichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import { claveValor, formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';

/**
 * Documento de la orden. Todo rol con orden_vista ve la hoja de trabajo (ITxx, cantidad, material,
 * espesor, procesos, observaciones y archivos); el bloque Totales se añade solo con orden_ver_totales.
 * El marcado es el mismo: la hoja nunca contiene precios, así que no hay nada que ocultar al imprimir.
 */
export function PanelDocumentoFicha({
  ficha,
  folio,
  puedeVerTotales,
}: {
  ficha: FichaOrden;
  folio: string;
  puedeVerTotales: boolean;
}) {
  const hoja = ficha.hojaTrabajo;
  return (
    <section className="grid gap-4" data-testid="ficha-panel-documento">
      <div className="flex justify-end print:hidden">
        <Button variante="contorno" tamano="sm" onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      <article className="rounded-lg border border-borde p-6">
        <header className="border-b border-borde pb-3">
          <h2 className="text-lg font-bold">Orden de servicio {hoja?.folio ?? folio}</h2>
          <p className="text-sm text-texto-secundario">
            {(hoja?.clienteNombre ?? ficha.orden.clienteNombre) ?? ''} · Compromiso comercial{' '}
            {ficha.orden.fechaCompromisoComercial
              ? formatearFechaCalendario(ficha.orden.fechaCompromisoComercial)
              : 'no disponible'}
          </p>
        </header>
        {hoja ? (
          <div className="mt-4 grid gap-3 text-sm">
            {hoja.items.map((item) => (
              <div key={item.codigoItem} className="rounded-md bg-superficie-2 p-3">
                <p className="font-semibold">
                  {item.codigoItem} · {item.descripcion ?? ''}
                </p>
                <p className="text-xs text-texto-secundario">
                  {claveValor(item.cantidad)} · {item.material ?? 'sin material'} · {item.espesor ?? 'sin espesor'}
                </p>
                {item.procesos.length > 0 ? (
                  <p className="text-xs text-texto-secundario">{item.procesos.join(' → ')}</p>
                ) : null}
                {item.observaciones ? (
                  <p className="whitespace-pre-wrap text-xs text-texto-secundario">
                    Observaciones: {item.observaciones}
                  </p>
                ) : null}
              </div>
            ))}
            {hoja.observacionesOrden ? (
              <p className="whitespace-pre-wrap rounded-md border border-borde p-3 text-texto-secundario">
                Observaciones de la orden: {hoja.observacionesOrden}
              </p>
            ) : null}
            {hoja.archivos.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold text-texto-secundario">Archivos</h3>
                <ul className="mt-1 grid gap-0.5 text-xs">
                  {hoja.archivos.map((archivo) => (
                    <li key={archivo.archivoId}>
                      {archivo.nombreOriginal ?? archivo.nombreErp ?? 'Archivo sin nombre'}
                      <span className="text-texto-secundario"> · {archivo.asociadoA}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-texto-secundario">
            Orden anterior al flujo SII; documento basado en sus partidas:
            {' '}{ficha.partidas.map((partida) => partida.descripcion ?? partida.codigoPieza).join(' · ')}
          </p>
        )}
        {puedeVerTotales ? (
          <div className="mt-4">
            <Totales totales={ficha.totales} />
          </div>
        ) : null}
      </article>
    </section>
  );
}
