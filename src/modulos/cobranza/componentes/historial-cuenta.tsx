'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/compartido/componentes/ui/dialog';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerHistorialCuentaAccion, obtenerDetalleOrdenCobranzaAccion, obtenerReciboPagoAccion } from '@/modulos/cobranza/acciones/consultar-historial';
import { etiquetaCondicionCuenta, reconciliarCuenta } from '@/modulos/cobranza/servicios/ficha-cuenta-servicio';
import { ReciboPersistido } from './recibo-persistido';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

async function datosDe<T>(promesa: Promise<RespuestaAccion<T>>): Promise<T> {
  const resultado = await promesa;
  if (!resultado.exito || resultado.datos === undefined) throw new Error('Información no disponible');
  return resultado.datos;
}

function Consulta({ consulta, children }: { consulta: { isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown }; children: ReactNode }) {
  if (consulta.isPending) return <SkeletonTabla filas={3} columnas={3} />;
  if (consulta.isError) return <div role="alert" className="grid gap-2 text-sm text-peligro-texto">No se pudo recuperar la información.<Button variante="contorno" disabled={consulta.isFetching} onClick={() => void consulta.refetch()}>Reintentar</Button></div>;
  return children;
}

function Paginas({ pagina, total, porPagina, cambiar, nombre }: { pagina: number; total: number; porPagina: number; cambiar: (pagina: number) => void; nombre: string }) {
  return <nav aria-label={`Páginas de ${nombre}`} className="flex flex-wrap items-center gap-3 text-sm"><Button variante="contorno" disabled={pagina <= 1} onClick={() => cambiar(pagina - 1)}>Anterior</Button><span>Página {pagina} · {total} registros</span><Button variante="contorno" disabled={pagina * porPagina >= total} onClick={() => cambiar(pagina + 1)}>Siguiente</Button></nav>;
}

export function ReciboPagoConsulta({ pagoId }: { pagoId: string }) {
  const consulta = useQuery({ queryKey: ['cobranza', 'recibo', pagoId], queryFn: () => datosDe(obtenerReciboPagoAccion({ pagoId })), staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 60_000 });
  return <Consulta consulta={consulta}>{consulta.data && <ReciboPersistido recibo={consulta.data} />}</Consulta>;
}

export function DetalleOrdenCobranza({ ordenId }: { ordenId: string }) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({ queryKey: ['cobranza', 'orden', ordenId, pagina], queryFn: () => datosDe(obtenerDetalleOrdenCobranzaAccion({ ordenId, paginaPartidas: pagina })) });
  const datos = consulta.data;
  return <Consulta consulta={consulta}>{datos && <div className="grid gap-4"><p>{datos.clienteNombre} · {datos.folio}</p><BadgeEstado estado={datos.estado} />
    {datos.partidas.registros.length ? <ul className="grid gap-3">{datos.partidas.registros.map(partida => <li key={partida.id} className="rounded-md border border-borde p-3 text-sm"><p className="font-medium">{partida.codigoPieza} · {partida.descripcion}</p><p>Solicitado: {partida.cantidadSolicitada} {partida.unidadMedida} · Producido: {partida.cantidadProducida} · Scrap: {partida.cantidadScrap}</p>{partida.maquinaAsignada && <p>Máquina: {partida.maquinaAsignada}</p>}</li>)}</ul> : <EstadoVacio titulo="Sin partidas disponibles" descripcion="No hay partidas visibles para esta orden." />}
    <Paginas nombre="partidas" pagina={pagina} total={datos.partidas.total} porPagina={datos.partidas.porPagina} cambiar={setPagina} /></div>}</Consulta>;
}

export function HistorialCuenta({ arId, clienteId }: { arId: string; clienteId: string }) {
  const [paginaPagos, setPaginaPagos] = useState(1);
  const [paginaMovimientos, setPaginaMovimientos] = useState(1);
  const [pagoId, setPagoId] = useState<string | null>(null);
  const consulta = useQuery({ queryKey: ['cobranza', 'historial', arId, clienteId, paginaPagos, paginaMovimientos], queryFn: () => datosDe(obtenerHistorialCuentaAccion({ arId, clienteId, paginaPagos, paginaMovimientos })), staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 60_000 });
  const datos = consulta.data;
  return <Consulta consulta={consulta}>{datos && <div className="grid gap-5">
    <section aria-label="Ficha de la cuenta" data-testid="ficha-cuenta" className="grid gap-2 rounded-base border border-borde p-3 text-sm">
      <p className="font-medium"><span className="font-mono text-xs">{datos.cuenta.referenciaInterna}</span> · {datos.cuenta.clienteNombre} · {datos.cuenta.folioOrden}{datos.cuenta.folioFacturaRemision ? ` · Factura: ${datos.cuenta.folioFacturaRemision}` : ''}</p>
      {(() => {
        const r = reconciliarCuenta(datos.cuenta);
        const m = datos.cuenta.moneda;
        const textoMonto = (valor: number | null) => valor === null ? 'No capturado' : formatearMoneda(valor, m);
        return <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <div><dt className="text-texto-secundario">Estado</dt><dd><BadgeEstado estado={datos.cuenta.estado} /></dd></div>
          <div><dt className="text-texto-secundario">Emisión</dt><dd>{formatearFecha(datos.cuenta.fechaEmision)}</dd></div>
          <div><dt className="text-texto-secundario">Condición</dt><dd>{etiquetaCondicionCuenta(datos.cuenta.condicionesPago)}</dd></div>
          <div><dt className="text-texto-secundario">Base</dt><dd>{textoMonto(r.base)}</dd></div>
          <div><dt className="text-texto-secundario">IVA</dt><dd>{textoMonto(r.iva)}</dd></div>
          <div><dt className="text-texto-secundario">Total</dt><dd>{formatearMoneda(r.total, m)}</dd></div>
          <div><dt className="text-texto-secundario">Abonado</dt><dd>{formatearMoneda(r.abonado, m)}</dd></div>
          <div><dt className="text-texto-secundario">Saldo</dt><dd className={r.saldo > 0 ? 'font-semibold' : ''}>{formatearMoneda(r.saldo, m)}</dd></div>
          <div><dt className="text-texto-secundario">Cobrabilidad</dt><dd>{r.cobrable ? `Cobrable desde ${formatearFecha(datos.cuenta.cobrableDesde ?? datos.cuenta.fechaEmision)}` : 'No cobrable (admite anticipos)'}</dd></div>
          <div><dt className="text-texto-secundario">Vencimiento</dt><dd>{datos.cuenta.fechaVencimiento ? formatearFecha(datos.cuenta.fechaVencimiento) : 'Por entregar'}</dd></div>
        </dl>;
      })()}
      {!reconciliarCuenta(datos.cuenta).desgloseCuadra ? <p role="alert" className="text-xs text-peligro-texto">El desglose base + IVA no coincide con el total de la cuenta.</p> : null}
    </section>
    <section className="grid gap-3"><h3 className="font-semibold">Pagos de la cuenta</h3>
      {datos.pagos.registros.length ? <ul className="grid gap-2">{datos.pagos.registros.map(pago => <li key={pago.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-borde p-3 text-sm"><div><p className="font-medium">{pago.folioRecibo} · {formatearMoneda(pago.montoPagado, pago.monedaPago)}</p><p>{new Date(pago.creadoEn).toLocaleString('es-MX')} · {pago.metodoPago.replaceAll('_', ' ')}</p></div><Button variante="contorno" onClick={() => setPagoId(pago.id)}>Ver recibo {pago.folioRecibo}</Button></li>)}</ul> : <EstadoVacio titulo="Sin pagos registrados" descripcion="Los pagos de esta cuenta aparecerán aquí." />}
      <Paginas nombre="pagos" pagina={paginaPagos} total={datos.pagos.total} porPagina={datos.pagos.porPagina} cambiar={setPaginaPagos} />
    </section>
    <section className="grid gap-3"><h3 className="font-semibold">Movimientos del monedero del cliente (MXN)</h3>
      {datos.movimientos.registros.length ? <ul className="grid gap-2">{datos.movimientos.registros.map(mov => <li key={mov.id} className="rounded-md border border-borde p-3 text-sm"><p className="font-medium">{mov.tipo.replaceAll('_', ' ')} · {formatearMoneda(mov.monto, 'MXN')}</p><p>{new Date(mov.creadoEn).toLocaleString('es-MX')} · {mov.descripcion}</p></li>)}</ul> : <EstadoVacio titulo="Sin movimientos del monedero" descripcion="Este historial comprende todas las cuentas del cliente." />}
      <Paginas nombre="movimientos" pagina={paginaMovimientos} total={datos.movimientos.total} porPagina={datos.movimientos.porPagina} cambiar={setPaginaMovimientos} />
    </section>
    <Dialog open={pagoId !== null} onOpenChange={abierto => { if (!abierto) setPagoId(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Recibo de pago</DialogTitle><DialogDescription>Consulta e impresión del pago registrado.</DialogDescription></DialogHeader>{pagoId && <ReciboPagoConsulta key={pagoId} pagoId={pagoId} />}</DialogContent></Dialog>
  </div>}</Consulta>;
}
