'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { usarTiendaGastos } from '@/estado/uso-tienda-gastos';
import {
  cambiarEstadoGastoAccion,
  obtenerDesgloseRentabilidadOrdenAccion,
  obtenerGastosAccion,
  obtenerProveedoresGastoAccion,
  obtenerRentabilidadOrdenAccion,
  obtenerUrlComprobanteGastoAccion,
  prepararSubidaComprobanteGastoAccion,
  procesarComprobanteOcrAccion,
  guardarGastoA19Accion,
  descartarSubidaComprobanteGastoAccion,
} from '@/modulos/gastos/acciones/indice';
import { CLAVE_GASTOS, CLAVE_RENTABILIDAD_GASTOS } from '@/modulos/gastos/componentes/claves-consulta';
import { ModalRegistrarGasto } from '@/modulos/gastos/componentes/modal-registrar-gasto';
import { SincronizadorGastosRealtime } from '@/modulos/gastos/componentes/sincronizador-gastos-realtime';
import { TablaGastos } from '@/modulos/gastos/componentes/tabla-gastos';
import { TarjetaRentabilidadOrden } from '@/modulos/gastos/componentes/tarjeta-rentabilidad-orden';
import type {
  CalculoRentabilidadOrden,
  DesgloseRentabilidadOrden,
  Gasto,
  TipoGasto,
} from '@/modulos/gastos/tipos/indice';
import { ESTADOS_GASTO } from '@/modulos/gastos/tipos/indice';
import { usarCatalogosComerciales } from '@/modulos/configuracion/hooks/usar-catalogos-comerciales';
import type { RegistrarGastoInput } from '@/modulos/gastos/validaciones/indice';
import type { DatosComprobanteOCR } from '@/modulos/gastos/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';

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
  const proveedorId = usarTiendaGastos((estado) => estado.proveedorId);
  const filtroIva = usarTiendaGastos((estado) => estado.filtroIva);
  const filtroTipo = usarTiendaGastos((estado) => estado.filtroTipo);
  const revision = usarTiendaGastos((estado) => estado.revisionGastos);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [gastoEditar, setGastoEditar] = useState<Gasto | null>(null);
  const [revisionModal, setRevisionModal] = useState(0);
  const [graficoVisible, setGraficoVisible] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [ordenRentabilidad, setOrdenRentabilidad] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const subidaPendiente = useRef<{ archivo: File; ruta: string } | null>(null);

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
  const proveedores = useQuery({
    queryKey: ['gastos', 'proveedores'],
    queryFn: async () => {
      const resultado = await obtenerProveedoresGastoAccion();
      if (!resultado.exito) throw new Error(resultado.error);
      return resultado.datos ?? [];
    },
    staleTime: 60_000,
  });
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-MX');
    return gastos.filter((gasto) => (
      (!termino || gasto.descripcion.toLocaleLowerCase('es-MX').includes(termino)
        || gasto.folio.toLocaleLowerCase('es-MX').includes(termino)
        || (gasto.proveedorNombre ?? '').toLocaleLowerCase('es-MX').includes(termino))
      && (categorias.length === 0 || categorias.includes(gasto.categoria))
      && (estados.length === 0 || estados.includes(gasto.estadoPago))
      && (!proveedorId || gasto.proveedorId === proveedorId)
      && (filtroIva === 'todos' || (filtroIva === 'con' ? gasto.montoIva > 0 : gasto.montoIva === 0))
      && (filtroTipo === 'todos' || gasto.tipoGasto === filtroTipo)
      && coincidePeriodo(gasto.fechaGasto, periodo, rango)
    ));
  }, [busqueda, categorias, estados, gastos, periodo, rango, proveedorId, filtroIva, filtroTipo]);

  const distribucion = useMemo(() => {
    const acumulado = new Map<Gasto['categoria'], number>();
    let total = 0;
    let fijos = 0;
    let variables = 0;
    let pendientes = 0;
    for (const gasto of filtrados) {
      if (gasto.estadoPago === 'cancelado') continue;
      const montoMxn = gasto.moneda === 'MXN' ? gasto.montoTotal : gasto.montoTotal * gasto.tipoCambio;
      if (!Number.isFinite(montoMxn) || montoMxn <= 0) continue;
      acumulado.set(gasto.categoria, (acumulado.get(gasto.categoria) ?? 0) + montoMxn);
      total += montoMxn;
      if (gasto.tipoGasto === 'fijo') fijos += montoMxn;
      if (gasto.tipoGasto === 'variable') variables += montoMxn;
      if (gasto.estadoPago === 'pendiente') pendientes += montoMxn;
    }
    const filas = [...acumulado.entries()]
      .map(([categoria, monto]) => ({
        categoria,
        monto,
        porcentaje: total > 0 ? (monto / total) * 100 : 0,
      }))
      .sort((a, b) => b.monto - a.monto);
    return { filas, total, fijos, variables, pendientes };
  }, [filtrados]);

  const rentabilidad = useQuery({
    queryKey: [...CLAVE_RENTABILIDAD_GASTOS, ordenRentabilidad],
    queryFn: async (): Promise<CalculoRentabilidadOrden> => {
      const resultado = await obtenerRentabilidadOrdenAccion({ ordenId: ordenRentabilidad as string });
      if (!resultado.exito || !resultado.datos) throw new Error(resultado.exito ? 'Sin datos de rentabilidad' : resultado.error);
      return resultado.datos;
    },
    enabled: ordenRentabilidad !== null,
  });

  // OBS-29: desglose por estación/rubro del mismo agregado.
  const desgloseRentabilidad = useQuery({
    queryKey: [...CLAVE_RENTABILIDAD_GASTOS, 'desglose', ordenRentabilidad],
    queryFn: async (): Promise<DesgloseRentabilidadOrden[]> => {
      const resultado = await obtenerDesgloseRentabilidadOrdenAccion({
        ordenId: ordenRentabilidad as string,
      });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'Sin desglose de rentabilidad' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: ordenRentabilidad !== null,
  });

  const refrescar = useCallback(async () => {
    // Una sola revalidación: invalidar el prefijo ya recarga la rama activa.
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_GASTOS });
  }, [clienteQuery]);

  const asegurarSubida = useCallback(async (archivo: File, gasto?: Gasto | null): Promise<string> => {
    if (subidaPendiente.current?.archivo === archivo) return subidaPendiente.current.ruta;
    if (subidaPendiente.current) {
      await descartarSubidaComprobanteGastoAccion({ ruta: subidaPendiente.current.ruta });
      subidaPendiente.current = null;
    }
    if (archivo.size < 1 || archivo.size > 10 * 1024 * 1024) throw new Error('Comprobante inválido o mayor a 10 MiB');
    const preparada = await prepararSubidaComprobanteGastoAccion({
      mime: archivo.type, tamano: archivo.size,
      ...(gasto ? { gastoId: gasto.id, actualizadoEn: gasto.actualizadoEn } : {}),
    });
    if (!preparada.exito || !preparada.datos) {
      throw new Error(preparada.exito ? 'No se pudo preparar el comprobante' : preparada.error);
    }
    const { error } = await crearClienteSupabase().storage.from('comprobantes-gasto')
      .uploadToSignedUrl(preparada.datos.ruta, preparada.datos.token, archivo, { contentType: archivo.type });
    if (error) throw new Error('No se pudo subir el comprobante');
    subidaPendiente.current = { archivo, ruta: preparada.datos.ruta };
    return preparada.datos.ruta;
  }, []);

  const guardar = useCallback(async (entrada: RegistrarGastoInput & {
    modo: 'crear' | 'editar'; gastoId?: string; actualizadoEn?: string; tipoGasto: TipoGasto;
  }, archivo: File | null): Promise<RespuestaAccion<unknown>> => {
    setProcesando(true);
    try {
      const formulario = new FormData();
      const ruta = archivo ? await asegurarSubida(archivo, gastoEditar) : undefined;
      formulario.set('datos', JSON.stringify({ ...entrada, ...(ruta ? { comprobanteRuta: ruta } : {}) }));
      const resultado = await guardarGastoA19Accion(formulario);
      if (resultado.exito) { subidaPendiente.current = null; await refrescar(); }
      return resultado;
    } catch (error) {
      console.error('[GASTOS] Error de comunicación al guardar:', error);
      return { exito: false, error: error instanceof Error ? error.message : 'No se pudo comunicar el guardado del gasto' };
    } finally {
      setProcesando(false);
    }
  }, [asegurarSubida, gastoEditar, refrescar]);

  const verComprobante = useCallback(async (gasto: Gasto) => {
    const ventana = window.open('', '_blank');
    try {
      const resultado = await obtenerUrlComprobanteGastoAccion({ gastoId: gasto.id });
      if (!resultado.exito || !resultado.datos) {
        ventana?.close();
        setMensaje(resultado.exito ? 'Comprobante no disponible' : resultado.error);
        return;
      }
      if (ventana) ventana.location.href = resultado.datos.url;
      else window.location.href = resultado.datos.url;
    } catch {
      ventana?.close();
      setMensaje('No se pudo abrir el comprobante');
    }
  }, []);

  const abrirNuevo = () => { subidaPendiente.current = null; setGastoEditar(null); setRevisionModal((actual) => actual + 1); setModalAbierto(true); };
  const abrirEdicion = (gasto: Gasto) => { subidaPendiente.current = null; setGastoEditar(gasto); setRevisionModal((actual) => actual + 1); setModalAbierto(true); };
  const cambiarModalAbierto = (abierto: boolean) => {
    if (!abierto && subidaPendiente.current) {
      const ruta = subidaPendiente.current.ruta;
      subidaPendiente.current = null;
      void descartarSubidaComprobanteGastoAccion({ ruta });
    }
    setModalAbierto(abierto);
  };

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
    try {
      const ruta = await asegurarSubida(archivo, gastoEditar);
      return await procesarComprobanteOcrAccion({ ruta });
    } catch (error) {
      return { exito: false, error: error instanceof Error ? error.message : 'No se pudo subir el comprobante' };
    } finally {
      usarTiendaGastos.getState().establecerOcrEnCurso(false);
    }
  }, [asegurarSubida, gastoEditar]);

  return (
    <div className="flex flex-col gap-5">
      <SincronizadorGastosRealtime />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Gastos registrados</h2><p className="text-sm text-texto-secundario">Los cambios se sincronizan sin recargar la página.</p></div>
        <Button onClick={abrirNuevo}>Registrar gasto</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Buscar<Input value={busqueda} onChange={(evento) => usarTiendaGastos.getState().establecerBusqueda(evento.target.value)} placeholder="Folio, descripción o proveedor" /></label>
        <label className="grid gap-1 text-sm font-medium">Periodo<Select value={periodo} onChange={(evento) => usarTiendaGastos.getState().establecerPeriodo(evento.target.value as typeof periodo)}><option value="hoy">Hoy</option><option value="esta_semana">Esta semana</option><option value="semana_pasada">Semana pasada</option><option value="este_mes">Este mes</option><option value="mes_pasado">Mes pasado</option><option value="este_anio">Este año</option><option value="personalizado">Personalizado</option></Select></label>
        {periodo === 'personalizado' ? <><label className="grid gap-1 text-sm font-medium">Desde<Input type="date" value={rango?.inicio ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerRango({ inicio: evento.target.value, fin: rango?.fin ?? evento.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Hasta<Input type="date" value={rango?.fin ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerRango({ inicio: rango?.inicio ?? evento.target.value, fin: evento.target.value })} /></label></> : null}
        <label className="grid gap-1 text-sm font-medium">Categoría<Select value={categorias[0] ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerCategorias(evento.target.value ? [evento.target.value] : [])}><option value="">Todas</option>{categoriasGasto.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-medium">Estado<Select value={estados[0] ?? ''} onChange={(evento) => usarTiendaGastos.getState().establecerEstados(evento.target.value ? [evento.target.value as typeof ESTADOS_GASTO[number]] : [])}><option value="">Todos</option>{ESTADOS_GASTO.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-medium">Proveedor<Select value={proveedorId} onChange={(evento) => usarTiendaGastos.getState().establecerProveedorId(evento.target.value)}><option value="">Todos</option>{(proveedores.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-medium">IVA<Select value={filtroIva} onChange={(evento) => usarTiendaGastos.getState().establecerFiltroIva(evento.target.value as typeof filtroIva)}><option value="todos">Todos</option><option value="con">Con IVA</option><option value="sin">Sin IVA</option></Select></label>
        <label className="grid gap-1 text-sm font-medium">Tipo<Select value={filtroTipo} onChange={(evento) => usarTiendaGastos.getState().establecerFiltroTipo(evento.target.value as typeof filtroTipo)}><option value="todos">Todos</option><option value="fijo">Fijos</option><option value="variable">Variables</option></Select></label>
      </div>
      {mensaje ? <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p> : null}
      {consulta.isError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-peligro-texto">No se pudo consultar gastos. <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>Reintentar</Button></div> : null}
      {proveedores.isError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-peligro-texto">No se pudieron consultar proveedores. <Button variante="contorno" tamano="sm" onClick={() => void proveedores.refetch()}>Reintentar proveedores</Button></div> : null}
      <section aria-label="Resumen de gastos filtrados" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['Total', distribucion.total], ['Fijos', distribucion.fijos], ['Variables', distribucion.variables], ['Pendientes de pago', distribucion.pendientes]].map(([etiqueta, monto]) => (
          <div key={String(etiqueta)} className="rounded-lg border border-borde bg-superficie p-3"><p className="text-sm text-texto-secundario">{etiqueta}</p><p className="font-semibold tabular-nums">{formatearMoneda(Number(monto))}</p></div>
        ))}
      </section>
      <p role="status" className="text-sm text-texto-secundario">{filtrados.length} resultados · suma sin cancelados {formatearMoneda(distribucion.total)} MXN</p>
      <TablaGastos gastos={filtrados} cargando={consulta.isPending && !consulta.isError} onCambiarEstado={(gasto, estado) => void cambiarEstado(gasto, estado)} onVerRentabilidad={setOrdenRentabilidad} onEditar={abrirEdicion} onVerComprobante={(gasto) => void verComprobante(gasto)} />
      {distribucion.filas.length > 0 ? (
        <section className="rounded-lg border border-borde bg-superficie p-4 shadow-sm" aria-labelledby="titulo-distribucion-categorias">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="titulo-distribucion-categorias" className="text-base font-semibold">Distribución por categoría</h3>
              <p className="text-xs text-texto-secundario">Resultados filtrados sin cancelados; importes convertidos a MXN. Históricos sin tipo quedan fuera de Fijos y Variables.</p>
            </div>
            <div className="flex items-center gap-3"><p className="text-sm font-semibold tabular-nums">{formatearMoneda(distribucion.total)}</p><Button variante="contorno" tamano="sm" onClick={() => setGraficoVisible((valor) => !valor)}>{graficoVisible ? 'Ocultar gráfico' : 'Mostrar gráfico'}</Button></div>
          </div>
          {graficoVisible ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {distribucion.filas.map(({ categoria, monto, porcentaje }) => (
              <li key={categoria} className="grid gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button type="button" className="text-acento underline" onClick={() => usarTiendaGastos.getState().establecerCategorias([categoria])}>{etiquetaCategoria(categoria)}</button>
                  <span className="font-medium tabular-nums">{formatearMoneda(monto)}</span>
                </div>
                <BarraProgreso valor={porcentaje} tono="acento" etiqueta={`${etiquetaCategoria(categoria)}: ${porcentaje.toFixed(1)}%`} />
              </li>
            ))}
          </ul> : null}
        </section>
      ) : null}
      {rentabilidad.isError ? <p role="alert" className="text-sm text-peligro-texto">No se pudo consultar la rentabilidad.</p> : null}
      <TarjetaRentabilidadOrden datos={rentabilidad.data ?? null} desglose={desgloseRentabilidad.data ?? null} />
      <ModalRegistrarGasto key={revisionModal} abierto={modalAbierto} gastoEditar={gastoEditar} proveedores={proveedores.data ?? []} procesando={procesando} ocrEnCurso={usarTiendaGastos((estado) => estado.ocrEnCurso)} onAbiertoChange={cambiarModalAbierto} onGuardar={guardar} onVerComprobante={(gasto) => void verComprobante(gasto)} onOcr={procesarOcr} />
    </div>
  );
}
