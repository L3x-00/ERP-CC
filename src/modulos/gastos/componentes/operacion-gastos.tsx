'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { usarTiendaGastos } from '@/estado/uso-tienda-gastos';
import {
  cambiarEstadoGastoAccion,
  obtenerGastosAccion,
  obtenerRentabilidadOrdenAccion,
  procesarComprobanteOcrAccion,
  registrarGastoAccion,
} from '@/modulos/gastos/acciones/indice';
import { CLAVE_GASTOS, CLAVE_RENTABILIDAD_GASTOS } from '@/modulos/gastos/componentes/claves-consulta';
import { ModalRegistrarGasto } from '@/modulos/gastos/componentes/modal-registrar-gasto';
import { SincronizadorGastosRealtime } from '@/modulos/gastos/componentes/sincronizador-gastos-realtime';
import { TablaGastos } from '@/modulos/gastos/componentes/tabla-gastos';
import { TarjetaRentabilidadOrden } from '@/modulos/gastos/componentes/tarjeta-rentabilidad-orden';
import type { CalculoRentabilidadOrden, Gasto } from '@/modulos/gastos/tipos/indice';
import { ESTADOS_GASTO } from '@/modulos/gastos/tipos/indice';
import { usarCatalogosComerciales } from '@/modulos/configuracion/hooks/usar-catalogos-comerciales';
import type { RegistrarGastoInput } from '@/modulos/gastos/validaciones/indice';
import type { DatosComprobanteOCR } from '@/modulos/gastos/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

function coincidePeriodo(fecha: string, periodo: string, rango: { inicio: string; fin: string } | null): boolean {
  const fechaDia = fecha.slice(0, 10);
  if (periodo === 'personalizado') return !rango || (fechaDia >= rango.inicio && fechaDia <= rango.fin);
  const hoy = new Date();
  const fechaHoy = hoy.toISOString().slice(0, 10);
  if (periodo === 'hoy') return fechaDia === fechaHoy;
  if (periodo === 'este_mes') return fechaDia.slice(0, 7) === fechaHoy.slice(0, 7);
  if (periodo === 'mes_pasado') {
    const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    return fechaDia.slice(0, 7) === mesPasado.toISOString().slice(0, 7);
  }
  if (periodo === 'este_anio') return fechaDia.slice(0, 4) === fechaHoy.slice(0, 4);
  if (periodo === 'esta_semana' || periodo === 'semana_pasada') {
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    if (periodo === 'semana_pasada') {
      const finAnterior = new Date(inicio);
      finAnterior.setDate(inicio.getDate() - 1);
      const inicioAnterior = new Date(inicio);
      inicioAnterior.setDate(inicio.getDate() - 7);
      return fechaDia >= inicioAnterior.toISOString().slice(0, 10)
        && fechaDia <= finAnterior.toISOString().slice(0, 10);
    }
    return fechaDia >= inicio.toISOString().slice(0, 10) && fechaDia <= fechaHoy;
  }
  return true;
}

function etiquetaCategoria(categoria: Gasto['categoria']): string {
  const texto = categoria.split('_').join(' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function OperacionGastos({ datosIniciales }: { datosIniciales: Gasto[] }) {
  const clienteQuery = useQueryClient();
  const { categoriasGasto } = usarCatalogosComerciales();
  const periodo = usarTiendaGastos((estado) => estado.periodo);
  const rango = usarTiendaGastos((estado) => estado.rango);
  const categorias = usarTiendaGastos((estado) => estado.categorias);
  const estados = usarTiendaGastos((estado) => estado.estados);
  const busqueda = usarTiendaGastos((estado) => estado.busqueda);
  const revision = usarTiendaGastos((estado) => estado.revisionGastos);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [ordenRentabilidad, setOrdenRentabilidad] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: [...CLAVE_GASTOS, revision],
    queryFn: async (): Promise<Gasto[]> => {
      const resultado = await obtenerGastosAccion({});
      if (!resultado.exito || !resultado.datos) throw new Error(resultado.exito ? 'Sin datos' : resultado.error);
      return resultado.datos;
    },
    ...(revision === 0 ? { initialData: datosIniciales } : {}),
  });
  const gastos = consulta.data ?? datosIniciales;
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-MX');
    return gastos.filter((gasto) => (
      (!termino || gasto.descripcion.toLocaleLowerCase('es-MX').includes(termino) || gasto.folio.toLocaleLowerCase('es-MX').includes(termino))
      && (categorias.length === 0 || categorias.includes(gasto.categoria))
      && (estados.length === 0 || estados.includes(gasto.estadoPago))
      && coincidePeriodo(gasto.fechaGasto, periodo, rango)
    ));
  }, [busqueda, categorias, estados, gastos, periodo, rango]);

  const distribucion = useMemo(() => {
    const acumulado = new Map<Gasto['categoria'], number>();
    let total = 0;
    for (const gasto of gastos) {
      if (gasto.estadoPago === 'cancelado') continue;
      const montoMxn = gasto.moneda === 'MXN' ? gasto.montoTotal : gasto.montoTotal * gasto.tipoCambio;
      if (!Number.isFinite(montoMxn) || montoMxn <= 0) continue;
      acumulado.set(gasto.categoria, (acumulado.get(gasto.categoria) ?? 0) + montoMxn);
      total += montoMxn;
    }
    const filas = [...acumulado.entries()]
      .map(([categoria, monto]) => ({
        categoria,
        monto,
        porcentaje: total > 0 ? (monto / total) * 100 : 0,
      }))
      .sort((a, b) => b.monto - a.monto);
    return { filas, total };
  }, [gastos]);

  const rentabilidad = useQuery({
    queryKey: [...CLAVE_RENTABILIDAD_GASTOS, ordenRentabilidad],
    queryFn: async (): Promise<CalculoRentabilidadOrden> => {
      const resultado = await obtenerRentabilidadOrdenAccion({ ordenId: ordenRentabilidad as string });
      if (!resultado.exito || !resultado.datos) throw new Error(resultado.exito ? 'Sin datos de rentabilidad' : resultado.error);
      return resultado.datos;
    },
    enabled: ordenRentabilidad !== null,
  });

  const refrescar = useCallback(async () => {
    // Una sola revalidación: invalidar el prefijo ya recarga la rama activa.
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_GASTOS });
  }, [clienteQuery]);

  const registrar = useCallback(async (entrada: RegistrarGastoInput): Promise<RespuestaAccion<unknown>> => {
    setProcesando(true);
    try {
      const resultado = await registrarGastoAccion(entrada);
      if (resultado.exito) await refrescar();
      return resultado;
    } catch (error) {
      console.error('[GASTOS] Error de comunicación al registrar:', error);
      return { exito: false, error: 'No se pudo comunicar el registro del gasto' };
    } finally {
      setProcesando(false);
    }
  }, [refrescar]);

  const cambiarEstado = useCallback(async (gasto: Gasto, nuevoEstado: Gasto['estadoPago']): Promise<void> => {
    setProcesando(true);
    setMensaje(null);
    try {
      const resultado = await cambiarEstadoGastoAccion({
        gastoId: gasto.id,
        nuevoEstado,
        estadoEsperado: gasto.estadoPago,
      });
      if (!resultado.exito) {
        setMensaje(resultado.error);
        return;
      }
      await refrescar();
    } catch (error) {
      console.error('[GASTOS] Error de comunicación al cambiar estado:', error);
      setMensaje('No se pudo actualizar el estado del gasto');
    } finally {
      setProcesando(false);
    }
  }, [refrescar]);

  const procesarOcr = useCallback(async (archivo: File): Promise<RespuestaAccion<DatosComprobanteOCR>> => {
    usarTiendaGastos.getState().establecerOcrEnCurso(true);
    const formulario = new FormData();
    formulario.set('comprobante', archivo);
    try {
      return await procesarComprobanteOcrAccion(formulario);
    } finally {
      usarTiendaGastos.getState().establecerOcrEnCurso(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <SincronizadorGastosRealtime />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Gastos registrados</h2><p className="text-sm text-texto-secundario">Los cambios se sincronizan sin recargar la página.</p></div>
        <Button onClick={() => setModalAbierto(true)}>Registrar gasto</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Buscar<Input value={busqueda} onChange={(evento) => usarTiendaGastos.getState().establecerBusqueda(evento.target.value)} placeholder="Folio o descripción" /></label>
        <label className="grid gap-1 text-sm font-medium">Periodo<Select value={periodo} onChange={(evento) => usarTiendaGastos.getState().establecerPeriodo(evento.target.value as typeof periodo)}><option value="hoy">Hoy</option><option value="esta_semana">Esta semana</option><option value="semana_pasada">Semana pasada</option><option value="este_mes">Este mes</option><option value="mes_pasado">Mes pasado</option><option value="este_anio">Este año</option><option value="personalizado">Personalizado</option></Select></label>
        {periodo === 'personalizado' ? <><label className="grid gap-1 text-sm font-medium">Desde<Input type="date" value={rango?.inicio ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerRango({ inicio: evento.target.value, fin: rango?.fin ?? evento.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Hasta<Input type="date" value={rango?.fin ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerRango({ inicio: rango?.inicio ?? evento.target.value, fin: evento.target.value })} /></label></> : null}
        <label className="grid gap-1 text-sm font-medium">Categoría<Select value={categorias[0] ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerCategorias(evento.target.value ? [evento.target.value] : [])}><option value="">Todas</option>{categoriasGasto.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-medium">Estado<Select value={estados[0] ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerEstados(evento.target.value ? [evento.target.value as typeof ESTADOS_GASTO[number]] : [])}><option value="">Todos</option>{ESTADOS_GASTO.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
      </div>
      {mensaje ? <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p> : null}
      {consulta.isError ? <p role="alert" className="text-sm text-peligro-texto">No se pudo consultar gastos.</p> : null}
      <TablaGastos gastos={filtrados} cargando={consulta.isPending && !consulta.isError} onCambiarEstado={(gasto, estado) => void cambiarEstado(gasto, estado)} onVerRentabilidad={setOrdenRentabilidad} />
      {distribucion.filas.length > 0 ? (
        <section className="rounded-lg border border-borde bg-superficie p-4 shadow-sm" aria-labelledby="titulo-distribucion-categorias">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="titulo-distribucion-categorias" className="text-base font-semibold">Distribución por categoría</h3>
              <p className="text-xs text-texto-secundario">Gastos cargados sin cancelados; importes convertidos a MXN.</p>
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatearMoneda(distribucion.total)}</p>
          </div>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {distribucion.filas.map(({ categoria, monto, porcentaje }) => (
              <li key={categoria} className="grid gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-texto-secundario">{etiquetaCategoria(categoria)}</span>
                  <span className="font-medium tabular-nums">{formatearMoneda(monto)}</span>
                </div>
                <BarraProgreso valor={porcentaje} tono="acento" etiqueta={`${etiquetaCategoria(categoria)}: ${porcentaje.toFixed(1)}%`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rentabilidad.isError ? <p role="alert" className="text-sm text-peligro-texto">No se pudo consultar la rentabilidad.</p> : null}
      <TarjetaRentabilidadOrden datos={rentabilidad.data ?? null} />
      <ModalRegistrarGasto abierto={modalAbierto} procesando={procesando} ocrEnCurso={usarTiendaGastos((estado) => estado.ocrEnCurso)} onAbiertoChange={setModalAbierto} onRegistrar={registrar} onOcr={procesarOcr} />
    </div>
  );
}
