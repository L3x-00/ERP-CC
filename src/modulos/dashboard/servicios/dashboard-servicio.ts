import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { RolUsuario } from '@/modulos/autenticacion/tipos/indice';
import {
  mapearMetricasContador,
  mapearMetricasEjecutivas,
  mapearMetricasPipelineEquipo,
  mapearMetricasVendedor,
  type DashboardConsolidado,
  type FiltroPeriodoDashboard,
  type MetricasContador,
  type MetricasEjecutivas,
  type MetricasPipelineEquipo,
  type MetricasVendedor,
  type ResumenOrdenesDashboard,
  type TarjetaMetrica,
  type UnidadTarjetaMetrica,
} from '@/modulos/dashboard/tipos/indice';
import {
  calcularVariacionPorcentaje,
  type ResultadoVariacionPorcentaje,
} from '@/modulos/dashboard/servicios/calculo-tendencias';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

type ClienteDashboard = SupabaseClient<Database>;

function tienePermiso(rol: string, permisos: readonly string[], permiso: string): boolean {
  return rol === 'admin' || permisos.includes(permiso);
}

function numeroSeguro(valor: number | null): number {
  return valor !== null && Number.isFinite(valor) ? valor : 0;
}

function tarjeta(
  id: string,
  titulo: string,
  actual: number | null,
  anterior: number | null,
  unidad: UnidadTarjetaMetrica,
  descripcion?: string,
): TarjetaMetrica {
  const actualSeguro = numeroSeguro(actual);
  const variacion: ResultadoVariacionPorcentaje = calcularVariacionPorcentaje(
    actualSeguro,
    numeroSeguro(anterior),
  );
  return {
    id,
    titulo,
    valor: actual === null ? '—' : actualSeguro,
    unidad,
    variacionPorcentaje: actual === null ? null : variacion.porcentaje,
    tendencia: actual === null ? 'neutro' : variacion.tendencia,
    ...(descripcion ? { descripcion } : {}),
  };
}

function argumentosPeriodo(filtro: FiltroPeriodoDashboard): {
  p_fecha_inicio: string;
  p_fecha_fin: string;
} {
  return { p_fecha_inicio: filtro.fechaInicio, p_fecha_fin: filtro.fechaFin };
}

async function obtenerEjecutivas(
  cliente: ClienteDashboard,
  filtro: FiltroPeriodoDashboard,
): Promise<MetricasEjecutivas> {
  const { data, error } = await cliente.rpc(
    'obtener_metricas_dashboard_ejecutivo',
    argumentosPeriodo(filtro),
  );
  if (error || data === null) throw new Error(error?.message ?? 'Métricas ejecutivas ausentes');
  return mapearMetricasEjecutivas(data);
}

async function obtenerVendedor(
  cliente: ClienteDashboard,
  usuarioId: string,
  filtro: FiltroPeriodoDashboard,
): Promise<MetricasVendedor> {
  const { data, error } = await cliente.rpc('obtener_metricas_vendedor', {
    ...argumentosPeriodo(filtro),
    p_usuario_id: usuarioId,
  });
  if (error || data === null) throw new Error(error?.message ?? 'Métricas de vendedor ausentes');
  return mapearMetricasVendedor(data);
}

async function obtenerEquipo(
  cliente: ClienteDashboard,
  filtro: FiltroPeriodoDashboard,
): Promise<MetricasPipelineEquipo> {
  const { data, error } = await cliente.rpc(
    'obtener_metricas_pipeline_equipo',
    argumentosPeriodo(filtro),
  );
  if (error || data === null) throw new Error(error?.message ?? 'Métricas de equipo ausentes');
  return mapearMetricasPipelineEquipo(data);
}

async function obtenerContador(
  cliente: ClienteDashboard,
  filtro: FiltroPeriodoDashboard,
): Promise<MetricasContador> {
  const { data, error } = await cliente.rpc('obtener_metricas_contador', argumentosPeriodo(filtro));
  if (error || data === null) throw new Error(error?.message ?? 'Métricas de contador ausentes');
  return mapearMetricasContador(data);
}

function tarjetasEjecutivas(metricas: MetricasEjecutivas): TarjetaMetrica[] {
  return [
    tarjeta('ventas-total-facturado', 'Ventas facturadas', metricas.actual.ventas.totalFacturado, metricas.anterior.ventas.totalFacturado, 'moneda', 'Importe convertido a MXN'),
    tarjeta('ordenes-activas', 'Órdenes activas', metricas.actual.ordenes.activas, metricas.anterior.ordenes.activas, 'cantidad'),
    tarjeta('ordenes-atrasadas', 'Órdenes atrasadas', metricas.actual.ordenes.atrasadas, metricas.anterior.ordenes.atrasadas, 'cantidad'),
    tarjeta('utilidad-neta', 'Utilidad neta acumulada', metricas.actual.finanzas.utilidadNetaAcumulada, metricas.anterior.finanzas.utilidadNetaAcumulada, 'moneda', 'Resultado aproximado del periodo en MXN'),
    tarjeta('margen-promedio', 'Margen promedio', metricas.actual.finanzas.margenPromedioPorcentaje, metricas.anterior.finanzas.margenPromedioPorcentaje, 'porcentaje'),
  ];
}

function tarjetasVendedor(metricas: MetricasVendedor): TarjetaMetrica[] {
  return [
    tarjeta('meta-mensual', 'Cumplimiento de meta', metricas.actual.metaMensual.porcentajeCumplimiento, metricas.anterior.metaMensual.porcentajeCumplimiento, 'porcentaje'),
    tarjeta('seguimientos-pendientes', 'Cotizaciones sin seguimiento', metricas.actual.cotizacionesSinSeguimiento, metricas.anterior.cotizacionesSinSeguimiento, 'cantidad'),
    tarjeta('comision-acumulada', 'Comisión acumulada', metricas.actual.comisionAcumuladaMxn, metricas.anterior.comisionAcumuladaMxn, 'moneda', 'Calculada sobre facturación en MXN'),
  ];
}

function tarjetasEquipo(metricas: MetricasPipelineEquipo): TarjetaMetrica[] {
  return [
    tarjeta('pipeline-equipo', 'Oportunidades del equipo', Object.values(metricas.actual.pipelinePorEtapa).reduce((suma, valor) => suma + valor, 0), Object.values(metricas.anterior.pipelinePorEtapa).reduce((suma, valor) => suma + valor, 0), 'cantidad'),
    tarjeta('seguimientos-equipo', 'Seguimientos del equipo', metricas.actual.cotizacionesSinSeguimiento, metricas.anterior.cotizacionesSinSeguimiento, 'cantidad'),
  ];
}

function tarjetasContador(metricas: MetricasContador): TarjetaMetrica[] {
  return [
    tarjeta('ar-pendiente-contador', 'CxC pendiente', metricas.actual.cobranza.arPendienteMxn, metricas.anterior.cobranza.arPendienteMxn, 'moneda'),
    tarjeta('ar-vencido-contador', 'CxC vencido', metricas.actual.cobranza.arVencidoMxn, metricas.anterior.cobranza.arVencidoMxn, 'moneda'),
    tarjeta('cxp-pendiente-contador', 'CxP pendiente', metricas.actual.cxp.pendienteMxn, metricas.anterior.cxp.pendienteMxn, 'moneda'),
    tarjeta('flujo-neto-contador', 'Flujo neto', metricas.actual.flujoCaja.netoMxn, metricas.anterior.flujoCaja.netoMxn, 'moneda'),
  ];
}

function tarjetasProduccion(actual: ResumenOrdenesDashboard, anterior: ResumenOrdenesDashboard): TarjetaMetrica[] {
  return [
    tarjeta('ordenes-aprobaciones-pendientes', 'Aprobaciones pendientes', actual.aprobacionesPendientes, anterior.aprobacionesPendientes, 'cantidad'),
    tarjeta('ordenes-atrasadas-produccion', 'Órdenes atrasadas', actual.atrasadas, anterior.atrasadas, 'cantidad'),
    tarjeta('ordenes-en-riesgo-produccion', 'Órdenes en riesgo', actual.enRiesgo, anterior.enRiesgo, 'cantidad'),
  ];
}

/**
 * Consolida únicamente las secciones autorizadas. Aunque el RPC ejecutivo
 * pueda devolver finanzas para un gerente, este servicio las descarta antes de
 * construir la respuesta que cruza la frontera hacia el navegador.
 */
export async function obtenerDashboardPorRol(
  usuarioId: string,
  rol: string,
  permisos: readonly string[],
  filtro: FiltroPeriodoDashboard,
  cliente?: ClienteDashboard,
): Promise<DashboardConsolidado> {
  const rolesValidos: readonly RolUsuario[] = ['admin', 'vendedor', 'gerente', 'operador', 'contador'];
  if (!rolesValidos.includes(rol as RolUsuario)) throw new Error('Rol de dashboard inválido');
  if (rol === 'operador') {
    return { rol: 'operador', filtro, tarjetas: [], redireccion: '/produccion' };
  }

  const supabase = cliente ?? crearClienteSupabaseAdmin();
  const base: DashboardConsolidado = {
    rol: rol as RolUsuario,
    filtro,
    tarjetas: [],
  };

  if (rol === 'vendedor') {
    if (!tienePermiso(rol, permisos, 'ver_clientes')) return base;
    const vendedor = await obtenerVendedor(supabase, usuarioId, filtro);
    return { ...base, vendedor, tarjetas: tarjetasVendedor(vendedor) };
  }

  if (rol === 'contador') {
    if (!tienePermiso(rol, permisos, 'ver_finanzas')) return base;
    const contador = await obtenerContador(supabase, filtro);
    return { ...base, contador, tarjetas: tarjetasContador(contador) };
  }

  if (rol === 'gerente') {
    if (!tienePermiso(rol, permisos, 'ver_pipeline_equipo')) return base;
    const equipo = await obtenerEquipo(supabase, filtro);
    const produccion = equipo.actual.ordenes;
    return {
      ...base,
      equipo,
      produccion,
      tarjetas: [...tarjetasEquipo(equipo), ...tarjetasProduccion(produccion, equipo.anterior.ordenes)],
    };
  }

  const ejecutivas = await obtenerEjecutivas(supabase, filtro);
  const resultado: DashboardConsolidado = {
    ...base,
    ejecutivas,
    produccion: ejecutivas.actual.ordenes,
    tarjetas: tarjetasEjecutivas(ejecutivas),
  };
  if (tienePermiso(rol, permisos, 'ver_pipeline_equipo')) {
    const equipo = await obtenerEquipo(supabase, filtro);
    resultado.equipo = equipo;
    resultado.tarjetas = [...resultado.tarjetas, ...tarjetasEquipo(equipo)];
  }
  if (tienePermiso(rol, permisos, 'ver_finanzas')) {
    const contador = await obtenerContador(supabase, filtro);
    resultado.contador = contador;
    resultado.tarjetas = [...resultado.tarjetas, ...tarjetasContador(contador)];
  }
  return resultado;
}
