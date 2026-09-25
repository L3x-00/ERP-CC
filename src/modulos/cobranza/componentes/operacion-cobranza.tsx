'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { usarTiendaCobranza } from '@/estado/uso-tienda-cobranza';
import {
  aplicarSaldoFavorAccion,
  obtenerResumenCarteraAccion,
  registrarFacturaArAccion,
  registrarPagoAccion,
} from '@/modulos/cobranza/acciones/indice';
import { CLAVE_CARTERA_COBRANZA } from '@/modulos/cobranza/componentes/claves-consulta';
import {
  ModalRegistrarPago,
  type DatosPagoFormulario,
  type DatosSaldoFormulario,
} from '@/modulos/cobranza/componentes/modal-registrar-pago';
import { HistorialCuenta, DetalleOrdenCobranza, ReciboPagoConsulta } from '@/modulos/cobranza/componentes/historial-cuenta';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/compartido/componentes/ui/dialog';
import { SincronizadorCobranzaRealtime } from '@/modulos/cobranza/componentes/sincronizador-cobranza-realtime';
import { TablaCuentasPorCobrar } from '@/modulos/cobranza/componentes/tabla-cuentas-por-cobrar';
import { ModalRegistrarFactura, type DatosFacturaAr } from '@/modulos/cobranza/componentes/modal-registrar-factura';
import { ModalAbrirArExcepcion } from '@/modulos/cobranza/componentes/modal-abrir-ar-excepcion';
import { TarjetaResumenAging } from '@/modulos/cobranza/componentes/tarjeta-resumen-aging';
import {
  BUCKETS_AGING,
  ETIQUETA_BUCKET_AGING,
  bucketDeCuenta,
  bucketDesdeSlugAging,
  type BucketAging,
} from '@/modulos/cobranza/servicios/aging-servicio';
import type { ResumenCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

function rangoPeriodo(periodo: string, personalizado: { inicio: string; fin: string } | null): { inicio: Date; fin: Date } | null {
  const hoy = new Date();
  const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  if (periodo === 'hoy') return { inicio: inicioDia, fin: finDia };
  if (periodo === 'esta_semana' || periodo === 'semana_pasada') {
    const inicioSemana = new Date(inicioDia);
    inicioSemana.setDate(inicioDia.getDate() - ((inicioDia.getDay() + 6) % 7) - (periodo === 'semana_pasada' ? 7 : 0));
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 7);
    return { inicio: inicioSemana, fin: finSemana };
  }
  if (periodo === 'este_mes' || periodo === 'mes_pasado') {
    const desplazamiento = periodo === 'mes_pasado' ? -1 : 0;
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento + 1, 1);
    return { inicio, fin };
  }
  if (periodo === 'este_anio') return { inicio: new Date(hoy.getFullYear(), 0, 1), fin: new Date(hoy.getFullYear() + 1, 0, 1) };
  if (periodo === 'personalizado' && personalizado) {
    const inicio = new Date(`${personalizado.inicio}T00:00:00`);
    const fin = new Date(`${personalizado.fin}T00:00:00`);
    fin.setDate(fin.getDate() + 1);
    if (Number.isFinite(inicio.getTime()) && Number.isFinite(fin.getTime()) && inicio < fin) return { inicio, fin };
  }
  return null;
}

export function OperacionCobranza({ datosIniciales, agingInicial, puedeRegistrarPago = false, puedeAplicarSaldo = false }: { datosIniciales: ResumenCartera; agingInicial?: string; puedeRegistrarPago?: boolean; puedeAplicarSaldo?: boolean }) {
  const clienteConsultas = useQueryClient();
  // Filtro de antigüedad (OBS-01): se puede sembrar desde el dashboard vía ?aging=<slug>.
  const [bucketAging, setBucketAging] = useState<BucketAging | null>(() => bucketDesdeSlugAging(agingInicial));
  const cuentaSeleccionadaId = usarTiendaCobranza((estado) => estado.cuentaSeleccionadaId);
  const busqueda = usarTiendaCobranza((estado) => estado.busqueda);
  const periodo = usarTiendaCobranza((estado) => estado.periodo);
  const rangoPersonalizado = usarTiendaCobranza((estado) => estado.rangoPersonalizado);
  const revisionCartera = usarTiendaCobranza((estado) => estado.revisionCartera);
  const seleccionarCuenta = usarTiendaCobranza((estado) => estado.seleccionarCuenta);
  const establecerBusqueda = usarTiendaCobranza((estado) => estado.establecerBusqueda);
  const establecerPeriodo = usarTiendaCobranza((estado) => estado.establecerPeriodo);
  const establecerRangoPersonalizado = usarTiendaCobranza((estado) => estado.establecerRangoPersonalizado);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [reciboId, setReciboId] = useState<string | null>(null);
  const [historial, setHistorial] = useState<{ arId: string; clienteId: string } | null>(null);
  const [ordenId, setOrdenId] = useState<string | null>(null);
  const [facturaCuentaId, setFacturaCuentaId] = useState<string | null>(null);
  const [altaExcepcionAbierta, setAltaExcepcionAbierta] = useState(false);

  const consulta = useQuery({
    queryKey: [...CLAVE_CARTERA_COBRANZA, revisionCartera],
    queryFn: async (): Promise<ResumenCartera> => {
      const resultado = await obtenerResumenCarteraAccion({});
      if (!resultado.exito || !resultado.datos) throw new Error(resultado.exito ? 'La cartera no devolvió datos' : resultado.error);
      return resultado.datos;
    },
    ...(revisionCartera === 0 ? { initialData: datosIniciales } : {}),
  });
  const datos = consulta.data ?? datosIniciales;
  const cuentasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-MX');
    const rango = rangoPeriodo(periodo, rangoPersonalizado);
    const hoyISO = new Date().toISOString();
    return datos.cuentas.filter((cuenta) => {
      const coincideBusqueda = !termino || [cuenta.clienteNombre, cuenta.folioOrden, cuenta.referenciaInterna, cuenta.folioFacturaRemision ?? ''].some((valor) => valor.toLocaleLowerCase('es-MX').includes(termino));
      const emitida = new Date(cuenta.fechaEmision);
      const coincidePeriodo = !rango || (emitida >= rango.inicio && emitida < rango.fin);
      const coincideAging = bucketAging === null || bucketDeCuenta(cuenta, hoyISO) === bucketAging;
      return coincideBusqueda && coincidePeriodo && coincideAging;
    });
  }, [busqueda, datos.cuentas, periodo, rangoPersonalizado, bucketAging]);
  const cuentaSeleccionada = datos.cuentas.find((cuenta) => cuenta.id === cuentaSeleccionadaId) ?? null;
  const cuentaFactura = datos.cuentas.find((cuenta) => cuenta.id === facturaCuentaId) ?? null;

  const abrirCobro = useCallback((cuentaId: string) => {
    seleccionarCuenta(cuentaId);
    setModalAbierto(true);
  }, [seleccionarCuenta]);

  const refrescar = useCallback(async () => {
    // Una sola revalidación: invalidar el prefijo ya recarga la rama activa.
    await clienteConsultas.invalidateQueries({ queryKey: ['cobranza'] });
  }, [clienteConsultas]);

  const registrarPago = useCallback(async (entrada: DatosPagoFormulario) => {
    setProcesando(true);
    try {
      const resultado = await registrarPagoAccion(entrada);
      if (!resultado.exito || !resultado.datos) return { exito: false, error: resultado.exito ? 'El pago no devolvió recibo' : resultado.error, rechazoConfirmado: resultado.rechazoConfirmado };
      setReciboId(resultado.datos.pagoId);
      await refrescar().catch(() => console.error('[COBRANZA] Pago confirmado; cartera pendiente de actualizar'));
      return { exito: true };
    } catch (error) {
      console.error('[COBRANZA] Error de comunicación al registrar pago:', error);
      return { exito: false, error: 'No se pudo comunicar el pago; vuelve a intentarlo' };
    } finally {
      setProcesando(false);
    }
  }, [refrescar]);

  const aplicarSaldo = useCallback(async (entrada: DatosSaldoFormulario) => {
    setProcesando(true);
    try {
      const resultado = await aplicarSaldoFavorAccion(entrada);
      if (!resultado.exito || !resultado.datos) return { exito: false, error: resultado.exito ? 'La aplicación no devolvió recibo' : resultado.error, rechazoConfirmado: resultado.rechazoConfirmado };
      setReciboId(resultado.datos.pagoId);
      await refrescar().catch(() => console.error('[COBRANZA] Pago confirmado; cartera pendiente de actualizar'));
      return { exito: true };
    } catch (error) {
      console.error('[COBRANZA] Error de comunicación al aplicar saldo:', error);
      return { exito: false, error: 'No se pudo comunicar la aplicación; vuelve a intentarlo' };
    } finally {
      setProcesando(false);
    }
  }, [refrescar]);

  const guardarFactura = useCallback(async (entrada: DatosFacturaAr, abrirAbono: boolean) => {
    const resultado = await registrarFacturaArAccion(entrada);
    if (!resultado.exito) return { exito: false as const, error: resultado.error };
    await refrescar().catch(() => console.error('[COBRANZA] Factura confirmada; cartera pendiente de actualizar'));
    setFacturaCuentaId(null);
    if (abrirAbono) {
      seleccionarCuenta(entrada.arId);
      setModalAbierto(true);
    }
    return { exito: true as const };
  }, [refrescar, seleccionarCuenta]);

  const cuentaExcepcionalCreada = useCallback(async (cuentaId: string, abrirAbono: boolean) => {
    await refrescar().catch(() => console.error('[COBRANZA] AR creada; cartera pendiente de actualizar'));
    setAltaExcepcionAbierta(false);
    if (abrirAbono) {
      seleccionarCuenta(cuentaId);
      setModalAbierto(true);
    }
  }, [refrescar, seleccionarCuenta]);

  const cargando = consulta.isPending && !consulta.isError;

  return (
    <div className="flex flex-col gap-6" data-testid="operacion-cobranza">
      <SincronizadorCobranzaRealtime />
      <TarjetaResumenAging resumenes={datos.agingPorCliente} />
      {puedeRegistrarPago && <div className="flex justify-end">
        <Button variante="secundario" onClick={() => setAltaExcepcionAbierta(true)}>Nueva factura de orden sin cuenta</Button>
      </div>}
      <div className="grid gap-3 rounded-lg border border-borde bg-superficie p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium text-texto-primario">Buscar por cliente, orden o AR
          <Input value={busqueda} onChange={(evento) => establecerBusqueda(evento.target.value)} placeholder="Cliente, OP, INVCNC o factura" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-texto-primario">Periodo de emisión
          <Select value={periodo} onChange={(evento) => establecerPeriodo(evento.target.value as typeof periodo)}>
            <option value="hoy">Hoy</option><option value="esta_semana">Esta semana</option><option value="semana_pasada">Semana pasada</option><option value="este_mes">Este mes</option><option value="mes_pasado">Mes pasado</option><option value="este_anio">Este año</option><option value="personalizado">Personalizado</option>
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-texto-primario">Antigüedad
          <Select value={bucketAging ?? 'todas'} onChange={(evento) => setBucketAging(evento.target.value === 'todas' ? null : (evento.target.value as BucketAging))}>
            <option value="todas">Todas</option>
            {BUCKETS_AGING.map((bucket) => <option key={bucket} value={bucket}>{ETIQUETA_BUCKET_AGING[bucket]}</option>)}
          </Select>
        </label>
        {periodo === 'personalizado' ? <>
          <label className="grid gap-1 text-sm font-medium text-texto-primario">Desde
            <Input type="date" value={rangoPersonalizado?.inicio ?? ''} onChange={(evento) => establecerRangoPersonalizado({ inicio: evento.target.value, fin: rangoPersonalizado?.fin ?? evento.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-texto-primario">Hasta
            <Input type="date" value={rangoPersonalizado?.fin ?? ''} onChange={(evento) => establecerRangoPersonalizado({ inicio: rangoPersonalizado?.inicio ?? evento.target.value, fin: evento.target.value })} />
          </label>
        </> : null}
      </div>
      {consulta.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3">
          <p className="text-sm text-peligro-texto">No se pudo actualizar la cartera; vuelve a intentarlo.</p>
          <Button
            variante="contorno"
            tamano="sm"
            onClick={() => void consulta.refetch()}
            disabled={consulta.isFetching}
          >
            {consulta.isFetching ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      ) : null}
      {cargando
        ? <SkeletonTabla columnas={8} filas={6} />
        : <TablaCuentasPorCobrar cuentas={cuentasFiltradas} cuentaSeleccionadaId={cuentaSeleccionadaId} onSeleccionar={abrirCobro} puedeCobrar={puedeRegistrarPago || puedeAplicarSaldo} onVerHistorial={(cuenta) => setHistorial({ arId: cuenta.id, clienteId: cuenta.clienteId })} onVerOrden={setOrdenId} onRegistrarFactura={puedeRegistrarPago ? setFacturaCuentaId : undefined} />}
      {reciboId && <ReciboPagoConsulta key={reciboId} pagoId={reciboId} />}
      <Dialog open={historial !== null} onOpenChange={(abierto) => { if (!abierto) setHistorial(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Historial de cobranza</DialogTitle><DialogDescription>Pagos de la cuenta y monedero del cliente.</DialogDescription></DialogHeader>{historial && <HistorialCuenta key={historial.arId} {...historial} />}</DialogContent></Dialog>
      <Dialog open={ordenId !== null} onOpenChange={(abierto) => { if (!abierto) setOrdenId(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Detalle de orden</DialogTitle><DialogDescription>Partidas y avance de la orden seleccionada.</DialogDescription></DialogHeader>{ordenId && <DetalleOrdenCobranza key={ordenId} ordenId={ordenId} />}</DialogContent></Dialog>
      <ModalRegistrarPago
        key={cuentaSeleccionada?.id ?? 'sin-cuenta'}
        cuenta={cuentaSeleccionada}
        abierto={modalAbierto}
        procesando={procesando}
        onAbiertoChange={setModalAbierto}
        onRegistrarPago={registrarPago}
        onAplicarSaldo={aplicarSaldo}
        puedeRegistrarPago={puedeRegistrarPago}
        puedeAplicarSaldo={puedeAplicarSaldo}
      />
      <ModalRegistrarFactura
        key={cuentaFactura?.id ?? 'sin-factura'}
        cuenta={cuentaFactura}
        abierto={facturaCuentaId !== null}
        onAbiertoChange={(abierto) => { if (!abierto) setFacturaCuentaId(null); }}
        onGuardar={guardarFactura}
      />
      <ModalAbrirArExcepcion
        abierto={altaExcepcionAbierta}
        onAbiertoChange={setAltaExcepcionAbierta}
        onCreada={cuentaExcepcionalCreada}
      />
    </div>
  );
}
