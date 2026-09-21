'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { obtenerDocumentoNotaEntregaAccion } from '@/modulos/produccion/acciones/obtener-documento-nota-entrega';
import { formatearFecha, formatearNumero } from '@/compartido/utilidades/formatear';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';

/**
 * Nota de entrega imprimible (OBS-13): conforma el registro persistido con la
 * confirmación de quién recibió. “Reimprimir” es volver a abrir este documento;
 * el navegador imprime o guarda como PDF, sin archivo intermedio. No contiene
 * precios, igual que la nota registrada.
 */
export function NotaEntregaDocumentoBoton({ notaId, folio }: { notaId: string; folio: string }) {
  const [abierto, setAbierto] = useState(false);
  const consulta = useQuery({
    queryKey: ['produccion', 'nota-entrega-documento', notaId],
    queryFn: async () => {
      const respuesta = await obtenerDocumentoNotaEntregaAccion({ notaId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La nota no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: abierto,
    staleTime: 60_000,
  });
  const documento = consulta.data;

  return (
    <>
      <Button
        type="button"
        variante="contorno"
        tamano="sm"
        data-testid={`imprimir-nota-${folio}`}
        onClick={() => setAbierto(true)}
      >
        Imprimir
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent
          aria-label={`Nota de entrega ${folio}`}
          className="max-h-[85vh] max-w-3xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Nota de entrega {folio}</DialogTitle>
            <DialogDescription>
              Conformidad de la entrega con su confirmación. Imprime o guarda como PDF; reimprimir
              es volver a abrir este documento.
            </DialogDescription>
          </DialogHeader>

          {consulta.isLoading && <p className="text-sm text-texto-secundario">Cargando nota…</p>}
          {consulta.isError && (
            <p role="alert" className="text-sm text-peligro-texto">
              No se pudo cargar la nota de entrega.
            </p>
          )}

          {documento && (
            <>
              <div
                id="nota-entrega-print"
                data-testid="documento-nota-entrega"
                className="flex flex-col gap-4 text-sm"
              >
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
                    <span className="font-mono text-sm font-semibold">{documento.nota.folio}</span>
                    <span className="text-xs text-texto-secundario">
                      {documento.nota.esParcial ? 'Entrega parcial' : 'Entrega total'}
                    </span>
                    <span className="text-xs text-texto-secundario">
                      Fecha: {formatearFecha(documento.nota.creadoEn)}
                    </span>
                    <span className="font-mono text-xs text-texto-secundario">
                      Orden: {documento.orden.folio}
                    </span>
                  </div>
                </header>

                <section className="flex flex-col">
                  <span className="text-xs font-medium uppercase text-texto-secundario">Cliente</span>
                  <span>{documento.orden.clienteRazonSocial ?? 'Sin cliente registrado'}</span>
                  {documento.orden.clienteRfc && (
                    <span className="text-xs text-texto-secundario">RFC: {documento.orden.clienteRfc}</span>
                  )}
                </section>

                <section className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">Piezas entregadas</h3>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-borde">
                        <th className="py-1 pr-2 font-medium">Código</th>
                        <th className="py-1 pr-2 font-medium">Descripción</th>
                        <th className="py-1 pr-2 text-right font-medium">Esta nota</th>
                        <th className="py-1 pr-2 text-right font-medium">Entregado acumulado</th>
                        <th className="py-1 text-right font-medium">Solicitado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documento.lineas.map((linea) => (
                        <tr key={linea.codigoPieza} className="border-b border-borde/60">
                          <td className="py-1 pr-2 font-mono">{linea.codigoPieza}</td>
                          <td className="py-1 pr-2">{linea.descripcion ?? '—'}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearNumero(linea.cantidadNota, 2)} {linea.unidadMedida}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearNumero(linea.entregadoAcumulado, 2)} /{' '}
                            {formatearNumero(linea.cantidadSolicitada, 2)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatearNumero(linea.cantidadSolicitada, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-texto-secundario">
                    Total de esta nota: {formatearNumero(documento.totalNota, 2)} pieza(s) ·
                    acumulado {formatearNumero(documento.totalAcumulado, 2)} de{' '}
                    {formatearNumero(documento.totalSolicitado, 2)}.
                  </p>
                </section>

                <section className="grid gap-3 border-t border-borde pt-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium uppercase text-texto-secundario">
                      Recibido por (confirmación)
                    </span>
                    <span className="font-medium">{documento.nota.recibidoPor}</span>
                    {documento.nota.firmaClienteUrl ? (
                      <a
                        className="text-xs text-enlace underline"
                        href={documento.nota.firmaClienteUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Ver firma adjunta
                      </a>
                    ) : (
                      <span className="mt-6 border-t border-borde-fuerte pt-1 text-xs text-texto-secundario">
                        Firma de conformidad
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium uppercase text-texto-secundario">
                      Entregado por
                    </span>
                    <span>{documento.empresa.razonSocial || documento.empresa.nombre}</span>
                    <span className="mt-6 border-t border-borde-fuerte pt-1 text-xs text-texto-secundario">
                      Firma de quien entrega
                    </span>
                  </div>
                </section>
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
                #nota-entrega-print, #nota-entrega-print * { visibility: visible; }
                #nota-entrega-print { position: absolute; left: 0; top: 0; width: 100%; }
              }`}</style>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
