import type { RolUsuario } from '@/modulos/autenticacion/tipos/indice';

/** Periodos que puede solicitar el dashboard; no se aceptan etiquetas libres. */
export const PERIODOS_DASHBOARD = [
  'hoy',
  'semana_actual',
  'mes_actual',
  'anio_actual',
  'personalizado',
] as const;

export type PeriodoTipoDashboard = (typeof PERIODOS_DASHBOARD)[number];

export const ETAPAS_PIPELINE_DASHBOARD = [
  'prospecto',
  'contactado',
  'cotizado',
  'negociacion',
  'ganada',
  'perdida',
] as const;

export type EtapaPipelineDashboard = (typeof ETAPAS_PIPELINE_DASHBOARD)[number];
export type TendenciaMetrica = 'subio' | 'bajo' | 'neutro';

/** Rango actual y rango anterior usados por una misma respuesta de métricas. */
export interface PeriodoComparativoDashboard {
  inicio: string;
  fin: string;
  anteriorInicio: string;
  anteriorFin: string;
}

export interface FiltroPeriodoDashboard {
  fechaInicio: string;
  fechaFin: string;
  periodoTipo: PeriodoTipoDashboard;
}

export interface ResumenVentasDashboard {
  totalFacturado: number;
  totalCotizado: number;
  porcentajeConversion: number;
  /** DAS-05: horas promedio entre alta de oportunidad y envío de cotización. */
  tiempoRespuestaHorasPromedio: number;
  /** DAS-05: % de cotizaciones enviadas en <=24h respecto a las enviadas. */
  porcentajeRespondidas24h: number;
}

export interface ResumenOrdenesDashboard {
  activas: number;
  completadas: number;
  aprobacionesPendientes: number;
  /** DAS-01: órdenes de trabajo interno (TI) del periodo, contadas por separado. */
  internas: number;
  atrasadas: number;
  enRiesgo: number;
}

export interface ResumenFinanzasDashboard {
  arPendiente: number;
  arVencido: number;
  cxpPendiente: number;
  /** DAS-02: gasto total no cancelado del periodo, en MXN. */
  gastosTotal: number;
  utilidadNetaAcumulada: number;
  margenPromedioPorcentaje: number | null;
}

/** DAS-06: un renglón de la distribución de gasto por categoría, en MXN. */
export interface GastoPorCategoriaDashboard {
  categoria: string;
  montoMxn: number;
}

/** OBS-29/TI: costo de producción de trabajos internos en el periodo. */
export interface CostoTiPeriodoDashboard {
  costoMaterialesMxn: number;
  costoManoObraMxn: number;
  costoGastosMxn: number;
  costoTotalMxn: number;
  ordenesInternas: number;
}

/** Costo TI del periodo y su comparativa inmediata anterior. */
export interface CostoTiComparativoDashboard {
  actual: CostoTiPeriodoDashboard;
  anterior: CostoTiPeriodoDashboard;
}

export interface ResumenEjecutivoPeriodo {
  ventas: ResumenVentasDashboard;
  ordenes: ResumenOrdenesDashboard;
  finanzas: ResumenFinanzasDashboard;
  /** DAS-06: distribución del gasto del periodo por categoría (orden descendente). */
  distribucionGastoPorCategoria: GastoPorCategoriaDashboard[];
}

/** Agregados globales de un periodo y su comparación inmediata anterior. */
export interface MetricasEjecutivas {
  version: number;
  periodo: PeriodoComparativoDashboard;
  actual: ResumenEjecutivoPeriodo;
  anterior: ResumenEjecutivoPeriodo;
  /**
   * OBS-29/TI: costo de producción de los trabajos internos del periodo.
   * Opcional: se omite si la RPC de costo TI aún no está aplicada en remoto.
   */
  costoTi?: CostoTiComparativoDashboard;
  generadoEn: string;
}

export type PipelinePorEtapa = Record<EtapaPipelineDashboard, number>;

export interface MetaMensualVendedor {
  /** `null` cuando el vendedor no tiene meta configurada para el periodo. */
  metaMxn: number | null;
  realMxn: number;
  porcentajeCumplimiento: number;
}

export interface ResumenVendedorPeriodo {
  pipelinePorEtapa: PipelinePorEtapa;
  cotizacionesSinSeguimiento: number;
  metaMensual: MetaMensualVendedor;
  /** `null` cuando aún no hay facturación comisionable en el periodo. */
  comisionAcumuladaMxn: number | null;
}

/** Métricas limitadas al vendedor indicado por la RPC protegida. */
export interface MetricasVendedor {
  version: number;
  usuarioId: string;
  periodo: PeriodoComparativoDashboard;
  actual: ResumenVendedorPeriodo;
  anterior: ResumenVendedorPeriodo;
  generadoEn: string;
}

export interface ResumenPipelineEquipoPeriodo {
  pipelinePorEtapa: PipelinePorEtapa;
  cotizacionesSinSeguimiento: number;
  ordenes: ResumenOrdenesDashboard;
}

/** Pipeline agregado del equipo para gerencia; no incluye importes financieros. */
export interface MetricasPipelineEquipo {
  version: number;
  periodo: PeriodoComparativoDashboard;
  actual: ResumenPipelineEquipoPeriodo;
  anterior: ResumenPipelineEquipoPeriodo;
  generadoEn: string;
}

export interface ResumenCobranzaContador {
  cobradoMxn: number;
  arPendienteMxn: number;
  arVencidoMxn: number;
}

export interface ResumenAgingContador {
  corrienteMxn: number;
  unoTreintaMxn: number;
  treintaSesentaMxn: number;
  sesentaNoventaMxn: number;
  mayorNoventaMxn: number;
}

export interface ResumenCxpContador {
  pendienteMxn: number;
  porVencerMxn: number;
  vencidoMxn: number;
}

export interface ResumenFlujoCajaContador {
  entradasMxn: number;
  salidasMxn: number;
  netoMxn: number;
}

export interface ResumenContadorPeriodo {
  cobranza: ResumenCobranzaContador;
  aging: ResumenAgingContador;
  cxp: ResumenCxpContador;
  flujoCaja: ResumenFlujoCajaContador;
}

/** Bloque financiero operativo del contador; no contiene margen de utilidad. */
export interface MetricasContador {
  version: number;
  periodo: PeriodoComparativoDashboard;
  actual: ResumenContadorPeriodo;
  anterior: ResumenContadorPeriodo;
  generadoEn: string;
}

export type UnidadTarjetaMetrica = 'moneda' | 'porcentaje' | 'cantidad' | 'texto';

export interface TarjetaMetrica {
  id: string;
  titulo: string;
  valor: number | string;
  unidad: UnidadTarjetaMetrica;
  variacionPorcentaje: number | null;
  tendencia: TendenciaMetrica;
  descripcion?: string;
}

/** Resultado de servidor ya filtrado por rol; no se debe ampliar en el cliente. */
export interface DashboardConsolidado {
  rol: RolUsuario;
  filtro: FiltroPeriodoDashboard;
  tarjetas: readonly TarjetaMetrica[];
  ejecutivas?: MetricasEjecutivas;
  vendedor?: MetricasVendedor;
  equipo?: MetricasPipelineEquipo;
  contador?: MetricasContador;
  produccion?: ResumenOrdenesDashboard;
  /** DAS-06: distribución de gasto por categoría del periodo actual (solo vista ejecutiva). */
  distribucionGasto?: GastoPorCategoriaDashboard[];
  redireccion?: '/produccion';
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function campo(objeto: Record<string, unknown>, nombre: string): unknown {
  if (!(nombre in objeto)) throw new Error(`Campo ausente en métricas: ${nombre}`);
  return objeto[nombre];
}

function texto(valor: unknown, nombre: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error(`Texto inválido en métricas: ${nombre}`);
  }
  return valor;
}

function numero(valor: unknown, nombre: string): number {
  const convertido =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string' && valor.trim() !== ''
        ? Number(valor)
        : NaN;
  if (!Number.isFinite(convertido)) throw new Error(`Número inválido en métricas: ${nombre}`);
  return convertido;
}

function numeroNulo(valor: unknown, nombre: string): number | null {
  return valor === null ? null : numero(valor, nombre);
}

/**
 * Lee una clave numérica que puede no existir todavía en el RPC remoto (claves
 * añadidas de forma aditiva). Si falta, devuelve el default sin lanzar; si está
 * presente, exige que sea un número válido. Así el dashboard no se rompe antes
 * de aplicar la migración que puebla estas métricas.
 */
function numeroOpcional(objeto: Record<string, unknown>, nombre: string, porDefecto = 0): number {
  if (!(nombre in objeto)) return porDefecto;
  return numero(objeto[nombre], nombre);
}

function objetoCampo(objeto: Record<string, unknown>, nombre: string): Record<string, unknown> {
  const valor = campo(objeto, nombre);
  if (!esObjeto(valor)) throw new Error(`Objeto inválido en métricas: ${nombre}`);
  return valor;
}

function periodoDesde(valor: unknown): PeriodoComparativoDashboard {
  if (!esObjeto(valor)) throw new Error('Periodo de métricas inválido');
  return {
    inicio: texto(campo(valor, 'inicio'), 'periodo.inicio'),
    fin: texto(campo(valor, 'fin'), 'periodo.fin'),
    anteriorInicio: texto(campo(valor, 'anteriorInicio'), 'periodo.anteriorInicio'),
    anteriorFin: texto(campo(valor, 'anteriorFin'), 'periodo.anteriorFin'),
  };
}

function ventasDesde(valor: unknown): ResumenVentasDashboard {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Ventas inválidas'); })();
  return {
    totalFacturado: numero(campo(objeto, 'totalFacturado'), 'ventas.totalFacturado'),
    totalCotizado: numero(campo(objeto, 'totalCotizado'), 'ventas.totalCotizado'),
    porcentajeConversion: numero(campo(objeto, 'porcentajeConversion'), 'ventas.porcentajeConversion'),
    tiempoRespuestaHorasPromedio: numeroOpcional(objeto, 'tiempoRespuestaHorasPromedio'),
    porcentajeRespondidas24h: numeroOpcional(objeto, 'porcentajeRespondidas24h'),
  };
}

function ordenesDesde(valor: unknown): ResumenOrdenesDashboard {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Órdenes inválidas'); })();
  return {
    activas: numero(campo(objeto, 'activas'), 'ordenes.activas'),
    completadas: numero(campo(objeto, 'completadas'), 'ordenes.completadas'),
    aprobacionesPendientes: numero(campo(objeto, 'aprobacionesPendientes'), 'ordenes.aprobacionesPendientes'),
    internas: numeroOpcional(objeto, 'internas'),
    atrasadas: numero(campo(objeto, 'atrasadas'), 'ordenes.atrasadas'),
    enRiesgo: numero(campo(objeto, 'enRiesgo'), 'ordenes.enRiesgo'),
  };
}

function finanzasDesde(valor: unknown): ResumenFinanzasDashboard {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Finanzas inválidas'); })();
  return {
    arPendiente: numero(campo(objeto, 'arPendiente'), 'finanzas.arPendiente'),
    arVencido: numero(campo(objeto, 'arVencido'), 'finanzas.arVencido'),
    cxpPendiente: numero(campo(objeto, 'cxpPendiente'), 'finanzas.cxpPendiente'),
    gastosTotal: numeroOpcional(objeto, 'gastosTotal'),
    utilidadNetaAcumulada: numero(campo(objeto, 'utilidadNetaAcumulada'), 'finanzas.utilidadNetaAcumulada'),
    margenPromedioPorcentaje: numeroNulo(campo(objeto, 'margenPromedioPorcentaje'), 'finanzas.margenPromedioPorcentaje'),
  };
}

/**
 * Distribución de gasto por categoría (DAS-06). Clave aditiva: si el RPC aún no
 * la envía, devuelve []. Descarta renglones malformados en vez de lanzar, para
 * no tumbar todo el dashboard por un dato accesorio.
 */
function distribucionGastoDesde(objeto: Record<string, unknown>): GastoPorCategoriaDashboard[] {
  if (!('distribucionGastoPorCategoria' in objeto)) return [];
  const bruto = objeto.distribucionGastoPorCategoria;
  if (!Array.isArray(bruto)) return [];
  const filas: GastoPorCategoriaDashboard[] = [];
  for (const item of bruto) {
    if (!esObjeto(item)) continue;
    const categoria = item.categoria;
    const monto = item.montoMxn;
    if (typeof categoria !== 'string' || categoria.trim() === '') continue;
    if (typeof monto !== 'number' || !Number.isFinite(monto)) continue;
    filas.push({ categoria, montoMxn: monto });
  }
  return filas;
}

function resumenEjecutivoDesde(valor: unknown): ResumenEjecutivoPeriodo {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Resumen ejecutivo inválido'); })();
  return {
    ventas: ventasDesde(campo(objeto, 'ventas')),
    ordenes: ordenesDesde(campo(objeto, 'ordenes')),
    finanzas: finanzasDesde(campo(objeto, 'finanzas')),
    distribucionGastoPorCategoria: distribucionGastoDesde(objeto),
  };
}

function pipelineDesde(valor: unknown): PipelinePorEtapa {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Pipeline inválido'); })();
  const resultado = {} as PipelinePorEtapa;
  for (const etapa of ETAPAS_PIPELINE_DASHBOARD) {
    resultado[etapa] = numero(campo(objeto, etapa), `pipelinePorEtapa.${etapa}`);
  }
  return resultado;
}

function resumenVendedorDesde(valor: unknown): ResumenVendedorPeriodo {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Resumen vendedor inválido'); })();
  const meta = objetoCampo(objeto, 'metaMensual');
  return {
    pipelinePorEtapa: pipelineDesde(campo(objeto, 'pipelinePorEtapa')),
    cotizacionesSinSeguimiento: numero(campo(objeto, 'cotizacionesSinSeguimiento'), 'cotizacionesSinSeguimiento'),
    metaMensual: {
      // La RPC devuelve `null` cuando el vendedor no tiene meta configurada:
      // es un dato ausente, no un cero (la tarjeta lo muestra como "—").
      metaMxn: numeroNulo(campo(meta, 'metaMxn'), 'metaMensual.metaMxn'),
      realMxn: numero(campo(meta, 'realMxn'), 'metaMensual.realMxn'),
      porcentajeCumplimiento: numero(campo(meta, 'porcentajeCumplimiento'), 'metaMensual.porcentajeCumplimiento'),
    },
    comisionAcumuladaMxn: numeroNulo(campo(objeto, 'comisionAcumuladaMxn'), 'comisionAcumuladaMxn'),
  };
}

function resumenEquipoDesde(valor: unknown): ResumenPipelineEquipoPeriodo {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Resumen de equipo inválido'); })();
  return {
    pipelinePorEtapa: pipelineDesde(campo(objeto, 'pipelinePorEtapa')),
    cotizacionesSinSeguimiento: numero(campo(objeto, 'cotizacionesSinSeguimiento'), 'equipo.cotizacionesSinSeguimiento'),
    ordenes: ordenesDesde(campo(objeto, 'ordenes')),
  };
}

function contadorDesde(valor: unknown): ResumenContadorPeriodo {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Resumen contador inválido'); })();
  const cobranza = objetoCampo(objeto, 'cobranza');
  const aging = objetoCampo(objeto, 'aging');
  const cxp = objetoCampo(objeto, 'cxp');
  const flujo = objetoCampo(objeto, 'flujoCaja');
  return {
    cobranza: {
      cobradoMxn: numero(campo(cobranza, 'cobradoMxn'), 'cobranza.cobradoMxn'),
      arPendienteMxn: numero(campo(cobranza, 'arPendienteMxn'), 'cobranza.arPendienteMxn'),
      arVencidoMxn: numero(campo(cobranza, 'arVencidoMxn'), 'cobranza.arVencidoMxn'),
    },
    aging: {
      corrienteMxn: numero(campo(aging, 'corrienteMxn'), 'aging.corrienteMxn'),
      unoTreintaMxn: numero(campo(aging, 'unoTreintaMxn'), 'aging.unoTreintaMxn'),
      treintaSesentaMxn: numero(campo(aging, 'treintaSesentaMxn'), 'aging.treintaSesentaMxn'),
      sesentaNoventaMxn: numero(campo(aging, 'sesentaNoventaMxn'), 'aging.sesentaNoventaMxn'),
      mayorNoventaMxn: numero(campo(aging, 'mayorNoventaMxn'), 'aging.mayorNoventaMxn'),
    },
    cxp: {
      pendienteMxn: numero(campo(cxp, 'pendienteMxn'), 'cxp.pendienteMxn'),
      porVencerMxn: numero(campo(cxp, 'porVencerMxn'), 'cxp.porVencerMxn'),
      vencidoMxn: numero(campo(cxp, 'vencidoMxn'), 'cxp.vencidoMxn'),
    },
    flujoCaja: {
      entradasMxn: numero(campo(flujo, 'entradasMxn'), 'flujoCaja.entradasMxn'),
      salidasMxn: numero(campo(flujo, 'salidasMxn'), 'flujoCaja.salidasMxn'),
      netoMxn: numero(campo(flujo, 'netoMxn'), 'flujoCaja.netoMxn'),
    },
  };
}

function versionDesde(valor: Record<string, unknown>): number {
  return numero(campo(valor, 'version'), 'version');
}

/** Mapea y valida la respuesta JSON del RPC ejecutivo, sin copiar campos extra. */
export function mapearMetricasEjecutivas(valor: unknown): MetricasEjecutivas {
  if (!esObjeto(valor)) throw new Error('Respuesta ejecutiva inválida');
  return {
    version: versionDesde(valor),
    periodo: periodoDesde(campo(valor, 'periodo')),
    actual: resumenEjecutivoDesde(campo(valor, 'actual')),
    anterior: resumenEjecutivoDesde(campo(valor, 'anterior')),
    generadoEn: texto(campo(valor, 'generadoEn'), 'generadoEn'),
  };
}

function costoTiPeriodoDesde(valor: unknown): CostoTiPeriodoDashboard {
  const objeto = esObjeto(valor) ? valor : (() => { throw new Error('Costo TI inválido'); })();
  return {
    costoMaterialesMxn: numero(campo(objeto, 'costoMaterialesMxn'), 'costoTi.costoMaterialesMxn'),
    costoManoObraMxn: numero(campo(objeto, 'costoManoObraMxn'), 'costoTi.costoManoObraMxn'),
    costoGastosMxn: numero(campo(objeto, 'costoGastosMxn'), 'costoTi.costoGastosMxn'),
    costoTotalMxn: numero(campo(objeto, 'costoTotalMxn'), 'costoTi.costoTotalMxn'),
    ordenesInternas: numero(campo(objeto, 'ordenesInternas'), 'costoTi.ordenesInternas'),
  };
}

/** OBS-29/TI: mapea el comparativo de costo de trabajos internos del periodo. */
export function mapearCostoTiPeriodo(valor: unknown): CostoTiComparativoDashboard {
  if (!esObjeto(valor)) throw new Error('Respuesta de costo TI inválida');
  return {
    actual: costoTiPeriodoDesde(campo(valor, 'actual')),
    anterior: costoTiPeriodoDesde(campo(valor, 'anterior')),
  };
}

/** Mapea y valida la respuesta JSON exclusiva de un vendedor. */
export function mapearMetricasVendedor(valor: unknown): MetricasVendedor {
  if (!esObjeto(valor)) throw new Error('Respuesta de vendedor inválida');
  return {
    version: versionDesde(valor),
    usuarioId: texto(campo(valor, 'usuarioId'), 'usuarioId'),
    periodo: periodoDesde(campo(valor, 'periodo')),
    actual: resumenVendedorDesde(campo(valor, 'actual')),
    anterior: resumenVendedorDesde(campo(valor, 'anterior')),
    generadoEn: texto(campo(valor, 'generadoEn'), 'generadoEn'),
  };
}

/** Mapea y valida la respuesta de pipeline agregado para gerencia. */
export function mapearMetricasPipelineEquipo(valor: unknown): MetricasPipelineEquipo {
  if (!esObjeto(valor)) throw new Error('Respuesta de equipo inválida');
  return {
    version: versionDesde(valor),
    periodo: periodoDesde(campo(valor, 'periodo')),
    actual: resumenEquipoDesde(campo(valor, 'actual')),
    anterior: resumenEquipoDesde(campo(valor, 'anterior')),
    generadoEn: texto(campo(valor, 'generadoEn'), 'generadoEn'),
  };
}

/** Mapea y valida la respuesta JSON financiera del contador. */
export function mapearMetricasContador(valor: unknown): MetricasContador {
  if (!esObjeto(valor)) throw new Error('Respuesta de contador inválida');
  return {
    version: versionDesde(valor),
    periodo: periodoDesde(campo(valor, 'periodo')),
    actual: contadorDesde(campo(valor, 'actual')),
    anterior: contadorDesde(campo(valor, 'anterior')),
    generadoEn: texto(campo(valor, 'generadoEn'), 'generadoEn'),
  };
}

/** Mapea una tarjeta y descarta cualquier propiedad no perteneciente al contrato. */
export function mapearTarjetaMetrica(valor: unknown): TarjetaMetrica {
  if (!esObjeto(valor)) throw new Error('Tarjeta métrica inválida');
  const unidad = texto(campo(valor, 'unidad'), 'tarjeta.unidad');
  if (!['moneda', 'porcentaje', 'cantidad', 'texto'].includes(unidad)) {
    throw new Error(`Unidad inválida en tarjeta: ${unidad}`);
  }
  const tendencia = texto(campo(valor, 'tendencia'), 'tarjeta.tendencia');
  if (!['subio', 'bajo', 'neutro'].includes(tendencia)) {
    throw new Error(`Tendencia inválida en tarjeta: ${tendencia}`);
  }
  const valorPrincipal = campo(valor, 'valor');
  if (typeof valorPrincipal !== 'string' && typeof valorPrincipal !== 'number') {
    throw new Error('Valor inválido en tarjeta');
  }
  if (typeof valorPrincipal === 'number' && !Number.isFinite(valorPrincipal)) {
    throw new Error('Valor no finito en tarjeta');
  }
  return {
    id: texto(campo(valor, 'id'), 'tarjeta.id'),
    titulo: texto(campo(valor, 'titulo'), 'tarjeta.titulo'),
    valor: valorPrincipal,
    unidad: unidad as UnidadTarjetaMetrica,
    variacionPorcentaje: numeroNulo(campo(valor, 'variacionPorcentaje'), 'tarjeta.variacionPorcentaje'),
    tendencia: tendencia as TendenciaMetrica,
    ...(valor.descripcion === undefined ? {} : { descripcion: texto(valor.descripcion, 'tarjeta.descripcion') }),
  };
}

// Alias explícitos para consumidores que nombran los mappers por la respuesta.
export const mapearRespuestaMetricasEjecutivas = mapearMetricasEjecutivas;
export const mapearRespuestaMetricasVendedor = mapearMetricasVendedor;
export const mapearRespuestaMetricasPipelineEquipo = mapearMetricasPipelineEquipo;
export const mapearRespuestaMetricasContador = mapearMetricasContador;
