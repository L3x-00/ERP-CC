'use client';

import { useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import type { MarcaDocumento } from '@/compartido/utilidades/impresion-documento';
import { HojaTrabajoDocumento } from '@/modulos/ordenes/componentes/hoja-trabajo-documento';
import { Totales } from '@/modulos/ordenes/componentes/tarjeta-ficha';
import type { FichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import { imprimirHojaTrabajo } from '@/modulos/ordenes/utilidades/imprimir-hoja-trabajo';

/**
 * Documento de la orden. Todo rol con orden_vista ve la hoja de trabajo (ITxx, cantidad, material,
 * espesor, procesos, observaciones y archivos); el bloque Totales se añade solo con orden_ver_totales.
 * «Imprimir orden» compone un documento aislado con la marca de la empresa: nunca imprime la
 * barra lateral ni el resto de la pantalla.
 */
export function PanelDocumentoFicha({
  ficha,
  folio,
  puedeVerTotales,
  marca,
}: {
  ficha: FichaOrden;
  folio: string;
  puedeVerTotales: boolean;
  marca?: MarcaDocumento | null;
}) {
  const hoja = ficha.hojaTrabajo;
  const [errorImpresion, setErrorImpresion] = useState<string | null>(null);
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

  function imprimir(): void {
    setErrorImpresion(null);
    void imprimirHojaTrabajo({
      hoja: hoja ?? {
        folio,
        clienteNombre: ficha.orden.clienteNombre,
        observacionesOrden: ficha.orden.notas,
        items: ficha.partidas.map((partida) => ({
          codigoItem: partida.codigoItem ?? partida.codigoPieza,
          descripcion: partida.descripcion,
          cantidad: partida.cantidadSolicitada,
          material: null,
          espesor: null,
          procesos: partida.procesos,
          observaciones: null,
        })),
        archivos: ficha.archivos,
      },
      marca: marca ?? null,
      totales: puedeVerTotales ? ficha.totales : null,
      compromiso,
    }).catch(() => {
      setErrorImpresion('No se pudo abrir la impresión. Revisa el bloqueo de ventanas del navegador.');
    });
  }

  return (
    <section className="grid gap-4" data-testid="ficha-panel-documento">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        {errorImpresion ? (
          <p role="alert" className="mr-auto text-sm text-peligro-texto">{errorImpresion}</p>
        ) : null}
        <Button variante="contorno" tamano="sm" onClick={imprimir} data-testid="imprimir-orden">
          Imprimir orden
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
