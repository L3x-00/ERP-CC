'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { formatearFecha, formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { Button } from '@/compartido/componentes/ui/button';
import {
  ETIQUETA_SITUACION_ORDEN,
  resumirOrdenesEstadoCuenta,
} from '@/modulos/cobranza/servicios/estado-cuenta-servicio';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';

/** Días de atraso de un vencimiento (0 si aún no vence o la fecha es inválida). */
function diasDeAtraso(fechaVencimiento: string): number {
  const vencimiento = new Date(fechaVencimiento).getTime();
  if (!Number.isFinite(vencimiento)) return 0;
  const dias = Math.floor((Date.now() - vencimiento) / 86_400_000);
  return dias > 0 ? dias : 0;
}

/**
 * Estado de cuenta consolidado por cliente (OBS-27): todas sus cuentas por
 * cobrar con monto, abonado, saldo, vencimiento y días de atraso, más el total
 * de cartera convertido a MXN con el TC de origen. Imprimible/descargable con
 * la impresión del navegador; no envía nada al cliente (acción manual aparte).
 *
 * La lectura va con el cliente del navegador bajo RLS: quien no tenga
 * `ver_finanzas` simplemente no recibe filas.
 */
export function EstadoCuentaClienteBoton({
  clienteId,
  clienteNombre,
}: {
  clienteId: string;
  clienteNombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const consulta = useQuery({
    queryKey: ['cobranza', 'estado-cuenta', clienteId],
    queryFn: async () => {
      const cliente = crearClienteSupabase();
      const [ficha, cuentas, ordenes] = await Promise.all([
        cliente
          .from('clientes')
          .select('razon_social, rfc, condiciones_pago, contacto')
          .eq('id', clienteId)
          .maybeSingle(),
        cliente
          .from('cuentas_por_cobrar')
          .select('*')
          .eq('cliente_id', clienteId)
          .order('fecha_vencimiento', { ascending: true }),
        cliente
          .from('ordenes_produccion')
          .select(
            'id, folio, estado, fecha_compromiso, es_interna, cotizacion_id, creado_en, partidas_orden_produccion(cantidad_solicitada, cantidad_producida), pipeline(folio_cnc, moneda)',
          )
          .eq('cliente_id', clienteId)
          .order('creado_en', { ascending: false }),
      ]);
      if (ficha.error) throw new Error(ficha.error.message);
      if (cuentas.error) throw new Error(cuentas.error.message);
      if (ordenes.error) throw new Error(ordenes.error.message);

      const idsCotizacion = [
        ...new Set(
          (ordenes.data ?? []).flatMap((orden) =>
            orden.cotizacion_id ? [orden.cotizacion_id] : [],
          ),
        ),
      ];
      const lineas =
        idsCotizacion.length > 0
          ? await cliente
              .from('cotizacion_lineas')
              .select('pipeline_id, cantidad, precio_unitario, es_descuento')
              .in('pipeline_id', idsCotizacion)
          : { data: [], error: null };
      if (lineas.error) throw new Error(lineas.error.message);

      const lineasPorCotizacion = new Map<
        string,
        { cantidad: number; precioUnitario: number; esDescuento: boolean }[]
      >();
      for (const linea of lineas.data ?? []) {
        const actuales = lineasPorCotizacion.get(linea.pipeline_id) ?? [];
        actuales.push({
          cantidad: Number(linea.cantidad),
          precioUnitario: Number(linea.precio_unitario),
          esDescuento: linea.es_descuento,
        });
        lineasPorCotizacion.set(linea.pipeline_id, actuales);
      }

      const ordenesResumidas = resumirOrdenesEstadoCuenta(
        (ordenes.data ?? []).map((orden) => {
          const { pipeline, partidas_orden_produccion, ...base } = orden;
          return {
            id: base.id,
            folio: base.folio,
            estado: base.estado,
            fechaCompromiso: base.fecha_compromiso,
            esInterna: base.es_interna,
            cotizacionId: base.cotizacion_id,
            cotizacionFolio: pipeline?.folio_cnc ?? null,
            cotizacionMoneda: pipeline?.moneda ?? 'MXN',
            partidas: (partidas_orden_produccion ?? []).map((partida) => ({
              cantidadSolicitada: Number(partida.cantidad_solicitada),
              cantidadProducida: Number(partida.cantidad_producida),
            })),
          };
        }),
        (cuentas.data ?? []).map((cuenta) => ({
          ordenId: cuenta.orden_id,
          montoTotal: Number(cuenta.monto_total),
          saldoPendiente: Number(cuenta.saldo_pendiente),
          estado: cuenta.estado,
          fechaVencimiento: cuenta.fecha_vencimiento,
          moneda: cuenta.moneda,
        })),
        lineasPorCotizacion,
        new Date(),
      );

      return { ficha: ficha.data, cuentas: cuentas.data ?? [], ordenes: ordenesResumidas };
    },
    enabled: abierto,
    staleTime: 60_000,
  });
  const datos = consulta.data;
  const cuentas = datos?.cuentas ?? [];
  const saldoTotalMxn = cuentas.reduce((suma, cuenta) => {
    const tipoCambio =
      cuenta.moneda === 'USD' && Number(cuenta.tipo_cambio_origen) > 0
        ? Number(cuenta.tipo_cambio_origen)
        : 1;
    return suma + Number(cuenta.saldo_pendiente) * tipoCambio;
  }, 0);
  const saldoVencidoMxn = cuentas
    .filter((cuenta) => cuenta.estado !== 'cancelado' && cuenta.estado !== 'pagado')
    .filter((cuenta) => diasDeAtraso(cuenta.fecha_vencimiento) > 0)
    .reduce((suma, cuenta) => {
      const tipoCambio =
        cuenta.moneda === 'USD' && Number(cuenta.tipo_cambio_origen) > 0
          ? Number(cuenta.tipo_cambio_origen)
          : 1;
      return suma + Number(cuenta.saldo_pendiente) * tipoCambio;
    }, 0);

  return (
    <>
      <Button
        type="button"
        variante="fantasma"
        tamano="sm"
        data-testid={`estado-cuenta-${clienteId}`}
        onClick={() => setAbierto(true)}
      >
        Estado de cuenta
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent
          aria-label={`Estado de cuenta de ${clienteNombre}`}
          className="max-h-[85vh] max-w-3xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Estado de cuenta · {clienteNombre}</DialogTitle>
            <DialogDescription>
              Órdenes con su avance y saldo, más cargos, abonos y vencimientos. Imprime o guarda
              como PDF; el envío al cliente es una acción manual.
            </DialogDescription>
          </DialogHeader>

          {consulta.isLoading && <p className="text-sm text-texto-secundario">Cargando estado de cuenta…</p>}
          {consulta.isError && (
            <p role="alert" className="text-sm text-peligro-texto">
              No se pudo cargar el estado de cuenta.
            </p>
          )}

          {datos && (
            <>
              <div id="estado-cuenta-print" className="flex flex-col gap-4 text-sm">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-3">
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-texto-primario">
                      {datos.ficha?.razon_social ?? clienteNombre}
                    </span>
                    {datos.ficha?.rfc && (
                      <span className="text-xs text-texto-secundario">RFC: {datos.ficha.rfc}</span>
                    )}
                    {datos.ficha?.contacto && (
                      <span className="text-xs text-texto-secundario">Contacto: {datos.ficha.contacto}</span>
                    )}
                    {datos.ficha?.condiciones_pago && (
                      <span className="text-xs text-texto-secundario">
                        Condiciones: {datos.ficha.condiciones_pago}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-texto-secundario">
                    Generado: {formatearFecha(new Date().toISOString())}
                  </span>
                </header>

                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-borde">
                      <th className="py-1 pr-2 font-medium">Documento</th>
                      <th className="py-1 pr-2 font-medium">Vencimiento</th>
                      <th className="py-1 pr-2 font-medium">Estado</th>
                      <th className="py-1 pr-2 text-right font-medium">Total</th>
                      <th className="py-1 pr-2 text-right font-medium">Abonado</th>
                      <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                      <th className="py-1 text-right font-medium">Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((cuenta) => {
                      const atraso = diasDeAtraso(cuenta.fecha_vencimiento);
                      const esCobrable = cuenta.estado !== 'cancelado' && cuenta.estado !== 'pagado';
                      const abonado = Number(cuenta.monto_total) - Number(cuenta.saldo_pendiente);
                      const moneda: 'MXN' | 'USD' = cuenta.moneda === 'USD' ? 'USD' : 'MXN';
                      return (
                        <tr key={cuenta.id} className="border-b border-borde/60">
                          <td className="py-1 pr-2 font-mono">
                            {cuenta.folio_factura_remision ?? cuenta.moneda}
                          </td>
                          <td className="py-1 pr-2">{formatearFecha(cuenta.fecha_vencimiento)}</td>
                          <td className="py-1 pr-2">
                            {cuenta.estado === 'cancelado'
                              ? 'Cancelado'
                              : cuenta.estado === 'pagado'
                                ? 'Pagado'
                                : atraso > 0
                                  ? 'Vencido'
                                  : 'Vigente'}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearMoneda(Number(cuenta.monto_total), moneda)}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearMoneda(abonado, moneda)}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {formatearMoneda(Number(cuenta.saldo_pendiente), moneda)}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {esCobrable && atraso > 0 ? `${formatearNumero(atraso, 0)} días` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {datos.ordenes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-texto-primario">
                      Órdenes y saldos por orden
                    </h3>
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-borde">
                          <th className="py-1 pr-2 font-medium">Orden</th>
                          <th className="py-1 pr-2 font-medium">Compromiso</th>
                          <th className="py-1 pr-2 text-right font-medium">Avance</th>
                          <th className="py-1 pr-2 text-right font-medium">Cotizado (s/IVA)</th>
                          <th className="py-1 pr-2 text-right font-medium">Abonado</th>
                          <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                          <th className="py-1 font-medium">Cobro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.ordenes.map((orden) => (
                          <tr key={orden.id} className="border-b border-borde/60">
                            <td className="py-1 pr-2 font-mono">
                              {orden.folio}
                              {orden.esInterna && (
                                <span
                                  className="ml-1 rounded-full bg-superficie-2 px-1.5 py-0.5 text-[10px] font-semibold text-texto-secundario"
                                  title="Trabajo interno (TI): no genera cobranza"
                                >
                                  TI
                                </span>
                              )}
                              {orden.cotizacionFolio && (
                                <span className="ml-1 text-texto-tenue">{orden.cotizacionFolio}</span>
                              )}
                            </td>
                            <td className="py-1 pr-2">{formatearFecha(orden.fechaCompromiso)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              {orden.avancePorcentaje}%
                            </td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              {orden.cotizadoSinIva === null
                                ? '—'
                                : formatearMoneda(orden.cotizadoSinIva, orden.moneda)}
                            </td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              {formatearMoneda(orden.abonado, orden.moneda)}
                            </td>
                            <td
                              className={`py-1 pr-2 text-right tabular-nums ${
                                orden.situacion === 'vencido'
                                  ? 'font-medium text-peligro-texto'
                                  : ''
                              }`}
                            >
                              {formatearMoneda(orden.saldo, orden.moneda)}
                            </td>
                            <td className="py-1">{ETIQUETA_SITUACION_ORDEN[orden.situacion]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <dl className="flex flex-col items-end gap-0.5 text-xs">
                  <div className="flex gap-3">
                    <dt className="text-texto-secundario">Saldo total (MXN, TC de origen)</dt>
                    <dd className="w-32 text-right font-medium tabular-nums">
                      {formatearMoneda(saldoTotalMxn, 'MXN')}
                    </dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-texto-secundario">Saldo vencido (MXN)</dt>
                    <dd className="w-32 text-right font-medium tabular-nums text-peligro-texto">
                      {formatearMoneda(saldoVencidoMxn, 'MXN')}
                    </dd>
                  </div>
                </dl>
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
                #estado-cuenta-print, #estado-cuenta-print * { visibility: visible; }
                #estado-cuenta-print { position: absolute; left: 0; top: 0; width: 100%; }
              }`}</style>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
