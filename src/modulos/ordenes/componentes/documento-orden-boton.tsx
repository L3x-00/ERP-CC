'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { obtenerDocumentoOrdenAccion } from '@/modulos/ordenes/acciones/obtener-documento-orden';
import { formatearFecha, formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

/**
 * Detalle de la orden + Orden de Servicio imprimible (ORD-03, DOC-01/03).
 * Muestra lo que se va a fabricar (partidas con área/procesos/horas) y el
 * detalle comercial de la cotización (líneas, descuento restado, IVA y total).
 * “Reimprimir” es volver a abrir este documento: el navegador lo imprime o
 * guarda como PDF; no se genera ni almacena un archivo intermedio.
 */
export function DocumentoOrdenBoton({ ordenId, folio }: { ordenId: string; folio: string }) {
  const [abierto, setAbierto] = useState(false);
  const consulta = useQuery({
    queryKey: ['ordenes', 'documento', ordenId],
    queryFn: async () => {
      const respuesta = await obtenerDocumentoOrdenAccion(ordenId);
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'El documento no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: abierto,
    staleTime: 60_000,
  });

  // Referencia congelada para que el narrowing se conserve dentro de los callbacks.
  const documento = consulta.data;

  return (
    <>
      <Button
        type="button"
        variante="contorno"
        tamano="sm"
        data-testid={`abrir-documento-${ordenId}`}
        onClick={() => setAbierto(true)}
      >
        Documento
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent
          aria-label={`Documento de ${folio}`}
          className="max-h-[85vh] max-w-3xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Orden de servicio {folio}</DialogTitle>
            <DialogDescription>
              Detalle de fabricación y comercial. Imprime o guarda como PDF; reimprimir es volver a abrir este documento.
            </DialogDescription>
          </DialogHeader>

          {consulta.isLoading && <p className="text-sm text-texto-secundario">Cargando documento…</p>}
          {consulta.isError && (
            <p role="alert" className="text-sm text-peligro-texto">
              No se pudo cargar el documento de la orden.
            </p>
          )}

          {documento && (
            <>
              <div id="documento-orden-print" className="flex flex-col gap-4 text-sm">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-3">
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-texto-primario">
                      {documento.empresa.razonSocial || documento.empresa.nombre}
                    </span>
                    {documento.empresa.rfc && (
                      <span className="text-xs text-texto-secundario">RFC: {documento.empresa.rfc}</span>
                    )}
                    {documento.empresa.direccion && (
                      <span className="text-xs text-texto-secundario">{documento.empresa.direccion}</span>
                    )}
                    {documento.empresa.telefono && (
                      <span className="text-xs text-texto-secundario">Tel: {documento.empresa.telefono}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-sm font-semibold">{documento.orden.folio}</span>
                    <span className="text-xs text-texto-secundario">
                      {ETIQUETA_ESTADO[documento.orden.estado] ?? documento.orden.estado}
                      {documento.orden.esInterna ? ' · TI' : ''}
                    </span>
                    <span className="text-xs text-texto-secundario">
                      Creada: {formatearFecha(documento.orden.creadoEn)}
                    </span>
                    <span className="text-xs text-texto-secundario">
                      Compromiso: {formatearFecha(documento.orden.fechaCompromiso)}
                    </span>
                  </div>
                </header>

                <section className="grid gap-1 sm:grid-cols-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium uppercase text-texto-secundario">Cliente</span>
                    <span>{documento.cliente?.razonSocial ?? 'Sin cliente registrado'}</span>
                    {documento.cliente?.rfc && (
                      <span className="text-xs text-texto-secundario">RFC: {documento.cliente.rfc}</span>
                    )}
                    {documento.orden.nombreContacto && (
                      <span className="text-xs text-texto-secundario">Contacto: {documento.orden.nombreContacto}</span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium uppercase text-texto-secundario">Referencias</span>
                    <span>
                      Cotización: {documento.orden.folioCotizacion ?? 'manual'}
                    </span>
                    <span>PO del cliente: {documento.orden.poCliente ?? 'Sin PO'}</span>
                    {documento.orden.notas && (
                      <span className="text-xs text-texto-secundario">Notas: {documento.orden.notas}</span>
                    )}
                  </div>
                </section>

                <section className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">Partidas a fabricar</h3>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-borde">
                        <th className="py-1 pr-2 font-medium">Código</th>
                        <th className="py-1 pr-2 font-medium">Descripción</th>
                        <th className="py-1 pr-2 font-medium">Área / procesos</th>
                        <th className="py-1 pr-2 text-right font-medium">Solicitado</th>
                        <th className="py-1 pr-2 text-right font-medium">Producido</th>
                        <th className="py-1 text-right font-medium">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documento.partidas.map((partida) => (
                        <tr key={partida.codigoPieza} className="border-b border-borde/60">
                          <td className="py-1 pr-2 font-mono">{partida.codigoPieza}</td>
                          <td className="py-1 pr-2">{partida.descripcion ?? '—'}</td>
                          <td className="py-1 pr-2">
                            {[partida.areaTrabajoCodigo, partida.procesos.join(', ')]
                              .filter((valor) => valor !== null && valor !== '')
                              .join(' · ') || '—'}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearNumero(partida.cantidadSolicitada, 2)} {partida.unidadMedida}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearNumero(partida.cantidadProducida, 2)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatearNumero(partida.tiempoRealMinutos / 60, 2)} /{' '}
                            {formatearNumero(partida.tiempoEstimadoMinutos / 60, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {documento.lineas.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold">Detalle comercial de la cotización</h3>
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-borde">
                          <th className="py-1 pr-2 font-medium">Concepto</th>
                          <th className="py-1 pr-2 text-right font-medium">Cantidad</th>
                          <th className="py-1 pr-2 text-right font-medium">Precio</th>
                          <th className="py-1 text-right font-medium">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documento.lineas.map((linea, indice) => (
                          <tr key={`${linea.descripcion}-${indice}`} className="border-b border-borde/60">
                            <td className="py-1 pr-2">
                              {linea.descripcion}
                              {linea.esDescuento ? ' (descuento)' : ''}
                            </td>
                            <td className="py-1 pr-2 text-right tabular-nums">{formatearNumero(linea.cantidad, 2)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              {formatearMoneda(linea.precioUnitario, documento.totales.moneda)}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {linea.esDescuento ? '−' : ''}
                              {formatearMoneda(linea.cantidad * linea.precioUnitario, documento.totales.moneda)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <dl className="mt-2 flex flex-col items-end gap-0.5 text-xs">
                      <div className="flex gap-3">
                        <dt className="text-texto-secundario">Subtotal líneas</dt>
                        <dd className="w-28 text-right tabular-nums">
                          {formatearMoneda(documento.totales.subtotal + documento.totales.descuento, documento.totales.moneda)}
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="text-texto-secundario">Descuento</dt>
                        <dd className="w-28 text-right tabular-nums">
                          −{formatearMoneda(documento.totales.descuento, documento.totales.moneda)}
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="text-texto-secundario">IVA ({documento.totales.ivaPorcentaje}%)</dt>
                        <dd className="w-28 text-right tabular-nums">
                          {formatearMoneda(documento.totales.iva, documento.totales.moneda)}
                        </dd>
                      </div>
                      <div className="flex gap-3 font-semibold">
                        <dt>Total</dt>
                        <dd className="w-28 text-right tabular-nums">
                          {formatearMoneda(documento.totales.total, documento.totales.moneda)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
              </div>

              <div className="flex justify-end gap-2 print:hidden">
                <Button type="button" variante="contorno" onClick={() => setAbierto(false)}>
                  Cerrar
                </Button>
                <Button type="button" onClick={() => window.print()}>
                  Imprimir
                </Button>
              </div>
              <style>{`@media print {
                body * { visibility: hidden; }
                #documento-orden-print, #documento-orden-print * { visibility: visible; }
                #documento-orden-print { position: absolute; left: 0; top: 0; width: 100%; }
              }`}</style>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
