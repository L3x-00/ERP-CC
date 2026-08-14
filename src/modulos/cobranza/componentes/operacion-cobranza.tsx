'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { usarTiendaCobranza } from '@/estado/uso-tienda-cobranza';
import {
  aplicarSaldoFavorAccion,
  obtenerResumenCarteraAccion,
  registrarPagoAccion,
} from '@/modulos/cobranza/acciones/indice';
import { CLAVE_CARTERA_COBRANZA } from '@/modulos/cobranza/componentes/claves-consulta';
import {
  ModalRegistrarPago,
  type DatosPagoFormulario,
  type DatosSaldoFormulario,
} from '@/modulos/cobranza/componentes/modal-registrar-pago';
import { ReciboPagoVista, type ReciboPago } from '@/modulos/cobranza/componentes/recibo-pago-vista';
import { SincronizadorCobranzaRealtime } from '@/modulos/cobranza/componentes/sincronizador-cobranza-realtime';
import { TablaCuentasPorCobrar } from '@/modulos/cobranza/componentes/tabla-cuentas-por-cobrar';
import { TarjetaResumenAging } from '@/modulos/cobranza/componentes/tarjeta-resumen-aging';
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

export function OperacionCobranza({ datosIniciales }: { datosIniciales: ResumenCartera }) {
  const clienteConsultas = useQueryClient();
  const cuentaSeleccionadaId = usarTiendaCobranza((estado) => estado.cuentaSeleccionadaId);
  const busqueda = usarTiendaCobranza((estado) => estado.busqueda);
  const periodo = usarTiendaCobranza((estado) => estado.periodo);
  const rangoPersonalizado = usarTiendaCobranza((estado) => estado.rangoPersonalizado);
  const revisionCartera = usarTiendaCobranza((estado) => estado.revisionCartera);
  const seleccionarCuenta = usarTiendaCobranza((estado) => estado.seleccionarCuenta);
  const establecerBusqueda = usarTiendaCobranza((estado) => estado.establecerBusqueda);
  const establecerPeriodo = usarTiendaCobranza((estado) => estado.establecerPeriodo);
  const establecerRangoPersonalizado = usarTiendaCobranza((estado) => estado.establecerRangoPersonalizado);
  const notificarActualizacion = usarTiendaCobranza((estado) => estado.notificarActualizacion);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [recibo, setRecibo] = useState<ReciboPago | null>(null);

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
    return datos.cuentas.filter((cuenta) => {
      const coincideBusqueda = !termino || [cuenta.clienteNombre, cuenta.folioOrden, cuenta.folioFacturaRemision ?? ''].some((valor) => valor.toLocaleLowerCase('es-MX').includes(termino));
      const emitida = new Date(cuenta.fechaEmision);
      const coincidePeriodo = !rango || (emitida >= rango.inicio && emitida < rango.fin);
      return coincideBusqueda && coincidePeriodo;
    });
  }, [busqueda, datos.cuentas, periodo, rangoPersonalizado]);
  const cuentaSeleccionada = datos.cuentas.find((cuenta) => cuenta.id === cuentaSeleccionadaId) ?? null;

  const abrirCobro = useCallback((cuentaId: string) => {
    seleccionarCuenta(cuentaId);
    setModalAbierto(true);
  }, [seleccionarCuenta]);

  const refrescar = useCallback(async () => {
    notificarActualizacion();
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CARTERA_COBRANZA });
  }, [clienteConsultas, notificarActualizacion]);

  const registrarPago = useCallback(async (entrada: DatosPagoFormulario) => {
    setProcesando(true);
    try {
      const resultado = await registrarPagoAccion(entrada);
      if (!resultado.exito || !resultado.datos) return { exito: false, error: resultado.exito ? 'El pago no devolvió recibo' : resultado.error };
      const cuenta = datos.cuentas.find((item) => item.id === entrada.arId);
      setRecibo({
        folio: resultado.datos.folioRecibo,
        cliente: cuenta?.clienteNombre ?? 'Cliente',
        montoAplicado: resultado.datos.montoAplicadoAr,
        moneda: cuenta?.moneda ?? entrada.monedaPago,
        metodo: entrada.metodoPago,
        saldoRestante: resultado.datos.saldoPendiente,
      });
      await refrescar();
      return { exito: true };
    } catch (error) {
      console.error('[COBRANZA] Error de comunicación al registrar pago:', error);
      return { exito: false, error: 'No se pudo comunicar el pago; vuelve a intentarlo' };
    } finally {
      setProcesando(false);
    }
  }, [datos.cuentas, refrescar]);

  const aplicarSaldo = useCallback(async (entrada: DatosSaldoFormulario) => {
    setProcesando(true);
    try {
      const resultado = await aplicarSaldoFavorAccion(entrada);
      if (!resultado.exito || !resultado.datos) return { exito: false, error: resultado.exito ? 'La aplicación no devolvió recibo' : resultado.error };
      const cuenta = datos.cuentas.find((item) => item.id === entrada.arId);
      setRecibo({
        folio: resultado.datos.folioRecibo,
        cliente: cuenta?.clienteNombre ?? 'Cliente',
        montoAplicado: resultado.datos.montoAplicadoAr,
        moneda: cuenta?.moneda ?? 'MXN',
        metodo: 'saldo a favor',
        saldoRestante: resultado.datos.saldoPendiente,
      });
      await refrescar();
      return { exito: true };
    } catch (error) {
      console.error('[COBRANZA] Error de comunicación al aplicar saldo:', error);
      return { exito: false, error: 'No se pudo comunicar la aplicación; vuelve a intentarlo' };
    } finally {
      setProcesando(false);
    }
  }, [datos.cuentas, refrescar]);

  return (
    <div className="flex flex-col gap-6" data-testid="operacion-cobranza">
      <SincronizadorCobranzaRealtime />
      <TarjetaResumenAging resumenes={datos.agingPorCliente} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Buscar por cliente u orden
          <Input value={busqueda} onChange={(evento) => establecerBusqueda(evento.target.value)} placeholder="Cliente, OP o remisión" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Periodo de emisión
          <Select value={periodo} onChange={(evento) => establecerPeriodo(evento.target.value as typeof periodo)}>
            <option value="hoy">Hoy</option><option value="esta_semana">Esta semana</option><option value="semana_pasada">Semana pasada</option><option value="este_mes">Este mes</option><option value="mes_pasado">Mes pasado</option><option value="este_anio">Este año</option><option value="personalizado">Personalizado</option>
          </Select>
        </label>
        {periodo === 'personalizado' ? <>
          <label className="grid gap-1 text-sm font-medium">Desde
            <Input type="date" value={rangoPersonalizado?.inicio ?? ''} onChange={(evento) => establecerRangoPersonalizado({ inicio: evento.target.value, fin: rangoPersonalizado?.fin ?? evento.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-medium">Hasta
            <Input type="date" value={rangoPersonalizado?.fin ?? ''} onChange={(evento) => establecerRangoPersonalizado({ inicio: rangoPersonalizado?.inicio ?? evento.target.value, fin: evento.target.value })} />
          </label>
        </> : null}
      </div>
      {consulta.isError ? <p role="alert" className="text-sm text-red-700">No se pudo actualizar la cartera; vuelve a intentarlo.</p> : null}
      <TablaCuentasPorCobrar cuentas={cuentasFiltradas} cuentaSeleccionadaId={cuentaSeleccionadaId} onSeleccionar={abrirCobro} />
      <ReciboPagoVista recibo={recibo} />
      <ModalRegistrarPago
        key={cuentaSeleccionada?.id ?? 'sin-cuenta'}
        cuenta={cuentaSeleccionada}
        abierto={modalAbierto}
        procesando={procesando}
        onAbiertoChange={setModalAbierto}
        onRegistrarPago={registrarPago}
        onAplicarSaldo={aplicarSaldo}
      />
    </div>
  );
}
