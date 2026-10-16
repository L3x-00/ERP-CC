import { Button } from '@/compartido/componentes/ui/button';
import { HojaTrabajoDocumento } from '@/modulos/ordenes/componentes/hoja-trabajo-documento';
import { Totales } from '@/modulos/ordenes/componentes/tarjeta-ficha';
import type { FichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';

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
  const compromiso = `Compromiso comercial ${
    ficha.orden.fechaCompromisoComercial
      ? formatearFechaCalendario(ficha.orden.fechaCompromisoComercial)
      : 'no disponible'
  }`;
  const totales = puedeVerTotales ? (
    <div className="mt-4">
      <Totales totales={ficha.totales} />
    </div>
  ) : null;

  return (
    <section className="grid gap-4" data-testid="ficha-panel-documento">
      <div className="flex justify-end print:hidden">
        <Button variante="contorno" tamano="sm" onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      {hoja ? (
        <HojaTrabajoDocumento hoja={hoja} detalleEncabezado={compromiso}>{totales}</HojaTrabajoDocumento>
      ) : (
        <article className="rounded-lg border border-borde p-6">
          <header className="border-b border-borde pb-3">
            <h2 className="text-lg font-bold">Orden de servicio {folio}</h2>
            <p className="text-sm text-texto-secundario">
              {ficha.orden.clienteNombre ?? ''} · {compromiso}
            </p>
          </header>
          <p className="mt-4 text-sm text-texto-secundario">
            Orden anterior al flujo SII; documento basado en sus partidas:
            {' '}{ficha.partidas.map((partida) => partida.descripcion ?? partida.codigoPieza).join(' · ')}
          </p>
          {totales}
        </article>
      )}
    </section>
  );
}
